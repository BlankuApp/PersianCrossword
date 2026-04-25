"""
Pure computer-vision functions for detecting a crossword grid in an image
and returning a 0/1 matrix.

Convention (matches the main app's v2 JSON format):
    1 = black square
    0 = open/white square
"""
from __future__ import annotations

import base64
from typing import TypedDict

import cv2
import numpy as np


class DetectResult(TypedDict):
    rows: int
    cols: int
    matrix: list[list[int]]
    warped_png_b64: str


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def order_points(points: np.ndarray) -> np.ndarray:
    """Order 4 points as: top-left, top-right, bottom-right, bottom-left."""
    points = np.asarray(points, dtype=np.float32)
    s = points.sum(axis=1)
    diff = np.diff(points, axis=1).ravel()

    rect = np.zeros((4, 2), dtype=np.float32)
    rect[0] = points[np.argmin(s)]     # top-left
    rect[2] = points[np.argmax(s)]     # bottom-right
    rect[1] = points[np.argmin(diff)]  # top-right
    rect[3] = points[np.argmax(diff)]  # bottom-left
    return rect


def four_point_transform(gray: np.ndarray, points: np.ndarray) -> np.ndarray:
    """Perspective-correct the detected crossword grid region."""
    rect = order_points(points)
    tl, tr, br, bl = rect

    width_a = float(np.linalg.norm(br - bl))
    width_b = float(np.linalg.norm(tr - tl))
    height_a = float(np.linalg.norm(tr - br))
    height_b = float(np.linalg.norm(tl - bl))

    max_width = max(1, int(round(max(width_a, width_b))))
    max_height = max(1, int(round(max(height_a, height_b))))

    dst = np.array(
        [
            [0, 0],
            [max_width - 1, 0],
            [max_width - 1, max_height - 1],
            [0, max_height - 1],
        ],
        dtype=np.float32,
    )

    transform = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(gray, transform, (max_width, max_height))


# ---------------------------------------------------------------------------
# Grid-line detection helpers
# ---------------------------------------------------------------------------

def _grouped_runs(indices: np.ndarray, max_gap: int = 2) -> list[tuple[int, int]]:
    """Turn nearby pixel-index runs into (start, end) groups."""
    indices = np.asarray(indices, dtype=int)
    if indices.size == 0:
        return []

    groups: list[tuple[int, int]] = []
    start = prev = int(indices[0])
    for val in indices[1:]:
        val = int(val)
        if val <= prev + max_gap:
            prev = val
        else:
            groups.append((start, prev))
            start = prev = val
    groups.append((start, prev))
    return groups


