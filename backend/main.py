from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import debate, palm, tts, verdict

load_dotenv()

app = FastAPI(
    title="The Mystic Court API",
    description="Palm readings, AI agent debate, and oracle verdicts.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(palm.router, prefix="/api/palm", tags=["palm"])
app.include_router(debate.router, prefix="/api/debate", tags=["debate"])
app.include_router(verdict.router, prefix="/api/verdict", tags=["verdict"])
app.include_router(tts.router, prefix="/api/tts", tags=["tts"])


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
