import os

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

router = APIRouter()

# Each agent gets a distinct ElevenLabs voice personality
VOICE_MAP: dict[str, str] = {
    "ancient_oracle": "21m00Tcm4TlvDq8ikWAM",  # Rachel – calm, eloquent
    "rage_gremlin": "AZnzlk1XvdvUeBnXmlld",    # Domi – strong, intense
    "hype_prophet": "EXAVITQu4vr4xnSDxMaL",    # Bella – soft, enthusiastic
    "skeptic_scholar": "ErXwobaYiN019PkySvjV",  # Antoni – measured, clear
    "chaos_neutral": "MF3mGyEYCl7XYWbV9V6O",   # Elli – curious, varied
}


@router.get("")
async def text_to_speech(
    text: str = Query(..., min_length=1, max_length=5000),
    agent: str = Query(...),
) -> Response:
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ELEVENLABS_API_KEY not configured")

    voice_id = VOICE_MAP.get(agent, VOICE_MAP["ancient_oracle"])

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
            json={
                "text": text,
                "model_id": "eleven_flash_v2_5",
                "voice_settings": {"stability": 0.50, "similarity_boost": 0.75},
            },
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"ElevenLabs error {resp.status_code}: {resp.text[:300]}")

    return Response(content=resp.content, media_type="audio/mpeg")
