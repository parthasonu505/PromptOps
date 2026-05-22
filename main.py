from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from api.routes import router
from database import create_tables, seed_database


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await create_tables()
    await seed_database()
    yield
    # Shutdown
    pass


app = FastAPI(
    title="PromptOps Platform",
    description=(
        "Enterprise-grade prompt lifecycle management platform.\n\n"
        "## SDK endpoints\n"
        "Runtime prompt access via `X-API-Key` header — framework and cloud agnostic.\n"
        "- `GET /api/sdk/v1/prompts` — list approved prompts\n"
        "- `GET /api/sdk/v1/prompts/{slug}` — fetch a prompt (latest or pinned version)\n"
        "- `GET /api/sdk/v1/prompts/{slug}/versions` — list all versions\n"
        "- `POST /api/sdk/v1/prompts/{slug}/render` — server-side variable substitution\n\n"
        "## API key management\n"
        "- `GET /api/api-keys` — list your keys\n"
        "- `POST /api/api-keys` — create a key (shown once)\n"
        "- `DELETE /api/api-keys/{id}` — revoke a key\n"
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router, prefix="/api")

# Serve React frontend (development - Vite serves on port 5173, but we proxy through Node.js on 5000)
# In production, this would serve the built React files from dist directory
if os.path.exists("dist"):
    app.mount("/", StaticFiles(directory="dist", html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)