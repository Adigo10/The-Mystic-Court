import json
import re

from fastapi import APIRouter, HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from routers.image_gen import generate_image_gemini

router = APIRouter()


class VerdictRequest(BaseModel):
    idea: str = Field(..., min_length=2, max_length=4000)
    palm_reading: dict
    debate_transcript: str = Field(..., min_length=10)


VERDICT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "verdict_text": {"type": "string"},
        "winning_agent": {"type": "string"},
        "destiny_alignment": {"type": "integer", "minimum": 0, "maximum": 100},
        "final_prophecy": {"type": "string"},
    },
    "required": ["verdict_text", "winning_agent", "destiny_alignment", "final_prophecy"],
}


def _extract_verdict_label(*texts: str) -> str:
    patterns = (
        ("NO_GO", r"(?<![\w-])NO[\s_-]?GO(?![\w-])"),
        ("PIVOT", r"(?<![\w-])PIVOT(?![\w-])"),
        ("GO", r"(?<![\w-])GO(?![\w-])"),
    )
    for text in texts:
        for label, pattern in patterns:
            if re.search(pattern, text, flags=re.IGNORECASE):
                return label
    return "PIVOT"


@router.post("")
async def create_verdict(payload: VerdictRequest):
    client = AsyncOpenAI()
    prompt = (
        "You are the final judge of The Mystic Court, an entertainment-first AI "
        "startup idea tribunal. Synthesize the palm reading and agent debate into "
        "a decisive, witty verdict. If the debate transcript includes a section "
        "named 'Council Streamed Final Verdict', treat it as binding and do not "
        "contradict its recommendation. Do not claim certainty about fate or "
        "guarantee business outcomes. Treat the palm reading as entertainment "
        "flavor only; do not let cursed status or destiny scores decide the "
        "business outcome. Use PIVOT only when the idea has promise but needs a "
        "material change to target customer, value proposition, distribution, or "
        "business model; do not use it as a compromise or uncertainty bucket. "
        "Start verdict_text with exactly one label: GO:, NO_GO:, or PIVOT:. "
        "Keep verdict_text to 2 short sentences and "
        "final_prophecy to 1 short sentence.\n\n"
        f"Founder idea:\n{payload.idea}\n\n"
        f"Palm reading JSON:\n{json.dumps(payload.palm_reading, ensure_ascii=True)}\n\n"
        f"Debate transcript:\n{payload.debate_transcript}\n\n"
        "Return only JSON matching the schema."
    )

    try:
        response = await client.responses.create(
            model="gpt-5.5",
            input=[{"role": "user", "content": prompt}],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "mystic_court_verdict",
                    "schema": VERDICT_SCHEMA,
                    "strict": True,
                }
            },
        )
        verdict = json.loads(response.output_text)
        verdict["destiny_alignment"] = max(0, min(100, int(verdict["destiny_alignment"])))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Verdict generation failed: {exc}") from exc

    verdict_label = _extract_verdict_label(
        verdict["verdict_text"],
        payload.debate_transcript,
    )
    card_prompt = (
        "Vertical 9:16 Verdict Constellation Card for a mystical startup tribunal. "
        "Create a court-like tarot card scene in a ceremonial judgment chamber, "
        "framed by aged vellum parchment, ornate arcane borderwork, gold ink filigree, "
        "and deep magenta-indigo shadows. At the exact center, place a glowing verdict "
        f"seal engraved with the exact label '{verdict_label}'. Around the seal, arrange "
        "five distinct agent sigils as a constellation ring, connected by fine celestial "
        "geometry and tiny stars. Put balanced scales of judgment behind the seal, with "
        "legal parchment bands and star-map markings that make the image feel like the "
        "official result of a debate. Include the exact title 'THE MYSTIC COURT' at the "
        f"top and a short verdict headline inspired by {verdict['winning_agent']}. "
        "Elegant, symmetrical, premium, legible, vertical composition. Negative guidance: "
        "no hands, no palms, no fingers, no arms, no body parts, no anatomy, no palmistry "
        "diagram, no hand silhouettes."
    )

    oracle_card_url = await generate_image_gemini(card_prompt, aspect_ratio="9:16")
    return {"verdict": verdict, "oracle_card_url": oracle_card_url}
