"""Extract playlist/channel entry lists for batch queue expansion."""

from __future__ import annotations

from typing import Any

from yt_dlp.utils import DownloadError

from app.auth.cookies import ytdlp_cookie_opts
from app.config import load_settings
from app.downloader.extract import extract_info
from app.downloader.ytdlp_opts import base_ytdlp_opts


def batch_list_opts(job: dict[str, Any]) -> dict[str, Any]:
    settings = job.get("cookie_settings") or load_settings()
    return base_ytdlp_opts(
        **ytdlp_cookie_opts(settings),
        noplaylist=False,
        ignoreerrors=False,
        no_warnings=False,
        quiet=True,
        nocheckcertificate=True,
    )


def extract_batch_entries(
    url: str,
    mode: str,
    job: dict[str, Any],
) -> tuple[str, list[dict[str, Any]], str | None, str | None]:
    """Return view name, flat entries, and path metadata for a playlist or channel."""
    if mode not in ("playlist", "channel"):
        raise ValueError(f"Unsupported batch mode: {mode}")

    opts_base = batch_list_opts(job)
    list_opts = {**opts_base, "extract_flat": "flat"}
    browser = (job.get("cookie_settings") or {}).get("cookies_browser")

    info = extract_info(url, list_opts, cookie_browser=browser)
    entries = list(info.get("entries") or [info])

    playlist_title = info.get("title") if mode == "playlist" else None
    channel_handle = info.get("uploader_id") or info.get("channel_id") or info.get("uploader")
    if mode == "channel":
        channel_handle = info.get("channel") or info.get("uploader") or channel_handle

    if mode == "playlist":
        view_name = (info.get("title") or "Playlist").strip()
    else:
        view_name = (info.get("channel") or info.get("uploader") or "Channel").strip()

    normalized: list[dict[str, Any]] = []
    for idx, entry in enumerate(entries, start=1):
        if not entry:
            continue
        entry = dict(entry)
        vid = entry.get("id")
        video_url = entry.get("webpage_url") or entry.get("url")
        if vid and (not video_url or "watch" not in str(video_url)):
            video_url = f"https://www.youtube.com/watch?v={vid}"
        if not video_url:
            continue
        normalized.append(
            {
                "url": video_url,
                "title": (entry.get("title") or vid or f"Video {idx}").strip(),
                "index": idx,
            }
        )

    if not normalized:
        raise DownloadError("No videos found in this playlist or channel.")

    return view_name, normalized, playlist_title, channel_handle
