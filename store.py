"""The site's database: community topics, topic votes, community questions and question reports.

It's a single SQLite file (built into Python), kept in AIRHEAD_DATA_DIR. On Render that folder is
the attached disk, so everything survives restarts and redeploys."""

import json
import os
import secrets
import sqlite3
import time

from builtin import TOPICS

DATA_DIR = os.environ.get("AIRHEAD_DATA_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"))
DB_PATH = os.path.join(DATA_DIR, "airhead.db")
NEED_VOTES = 3          # votes from other players before a topic joins the menu
MAX_TOPICS_PER_PERSON = 6
MAX_TOPICS = 500
HIDE_AT_REPORTS = 3     # reports from other players before a question is taken out of games

SCHEMA = """
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, blurb TEXT NOT NULL DEFAULT '',
  subs TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS topic_votes (
  topic_id TEXT NOT NULL, client TEXT NOT NULL, PRIMARY KEY (topic_id, client));
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, topic TEXT NOT NULL, sub TEXT NOT NULL DEFAULT '',
  q TEXT NOT NULL, answer TEXT NOT NULL, wrong1 TEXT NOT NULL, wrong2 TEXT NOT NULL, wrong3 TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS questions_by_topic ON questions (topic, sub);
CREATE INDEX IF NOT EXISTS questions_by_owner ON questions (owner);
CREATE TABLE IF NOT EXISTS question_reports (
  question_id TEXT NOT NULL, client TEXT NOT NULL, PRIMARY KEY (question_id, client));
CREATE TABLE IF NOT EXISTS daily (
  day TEXT PRIMARY KEY, ids TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS daily_results (
  day TEXT NOT NULL, client TEXT NOT NULL, round INTEGER NOT NULL, total INTEGER NOT NULL,
  created INTEGER NOT NULL, PRIMARY KEY (day, client));
"""

os.makedirs(DATA_DIR, exist_ok=True)
db = sqlite3.connect(DB_PATH, isolation_level=None)  # autocommit; each write is its own transaction
db.row_factory = sqlite3.Row
db.execute("PRAGMA journal_mode=WAL")
db.executescript(SCHEMA)


class StoreError(Exception):
    """A request the player can fix; the message is shown to them."""


def clean(text, limit):
    return " ".join(str(text or "").split())[:limit]


def now_ms():
    return int(time.time() * 1000)


# ----- topics -----
def _topic_row(r, client):
    votes = r["votes"]
    return {
        "key": "c:" + r["id"], "id": r["id"], "name": r["name"], "blurb": r["blurb"], "subs": json.loads(r["subs"]),
        "votes": votes, "added": votes >= NEED_VOTES, "mine": r["owner"] == client,
        "voted": bool(r["voted"]), "created": r["created"],
    }


_TOPIC_SELECT = """
SELECT t.*,
  (SELECT COUNT(*) FROM topic_votes v WHERE v.topic_id = t.id AND v.client != t.owner) AS votes,
  EXISTS (SELECT 1 FROM topic_votes v WHERE v.topic_id = t.id AND v.client = ?) AS voted
FROM topics t"""


def list_topics(client):
    return [_topic_row(r, client) for r in db.execute(_TOPIC_SELECT + " ORDER BY t.created", (client or "",))]


def get_topic(topic_id, client):
    r = db.execute(_TOPIC_SELECT + " WHERE t.id = ?", (client or "", topic_id)).fetchone()
    return _topic_row(r, client) if r else None


def find_topic(key):
    """A topic by key: a built-in key, or "c:<id>" for a community topic."""
    for t in TOPICS:
        if t["key"] == key:
            return t
    if key.startswith("c:"):
        r = db.execute("SELECT name, subs FROM topics WHERE id = ?", (key[2:],)).fetchone()
        if r:
            return {"key": key, "name": r["name"], "subs": json.loads(r["subs"])}
    return None


def add_topic(client, name, blurb, subs):
    name, blurb = clean(name, 40), clean(blurb, 120)
    seen, clean_subs = set(), []
    for s in subs if isinstance(subs, list) else []:
        s = clean(s, 80)
        if s and s.lower() not in seen:
            seen.add(s.lower())
            clean_subs.append(s)
    if len(name) < 2:
        raise StoreError("Give the topic a name of at least 2 characters.")
    lower = name.lower()
    if any(t["name"].lower() == lower for t in TOPICS) or \
            db.execute("SELECT 1 FROM topics WHERE lower(name) = ?", (lower,)).fetchone():
        raise StoreError(f'"{name}" already exists. Try a different name.')
    if not 5 <= len(clean_subs) <= 12:
        raise StoreError(f"Add between 5 and 12 subtopics. You have {len(clean_subs)}.")
    if any(len(s) > 40 for s in clean_subs):
        raise StoreError("Keep each subtopic under 40 characters.")
    if db.execute("SELECT COUNT(*) FROM topics WHERE owner = ?", (client,)).fetchone()[0] >= MAX_TOPICS_PER_PERSON:
        raise StoreError(f"You can have up to {MAX_TOPICS_PER_PERSON} topics at once. Delete one to add another.")
    if db.execute("SELECT COUNT(*) FROM topics").fetchone()[0] >= MAX_TOPICS:
        raise StoreError("The community topic list is full right now.")
    topic_id = secrets.token_hex(6)
    db.execute("INSERT INTO topics (id, owner, name, blurb, subs, created) VALUES (?, ?, ?, ?, ?, ?)",
               (topic_id, client, name, blurb, json.dumps(clean_subs), now_ms()))
    return get_topic(topic_id, client)


