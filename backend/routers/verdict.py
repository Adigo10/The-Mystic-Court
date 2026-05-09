import json

from fastapi import APIRouter, HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

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


def _image_result_to_url(image_result) -> str:
    item = image_result.data[0]
    url = getattr(item, "url", None)
    if url:
        return url
    b64_json = getattr(item, "b64_json", None)
    if b64_json:
        return f"data:image/png;base64,{b64_json}"
    raise HTTPException(status_code=502, detail="Image model returned no usable image data.")


@router.post("")
async def create_verdict(payload: VerdictRequest):
    client = AsyncOpenAI()
    prompt = (
        "You are the final judge of The Mystic Court, an entertainment-first AI "
        "startup idea tribunal. Synthesize the palm reading and agent debate into "
        "a decisive, witty verdict. Do not claim certainty about fate or guarantee "
        "business outcomes.\n\n"
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
        "Vertical 1024x1792 mystical oracle card. Vellum parchment aesthetic, vivid "
        "tarot-inspired border, palm lines glowing under gold ink annotations, "
        "small arcane glyphs, refined dark-magenta shadows, dramatic headline based "
        f"on this agent verdict: {verdict['winning_agent']}. Include the exact title "
        "'THE MYSTIC COURT' and a short verdict headline. Elegant, legible, premium."
    )

    try:
        image = await client.images.generate(
            model="gpt-image-2-2026-04-21",
            prompt=card_prompt,
            size="1024x1792",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Oracle card generation failed: {exc}") from exc

    return {"verdict": verdict, "oracle_card_url": _image_result_to_url(image)}
