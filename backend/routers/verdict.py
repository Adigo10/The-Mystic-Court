import json

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



@router.post("")
async def create_verdict(payload: VerdictRequest):
    client = AsyncOpenAI()
    prompt = (
        "You are the final judge of The Mystic Court, an entertainment-first AI "
        "startup idea tribunal. Synthesize the palm reading and agent debate into "
        "a decisive, witty verdict. Do not claim certainty about fate or guarantee "
        "business outcomes. Keep verdict_text to 2 short sentences and "
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

    card_prompt = (
        "Vertical portrait mystical oracle card. Vellum parchment aesthetic, vivid "
        "tarot-inspired border, palm lines glowing under gold ink annotations, "
        "small arcane glyphs, refined dark-magenta shadows, dramatic headline based "
        f"on this agent verdict: {verdict['winning_agent']}. Include the exact title "
        "'THE MYSTIC COURT' and a short verdict headline. Elegant, legible, premium."
    )

    oracle_card_url = await generate_image_gemini(card_prompt, aspect_ratio="9:16")
    return {"verdict": verdict, "oracle_card_url": oracle_card_url}
