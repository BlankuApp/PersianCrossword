"""LlamaCloud parsing integration for Persian crossword images."""
from __future__ import annotations

import asyncio
import io

from llama_cloud import LlamaCloud

CUSTOM_PROMPT = (
    "The text direction is RTL\n"
    "Text belongs to a persian crossword\n"
    "The page has multi column layout in RTL direction the first column is in the "
    "rightmost side, the second is on its immediate left and so on. The text in each "
    "column is naturally top to bottom.\n"
    "pay more attention on hyphens - and numbers\n"
    "ignore the images or shapes or crossword tables\n\n"
    "The final output is like\n"
    "جدول عادی\n"
    "افقی\n"
    "1) ... - ... - ... 2) ... 15)...\n"
    "عمودی\n"
    "1) ... - ... - ... 2) ... 15)...\n"
    "جدول ویژه\n"
    "افقی\n"
    "1) ... - ... - ... 2) ... 15)...\n"
    "عمودی\n"
    "1) ... - ... - ... 2) ... 15)..."
)


def _parse_sync(image_bytes: bytes, api_key: str) -> dict:
    client = LlamaCloud(api_key=api_key)
    result = client.parsing.parse(
        upload_file=("image.png", io.BytesIO(image_bytes), "image/png"),
        tier="agentic",
        version="latest",
        agentic_options={"custom_prompt": CUSTOM_PROMPT},
        disable_cache=True,
        output_options={"tables_as_spreadsheet": {"guess_sheet_name": True}},
        processing_options={"ocr_parameters": {"languages": ["fa"]}},
        expand=["markdown_full", "text_full"],
        timeout=300.0,
    )
    return {
        "markdown_full": result.markdown_full or "",
        "text_full": result.text_full or "",
    }


async def parse_image(image_bytes: bytes, api_key: str) -> dict:
    return await asyncio.to_thread(_parse_sync, image_bytes, api_key)
