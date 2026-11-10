"""Airhead web server: the site, community topics and questions, and online games."""

import asyncio
import collections
import datetime
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

# Per-address limits on the endpoints that write data.
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


def is_admin(request):
    return bool(ADMIN_TOKEN) and request.headers.get("X-Admin-Token") == ADMIN_TOKEN


# ----- pages -----
@web.middleware
async def revalidate_static(request, handler):
    """Make browsers check for a newer app.js / style.css instead of reusing an old copy after an update."""
    resp = await handler(request)
    if request.path.startswith("/static/"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


HOST_RE = re.compile(r"^[A-Za-z0-9.-]+(:\d{1,5})?$")


def site_origin(request):
    """This site's address as visitors see it (Render's proxy passes the original https scheme along)."""
    scheme = request.headers.get("X-Forwarded-Proto", request.scheme).split(",")[0].strip()
    host = request.host if HOST_RE.match(request.host or "") else "localhost"
    return f"{'https' if scheme == 'https' else 'http'}://{host}"


async def index(request):
    # Link previews need full addresses for the page and its preview image, so fill in the origin.
    with open(os.path.join(STATIC, "index.html"), encoding="utf-8") as f:
        page = f.read().replace("__ORIGIN__", site_origin(request))
    return web.Response(text=page, content_type="text/html", headers={"Cache-Control": "no-cache"})


async def health(request):
    return web.json_response({"ok": True})


# ----- topics -----
async def get_topics(request):
    client = client_id(request.query.get("client"))
    return web.json_response({
        "builtin": TOPICS, "community": store.list_topics(client), "needVotes": store.NEED_VOTES,
        "counts": store.question_counts(),
    })


async def add_topic(request):
    if limited(request, "add-topic", 10, 3600):
        return bad("You've suggested a lot of topics recently. Try again later.", 429)
    data = await read_json(request)
    client = client_id(data.get("client"))
    if not client:
        return bad("Reload the page and try again.")
    try:
        return web.json_response(store.add_topic(client, data.get("name", ""), data.get("blurb", ""), data.get("subs")))
    except store.StoreError as e:
        return bad(str(e))


async def vote_topic(request):
    if limited(request, "vote", 60, 600):
        return bad("Too many votes in a short time. Try again in a few minutes.", 429)
    data = await read_json(request)
    client = client_id(data.get("client"))
    if not client:
        return bad("Reload the page and try again.")
    try:
        return web.json_response(store.toggle_topic_vote(client, request.match_info["id"]))
    except store.StoreError as e:
        return bad(str(e))


async def delete_topic(request):
    data = await read_json(request)
    client = client_id(data.get("client"))
    if not client and not is_admin(request):
        return bad("Reload the page and try again.")
    try:
        store.remove_topic(client, request.match_info["id"], admin=is_admin(request))
    except store.StoreError as e:
        return bad(str(e))
    return web.json_response({"ok": True})


# ----- questions -----
async def add_question(request):
    if limited(request, "add-question", 40, 3600):
        return bad("You've written a lot of questions in the last hour. Take a break and try again later.", 429)
    data = await read_json(request)
    client = client_id(data.get("client"))
    if not client:
        return bad("Reload the page and try again.")
    level = data.get("level") if isinstance(data.get("level"), int) else 1
    try:
        return web.json_response(store.add_question(client, data.get("topic", ""), data.get("sub", ""), data.get("q", ""),
                                                    data.get("answer", ""), data.get("wrong"), level))
    except store.StoreError as e:
        return bad(str(e))


async def mine(request):
    client = client_id(request.query.get("client"))
    if not client:
        return bad("Reload the page and try again.")
    return web.json_response({"questions": store.my_questions(client)})


async def delete_question(request):
    data = await read_json(request)
    client = client_id(data.get("client"))
    if not client and not is_admin(request):
        return bad("Reload the page and try again.")
    try:
        store.remove_question(client, request.match_info["id"], admin=is_admin(request))
    except store.StoreError as e:
        return bad(str(e))
    return web.json_response({"ok": True})


async def report_question(request):
    if limited(request, "report", 30, 600):
        return bad("Too many reports in a short time. Try again in a few minutes.", 429)
    data = await read_json(request)
    client = client_id(data.get("client"))
    if not client:
        return bad("Reload the page and try again.")
    try:
        store.report_question(client, request.match_info["id"])
    except store.StoreError as e:
        return bad(str(e))
    return web.json_response({"ok": True})


async def draw_questions(request):
    """Questions for a game played on one device."""
    if limited(request, "draw", 60, 600):
        return bad("Too many requests. Wait a few minutes and try again.", 429)
    data = await read_json(request)
    topic = str(data.get("topic", ""))
    if not store.find_topic(topic):
        return bad("That topic no longer exists.")
    round_ = data.get("round") if isinstance(data.get("round"), int) else 1
    avoid = [str(a)[:300] for a in data.get("avoid", []) if isinstance(a, str)][-200:] if isinstance(data.get("avoid"), list) else []
    qs, info = questions.draw(topic, str(data.get("sub", ""))[:40], max(1, min(10, round_)), avoid)
    return web.json_response({"questions": qs, "info": info})


# ----- daily game -----
def daily_day(value):
    """The player's local date. Accept only yesterday, today or tomorrow (UTC) so time zones work
    but nobody can load future daily games."""
    try:
        day = datetime.date.fromisoformat(str(value))
    except ValueError:
        return None
    today = datetime.datetime.now(datetime.timezone.utc).date()
    if abs((day - today).days) > 1 or day < questions.LAUNCH:
        return None
    return day


async def get_daily(request):
    day = daily_day(request.query.get("date"))
    if not day:
        return bad("That daily game isn't available.")
    return web.json_response({"date": day.isoformat(), "number": questions.daily_number(day), "questions": questions.daily(day)})


async def daily_result(request):
    if limited(request, "daily-result", 20, 3600):
        return bad("Too many requests. Try again later.", 429)
    data = await read_json(request)
    client = client_id(data.get("client"))
    day = daily_day(data.get("date"))
    round_, total = data.get("round"), data.get("total")
    if not client or not day or not isinstance(round_, int) or not isinstance(total, int) \
            or not 1 <= round_ <= game.ROUNDS or not 0 <= total <= 55:
        return bad("That result couldn't be saved.")
    store.save_daily_result(day.isoformat(), client, round_, total)
    return web.json_response(store.daily_stats(day.isoformat(), client))


async def daily_stats(request):
    day = daily_day(request.query.get("date"))
    if not day:
        return bad("That daily game isn't available.")
    return web.json_response(store.daily_stats(day.isoformat(), client_id(request.query.get("client"))))


# ----- moderation (needs AIRHEAD_ADMIN_TOKEN) -----
async def admin_reported(request):
    if not is_admin(request):
        return bad("Not allowed.", 403)
    return web.json_response({"questions": store.reported_questions()})


async def admin_restore(request):
    if not is_admin(request):
        return bad("Not allowed.", 403)
    store.restore_question(request.match_info["id"])
    return web.json_response({"ok": True})


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
    log.info("Database at %s", store.DB_PATH)


async def on_cleanup(app):
    app["sweeper"].cancel()


def make_app():
    app = web.Application(client_max_size=64 * 1024, middlewares=[revalidate_static])
    app.router.add_get("/", index)
    app.router.add_get("/health", health)
    app.router.add_get("/api/topics", get_topics)
    app.router.add_post("/api/topics", add_topic)
    app.router.add_post("/api/topics/{id}/vote", vote_topic)
    app.router.add_delete("/api/topics/{id}", delete_topic)
    app.router.add_post("/api/questions", add_question)
    app.router.add_get("/api/questions/mine", mine)
    app.router.add_post("/api/questions/draw", draw_questions)
    app.router.add_post("/api/questions/{id}/report", report_question)
    app.router.add_delete("/api/questions/{id}", delete_question)
    app.router.add_get("/api/daily", get_daily)
    app.router.add_post("/api/daily/result", daily_result)
    app.router.add_get("/api/daily/stats", daily_stats)
    app.router.add_get("/api/admin/reported", admin_reported)
    app.router.add_post("/api/admin/questions/{id}/restore", admin_restore)
    app.router.add_get("/ws", ws_handler)
    app.router.add_static("/static", STATIC)
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app


if __name__ == "__main__":
    web.run_app(make_app(), host=os.environ.get("HOST", "0.0.0.0"), port=int(os.environ.get("PORT", "8000")))