def toggle_topic_vote(client, topic_id):
    r = db.execute("SELECT owner FROM topics WHERE id = ?", (topic_id,)).fetchone()
    if not r:
        raise StoreError("That topic no longer exists.")
    if r["owner"] == client:
        raise StoreError("You can't vote for your own topic.")
    if db.execute("DELETE FROM topic_votes WHERE topic_id = ? AND client = ?", (topic_id, client)).rowcount == 0:
        db.execute("INSERT INTO topic_votes (topic_id, client) VALUES (?, ?)", (topic_id, client))
    return get_topic(topic_id, client)


def remove_topic(client, topic_id, admin=False):
    r = db.execute("SELECT owner FROM topics WHERE id = ?", (topic_id,)).fetchone()
    if not r:
        raise StoreError("That topic no longer exists.")
    if not admin and r["owner"] != client:
        raise StoreError("Only the person who suggested this topic can delete it.")
    with db:
        db.execute("BEGIN")
        db.execute("DELETE FROM topics WHERE id = ?", (topic_id,))
        db.execute("DELETE FROM topic_votes WHERE topic_id = ?", (topic_id,))
        db.execute("DELETE FROM question_reports WHERE question_id IN (SELECT id FROM questions WHERE topic = ?)", ("c:" + topic_id,))
        db.execute("DELETE FROM questions WHERE topic = ?", ("c:" + topic_id,))


# ----- questions -----
def question_counts():
    """{topic key: {"total": n, "subs": {subtopic: n}}} for questions currently in play."""
    out = {}
    for r in db.execute("SELECT topic, sub, COUNT(*) AS n FROM questions WHERE hidden = 0 GROUP BY topic, sub"):
        t = out.setdefault(r["topic"], {"total": 0, "subs": {}})
        t["total"] += r["n"]
        t["subs"][r["sub"]] = t["subs"].get(r["sub"], 0) + r["n"]
    return out


def add_question(client, topic_key, sub, q, answer, wrongs, level):
    topic = find_topic(str(topic_key))
    if not topic:
        raise StoreError("Pick a topic for your question.")
    sub = clean(sub, 40)
    if sub and sub.lower() not in {s.lower() for s in topic["subs"]}:
        raise StoreError("Pick one of this topic's subtopics.")
    sub = next((s for s in topic["subs"] if s.lower() == sub.lower()), "")
    q, answer = clean(q, 200), clean(answer, 80)
    wrongs = [clean(w, 80) for w in (wrongs if isinstance(wrongs, list) else [])][:3]
    if len(q) < 10:
        raise StoreError("Write a question of at least 10 characters.")
    if not answer or len(wrongs) != 3 or not all(wrongs):
        raise StoreError("Fill in the right answer and all three wrong answers.")
    if len({a.lower() for a in [answer, *wrongs]}) != 4:
        raise StoreError("The four answers need to be different from each other.")
    if level not in (1, 2, 3):
        level = 1
    if db.execute("SELECT 1 FROM questions WHERE topic = ? AND lower(q) = ?", (topic["key"], q.lower())).fetchone():
        raise StoreError("That question is already in this topic.")
    qid = secrets.token_hex(6)
    db.execute("INSERT INTO questions (id, owner, topic, sub, q, answer, wrong1, wrong2, wrong3, level, created) "
               "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
               (qid, client, topic["key"], sub, q, answer, *wrongs, level, now_ms()))
    return {"id": qid, "topic": topic["key"], "topicName": topic["name"], "sub": sub, "q": q}


def my_questions(client):
    rows = db.execute("""
      SELECT q.id, q.topic, q.sub, q.q, q.answer, q.hidden, q.created,
        (SELECT COUNT(*) FROM question_reports r WHERE r.question_id = q.id) AS reports
      FROM questions q WHERE q.owner = ? ORDER BY q.created DESC LIMIT 200""", (client,))
    out = []
    for r in rows:
        t = find_topic(r["topic"])
        out.append({"id": r["id"], "topic": r["topic"], "topicName": t["name"] if t else "Deleted topic", "sub": r["sub"],
                    "q": r["q"], "answer": r["answer"], "hidden": bool(r["hidden"]), "reports": r["reports"]})
    return out


