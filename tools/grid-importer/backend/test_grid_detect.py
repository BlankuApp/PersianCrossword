"""
Unit tests for grid_detect.py.

Run from tools/grid-importer/backend/:
    pytest test_grid_detect.py -v
"""
from __future__ import annotations

import base64

import cv2
import numpy as np
import pytest

from grid_detect import image_bytes_to_matrix


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_synthetic_grid(
    rows: int = 15,
    cols: int = 15,
    cell_size: int = 30,
    border: int = 3,
    black_cells: list[tuple[int, int]] | None = None,
    margin: int = 12,
) -> tuple[bytes, list[list[int]]]:
    """
    Build a synthetic crossword-grid PNG in memory and return the raw bytes
    plus the expected 0/1 matrix.

    The grid is drawn on a white canvas with a small white margin on all sides
    so that find_grid_quad() can detect the outer rectangle cleanly.
    """
    if black_cells is None:
        black_cells = []

    grid_h = rows * cell_size + (rows + 1) * border
    grid_w = cols * cell_size + (cols + 1) * border
    total_h = grid_h + 2 * margin
    total_w = grid_w + 2 * margin

    img = np.full((total_h, total_w), 255, dtype=np.uint8)

    # Horizontal grid lines (dark gray to mimic real crossword borders)
    for r in range(rows + 1):
        y = margin + r * (cell_size + border)
        img[y : y + border, margin : margin + grid_w] = 70

    # Vertical grid lines
    for c in range(cols + 1):
        x = margin + c * (cell_size + border)
        img[margin : margin + grid_h, x : x + border] = 70

    # Fill black cells (pure black)
    expected: list[list[int]] = [[0] * cols for _ in range(rows)]
    for r, c in black_cells:
        y = margin + r * (cell_size + border) + border
        x = margin + c * (cell_size + border) + border
        img[y : y + cell_size, x : x + cell_size] = 0
        expected[r][c] = 1

    ok, buf = cv2.imencode(".png", img)
    assert ok, "cv2.imencode failed in test helper"
    return buf.tobytes(), expected


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestSyntheticGrid:
    BLACK_CELLS = [(0, 2), (2, 7), (7, 7), (14, 14)]

    def test_known_n_shape_and_matrix(self):
        data, expected = make_synthetic_grid(black_cells=self.BLACK_CELLS)
        result = image_bytes_to_matrix(data, n=15)

        assert result["rows"] == 15
        assert result["cols"] == 15
        assert result["matrix"] == expected

    def test_auto_detect_shape_and_matrix(self):
        """Auto line-detection should produce the same result as n=15."""
        data, expected = make_synthetic_grid(black_cells=[(3, 3), (10, 10)])
        result = image_bytes_to_matrix(data, n=None)

        assert result["rows"] == 15
        assert result["cols"] == 15
        assert result["matrix"] == expected

    def test_empty_grid_all_zeros(self):
        data, expected = make_synthetic_grid(black_cells=[])
        result = image_bytes_to_matrix(data, n=15)
        assert all(v == 0 for row in result["matrix"] for v in row)

    def test_fully_black_grid(self):
        all_black = [(r, c) for r in range(15) for c in range(15)]
        data, expected = make_synthetic_grid(black_cells=all_black)
        result = image_bytes_to_matrix(data, n=15)
        assert all(v == 1 for row in result["matrix"] for v in row)

    def test_warped_png_is_valid_png(self):
        data, _ = make_synthetic_grid(black_cells=self.BLACK_CELLS)
        result = image_bytes_to_matrix(data, n=15)
        decoded = base64.b64decode(result["warped_png_b64"])
        assert decoded[:8] == b"\x89PNG\r\n\x1a\n", "warped_png_b64 is not a valid PNG"

    def test_different_grid_sizes(self):
        for size in (10, 13, 21):
            data, expected = make_synthetic_grid(rows=size, cols=size, black_cells=[])
            result = image_bytes_to_matrix(data, n=size)
            assert result["rows"] == size
            assert result["cols"] == size


class TestInvalidInput:
    def test_garbage_bytes_raise_value_error(self):
        with pytest.raises(ValueError, match="Could not decode image"):
            image_bytes_to_matrix(b"not an image at all")

    def test_empty_bytes_raise_value_error(self):
        with pytest.raises(ValueError, match="Could not decode image"):
            image_bytes_to_matrix(b"")