def find_grid_quad(binary_inv: np.ndarray) -> np.ndarray:
    """
    Find the outer crossword grid as a quadrilateral (4 float32 corners).

    Strategy:
    1. Sort contours by area (largest first).
    2. For each large-enough contour try several approxPolyDP epsilon values
       until a 4-corner approximation is found.
    3. If nothing gives exactly 4 corners, fall back to the axis-aligned
       bounding rect of ALL significant contours combined — this covers the
       case where the grid is made up of many disconnected line segments or
       cells rather than one outer rectangle.
    """
    contours, _ = cv2.findContours(
        binary_inv, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    if not contours:
        raise ValueError("No contours found — is the crossword grid visible in the image?")

    image_area = binary_inv.shape[0] * binary_inv.shape[1]
    h, w = binary_inv.shape[:2]

    # Step 1: try to find a single large rectangular contour.
    for contour in sorted(contours, key=cv2.contourArea, reverse=True):
        if cv2.contourArea(contour) < image_area * 0.10:
            break  # remaining contours are too small
        perimeter = cv2.arcLength(contour, True)
        for eps in (0.02, 0.03, 0.05, 0.01, 0.07):
            approx = cv2.approxPolyDP(contour, eps * perimeter, True)
            if len(approx) == 4:
                return approx.reshape(4, 2).astype(np.float32)

    # Step 2: bounding rect of ALL contours that are at least 0.05 % of the image.
    min_area = max(1.0, image_area * 0.0005)
    significant = [c for c in contours if cv2.contourArea(c) >= min_area]
    if not significant:
        significant = contours

    all_points = np.vstack(significant)
    x, y, bw, bh = cv2.boundingRect(all_points)
    # Small padding so the outermost grid line isn't clipped.
    pad = 4
    x  = max(0, x - pad)
    y  = max(0, y - pad)
    bw = min(w - x, bw + 2 * pad)
    bh = min(h - y, bh + 2 * pad)
    return np.array(
        [[x, y], [x + bw - 1, y], [x + bw - 1, y + bh - 1], [x, y + bh - 1]],
        dtype=np.float32,
    )


def detect_grid_edges(
    warped_gray: np.ndarray,
    n: int | None = None,
    near_white_threshold: int = 245,
    line_coverage: float = 0.65,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Return (x_edges, y_edges) — the pixel positions of the n+1 vertical and
    horizontal dividing lines.

    If *n* is provided, edges are evenly spaced (fast, reliable for known sizes).
    Otherwise, lines are auto-detected by looking for columns/rows where most
    pixels are non-white (i.e., ink / grid lines).
    """
    height, width = warped_gray.shape[:2]

    if n is not None:
        x_edges = np.linspace(0, width - 1, n + 1, dtype=np.float32)
        y_edges = np.linspace(0, height - 1, n + 1, dtype=np.float32)
        return x_edges, y_edges

    _, ink = cv2.threshold(
        warped_gray, near_white_threshold, 255, cv2.THRESH_BINARY_INV
    )

    col_counts = (ink > 0).sum(axis=0)   # how dark is each column
    row_counts = (ink > 0).sum(axis=1)   # how dark is each row

    x_groups = _grouped_runs(
        np.where(col_counts > height * line_coverage)[0], max_gap=3
    )
    y_groups = _grouped_runs(
        np.where(row_counts > width * line_coverage)[0], max_gap=3
    )

    x_edges = np.array([(a + b) / 2 for a, b in x_groups], dtype=np.float32)
    y_edges = np.array([(a + b) / 2 for a, b in y_groups], dtype=np.float32)

    if len(x_edges) < 2 or len(y_edges) < 2:
        raise ValueError(
            "Could not detect enough grid lines. "
            "Try specifying the grid size (e.g. n=15) or improving image contrast."
        )

    return x_edges, y_edges


# ---------------------------------------------------------------------------
# Cell classification
# ---------------------------------------------------------------------------

def classify_cells(
    warped_gray: np.ndarray,
    x_edges: np.ndarray,
    y_edges: np.ndarray,
    black_pixel_threshold: int = 100,
    black_ratio_cutoff: float = 0.55,
    inner_margin: float = 0.18,
) -> np.ndarray:
    """
    Sample the inner region of each cell and return a uint8 matrix where
    1 = black square and 0 = open square.

    *inner_margin* (0–0.5) controls how much of each cell edge is ignored to
    avoid counting grid lines as black pixels.
    """
    dark = warped_gray < black_pixel_threshold
    num_rows = len(y_edges) - 1
    num_cols = len(x_edges) - 1
    matrix = np.zeros((num_rows, num_cols), dtype=np.uint8)

    for row in range(num_rows):
        y0, y1 = sorted((float(y_edges[row]), float(y_edges[row + 1])))
        for col in range(num_cols):
            x0, x1 = sorted((float(x_edges[col]), float(x_edges[col + 1])))
            mx = (x1 - x0) * inner_margin
            my = (y1 - y0) * inner_margin
            crop = dark[int(y0 + my): int(y1 - my), int(x0 + mx): int(x1 - mx)]
            ratio = float(crop.mean()) if crop.size > 0 else 0.0
            matrix[row, col] = 1 if ratio >= black_ratio_cutoff else 0

    return matrix


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def image_bytes_to_matrix(data: bytes, n: int | None = None) -> DetectResult:
    """
    Convert raw image bytes (JPEG / PNG / BMP / WebP) into a DetectResult.

    Parameters
    ----------
    data:
        Raw bytes of the image file.
    n:
        Known grid size (e.g. 15 for a 15×15 crossword).  Leave as None to
        auto-detect grid lines.

    Returns
    -------
    DetectResult with fields:
        rows, cols     — detected grid dimensions
        matrix         — list[list[int]] of 0/1 values
        warped_png_b64 — base64-encoded PNG of the perspective-corrected grid
    """
    arr = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(
            "Could not decode image. Ensure the file is a valid JPEG, PNG, BMP, or WebP."
        )

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)

    _, binary_inv = cv2.threshold(
        gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )

    # Dilate so nearby dark pixels (thin grid lines, separate cells) connect
    # into one solid region — makes find_grid_quad far more reliable.
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    dilated = cv2.dilate(binary_inv, kernel, iterations=2)

    quad = find_grid_quad(dilated)
    warped = four_point_transform(gray, quad)

    x_edges, y_edges = detect_grid_edges(warped, n=n)
    matrix = classify_cells(warped, x_edges, y_edges)

    ok, buf = cv2.imencode(".png", warped)
    if not ok:
        raise RuntimeError("Failed to encode the warped grid image.")
    warped_b64 = base64.b64encode(buf.tobytes()).decode("ascii")

    r, c = matrix.shape
    return DetectResult(
        rows=r,
        cols=c,
        matrix=matrix.tolist(),
        warped_png_b64=warped_b64,
    )
