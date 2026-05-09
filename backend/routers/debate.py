import asyncio
import json
import logging
import os
from typing import Any, AsyncIterator

from exa_py import Exa
from fastapi import APIRouter, Query
from openai import AsyncOpenAI
from sse_starlette.sse import EventSourceResponse

from agents.personas import PERSONAS, VOTE_INSTRUCTIONS

router = APIRouter()
logger = logging.getLogger(__name__)

MAX_TURNS = 5
VOTE_EVERY = 3
CONSENSUS_THRESHOLD = 4
VERDICTS = ("GO", "NO_GO", "PIVOT")
AGENT_REPLY_GUIDANCE = (
    "Keep visible replies to 1-2 sentences, 45-70 words max. "
    "Stay in character, make one sharp point, and end with one concrete recommendation."
)
MODERATOR_REPLY_GUIDANCE = (
    "Keep prompt_hint and reason to one short sentence each, under 120 characters."
)
FINAL_REPLY_GUIDANCE = (
    "Keep the final verdict to 2-3 short sentences: decision, rationale, next move."
)
VOTE_REASON_LIMIT = 80

MODERATOR_JSON_SCHEMA = {
    "action": '"speak"|"call_vote"',
    "next_agent": list(PERSONAS.keys()),
    "prompt_hint": "one short sentence telling the selected agent what to address",
    "reason": "one short reason for this moderation choice",
}

VOTE_JSON_SCHEMA = {
    "verdict": '"GO"|"NO_GO"|"PIVOT"',
    "confidence": "0..1",
    "reason": f"<={VOTE_REASON_LIMIT} chars",
}


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


def _response_text(response: Any) -> str:
    direct_text = getattr(response, "output_text", None)
    if direct_text:
        return str(direct_text)

    chunks: list[str] = []
    for output in getattr(response, "output", []) or []:
        for content in getattr(output, "content", []) or []:
            text = getattr(content, "text", None)
            if text:
                chunks.append(str(text))
            elif isinstance(content, dict) and content.get("text"):
                chunks.append(str(content["text"]))
    return "".join(chunks)


def _parse_json_object(raw_text: str) -> dict[str, Any]:
    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        start = raw_text.find("{")
        end = raw_text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        parsed = json.loads(raw_text[start : end + 1])

    if not isinstance(parsed, dict):
        raise ValueError("model returned non-object JSON")
    return parsed


def _round_robin_after(last_speaker: str | None) -> str:
    agent_keys = list(PERSONAS.keys())
    if last_speaker not in agent_keys:
        return agent_keys[0]
    return agent_keys[(agent_keys.index(last_speaker) + 1) % len(agent_keys)]


def _format_transcript(transcript: list[dict[str, Any]]) -> str:
    if not transcript:
        return "No council turns have been spoken yet."
    return "\n\n".join(
        (
            f"Turn {item.get('turn')}: "
            f"{PERSONAS.get(str(item.get('agent')), {}).get('name', item.get('agent'))}\n"
            f"{item.get('text', '')}"
        )
        for item in transcript
    )


