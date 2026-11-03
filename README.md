# Airhead

A trivia party game for 1 to 8 players. Pick a topic, spin the wheel for subtopics, vote, and play
10 rounds: round 1 needs 1 right answer, round 10 needs 10. Every right answer inflates your
avatar's head until it pops. Three misses in a round and you're out.

- **One device:** pick a topic on the main menu and pass the device around.
- **Online:** choose **Play online**. The host gets a 4-letter code, and friends join from their own
  phones or computers. Everyone answers the same question at the same time.
- **Community topics:** anyone can suggest a topic with 5 to 12 subtopics. At 3 votes it joins the menu.

No accounts. Each browser gets an anonymous id, which is used for community votes and to keep your
seat if you reload in the middle of an online game.

## How it fits together

| File | What it does |
|---|---|
| `server.py` | The web server: serves the site, the topics API, questions, and online games (WebSocket at `/ws`) |
| `game.py` | Runs online games. The server owns each game's state and timers; browsers only send actions |
| `questions.py` | Gets questions from Claude when `ANTHROPIC_API_KEY` is set, otherwise from the built-in bank |
| `store.py` | Saves community topics and votes to `data/community.json` |
| `builtin.py` | The 12 built-in topics, the built-in question bank, and avatar options |
| `static/` | The page: `index.html`, `style.css`, `app.js` |
| `tools/smoke_online.py` | Plays a scripted two-player online game against a running server, for testing |

## Run it on your computer

You need Python 3.11 or newer.

```bash
pip install -r requirements.txt
python server.py
```

Open http://localhost:8000. To try online play, open a second browser (or a private window) and join
with the code.

Without an API key the game uses the built-in question bank (about 70 general knowledge questions).
To have Claude write questions for any topic, set your key first:

```bash
# macOS / Linux
export ANTHROPIC_API_KEY=sk-ant-...
# Windows PowerShell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
```

Get a key at https://platform.claude.com. Never put the key in the page or commit it to Git; it only
belongs in the server's environment.

## Settings (environment variables)

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | not set | Turns on Claude-written questions |
| `AIRHEAD_MODEL` | `claude-opus-5-5` | Which Claude model writes questions. `claude-haiku-5-5` is much cheaper |
| `AIRHEAD_DAILY_AI_LIMIT` | `300` | Most question batches Claude writes per day. After that, the built-in bank is used until tomorrow |
| `AIRHEAD_ADMIN_TOKEN` | not set | Lets you delete any community topic (see below) |
| `AIRHEAD_DATA_DIR` | `./data` | Where community topics are saved |
| `PORT` | `8000` | Port to listen on |

## Costs

Hosting is the only fixed cost. Claude is billed to your API account per use: one batch is about 15
questions, a game usually needs one to a few batches, and players on one device in the same game share
batches. The daily limit above caps the worst case. Check current prices at
https://platform.claude.com/docs/en/about-claude/pricing.

## Put it online (Render)

1. Put this folder in a GitHub repository.
2. On https://render.com choose **New > Blueprint** and pick the repository. `render.yaml` sets up
   the web service and a 1 GB disk for community topics.
3. Paste your `ANTHROPIC_API_KEY` when Render asks for it (or leave it empty to use the built-in bank).
4. When it's live, share the `onrender.com` link, or add your own domain under **Settings > Custom Domains**.

The blueprint uses Render's Starter plan, because the free plan has no disk and goes to sleep when
idle. On the free plan community topics are wiped on every deploy and the first visit after a quiet
spell takes about a minute to wake up. To use it anyway, change `plan: starter` to `plan: free` and
remove the `disk` section and `AIRHEAD_DATA_DIR`.

Any host that runs a long-lived Python process with WebSockets works too (Railway, Fly.io, a VPS):
install `requirements.txt` and run `python server.py`. Serverless hosts (like Vercel functions) won't
work, because online games keep a live connection open.

## Moderating community topics

Anyone can delete topics they suggested. To remove someone else's, use your admin token (Render shows
the generated `AIRHEAD_ADMIN_TOKEN` under the service's **Environment** tab):

```bash
curl -X DELETE https://YOUR-SITE/api/topics/TOPIC_ID -H "X-Admin-Token: YOUR_TOKEN"
```

Topic ids are in `GET /api/topics`.

## Limits worth knowing

- Online games live in the server's memory. Restarting or redeploying the server ends games in progress.
- Votes are one per browser. Someone determined could vote more than once by clearing their browser
  data. Adding sign-in would fix that.
- Run the site as a single server process. Online games aren't shared between processes.
