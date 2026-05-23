"""Compact video metadata (essentials only, similar to mattw.io/youtube-metadata)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

META_FILENAME = ".meta.json"


def _truncate(text: str | None, limit: int = 500) -> str | None:
    if not text:
        return None
    text = str(text).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def build_essential_metadata(info: dict[str, Any]) -> dict[str, Any]:
    """Pick human-readable fields from a yt-dlp info dict."""
    channel_id = info.get("channel_id") or info.get("uploader_id")
    channel_url = info.get("channel_url")
    if not channel_url and channel_id:
        channel_url = f"https://www.youtube.com/channel/{channel_id}"

    thumbs = info.get("thumbnails") or []
    thumb_url = info.get("thumbnail") or (thumbs[-1].get("url") if thumbs else None)

    return {
        "id": info.get("id"),
        "title": info.get("title"),
        "description": _truncate(info.get("description")),
        "url": info.get("webpage_url") or info.get("original_url"),
        "duration": info.get("duration"),
        "duration_string": info.get("duration_string"),
        "upload_date": info.get("upload_date"),
        "view_count": info.get("view_count"),
        "like_count": info.get("like_count"),
        "comment_count": info.get("comment_count"),
        "channel": {
            "id": channel_id,
            "name": info.get("channel") or info.get("uploader"),
            "url": channel_url,
            "subscriber_count": info.get("channel_follower_count"),
        },
        "category": info.get("category") or (info.get("categories") or [None])[0],
        "tags": info.get("tags") or [],
        "thumbnail": thumb_url,
        "resolution": info.get("resolution"),
        "fps": info.get("fps"),
        "format_note": info.get("format_note"),
        "availability": info.get("availability"),
        "live_status": info.get("live_status"),
        "age_limit": info.get("age_limit"),
        "playlist": {
            "id": info.get("playlist_id"),
            "title": info.get("playlist_title"),
            "index": info.get("playlist_index"),
        }
        if info.get("playlist_id")
        else None,
    }


def write_metadata(target_dir: Path, file_base: str, info: dict[str, Any]) -> Path:
    path = target_dir / f"{file_base}{META_FILENAME}"
    payload = build_essential_metadata(info)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return path
