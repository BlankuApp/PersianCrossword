"""
FastAPI backend for the Crossword Grid Importer.

Run from this directory:
    uvicorn app:app --reload

Endpoints:
    GET  /             — serves frontend/index.html
    POST /api/detect   — detect grid in uploaded image; returns JSON
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from grid_detect import image_bytes_to_matrix

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

FRONTEND_INDEX = Path(__file__).parent.parent / "frontend" / "index.html"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

ALLOWED_MIME_PREFIXES = (
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/bmp",
    "image/webp",
    "image/tiff",
)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Crossword Grid Importer",
    description="Upload a crossword screenshot; get back a 0/1 matrix.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://127.0.0.1"],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/", include_in_schema=False)
async def serve_frontend() -> FileResponse:
    if not FRONTEND_INDEX.exists():
        raise HTTPException(status_code=404, detail="Frontend not found.")
    return FileResponse(FRONTEND_INDEX, media_type="text/html")


@app.post(
    "/api/detect",
    summary="Detect crossword grid",
    response_description="Rows, columns, 0/1 matrix, and base64 warped preview image.",
)
async def detect(
    image: UploadFile = File(..., description="Crossword grid image (JPEG, PNG, BMP, WebP)."),
    n: int | None = Form(
        default=None,
        ge=3,
        le=50,
        description="Known grid size (e.g. 15 for 15×15). Omit to auto-detect.",
    ),
) -> dict:
    # Validate MIME type (content_type may be None for some clients)
    if image.content_type and not any(
        image.content_type.startswith(p) for p in ALLOWED_MIME_PREFIXES
    ):
        raise HTTPException(
            status_code=415,
            detail=(
                f"Unsupported media type '{image.content_type}'. "
                "Upload a JPEG, PNG, BMP, or WebP image."
            ),
        )

    data = await image.read()

    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image too large ({len(data) // 1024} KB). Maximum is 10 MB.",
        )

    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        result = image_bytes_to_matrix(data, n=n)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return result
