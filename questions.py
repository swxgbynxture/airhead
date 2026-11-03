"""Trivia questions: written by Claude when an API key is set, otherwise from the built-in bank."""

import datetime
import logging
import os
import random

import anthropic
from pydantic import BaseModel

from builtin import OFFLINE

log = logging.getLogger("airhead.questions")

MODEL = os.environ.get("AIRHEAD_MODEL", "claude-opus-5-5")
# A ceiling on Claude calls per day so a busy site can't run up an unexpected bill.
DAILY_LIMIT = int(os.environ.get("AIRHEAD_DAILY_AI_LIMIT", "300"))

_client = None
_day = None
_used_today = 0


class Question(BaseModel):
    q: str
    choices: list[str]
    answer: int


class QuestionSet(BaseModel):
    questions: list[Question]


class NoAI(Exception):
    """Claude isn't available: no key, the daily limit is used up, or the call failed."""


def ai_enabled():
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def _get_client():
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic()
    return _client


def _spend_one():
    global _day, _used_today
    today = datetime.date.today()
    if today != _day:
        _day, _used_today = today, 0
    if _used_today >= DAILY_LIMIT:
        return False
    _used_today += 1
    return True


def level_for(round_):
    if round_ <= 3:
        return "easy: most people should know these"
    if round_ <= 7:
        return "medium: someone who likes the subject would know these"
    return "hard: for real experts, but still fair"


def shuffle_choices(q, choices, answer):
    order = random.sample(range(4), 4)
    return {"q": q, "choices": [choices[i] for i in order], "correct": order.index(answer)}


def _valid(q, seen):
    choices = [c.strip() for c in q.choices]
    return (
        q.q.strip()
        and len(q.q) <= 300
        and len(choices) == 4
        and all(choices)
        and all(len(c) <= 80 for c in choices)
        and len({c.lower() for c in choices}) == 4
        and 0 <= q.answer < 4
        and q.q.strip().lower() not in seen
    )


async def generate(topic, sub, round_, avoid, n=16):
    """Ask Claude for n questions. Raises NoAI if it can't."""
    if not ai_enabled() or not _spend_one():
        raise NoAI()
    avoid_list = "\n".join(f"- {a}" for a in avoid[-40:]) or "(none yet)"
    prompt = (
        'You write questions for "Airhead", a family-friendly trivia party game.\n'
        f"Topic: {topic[:40]} > {sub[:60]}\n"
        f'Write {n} multiple-choice questions about "{sub[:60]}". Difficulty: {level_for(round_)}.\n'
        "Rules:\n"
        "- Exactly 4 short answer choices (under 40 characters each) with exactly one correct answer; "
        "`answer` is the index (0-3) of the correct choice.\n"
        "- Use well-established facts only. Avoid anything disputed or likely to have changed recently.\n"
        "- Keep each question under 140 characters and make every question different.\n"
        "- Do not repeat these already-asked questions:\n"
        f"{avoid_list}"
    )
    try:
        resp = await _get_client().messages.parse(
            model=MODEL,
            max_tokens=16000,
            messages=[{"role": "user", "content": prompt}],
            output_format=QuestionSet,
        )
    except anthropic.AuthenticationError:
        log.error("ANTHROPIC_API_KEY was rejected; using the built-in question bank")
        raise NoAI()
    except anthropic.RateLimitError:
        log.warning("Claude rate limit reached; using the built-in question bank")
        raise NoAI()
    except anthropic.APIError as e:
        log.warning("Claude request failed (%s); using the built-in question bank", e)
        raise NoAI()
    if resp.stop_reason == "refusal" or resp.parsed_output is None:
        log.warning("Claude declined or returned no questions for %r / %r", topic, sub)
        raise NoAI()
    seen = {a.strip().lower() for a in avoid}
    out = []
    for q in resp.parsed_output.questions:
        if _valid(q, seen):
            seen.add(q.q.strip().lower())
            out.append(shuffle_choices(q.q.strip(), [c.strip() for c in q.choices], q.answer))
    if not out:
        raise NoAI()
    return out


def from_bank(avoid, n=16):
    used = set(avoid)
    left = [row for row in OFFLINE if row[0] not in used]
    random.shuffle(left)
    return [shuffle_choices(row[0], row[1:], 0) for row in left[:n]]


async def get_questions(topic, sub, round_, avoid, n=16):
    """Returns (questions, source) where source is "claude" or "bank"."""
    try:
        return await generate(topic, sub, round_, avoid, n), "claude"
    except NoAI:
        return from_bank(avoid, n), "bank"
