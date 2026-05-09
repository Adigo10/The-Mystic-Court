import asyncio
import base64
import os

from fastapi import HTTPException
from google import genai
from google.genai import types

_IMAGEN_MODEL = "imagen-3.0-generate-002"


async def generate_image_gemini(prompt: str, aspect_ratio: str = "1:1") -> str:
    """Generate an image with Imagen 3 and return a data-URL string."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured.")

    client = genai.Client(api_key=api_key)
    config = types.GenerateImagesConfig(number_of_images=1, aspect_ratio=aspect_ratio)

    try:
        response = await asyncio.to_thread(
            client.models.generate_images,
            model=_IMAGEN_MODEL,
            prompt=prompt,
            config=config,
        )
        image_bytes = response.generated_images[0].image.image_bytes
        b64 = base64.b64encode(image_bytes).decode()
        return f"data:image/jpeg;base64,{b64}"
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini image generation failed: {exc}") from exc