def remove_question(client, qid, admin=False):
    r = db.execute("SELECT owner FROM questions WHERE id = ?", (qid,)).fetchone()
    if not r:
        raise StoreError("That question no longer exists.")
    if not admin and r["owner"] != client:
        raise StoreError("Only the person who wrote this question can delete it.")
    with db:
        db.execute("BEGIN")
        db.execute("DELETE FROM questions WHERE id = ?", (qid,))
        db.execute("DELETE FROM question_reports WHERE question_id = ?", (qid,))


def report_question(client, qid):
    r = db.execute("SELECT owner FROM questions WHERE id = ?", (qid,)).fetchone()
    if not r:
        raise StoreError("That question can't be reported.")
    if r["owner"] == client:
        raise StoreError("You can delete your own question from the Community tab instead.")
    db.execute("INSERT OR IGNORE INTO question_reports (question_id, client) VALUES (?, ?)", (qid, client))
    n = db.execute("SELECT COUNT(*) FROM question_reports WHERE question_id = ?", (qid,)).fetchone()[0]
    if n >= HIDE_AT_REPORTS:
        db.execute("UPDATE questions SET hidden = 1 WHERE id = ?", (qid,))


def restore_question(qid):
    """Admin: put a reported question back into games and clear its reports."""
    with db:
        db.execute("BEGIN")
        db.execute("UPDATE questions SET hidden = 0 WHERE id = ?", (qid,))
        db.execute("DELETE FROM question_reports WHERE question_id = ?", (qid,))


def reported_questions():
    """Admin: questions with at least one report, most reported first."""
    rows = db.execute("""
      SELECT q.*, (SELECT COUNT(*) FROM question_reports r WHERE r.question_id = q.id) AS reports
      FROM questions q WHERE reports > 0 ORDER BY reports DESC, q.created DESC LIMIT 500""")
    return [{"id": r["id"], "topic": r["topic"], "sub": r["sub"], "q": r["q"], "answer": r["answer"],
             "wrong": [r["wrong1"], r["wrong2"], r["wrong3"]], "hidden": bool(r["hidden"]), "reports": r["reports"]}
            for r in rows]


def all_questions():
    """Every question in play, from every topic, for building daily games."""
    return db.execute("SELECT id, topic, sub, q, answer, wrong1, wrong2, wrong3, level FROM questions WHERE hidden = 0").fetchall()


def question_by_id(qid):
    return db.execute("SELECT id, topic, sub, q, answer, wrong1, wrong2, wrong3, level, hidden FROM questions WHERE id = ?", (qid,)).fetchone()


# ----- daily games -----
def daily_ids(day):
    r = db.execute("SELECT ids FROM daily WHERE day = ?", (day,)).fetchone()
    return json.loads(r["ids"]) if r else None


def save_daily_ids(day, ids):
    """Freeze a day's question list. If two requests race, the first one saved wins."""
    db.execute("INSERT OR IGNORE INTO daily (day, ids, created) VALUES (?, ?, ?)", (day, json.dumps(ids), now_ms()))
    return daily_ids(day)


def recent_daily_ids(days):
    out = set()
    for d in days:
        out.update(daily_ids(d) or [])
    return out


def save_daily_result(day, client, round_, total):
    """Each browser's first finished game counts for the day's stats."""
    db.execute("INSERT OR IGNORE INTO daily_results (day, client, round, total, created) VALUES (?, ?, ?, ?, ?)",
               (day, client, round_, total, now_ms()))


def daily_stats(day, client=None):
    rows = db.execute("SELECT client, round, total FROM daily_results WHERE day = ?", (day,)).fetchall()
    stats = {"players": len(rows), "avgRound": round(sum(r["round"] for r in rows) / len(rows), 1) if rows else 0,
             "rounds": {}}
    for r in rows:
        stats["rounds"][str(r["round"])] = stats["rounds"].get(str(r["round"]), 0) + 1
    mine = next((r for r in rows if r["client"] == client), None) if client else None
    if mine and len(rows) > 1:
        others = [r for r in rows if r["client"] != client]
        beaten = sum(1 for r in others if (r["round"], r["total"]) < (mine["round"], mine["total"]))
        stats["beat"] = round(100 * beaten / len(others))
    return stats


def topic_questions(topic_key):
    """Every question in play for a topic, for drawing game questions."""
    return db.execute("SELECT id, sub, q, answer, wrong1, wrong2, wrong3, level FROM questions "
                      "WHERE topic = ? AND hidden = 0", (topic_key,)).fetchall()
