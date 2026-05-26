"""
FastAPI backend for the Crossword Grid Importer.

Run from this directory:
    uvicorn app:app --reload

Endpoints:
    GET  /             — serves frontend/dist/index.html (production build)
    POST /api/detect   — detect grid in uploaded image; returns JSON

Development: run the Vite dev server in frontend/ and it proxies /api here.
Production:  cd frontend && npm run build, then this endpoint serves dist/.
"""
from __future__ import annotations

import json
from json import JSONDecodeError
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from column_extract import extract_columns
from grid_detect import image_bytes_to_matrix

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

FRONTEND_INDEX = Path(__file__).parent.parent / "frontend" / "dist" / "index.html"
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
    corners: str | None = Form(
        default=None,
        description=(
            "Optional JSON array of 4 [x, y] points in original-image pixels. "
            "Example: [[10, 20], [210, 22], [208, 220], [12, 218]]."
        ),
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

    parsed_corners = None
    if corners is not None:
        try:
            parsed_corners = json.loads(corners)
        except JSONDecodeError as exc:
            raise HTTPException(
                status_code=422,
                detail="Manual corners must be valid JSON with 4 [x, y] points.",
            ) from exc

    try:
        result = image_bytes_to_matrix(data, n=n, corners=parsed_corners)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return result


@app.post(
    "/api/extract-columns",
    summary="Extract and stack image regions",
    response_description="Base64-encoded PNG of vertically stacked cropped regions.",
)
async def extract_columns_endpoint(
    image: UploadFile = File(..., description="Source image (JPEG, PNG, BMP, WebP)."),
    rects: str = Form(
        ...,
        description=(
            'JSON array of rectangle objects, e.g. [{"x":10,"y":20,"w":100,"h":50}]. '
            "Coordinates are in natural image pixels."
        ),
    ),
) -> dict:
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
        parsed_rects = json.loads(rects)
    except JSONDecodeError as exc:
        raise HTTPException(
            status_code=422,
            detail="rects must be a valid JSON array of {x, y, w, h} objects.",
        ) from exc

    if not isinstance(parsed_rects, list) or len(parsed_rects) == 0:
        raise HTTPException(status_code=422, detail="rects must be a non-empty JSON array.")

    try:
        result = extract_columns(data, parsed_rects)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return result
