import os

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

router = APIRouter()

# Each agent gets a distinct voice accent + speaking style
# voice_id, stability, similarity_boost, style (0=neutral, 1=expressive)
VOICE_CONFIG: dict[str, dict] = {
    # George – deep British male; slow, oracular cadence
    "ancient_oracle": {
        "voice_id": "JBFqnCBsd6RMkjVDRZzb",
        "stability": 0.72,
        "similarity_boost": 0.85,
        "style": 0.20,
    },
    # Matilda – Australian female; volatile, low stability = wild swings
    "rage_gremlin": {
        "voice_id": "XrExE9yKIg1WjnnlVkGX",
        "stability": 0.18,
        "similarity_boost": 0.90,
        "style": 0.85,
    },
    # Aria – bright American female; bouncy, high style expressiveness
    "hype_prophet": {
        "voice_id": "9BWtsMINqrJLrRacOk9x",
        "stability": 0.38,
        "similarity_boost": 0.65,
        "style": 0.75,
    },
    # Alice – crisp British female; very stable, measured delivery
    "skeptic_scholar": {
        "voice_id": "Xb7hH8MSUJpSbSDYk0k2",
        "stability": 0.82,
        "similarity_boost": 0.80,
        "style": 0.05,
    },
    # Charlotte – Swedish-accented English; unpredictable, mid settings
    "chaos_neutral": {
        "voice_id": "XB0fDUnXU5powFXDhCwa",
        "stability": 0.14,
        "similarity_boost": 0.70,
        "style": 0.60,
    },
}

_FALLBACK = VOICE_CONFIG["ancient_oracle"]


@router.get("")
async def text_to_speech(
    text: str = Query(..., min_length=1, max_length=5000),
    agent: str = Query(...),
) -> Response:
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ELEVENLABS_API_KEY not configured")

    cfg = VOICE_CONFIG.get(agent, _FALLBACK)
    voice_id = cfg["voice_id"]

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
            json={
                "text": text,
                "model_id": "eleven_flash_v2_5",
                "voice_settings": {
                    "stability": cfg["stability"],
                    "similarity_boost": cfg["similarity_boost"],
                    "style": cfg["style"],
                    "use_speaker_boost": True,
                },
            },
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"ElevenLabs error {resp.status_code}: {resp.text[:300]}")

    return Response(content=resp.content, media_type="audio/mpeg")
