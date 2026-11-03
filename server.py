"""Airhead web server: the site, the community topics API, questions, and online games."""

import asyncio
import collections
import logging
import os
import re
import time

from aiohttp import WSMsgType, web

import game
import questions
import store
from builtin import TOPICS, clean_avatar

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("airhead")

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(HERE, "static")
ADMIN_TOKEN = os.environ.get("AIRHEAD_ADMIN_TOKEN", "")
CLIENT_RE = re.compile(r"^[A-Za-z0-9_-]{8,40}$")

# Per-address limits on the endpoints that cost money or write data.
_hits = collections.defaultdict(collections.deque)


def limited(request, bucket, max_hits, per_seconds):
    ip = request.headers.get("X-Forwarded-For", request.remote or "?").split(",")[0].strip()
    q = _hits[(bucket, ip)]
    now = time.monotonic()
    while q and now - q[0] > per_seconds:
        q.popleft()
    if len(q) >= max_hits:
        return True
    q.append(now)
    return False


def bad(msg, status=400):
    return web.json_response({"error": msg}, status=status)


async def read_json(request):
    try:
        data = await request.json()
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def client_id(value):
    return value if isinstance(value, str) and CLIENT_RE.match(value) else None


# ----- pages -----
async def index(request):
    return web.FileResponse(os.path.join(STATIC, "index.html"), headers={"Cache-Control": "no-cache"})


async def health(request):
    return web.json_response({"ok": True, "claude": questions.ai_enabled()})


# ----- topics -----
async def get_topics(request):
    client = client_id(request.query.get("client"))
    return web.json_response({
        "builtin": TOPICS, "community": store.listing(client), "needVotes": store.NEED_VOTES,
        "claude": questions.ai_enabled(),
    })


async def add_topic(request):
    if limited(request, "add", 10, 3600):
        return bad("You've suggested a lot of topics recently. Try again later.", 429)
    data = await read_json(request)
    client = client_id(data.get("client"))
    if not client:
        return bad("Reload the page and try again.")
    try:
        t = store.add(client, data.get("name", ""), data.get("blurb", ""), data.get("subs"))
    except store.StoreError as e:
        return bad(str(e))
    return web.json_response(store.public(t, client))


async def vote_topic(request):
    if limited(request, "vote", 60, 600):
        return bad("Too many votes in a short time. Try again in a few minutes.", 429)
    data = await read_json(request)
    client = client_id(data.get("client"))
    if not client:
        return bad("Reload the page and try again.")
    try:
        t = store.toggle_vote(client, request.match_info["id"])
    except store.StoreError as e:
        return bad(str(e))
    return web.json_response(store.public(t, client))


async def delete_topic(request):
    data = await read_json(request)
    client = client_id(data.get("client"))
    admin = bool(ADMIN_TOKEN) and request.headers.get("X-Admin-Token") == ADMIN_TOKEN
    if not client and not admin:
        return bad("Reload the page and try again.")
    try:
        store.remove(client, request.match_info["id"], admin=admin)
    except store.StoreError as e:
        return bad(str(e))
    return web.json_response({"ok": True})


# ----- questions for games on one device -----
async def get_questions(request):
    if limited(request, "questions", 20, 600):
        return bad("Too many question requests. Wait a few minutes and try again.", 429)
    data = await read_json(request)
    topic = str(data.get("topic", ""))[:40]
    sub = str(data.get("sub", ""))[:60]
    round_ = data.get("round") if isinstance(data.get("round"), int) else 1
    avoid = [str(a)[:300] for a in data.get("avoid", []) if isinstance(a, str)][-60:] if isinstance(data.get("avoid"), list) else []
    if not topic or not sub:
        return bad("Missing topic.")
    qs, source = await questions.get_questions(topic, sub, max(1, min(10, round_)), avoid)
    return web.json_response({"questions": qs, "source": source})


# ----- online games -----
async def ws_handler(request):
    ws = web.WebSocketResponse(heartbeat=25, max_msg_size=8192)
    await ws.prepare(request)
    room, seat, me = None, None, {}

    async def send_error(msg):
        await ws.send_json({"t": "error", "msg": msg})

    try:
        async for raw in ws:
            if raw.type != WSMsgType.TEXT:
                continue
            try:
                msg = raw.json()
                assert isinstance(msg, dict)
            except Exception:
                continue
            t = msg.get("t")
            if t == "hello":
                client = client_id(msg.get("client"))
                if not client:
                    await send_error("Reload the page and try again.")
                    continue
                name = " ".join(str(msg.get("name", "")).split())[:14] or "Player"
                me = {"client": client, "name": name, "av": clean_avatar(msg.get("av"))}
            elif t in ("create", "join"):
                if not me:
                    continue
                if room:
                    room.detach(seat, ws)
                    room = None
                if t == "create":
                    if limited(request, "create", 20, 3600):
                        await send_error("Too many games created recently. Try again later.")
                        continue
                    room = game.Room(game.new_code())
                    game.rooms[room.code] = room
                else:
                    code = str(msg.get("code", "")).upper()
                    room = game.rooms.get(code)
                    if not room:
                        await send_error(f"No game found with code {code[:4]}. Check the code with your host.")
                        continue
                seat = room.attach(ws, me["client"], me["name"], me["av"])
            elif t == "leave":
                if room:
                    room.detach(seat, ws)
                    room, seat = None, None
            elif room and not room.dead:
                err = room.act(seat, msg)
                if err:
                    await send_error(err)
    finally:
        if room:
            room.detach(seat, ws)
    return ws


async def on_startup(app):
    app["sweeper"] = asyncio.ensure_future(game.sweep())
    log.info("Questions from %s", f"Claude ({questions.MODEL})" if questions.ai_enabled() else "the built-in bank (no ANTHROPIC_API_KEY set)")


async def on_cleanup(app):
    app["sweeper"].cancel()


def make_app():
    app = web.Application(client_max_size=64 * 1024)
    app.router.add_get("/", index)
    app.router.add_get("/health", health)
    app.router.add_get("/api/topics", get_topics)
    app.router.add_post("/api/topics", add_topic)
    app.router.add_post("/api/topics/{id}/vote", vote_topic)
    app.router.add_delete("/api/topics/{id}", delete_topic)
    app.router.add_post("/api/questions", get_questions)
    app.router.add_get("/ws", ws_handler)
    app.router.add_static("/static", STATIC)
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app


if __name__ == "__main__":
    web.run_app(make_app(), host=os.environ.get("HOST", "0.0.0.0"), port=int(os.environ.get("PORT", "8000")))
