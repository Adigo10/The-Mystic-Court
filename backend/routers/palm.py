import json
import random
from typing import Literal

from fastapi import APIRouter, HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

router = APIRouter()


class PalmReadRequest(BaseModel):
    image_base64: str = Field(..., min_length=20)


class PalmImageRequest(BaseModel):
    palm_summary: str = Field(..., min_length=3, max_length=4000)


PALM_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "image_quality": {"type": "string", "enum": ["good", "poor"]},
        "dominant_element": {"type": "string", "enum": ["fire", "water", "earth", "air"]},
        "landmarks": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "name": {"type": "string"},
                    "visibility": {"type": "string"},
                    "description": {"type": "string"},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "required": ["name", "visibility", "description", "confidence"],
            },
        },
        "reading": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "tone": {"type": "string"},
                "themes": {"type": "array", "items": {"type": "string"}},
                "strengths": {"type": "array", "items": {"type": "string"}},
                "cautions": {"type": "array", "items": {"type": "string"}},
                "destiny_suggestions": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["tone", "themes", "strengths", "cautions", "destiny_suggestions"],
        },
        "is_cursed": {"type": "boolean"},
        "destiny_score": {"type": "integer", "minimum": 0, "maximum": 100},
        "safety_disclaimer": {"type": "string"},
    },
    "required": [
        "image_quality",
        "dominant_element",
        "landmarks",
        "reading",
        "is_cursed",
        "destiny_score",
        "safety_disclaimer",
    ],
}


def _strip_data_url(image_base64: str) -> str:
    if "," in image_base64 and image_base64.lstrip().startswith("data:"):
        return image_base64.split(",", 1)[1]
    return image_base64


def _get_mime_type(image_base64: str) -> str:
    if image_base64.lstrip().startswith("data:") and ";" in image_base64:
        return image_base64.split(";", 1)[0].split(":", 1)[1]
    return "image/jpeg"


def _image_result_to_url(image_result) -> str:
    item = image_result.data[0]
    url = getattr(item, "url", None)
    if url:
        return url
    b64_json = getattr(item, "b64_json", None)
    if b64_json:
        return f"data:image/png;base64,{b64_json}"
    raise HTTPException(status_code=502, detail="Image model returned no usable image data.")


@router.post("/read")
async def read_palm(payload: PalmReadRequest):
    client = AsyncOpenAI()
    mime_type = _get_mime_type(payload.image_base64)
    image_base64 = _strip_data_url(payload.image_base64)
    image_url = f"data:{mime_type};base64,{image_base64}"

    prompt = (
        "Analyze this uploaded palm photo as a playful mystical reading for an AI "
        "startup ideation app. Do not provide medical, biometric identity, or life "
        "certainty claims. If the image is hard to read, mark image_quality as poor "
        "and keep confidence low. Return only JSON matching the schema."
    )

    try:
        response = await client.responses.create(
            model="gpt-5.5",
            input=[
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {"type": "input_image", "image_url": image_url, "detail": "high"},
                    ],
                }
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "palm_reading",
                    "schema": PALM_SCHEMA,
                    "strict": True,
                }
            },
        )
        data = json.loads(response.output_text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Palm reading failed: {exc}") from exc

    data["is_cursed"] = random.random() < 0.10
    data["destiny_score"] = max(0, min(100, int(data.get("destiny_score", 50))))
    data["safety_disclaimer"] = (
        data.get("safety_disclaimer")
        or "For entertainment only. This palm reading is not medical, financial, legal, or life advice."
    )
    return data


@router.post("/image")
async def generate_palm_image(payload: PalmImageRequest):
    client = AsyncOpenAI()
    prompt = (
        "Create a mystical palm map visual inspired by a readable hand diagram. "
        "Show luminous palm lines, elemental glyphs, tiny gold annotations, smoky "
        "violet shadows, and a refined oracle-table aesthetic. Base the symbolism "
        f"on this palm summary: {payload.palm_summary}"
    )

    try:
        image = await client.images.generate(
            model="gpt-image-2-2026-04-21",
            prompt=prompt,
            size="1024x1024",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Palm image generation failed: {exc}") from exc

    return {"image_url": _image_result_to_url(image)}
