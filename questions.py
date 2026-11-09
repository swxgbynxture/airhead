"""Picks questions for a game from the community's questions, falling back to the built-in bank.

Order of preference: questions written for the subtopic being played, then other questions in the
same topic, then the built-in general knowledge bank. Within each group, questions whose difficulty
matches the current round come first, so games get harder as they go."""

import datetime
import os
import random

import store
from builtin import OFFLINE

# Daily games: the first day is daily game #1.
LAUNCH = datetime.date.fromisoformat(os.environ.get("AIRHEAD_LAUNCH_DATE", "2026-11-01"))
DAILY_SIZE = 80          # enough to clear all 10 rounds (55 right) with two misses a round
DAILY_FRESH_DAYS = 7     # avoid questions used in the past week's daily games when there are enough others


def target_level(round_):
    return 1 if round_ <= 3 else 2 if round_ <= 7 else 3


def shuffle_choices(qid, q, answer, wrongs):
    choices = [answer, *wrongs]
    order = random.sample(range(4), 4)
    return {"id": qid, "q": q, "choices": [choices[i] for i in order], "correct": order.index(0)}


def _by_level(rows, level):
    rows = list(rows)
    random.shuffle(rows)
    return sorted(rows, key=lambda r: abs(r["level"] - level))


def draw(topic_key, sub, round_, avoid, n=20):
    """Returns (questions, info). info says how many came from the subtopic, the topic and the bank."""
    avoid = set(avoid)
    level = target_level(round_)
    rows = [r for r in store.topic_questions(topic_key) if r["q"] not in avoid]
    sub_l = (sub or "").lower()
    for_sub = _by_level([r for r in rows if r["sub"].lower() == sub_l], level)
    for_topic = _by_level([r for r in rows if r["sub"].lower() != sub_l], level)
    out, info = [], {"sub": 0, "topic": 0, "bank": 0}
    for group, name in ((for_sub, "sub"), (for_topic, "topic")):
        for r in group:
            if len(out) >= n:
                break
            out.append(shuffle_choices(r["id"], r["q"], r["answer"], [r["wrong1"], r["wrong2"], r["wrong3"]]))
            info[name] += 1
    if len(out) < n:
        bank = [(i, row) for i, row in enumerate(OFFLINE) if row[0] not in avoid]
        random.shuffle(bank)
        for i, row in bank[:n - len(out)]:
            out.append(shuffle_choices(f"b{i}", row[0], row[1], row[2:]))
            info["bank"] += 1
    info["available"] = len(for_sub)
    return out, info


# ----- daily game -----
def daily_number(day):
    return (day - LAUNCH).days + 1


def _bank_entry(i):
    row = OFFLINE[i]
    return {"q": row[0], "answer": row[1], "wrong": row[2:], "topic": "General knowledge", "sub": "", "level": 1}


def _community_entry(r):
    t = store.find_topic(r["topic"])
    return {"q": r["q"], "answer": r["answer"], "wrong": [r["wrong1"], r["wrong2"], r["wrong3"]],
            "topic": t["name"] if t else "Community", "sub": r["sub"], "level": r["level"]}


def _pick_daily_ids(day):
    """Choose a day's questions from every topic: fresh ones first, easy ones early."""
    rng = random.Random(f"airhead-daily-{day.isoformat()}")
    recent = store.recent_daily_ids((day - datetime.timedelta(days=d)).isoformat() for d in range(1, DAILY_FRESH_DAYS + 1))
    pool = [(r["id"], r["level"]) for r in store.all_questions()] + [(f"b{i}", 1) for i in range(len(OFFLINE))]
    rng.shuffle(pool)
    fresh = [p for p in pool if p[0] not in recent]
    stale = [p for p in pool if p[0] in recent]
    chosen = (fresh + stale)[:DAILY_SIZE]
    chosen.sort(key=lambda p: p[1])  # stable: keeps the shuffle within each difficulty
    return [p[0] for p in chosen]


def daily(day):
    """The day's questions, the same for everyone, with answers in a fixed order."""
    key = day.isoformat()
    ids = store.daily_ids(key) or store.save_daily_ids(key, _pick_daily_ids(day))
    out = []
    for qid in ids:
        if qid.startswith("b"):
            i = int(qid[1:])
            if i >= len(OFFLINE):
                continue
            e = _bank_entry(i)
        else:
            r = store.question_by_id(qid)
            if not r or r["hidden"]:
                continue  # deleted or reported out since the day's list was made
            e = _community_entry(r)
        rng = random.Random(f"{key}-{qid}")
        choices = [e["answer"], *e["wrong"]]
        order = rng.sample(range(4), 4)
        out.append({"id": qid, "q": e["q"], "choices": [choices[i] for i in order], "correct": order.index(0),
                    "topic": e["topic"], "sub": e["sub"]})
    return out
