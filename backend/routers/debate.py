import asyncio
import json
import os
from typing import Any

from exa_py import Exa
from fastapi import APIRouter, Query
from openai import AsyncOpenAI
from sse_starlette.sse import EventSourceResponse

from agents.personas import PERSONAS

router = APIRouter()


def _safe_palm_summary(raw_context: str | None) -> str:
    if not raw_context:
        return "No palm context was supplied."
    try:
        parsed = json.loads(raw_context)
    except json.JSONDecodeError:
        return raw_context[:2000]
    reading = parsed.get("reading", {}) if isinstance(parsed, dict) else {}
    return json.dumps(
        {
            "dominant_element": parsed.get("dominant_element"),
            "destiny_score": parsed.get("destiny_score"),
            "is_cursed": parsed.get("is_cursed"),
            "themes": reading.get("themes", []),
            "strengths": reading.get("strengths", []),
            "cautions": reading.get("cautions", []),
            "destiny_suggestions": reading.get("destiny_suggestions", []),
        },
        ensure_ascii=True,
    )


def _fetch_exa_snippets(idea: str) -> list[dict[str, str]]:
    api_key = os.getenv("EXA_API_KEY")
    if not api_key:
        return [
            {
                "title": "Exa unavailable",
                "highlights": "Set EXA_API_KEY to add live market research snippets.",
            }
        ]

    exa = Exa(api_key=api_key)
    results = exa.search_and_contents(
        f"{idea} market trends research",
        type="neural",
        num_results=3,
        highlights=True,
    )
    snippets: list[dict[str, str]] = []
    for result in getattr(results, "results", [])[:3]:
        highlights = getattr(result, "highlights", None) or []
        snippets.append(
            {
                "title": getattr(result, "title", "Untitled source"),
                "highlights": " ".join(str(item) for item in highlights)[:800],
            }
        )
    return snippets or [{"title": "No Exa matches", "highlights": "No snippets were returned."}]


def _event(payload: dict[str, Any]) -> dict[str, str]:
    return {"data": json.dumps(payload, ensure_ascii=False)}


def _extract_delta(event: Any) -> str:
    event_type = getattr(event, "type", "")
    if event_type == "response.output_text.delta":
        return getattr(event, "delta", "") or ""
    if event_type == "response.refusal.delta":
        return getattr(event, "delta", "") or ""
    return ""


async def _stream_agent(
    client: AsyncOpenAI,
    agent_key: str,
    round_number: int,
    user_prompt: str,
    mood: str,
    queue: asyncio.Queue[dict[str, Any]],
) -> str:
    persona = PERSONAS[agent_key]
    full_text: list[str] = []
    system_prompt = f"{persona['system_prompt']}\n\nMood for this round: {mood}"

    try:
        stream = await client.responses.create(
            model="gpt-5.4-mini",
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            stream=True,
        )
        async for event in stream:
            delta = _extract_delta(event)
            if not delta:
                continue
            full_text.append(delta)
            await queue.put(
                {
                    "agent": agent_key,
                    "round": round_number,
                    "content": delta,
                    "done": False,
                }
            )
    except Exception as exc:
        delta = f"\n[The court mirror cracked: {exc}]"
        full_text.append(delta)
        await queue.put(
            {
                "agent": agent_key,
                "round": round_number,
                "content": delta,
                "done": False,
            }
        )

    await queue.put({"agent": agent_key, "round": round_number, "content": "", "done": True})
    return "".join(full_text)


async def _run_round(
    client: AsyncOpenAI,
    round_number: int,
    prompts_by_agent: dict[str, str],
    mood_by_agent: dict[str, str],
):
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    agent_keys = list(PERSONAS.keys())
    tasks = [
        _stream_agent(
            client=client,
            agent_key=agent_key,
            round_number=round_number,
            user_prompt=prompts_by_agent[agent_key],
            mood=mood_by_agent[agent_key],
            queue=queue,
        )
        for agent_key in agent_keys
    ]

    async def collect_results():
        return await asyncio.gather(*tasks)

    gather_task = asyncio.create_task(collect_results())
    while not gather_task.done() or not queue.empty():
        try:
            payload = await asyncio.wait_for(queue.get(), timeout=0.15)
            yield payload
        except asyncio.TimeoutError:
            continue

    results = await gather_task
    return_payload = {
        agent_key: result
        for agent_key, result in zip(agent_keys, results, strict=False)
    }
    yield {"type": "_round_results", "round": round_number, "results": return_payload}


@router.get("/stream")
async def debate_stream(
    idea: str = Query(..., min_length=2, max_length=2000),
    palm_context: str | None = Query(None),
):
    async def event_generator():
        client = AsyncOpenAI()
        palm_summary = _safe_palm_summary(palm_context)
        try:
            exa_snippets = await asyncio.to_thread(_fetch_exa_snippets, idea)
        except Exception:
            exa_snippets = [{"title": "Exa unavailable", "highlights": "Live research unavailable for this session."}]
        research_block = json.dumps(exa_snippets, ensure_ascii=True, indent=2)

        round_one_prompt = (
            "The founder's idea:\n"
            f"{idea}\n\n"
            "Palm reading context:\n"
            f"{palm_summary}\n\n"
            "Exa market research snippets:\n"
            f"{research_block}\n\n"
            "Give your Round 1 argument in 2-4 punchy paragraphs. Be in character."
        )
        round_one_prompts = {agent_key: round_one_prompt for agent_key in PERSONAS}
        round_one_moods = {
            "ancient_oracle": "ceremonial, pattern-seeking, cryptic",
            "rage_gremlin": "irritated, flaw-hunting, barely contained",
            "hype_prophet": "breathless, radiant, maximalist",
            "skeptic_scholar": "measured, citation-minded, faintly superior",
            "chaos_neutral": "mercurial, amused, unstable",
        }

        round_one_results: dict[str, str] = {}
        async for payload in _run_round(client, 1, round_one_prompts, round_one_moods):
            if payload.get("type") == "_round_results":
                round_one_results = payload["results"]
            else:
                yield _event(payload)

        transcript = "\n\n".join(
            f"{PERSONAS[key]['name']}:\n{content}"
            for key, content in round_one_results.items()
        )
        round_two_prompts = {
            agent_key: (
                "Round 1 transcript:\n"
                f"{transcript}\n\n"
                "Now deliver your Round 2 rebuttal. Escalate your persona, directly "
                "respond to at least two other agents, and end with one concrete "
                "verdict recommendation for the founder."
            )
            for agent_key in PERSONAS
        }
        round_two_moods = {
            "ancient_oracle": "more ominous, more specific, thunder in the temple",
            "rage_gremlin": "unhinged but accurate, louder, more surgical",
            "hype_prophet": "supernova conviction, no brakes, visionary",
            "skeptic_scholar": "cooler, sharper, receipts on the table",
            "chaos_neutral": "openly contradictory, turning reversal into strategy",
        }

        async for payload in _run_round(client, 2, round_two_prompts, round_two_moods):
            if payload.get("type") != "_round_results":
                yield _event(payload)

        yield _event({"type": "complete"})

    return EventSourceResponse(event_generator())
