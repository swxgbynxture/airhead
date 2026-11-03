"""Community topics and votes, kept in a JSON file."""

import json
import os
import secrets
import time

from builtin import TOPICS

DATA_DIR = os.environ.get("AIRHEAD_DATA_DIR", os.path.join(os.path.dirname(__file__), "data"))
PATH = os.path.join(DATA_DIR, "community.json")
NEED_VOTES = 3
MAX_PER_PERSON = 6
MAX_TOPICS = 500


class StoreError(Exception):
    pass


def _load():
    try:
        with open(PATH, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data.get("topics"), list) else {"topics": []}
    except (FileNotFoundError, ValueError):
        return {"topics": []}


_data = _load()


def _save():
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(_data, f, ensure_ascii=False)
    os.replace(tmp, PATH)


def votes(t):
    return len([v for v in t["voters"] if v != t["owner"]])


def public(t, client):
    """A topic as a browser may see it: no client ids, just whether this browser owns or voted."""
    return {
        "key": "c:" + t["id"], "id": t["id"], "name": t["name"], "blurb": t["blurb"], "subs": t["subs"],
        "votes": votes(t), "added": votes(t) >= NEED_VOTES, "mine": t["owner"] == client,
        "voted": client in t["voters"], "created": t["created"],
    }


def listing(client):
    return [public(t, client) for t in _data["topics"]]


def find(key):
    """Look up a topic by key: a built-in key or "c:<id>" for a community topic."""
    for t in TOPICS:
        if t["key"] == key:
            return t
    if key.startswith("c:"):
        for t in _data["topics"]:
            if "c:" + t["id"] == key:
                return {"key": key, "name": t["name"], "subs": t["subs"]}
    return None


def add(client, name, blurb, subs):
    name = " ".join(str(name).split())[:40]
    blurb = " ".join(str(blurb or "").split())[:120]
    clean = []
    for s in subs if isinstance(subs, list) else []:
        s = " ".join(str(s).split())
        if s and s.lower() not in {c.lower() for c in clean}:
            clean.append(s)
    if len(name) < 2:
        raise StoreError("Give the topic a name of at least 2 characters.")
    lower = name.lower()
    if any(t["name"].lower() == lower for t in TOPICS) or any(t["name"].lower() == lower for t in _data["topics"]):
        raise StoreError(f'"{name}" already exists. Try a different name.')
    if not 5 <= len(clean) <= 12:
        raise StoreError(f"Add between 5 and 12 subtopics. You have {len(clean)}.")
    if any(len(s) > 40 for s in clean):
        raise StoreError("Keep each subtopic under 40 characters.")
    if sum(1 for t in _data["topics"] if t["owner"] == client) >= MAX_PER_PERSON:
        raise StoreError(f"You can have up to {MAX_PER_PERSON} topics at once. Delete one to add another.")
    if len(_data["topics"]) >= MAX_TOPICS:
        raise StoreError("The community topic list is full right now.")
    t = {"id": secrets.token_hex(6), "owner": client, "name": name, "blurb": blurb, "subs": clean,
         "created": int(time.time() * 1000), "voters": []}
    _data["topics"].append(t)
    _save()
    return t


def toggle_vote(client, topic_id):
    for t in _data["topics"]:
        if t["id"] == topic_id:
            if t["owner"] == client:
                raise StoreError("You can't vote for your own topic.")
            if client in t["voters"]:
                t["voters"].remove(client)
            else:
                t["voters"].append(client)
            _save()
            return t
    raise StoreError("That topic no longer exists.")


def remove(client, topic_id, admin=False):
    for t in _data["topics"]:
        if t["id"] == topic_id:
            if not admin and t["owner"] != client:
                raise StoreError("Only the person who suggested this topic can delete it.")
            _data["topics"].remove(t)
            _save()
            return
    raise StoreError("That topic no longer exists.")