async def moderate(
    client: AsyncOpenAI,
    council_context: str,
    transcript: list[dict[str, Any]],
    votes_history: list[dict[str, Any]],
    last_speaker: str | None,
) -> dict[str, str]:
    fallback_agent = _round_robin_after(last_speaker)
    fallback = {
        "action": "speak",
        "next_agent": fallback_agent,
        "prompt_hint": "Address the strongest unresolved risk or upside.",
        "reason": "Round-robin fallback.",
    }

    system_prompt = (
        "You are the off-stage moderator for a five-agent startup council. "
        "Choose who should speak next, or call a vote if the debate is ready. "
        "Never choose the same speaker twice in a row. "
        f"{MODERATOR_REPLY_GUIDANCE} Return only strict JSON "
        f"matching this schema: {json.dumps(MODERATOR_JSON_SCHEMA, ensure_ascii=True)}."
    )
    user_prompt = (
        "Council context:\n"
        f"{council_context}\n\n"
        "Available agents:\n"
        f"{json.dumps(list(PERSONAS.keys()), ensure_ascii=True)}\n\n"
        "Last speaker:\n"
        f"{last_speaker or 'none'}\n\n"
        "Transcript:\n"
        f"{_format_transcript(transcript)}\n\n"
        "Votes history:\n"
        f"{json.dumps(votes_history, ensure_ascii=True)}"
    )

    try:
        response = await client.responses.create(
            model="gpt-5.4-mini",
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        parsed = _parse_json_object(_response_text(response))
    except Exception as exc:
        logger.warning("Moderator output was unparseable; using fallback: %s", exc)
        return fallback

    action = str(parsed.get("action", "")).strip()
    next_agent = str(parsed.get("next_agent", "")).strip()
    if action not in {"speak", "call_vote"} or next_agent not in PERSONAS:
        logger.warning("Moderator output had invalid action or agent; using fallback: %s", parsed)
        return fallback

    if next_agent == last_speaker:
        replacement = _round_robin_after(last_speaker)
        logger.warning(
            "Moderator picked the previous speaker %s; overriding to %s",
            next_agent,
            replacement,
        )
        next_agent = replacement

    return {
        "action": action,
        "next_agent": next_agent,
        "prompt_hint": str(parsed.get("prompt_hint") or fallback["prompt_hint"])[:120],
        "reason": str(parsed.get("reason") or "Moderator selected the next move.")[:120],
    }


async def stream_agent_turn(
    client: AsyncOpenAI,
    agent_key: str,
    turn: int,
    council_context: str,
    transcript: list[dict[str, Any]],
    hint: str,
) -> AsyncIterator[dict[str, Any]]:
    persona = PERSONAS[agent_key]
    system_prompt = (
        f"{persona['system_prompt']}\n\n"
        "You are speaking in a sequential council debate. Directly build on the "
        f"shared transcript. {AGENT_REPLY_GUIDANCE}"
    )
    user_prompt = (
        "Council context:\n"
        f"{council_context}\n\n"
        "Transcript so far:\n"
        f"{_format_transcript(transcript)}\n\n"
        "Moderator hint:\n"
        f"{hint}"
    )

    yield {"type": "turn_start", "agent": agent_key, "turn": turn}
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
            if delta:
                yield {"type": "delta", "agent": agent_key, "turn": turn, "content": delta}
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        yield {
            "type": "delta",
            "agent": agent_key,
            "turn": turn,
            "content": f"\n[The court mirror cracked: {exc}]",
        }
    yield {"type": "turn_end", "agent": agent_key, "turn": turn}


def _default_vote(agent_key: str) -> dict[str, Any]:
    return {
        "agent": agent_key,
        "verdict": "PIVOT",
        "confidence": 0.0,
        "reason": "vote unparseable",
    }


async def _collect_vote(
    client: AsyncOpenAI,
    agent_key: str,
    council_context: str,
    transcript: list[dict[str, Any]],
) -> dict[str, Any]:
    persona = PERSONAS[agent_key]
    system_prompt = (
        f"{persona['system_prompt']}\n\n"
        "You are now voting as a council member. "
        f"Keep the reason under {VOTE_REASON_LIMIT} characters. "
        f"{VOTE_INSTRUCTIONS}"
    )
    user_prompt = (
        "Council context:\n"
        f"{council_context}\n\n"
        "Transcript:\n"
        f"{_format_transcript(transcript)}\n\n"
        "Vote now. Return only JSON matching this schema:\n"
        f"{json.dumps(VOTE_JSON_SCHEMA, ensure_ascii=True)}"
    )

    try:
        response = await client.responses.create(
            model="gpt-5.4-mini",
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        parsed = _parse_json_object(_response_text(response))
        verdict = str(parsed.get("verdict", "")).strip()
        if verdict not in VERDICTS:
            raise ValueError(f"invalid verdict: {verdict}")
        confidence = float(parsed.get("confidence", 0.0))
        confidence = max(0.0, min(1.0, confidence))
        reason = str(parsed.get("reason", ""))[:VOTE_REASON_LIMIT] or "no reason supplied"
        return {
            "agent": agent_key,
            "verdict": verdict,
            "confidence": confidence,
            "reason": reason,
        }
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.warning("Vote output for %s was unparseable; using fallback: %s", agent_key, exc)
        return _default_vote(agent_key)


async def collect_votes(
    client: AsyncOpenAI,
    council_context: str,
    transcript: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    tasks = [
        asyncio.create_task(_collect_vote(client, agent_key, council_context, transcript))
        for agent_key in PERSONAS.keys()
    ]
    try:
        return await asyncio.gather(*tasks)
    except asyncio.CancelledError:
        for task in tasks:
            if isinstance(task, asyncio.Task):
                task.cancel()
        raise


def supermajority(votes: list[dict[str, Any]]) -> tuple[dict[str, int], str | None, bool]:
    tally = {verdict: 0 for verdict in VERDICTS}
    for vote in votes:
        verdict = vote.get("verdict")
        if verdict in tally:
            tally[verdict] += 1

    max_votes = max(tally.values())
    leaders = [verdict for verdict, count in tally.items() if count == max_votes]
    if len(leaders) != 1:
        return tally, None, False

    leader = leaders[0]
    return tally, leader, tally[leader] >= CONSENSUS_THRESHOLD


async def synthesize_verdict(
    client: AsyncOpenAI,
    council_context: str,
    transcript: list[dict[str, Any]],
    votes_history: list[dict[str, Any]],
) -> AsyncIterator[dict[str, Any]]:
    system_prompt = (
        "You are the final court scribe. Synthesize the debate into a concise "
        f"founder-facing verdict with the decision, rationale, and next move. {FINAL_REPLY_GUIDANCE}"
    )
    user_prompt = (
        "Council context:\n"
        f"{council_context}\n\n"
        "Transcript:\n"
        f"{_format_transcript(transcript)}\n\n"
        "Votes history:\n"
        f"{json.dumps(votes_history, ensure_ascii=True)}"
    )

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
            if delta:
                yield {"type": "final_delta", "content": delta}
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        yield {"type": "final_delta", "content": f"Final verdict synthesis failed: {exc}"}


@router.get("/council")
async def debate_council(
    idea: str = Query(..., min_length=2, max_length=2000),
    palm_context: str | None = Query(None),
):
    async def event_generator():
        try:
            client = AsyncOpenAI()
            palm_summary = _safe_palm_summary(palm_context)
            try:
                exa_snippets = await asyncio.to_thread(_fetch_exa_snippets, idea)
            except Exception:
                exa_snippets = [
                    {
                        "title": "Exa unavailable",
                        "highlights": "Live research unavailable for this session.",
                    }
                ]

            council_context = (
                "The founder's idea:\n"
                f"{idea}\n\n"
                "Palm reading context:\n"
                f"{palm_summary}\n\n"
                "Exa market research snippets:\n"
                f"{json.dumps(exa_snippets, ensure_ascii=True, indent=2)}"
            )

            transcript: list[dict[str, Any]] = []
            votes_history: list[dict[str, Any]] = []
            turn = 0
            vote_round = 0
            last_vote_turn: int | None = None
            last_speaker: str | None = None

            while turn < MAX_TURNS:
                decision = await moderate(
                    client=client,
                    council_context=council_context,
                    transcript=transcript,
                    votes_history=votes_history,
                    last_speaker=last_speaker,
                )
                yield _event(
                    {
                        "type": "moderator",
                        "speaker": decision["next_agent"],
                        "hint": decision["prompt_hint"],
                        "reason": decision["reason"],
                        "turn": turn,
                    }
                )

                should_vote = (
                    last_vote_turn != turn
                    and (
                        decision["action"] == "call_vote"
                        or (turn > 0 and turn % VOTE_EVERY == 0)
                    )
                )
                if should_vote:
                    vote_round += 1
                    last_vote_turn = turn
                    yield _event({"type": "vote_open", "round": vote_round})
                    votes = await collect_votes(client, council_context, transcript)
                    for vote in votes:
                        yield _event(
                            {
                                "type": "vote_cast",
                                "agent": vote["agent"],
                                "verdict": vote["verdict"],
                                "confidence": vote["confidence"],
                                "reason": vote["reason"],
                                "round": vote_round,
                            }
                        )

                    tally, leader, reached_consensus = supermajority(votes)
                    votes_history.append(
                        {
                            "round": vote_round,
                            "votes": votes,
                            "tally": tally,
                            "leader": leader,
                            "reached_consensus": reached_consensus,
                        }
                    )
                    yield _event(
                        {
                            "type": "vote_result",
                            "round": vote_round,
                            "tally": tally,
                            "leader": leader,
                            "reached_consensus": reached_consensus,
                        }
                    )
                    if reached_consensus:
                        yield _event({"type": "consensus", "verdict": leader, "round": vote_round})
                        break
                    continue

                agent_key = decision["next_agent"]
                turn_text: list[str] = []
                async for payload in stream_agent_turn(
                    client=client,
                    agent_key=agent_key,
                    turn=turn,
                    council_context=council_context,
                    transcript=transcript,
                    hint=decision["prompt_hint"],
                ):
                    if payload.get("type") == "delta":
                        turn_text.append(str(payload.get("content", "")))
                    yield _event(payload)

                transcript.append(
                    {
                        "agent": agent_key,
                        "turn": turn,
                        "text": "".join(turn_text),
                    }
                )
                last_speaker = agent_key
                turn += 1
                await asyncio.sleep(1.5)

            final_text: list[str] = []
            async for payload in synthesize_verdict(
                client=client,
                council_context=council_context,
                transcript=transcript,
                votes_history=votes_history,
            ):
                final_text.append(str(payload.get("content", "")))
                yield _event(payload)

            yield _event({"type": "complete", "final_verdict": "".join(final_text)})
        except asyncio.CancelledError:
            logger.info("Council debate stream cancelled by client.")
            raise
        except Exception as exc:
            logger.exception("Council debate stream failed")
            yield _event({"type": "error", "message": str(exc)})

    return EventSourceResponse(event_generator())


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
            f"Give your Round 1 argument. {AGENT_REPLY_GUIDANCE}"
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
                "Now deliver your Round 2 rebuttal. Directly respond to one other "
                f"agent and give a verdict recommendation. {AGENT_REPLY_GUIDANCE}"
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
