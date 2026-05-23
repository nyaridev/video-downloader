"""Render download folder and file name templates."""

from __future__ import annotations

import re
from typing import Any

from app.paths import sanitize_name

DEFAULT_BUNDLE_FOLDER_TEMPLATE = "{title}_{id}"
DEFAULT_FILE_NAME_TEMPLATE = "{id}"

_PLACEHOLDER = re.compile(r"\{(\w+)\}")


def build_naming_context(
    *,
    info: dict[str, Any] | None = None,
    video_id: str = "",
    title: str = "",
    playlist_title: str | None = None,
    channel_handle: str | None = None,
) -> dict[str, str]:
    if info:
        video_id = str(info.get("id") or video_id or "unknown")
        title = str(info.get("title") or title or video_id)
        channel = str(info.get("channel") or info.get("uploader") or "")
        upload_date = str(info.get("upload_date") or "")
        playlist = str(info.get("playlist_title") or playlist_title or "")
    else:
        channel = ""
        upload_date = ""
        playlist = str(playlist_title or "")

    if channel_handle:
        channel = channel_handle if channel_handle.startswith("@") else f"@{channel_handle}"

    return {
        "title": sanitize_name(title),
        "id": video_id,
        "channel": sanitize_name(channel) if channel else "unknown",
        "upload_date": upload_date or "unknown",
        "playlist": sanitize_name(playlist) if playlist else "",
    }


def render_name_template(template: str, context: dict[str, str], *, max_len: int = 120) -> str:
    def repl(match: re.Match[str]) -> str:
        key = match.group(1)
        return context.get(key, match.group(0))

    rendered = _PLACEHOLDER.sub(repl, template or "")
    rendered = sanitize_name(rendered, max_len=max_len)
    return rendered or "untitled"


def normalize_name_template(value: Any, default: str) -> str:
    text = str(value or "").strip()
    return text if text else default
