"""Plays a two-player online game against a running server: python tools/smoke_online.py [http://127.0.0.1:8000]
Add a game code as a second argument to join that game as one scripted guest instead."""

import asyncio
import os
import random
import sys

import aiohttp

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
PLAYERS = int(os.environ.get("PLAYERS", "2"))  # how many scripted players in the full test
AV = {"skin": "#F9D9B8", "hair": "short", "hairColor": "#2A1A10", "eyes": "dots", "mouth": "smile", "hat": "none", "shirt": "#FF4F6D"}


async def player(session, client, name, code_box, log, host):
    ws = await session.ws_connect(BASE.replace("http", "ws") + "/ws")
    await ws.send_json({"t": "hello", "client": client, "name": name, "av": AV})
    if host:
        await ws.send_json({"t": "create"})
    else:
        while not code_box:
            await asyncio.sleep(.1)
        await ws.send_json({"t": "join", "code": code_box[0]})
    seen, tried = set(), set()
    async for msg in ws:
        m = msg.json()
        if m["t"] == "error":
            log.append(f"{name} error: {m['msg']}")
            continue
        g = m["g"]
        if host and not code_box:
            code_box.append(g["code"])
        key = (g["ph"], g.get("round"), (g.get("q") or {}).get("n"), len((g.get("wheel") or {}).get("picks", [])))
        if key not in seen:
            seen.add(key)
            log.append(f"{name}: {g['ph']} round={g['round']} players={len(g['players'])} host={g['isHost']}")
        if g["ph"] == "lobby" and g["isHost"] and len(g["players"]) == PLAYERS:
            await ws.send_json({"t": "start", "topic": "science"})
        elif g["ph"] == "wheel" and g["isHost"] and not g["wheel"]["busy"] and len(g["wheel"]["picks"]) < g["wheel"]["spins"]:
            await ws.send_json({"t": "spin"})
        elif g["ph"] == "vote" and g["vote"]["mine"] is None:
            await ws.send_json({"t": "vote", "i": 0})
        elif g["ph"] == "voted" and g["isHost"]:
            await ws.send_json({"t": "begin"})
        elif g["ph"] == "ri":
            me = next((p for p in g["players"] if p["p"] == g["you"]), None)
            names = {p["p"]: p["n"] for p in g["players"]}
            if g.get("news") and ("news", g["round"]) not in tried:
                tried.add(("news", g["round"]))
                n = g["news"]
                log.append(f"{name}: news R{g['round'] - 1} first={names.get(n['first'])} back={[names[s] for s in n['back']]} "
                           f"wrong={[names[s] for s in n['wrong']]} out={[names[s] for s in n['out']]}")
            if me and me["betting"] and not me["bet"]:
                pick = random.choice([p for p in g["players"] if p["s"] != "elim"])
                await ws.send_json({"t": "bet", "p": pick["p"]})
                log.append(f"{name}: bets on {pick['n']} for R{g['round']}")
            elif g["isHost"] and not any(p["betting"] and not p["bet"] for p in g["players"]) and ("start", g["round"]) not in tried:
                tried.add(("start", g["round"]))
                await ws.send_json({"t": "round"})
        elif g["ph"] == "q" and g["q"]["mine"] is None:
            me = next((p for p in g["players"] if p["p"] == g["you"]), None)
            if me and me["s"] == "playing" and (g["q"]["n"], g["q"]["attempt"]) not in tried:
                tried.add((g["q"]["n"], g["q"]["attempt"]))
                await asyncio.sleep(random.random() * .5)  # both players race
                left = [i for i in range(4) if i not in g["q"]["gone"]]
                await ws.send_json({"t": "answer", "n": g["q"]["n"], "i": random.choice(left)})
                log.append(f"{name}: answered q{g['q']['n']} try {g['q']['attempt']}")
        elif g["ph"] == "rv" and (g["q"]["n"], "rv") not in tried:
            tried.add((g["q"]["n"], "rv"))
            w = next((p["n"] for p in g["players"] if p["p"] == g["rv"]["winner"]), "nobody")
            log.append(f"{name}: q{g['q']['n']} won by {w}")
            if g["isHost"]:
                await asyncio.sleep(.2)
                await ws.send_json({"t": "next"})
        elif g["ph"] == "end":
            log.append(f"{name}: END reason={g['end']['reason']} winners={len(g['end']['w'])}")
            await ws.close()
            return g


async def main():
    log, code = [], []
    if len(sys.argv) > 2:
        async with aiohttp.ClientSession() as s:
            await asyncio.wait_for(player(s, "guestclient02", "Scripty", [sys.argv[2]], log, False), 600)
        print("\n".join(log))
        return
    async with aiohttp.ClientSession() as s:
        results = await asyncio.wait_for(asyncio.gather(
            player(s, "hostclient001", "Hosty", code, log, True),
            *[player(s, f"guestclient{i:02d}", f"Guest{i}", code, log, False) for i in range(1, PLAYERS)]), 600)
    print("\n".join(log))
    print("both finished:", all(results))


asyncio.run(main())
