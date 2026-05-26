from __future__ import annotations

import base64

import cv2
import numpy as np


def extract_columns(data: bytes, rects: list[dict]) -> dict:
    """
    Crop rectangles from an image and stack them vertically into a single PNG.

    Parameters
    ----------
    data  : raw image bytes (JPEG / PNG / BMP / WebP / TIFF)
    rects : list of {"x": int, "y": int, "w": int, "h": int} in natural image pixels

    Returns
    -------
    {"stitched_png_b64": str}

    Raises
    ------
    ValueError  – bad image data or invalid / out-of-bounds rectangles
    RuntimeError – PNG encode failure
    """
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image. Ensure it is a valid JPEG, PNG, BMP, WebP, or TIFF.")

    img_h, img_w = img.shape[:2]

    if not rects:
        raise ValueError("At least one rectangle is required.")

    crops: list[np.ndarray] = []
    for i, r in enumerate(rects):
        try:
            x = int(r["x"])
            y = int(r["y"])
            w = int(r["w"])
            h = int(r["h"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"Rectangle {i}: must have integer fields x, y, w, h.") from exc

        # Clamp to image bounds (handles sub-pixel rounding at edges)
        x = max(0, x)
        y = max(0, y)
        w = min(w, img_w - x)
        h = min(h, img_h - y)

        if w <= 0 or h <= 0:
            raise ValueError(f"Rectangle {i} is outside the image bounds after clamping.")

        crops.append(img[y : y + h, x : x + w])

    # Normalize all crops to the same width (widest wins)
    max_w = max(c.shape[1] for c in crops)
    resized: list[np.ndarray] = []
    for c in crops:
        cw = c.shape[1]
        if cw != max_w:
            ch = c.shape[0]
            new_h = max(1, round(ch * max_w / cw))
            interp = cv2.INTER_AREA if cw > max_w else cv2.INTER_LINEAR
            c = cv2.resize(c, (max_w, new_h), interpolation=interp)
        resized.append(c)

    stitched = np.vstack(resized)

    ok, buf = cv2.imencode(".png", stitched)
    if not ok:
        raise RuntimeError("Failed to encode stitched image as PNG.")

    return {"stitched_png_b64": base64.b64encode(buf.tobytes()).decode()}
