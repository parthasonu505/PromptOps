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
    description="Enterprise-grade prompt lifecycle management platform",
    version="1.0.0",
    lifespan=lifespan
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