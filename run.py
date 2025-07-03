#!/usr/bin/env python3
"""
Startup script for the FastAPI PromptOps platform.
"""

import uvicorn
import os

if __name__ == "__main__":
    # Configuration
    host = "0.0.0.0"
    port = int(os.getenv("PORT", 5000))
    
    # Run the FastAPI app
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=True,  # Enable hot reload for development
        log_level="info"
    )