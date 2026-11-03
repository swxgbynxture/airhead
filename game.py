"""Online games. The server owns every room's state and timers; browsers only send actions."""

import asyncio
import logging
import random
import secrets
import time

import store
from builtin import clean_avatar
from questions import get_questions

log = logging.getLogger("airhead.game")

ROUNDS, STRIKES, QTIME, MAX_PLAYERS = 10, 3, 20, 8
SPIN_MS, REVEAL_S = 4.4, 5.5
CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"
ROOM_IDLE_S = 300

rooms = {}


def new_code():
    while True:
        code = "".join(random.choice(CODE_CHARS) for _ in range(4))
        if code not in rooms:
            return code


class Room:
    def __init__(self, code):
        self.code = code
        self.conns = {}      # seat -> websocket
        self.seats = {}      # client id -> seat id (so a reload keeps your place)
        self.names = {}      # seat -> (name, avatar), spectators included
        self.players = []    # seats in the game
        self.host = None
        self.ph = "lobby"
        self.round = 0
        self.qn = 0
        self.topic = self.sub = self.wheel = self.vote = self.tally = None
        self.q = self.deadline = self.rv = self.end = None
        self.answers = {}
        self.votes = {}
        self.pool, self.asked = [], []
        self.fetching = None
        self.source = None
        self.timers = {}
        self.idle_since = None
        self.dead = False

    # ----- helpers -----
    def player(self, seat):
        return next((p for p in self.players if p["p"] == seat), None)

    def connected_players(self):
        return [p for p in self.players if p["p"] in self.conns]

    def later(self, name, delay, fn):
        self.cancel(name)
        self.timers[name] = asyncio.get_running_loop().call_later(delay, fn)

    def cancel(self, name):
        t = self.timers.pop(name, None)
        if t:
            t.cancel()

    def close(self):
        self.dead = True
        for t in self.timers.values():
            t.cancel()
        self.timers.clear()
        rooms.pop(self.code, None)

    # ----- what each browser sees -----
    def view(self, seat):
        g = {
            "ph": self.ph, "code": self.code, "you": seat, "host": self.host, "isHost": seat == self.host,
            "round": self.round, "sub": self.sub, "source": self.source,
            "topic": {"key": self.topic["key"], "name": self.topic["name"]} if self.topic else None,
            "players": [{**p, "on": p["p"] in self.conns} for p in self.players],
        }
        if self.wheel:
            g["wheel"] = {k: self.wheel[k] for k in ("items", "picks", "spins", "spin", "busy")}
        if self.vote:
            g["vote"] = {"id": self.vote["id"], "opts": self.vote["opts"], "who": list(self.votes.keys()),
                         "mine": self.votes.get(seat)}
        if self.tally:
            g["tally"] = self.tally
        if self.q:
            g["q"] = {"n": self.q["n"], "t": self.q["q"], "c": self.q["choices"],
                      "dl": max(0, int((self.deadline - time.monotonic()) * 1000)) if self.ph == "q" else 0,
                      "got": list(self.answers.keys()), "mine": self.answers.get(seat)}
        if self.rv:
            g["rv"] = self.rv
        if self.end:
            g["end"] = self.end
        return g

    def broadcast(self):
        for seat, ws in list(self.conns.items()):
            asyncio.ensure_future(_send(ws, {"t": "state", "g": self.view(seat)}))

    # ----- people coming and going -----
    def attach(self, ws, client, name, av):
        seat = self.seats.get(client)
        if not seat:
            seat = secrets.token_hex(5)
            self.seats[client] = seat
        old = self.conns.get(seat)
        if old is not None and old is not ws:
            asyncio.ensure_future(old.close())
        self.conns[seat] = ws
        self.names[seat] = (name, av)
        self.idle_since = None
        p = self.player(seat)
        if p:
            p["n"], p["av"] = name, av
        elif self.ph == "lobby" and len(self.players) < MAX_PLAYERS:
            self.players.append(new_player(seat, name, av))
        if self.host is None or self.host not in self.conns:
            self.host = seat if self.player(seat) else self.host
        self.cancel("host")
        self.broadcast()
        return seat

    def detach(self, seat, ws):
        if self.conns.get(seat) is not ws:
            return
        del self.conns[seat]
        if self.ph == "lobby":
            self.players = [p for p in self.players if p["p"] != seat]
        if seat == self.host:
            # Give the host a moment to come back from a reload before handing over.
            self.later("host", 8, self.pass_host)
        if not self.conns:
            self.idle_since = time.monotonic()
        self.check_progress()
        self.broadcast()

    def pass_host(self):
        if self.host in self.conns:
            return
        nxt = next((p["p"] for p in self.players if p["p"] in self.conns), None)
        self.host = nxt
        self.broadcast()

    # ----- actions -----
    def act(self, seat, msg):
        t = msg.get("t")
        is_host = seat == self.host
        if t == "start" and is_host and self.ph == "lobby" and self.players:
            topic = store.find(str(msg.get("topic", "")))
            if not topic:
                return "That topic no longer exists."
            self.topic = topic
            spins = min(3 if len(self.players) <= 2 else 5, len(topic["subs"]))
            self.wheel = {"items": [s[:40] for s in topic["subs"]], "picks": [], "spins": spins, "spin": None, "busy": False}
            self.ph = "wheel"
        elif t == "spin" and is_host and self.ph == "wheel":
            self.spin()
        elif t == "vote" and self.ph == "vote" and self.player(seat):
            i = msg.get("i")
            if isinstance(i, int) and 0 <= i < len(self.vote["opts"]):
                self.votes[seat] = i
                self.check_progress()
        elif t == "count" and is_host and self.ph == "vote" and self.votes:
            self.count_votes()
        elif t == "begin" and is_host and self.ph == "voted":
            asyncio.ensure_future(self.begin())
        elif t == "round" and is_host and self.ph == "ri":
            self.start_round()
        elif t == "answer" and self.ph == "q":
            p, i = self.player(seat), msg.get("i")
            if p and p["s"] == "playing" and msg.get("n") == self.q["n"] and seat not in self.answers \
                    and isinstance(i, int) and 0 <= i < 4:
                self.answers[seat] = i
                self.check_progress()
        elif t == "next" and is_host and self.ph == "rv":
            self.next_question()
            return None
        elif t == "lobby" and is_host and self.ph == "end":
            self.to_lobby()
        else:
            return None
        self.broadcast()
        return None

    def check_progress(self):
        """Move on when everyone still here has voted or answered."""
        if self.ph == "vote":
            here = [p for p in self.connected_players()]
            if here and all(p["p"] in self.votes for p in here):
                self.count_votes()
        elif self.ph == "q":
            here = [p for p in self.connected_players() if p["s"] == "playing"]
            if all(p["p"] in self.answers for p in here):
                self.reveal()

    def spin(self):
        w = self.wheel
        if w["busy"] or len(w["picks"]) >= w["spins"]:
            return
        target = random.randrange(len(w["items"]))
        w["spin"] = {"seq": (w["spin"]["seq"] if w["spin"] else 0) + 1, "t": target, "j": round(random.random() - .5, 3)}
        w["busy"] = True

        def land():
            if self.dead or self.ph != "wheel":
                return
            w["picks"].append(w["items"].pop(target))
            w["busy"] = False
            if len(w["picks"]) >= w["spins"]:
                self.later("vote", 1.6, self.open_vote)
            self.broadcast()
        self.later("spin", SPIN_MS, land)

    def open_vote(self):
        if self.dead or self.ph != "wheel":
            return
        self.ph = "vote"
        self.vote = {"id": secrets.token_hex(4), "opts": self.wheel["picks"]}
        self.votes = {}
        self.wheel = None
        self.broadcast()

    def count_votes(self):
        opts = self.vote["opts"]
        counts = [list(self.votes.values()).count(i) for i in range(len(opts))]
        top = max(counts)
        tied = [i for i, c in enumerate(counts) if c == top]
        self.tally = {"counts": counts, "win": random.choice(tied), "tie": len(tied) > 1}
        self.ph = "voted"

    async def begin(self):
        self.sub = self.vote["opts"][self.tally["win"]]
        self.ph, self.round = "load", 1
        self.pool, self.asked = [], []
        self.broadcast()
        await self.ensure_pool(1)
        if self.dead:
            return
        if not self.pool:
            return self.finish("empty", [])
        for p in self.players:
            p.update(s="playing", c=0, k=0, t=0, r=1)
        self.ph = "ri"
        self.broadcast()
        asyncio.ensure_future(self.ensure_pool(8))

    async def ensure_pool(self, need):
        if len(self.pool) >= need:
            return
        if not self.fetching:
            self.fetching = asyncio.ensure_future(self._refill())
        try:
            await self.fetching
        finally:
            self.fetching = None

    async def _refill(self):
        qs, source = await get_questions(self.topic["name"], self.sub, self.round, self.asked)
        if source == "bank" and self.source == "claude":
            log.info("room %s switched to the built-in question bank", self.code)
        self.source = source if self.source != "bank" else "bank"
        have = {q["q"] for q in self.pool} | set(self.asked)
        self.pool.extend(q for q in qs if q["q"] not in have)

    def start_round(self):
        for p in self.players:
            if p["s"] not in ("elim",):
                p.update(s="playing", c=0, k=0, r=self.round)
        asyncio.ensure_future(self.ask())

    async def ask(self):
        if not self.pool:
            self.ph = "load"
            self.broadcast()
            await self.ensure_pool(1)
            if self.dead:
                return
            if not self.pool:
                return self.finish("empty", [])
        if len(self.pool) < 6:
            asyncio.ensure_future(self.ensure_pool(6))
        q = self.pool.pop(0)
        self.asked.append(q["q"])
        self.qn += 1
        self.q = {**q, "n": self.qn}
        self.answers, self.rv = {}, None
        self.deadline = time.monotonic() + QTIME
        self.ph = "q"
        self.later("q", QTIME + 1, self.reveal)
        self.broadcast()
        self.check_progress()

    def reveal(self):
        if self.dead or self.ph != "q":
            return
        self.cancel("q")
        for p in self.players:
            if p["s"] != "playing":
                continue
            if self.answers.get(p["p"]) == self.q["correct"]:
                p["c"] += 1
                p["t"] += 1
                if p["c"] >= self.round:
                    p["s"] = "passed"
            else:
                p["k"] += 1
                if p["k"] >= STRIKES:
                    p["s"] = "out"
        self.ph = "rv"
        self.rv = {"c": self.q["correct"], "a": dict(self.answers)}
        self.later("rv", REVEAL_S, self.next_question)
        self.broadcast()

    def next_question(self):
        if self.dead or self.ph != "rv":
            return
        self.cancel("rv")
        if any(p["s"] == "playing" for p in self.players):
            asyncio.ensure_future(self.ask())
        else:
            self.end_round()

    def end_round(self):
        in_round = [p for p in self.players if p["s"] in ("passed", "out")]
        passed = [p for p in in_round if p["s"] == "passed"]
        for p in in_round:
            if p["s"] == "out":
                p["s"] = "elim"
        multi = len(self.players) > 1
        if not passed:
            if not multi:
                return self.finish("solo-out", [])
            best = max([p["c"] for p in in_round] or [0])
            return self.finish("all-out", [p for p in in_round if p["c"] == best])
        if self.round >= ROUNDS:
            return self.finish("cleared", passed)
        if multi and len(passed) == 1:
            return self.finish("last", passed)
        self.round += 1
        self.ph = "ri"
        self.broadcast()

    def finish(self, reason, winners):
        self.ph = "end"
        self.end = {"reason": reason, "w": [p["p"] for p in winners]}
        self.q = self.rv = None
        self.broadcast()

    def to_lobby(self):
        for name in list(self.timers):
            self.cancel(name)
        self.ph, self.round = "lobby", 0
        self.topic = self.sub = self.wheel = self.vote = self.tally = self.q = self.rv = self.end = None
        self.pool, self.asked, self.source = [], [], None
        self.players = [new_player(p["p"], p["n"], p["av"]) for p in self.players if p["p"] in self.conns]
        for seat in self.conns:
            if not self.player(seat) and len(self.players) < MAX_PLAYERS:
                name, av = self.names.get(seat, ("Player", clean_avatar(None)))
                self.players.append(new_player(seat, name, av))


def new_player(seat, name, av):
    return {"p": seat, "n": name, "av": av, "s": "playing", "c": 0, "k": 0, "t": 0, "r": 1}


async def _send(ws, data):
    try:
        await ws.send_json(data)
    except Exception:  # the socket closed between broadcast and send
        pass


async def sweep():
    """Close rooms nobody has been connected to for a while."""
    while True:
        await asyncio.sleep(60)
        now = time.monotonic()
        for room in list(rooms.values()):
            if room.idle_since and now - room.idle_since > ROOM_IDLE_S:
                room.close()
