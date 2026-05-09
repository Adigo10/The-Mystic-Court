# The Mystic Court

A mystical AI web app that reads a palm image, debates an idea through five agent personas, and generates a final oracle verdict card.

## Setup

1. Copy the environment template and fill your keys.

```bash
cp .env.example .env
```

2. Start the backend.

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

3. Start the frontend.

```bash
cd frontend
npm install
npm run dev
```

The frontend expects the API at `http://localhost:8000`.

## Flow

1. Upload a palm photo. The FastAPI backend calls `gpt-5.5` with vision and returns a structured mystical reading.
2. Enter an idea pitch. The frontend opens an EventSource stream to `/api/debate/council`, while the backend fetches Exa snippets and runs a compact moderated council with five `gpt-5.4-mini` personas.
3. When the debate finishes, the backend asks `gpt-5.5` for the final verdict and uses `gpt-image-2-2026-04-21` to generate a tarot-style oracle card.

## Environment

The backend loads `.env` with `python-dotenv`.

```bash
OPENAI_API_KEY=
EXA_API_KEY=
```
