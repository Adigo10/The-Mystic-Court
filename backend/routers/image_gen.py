import asyncio
import base64
import os
from typing import Any

from fastapi import HTTPException
from google import genai
from google.genai import types
from openai import AsyncOpenAI

_DEFAULT_IMAGEN_MODEL = "imagen-4.0-generate-001"
_DEFAULT_GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview"
_DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1.5"


def _image_data_url(image_data: bytes | bytearray | str, mime_type: str = "image/png") -> str:
    if isinstance(image_data, str):
        b64 = image_data
    else:
        b64 = base64.b64encode(image_data).decode("ascii")
    return f"data:{mime_type};base64,{b64}"


def _iter_response_parts(response: Any) -> list[Any]:
    parts = getattr(response, "parts", None)
    if parts:
        return list(parts)

    candidates = getattr(response, "candidates", None) or []
    if not candidates:
        return []

    content = getattr(candidates[0], "content", None)
    return list(getattr(content, "parts", None) or [])


def _openai_image_size(aspect_ratio: str) -> str:
    try:
        width, height = [float(part) for part in aspect_ratio.split(":", 1)]
        ratio = width / height
    except (TypeError, ValueError, ZeroDivisionError):
        ratio = 1.0

    if ratio > 1.15:
        return "1536x1024"
    if ratio < 0.9:
        return "1024x1536"
    return "1024x1024"


async def _generate_with_imagen(client: genai.Client, prompt: str, aspect_ratio: str) -> str:
    model = os.getenv("GEMINI_IMAGEN_MODEL") or _DEFAULT_IMAGEN_MODEL
    config = types.GenerateImagesConfig(number_of_images=1, aspect_ratio=aspect_ratio)

    response = await asyncio.to_thread(
        client.models.generate_images,
        model=model,
        prompt=prompt,
        config=config,
    )

    generated_images = getattr(response, "generated_images", None) or []
    if not generated_images:
        raise RuntimeError(f"{model} returned no generated images.")

    image = generated_images[0].image
    return _image_data_url(image.image_bytes, "image/png")


async def _generate_with_gemini_image_model(
    client: genai.Client, prompt: str, aspect_ratio: str
) -> str:
    model = os.getenv("GEMINI_IMAGE_MODEL") or _DEFAULT_GEMINI_IMAGE_MODEL
    config = types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(aspect_ratio=aspect_ratio),
    )

    response = await asyncio.to_thread(
        client.models.generate_content,
        model=model,
        contents=[prompt],
        config=config,
    )

    for part in _iter_response_parts(response):
        inline_data = getattr(part, "inline_data", None)
        if inline_data is None:
            continue
        image_data = getattr(inline_data, "data", None)
        if image_data:
            mime_type = getattr(inline_data, "mime_type", None) or "image/png"
            return _image_data_url(image_data, mime_type)

    raise RuntimeError(f"{model} returned no image data.")


async def _generate_with_openai(prompt: str, aspect_ratio: str) -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    model = os.getenv("OPENAI_IMAGE_MODEL") or _DEFAULT_OPENAI_IMAGE_MODEL
    client = AsyncOpenAI(api_key=api_key)
    response = await client.images.generate(
        model=model,
        prompt=prompt,
        n=1,
        size=_openai_image_size(aspect_ratio),
        quality="auto",
        output_format="png",
    )

    image = response.data[0]
    if image.b64_json:
        return _image_data_url(image.b64_json, "image/png")
    if image.url:
        return image.url
    raise RuntimeError(f"{model} returned no image data.")


async def generate_image_gemini(prompt: str, aspect_ratio: str = "1:1") -> str:
    """Generate an image and return a data-URL string."""
    errors: list[str] = []
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        client = genai.Client(api_key=api_key)
        try:
            return await _generate_with_imagen(client, prompt, aspect_ratio)
        except Exception as imagen_exc:
            errors.append(f"Imagen error: {imagen_exc}")

        try:
            return await _generate_with_gemini_image_model(client, prompt, aspect_ratio)
        except Exception as gemini_exc:
            errors.append(f"Gemini image model error: {gemini_exc}")
    else:
        errors.append("GEMINI_API_KEY is not configured.")

    try:
        return await _generate_with_openai(prompt, aspect_ratio)
    except Exception as openai_exc:
        errors.append(f"OpenAI image model error: {openai_exc}")

    raise HTTPException(status_code=502, detail="Image generation failed. " + " ".join(errors))
