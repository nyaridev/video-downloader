"""Extract playlist/channel entry lists for batch queue expansion."""

from __future__ import annotations

import re
from typing import Any, Callable

from yt_dlp.utils import DownloadError

from app.auth.cookies import ytdlp_cookie_opts
from app.config import load_settings
from app.downloader.extract import extract_info
from app.downloader.ytdlp_opts import base_ytdlp_opts

PrepareProgressFn = Callable[[dict[str, Any]], None]
CancelCheckFn = Callable[[], bool]


class BatchPrepareCancelled(Exception):
    """Raised when batch entry fetch is cancelled during preparation."""


_ITEM_RE = re.compile(r"Downloading item\s+(\d+)\s+of\s+(\d+|N/A)", re.I)
_PAGE_RE = re.compile(r"page\s+(\d+)\s*:\s*Downloading", re.I)
_PLAYLIST_RE = re.compile(r"Downloading playlist:\s*(.+)", re.I)
_EXTRACTING_RE = re.compile(r"Extracting URL:\s*(.+)", re.I)
_WEBPAGE_RE = re.compile(r": Downloading webpage", re.I)


class BatchPrepareLogger:
    """Map yt-dlp log lines to batch-prepare progress updates."""

    def __init__(self, on_progress: PrepareProgressFn | None) -> None:
        self._on_progress = on_progress
        self.found = 0
        self.total: int | None = None
        self.page: int | None = None
        self.playlist_name: str | None = None

    def _emit(self, message: str | None = None, **extra: Any) -> None:
        if not self._on_progress:
            return
        payload: dict[str, Any] = {
            "found": self.found,
            "total": self.total,
            "page": self.page,
        }
        if message is not None:
            payload["message"] = message
        payload.update(extra)
        self._on_progress(payload)

    def _default_message(self) -> str:
        parts: list[str] = []
        if self.playlist_name:
            parts.append(self.playlist_name)
        if self.page is not None:
            parts.append(f"page {self.page}")
        if self.found > 0:
            if self.total is not None:
                parts.append(f"{self.found} / {self.total} videos")
            else:
                parts.append(f"{self.found} videos found")
        elif self.page is not None:
            parts.append("fetching entries")
        return " · ".join(parts) if parts else "Fetching entries..."

    def debug(self, msg: str) -> None:
        if msg.startswith("[debug] "):
            return
        self.info(msg)

    def info(self, msg: str) -> None:
        if msg.startswith("[debug] "):
            return

        match = _PLAYLIST_RE.search(msg)
        if match:
            self.playlist_name = match.group(1).strip()
            self._emit(self._default_message(), phase="playlist")
            return

        match = _EXTRACTING_RE.search(msg)
        if match:
            self._emit("Connecting to source...", phase="connect")
            return

        if _WEBPAGE_RE.search(msg):
            self._emit("Loading page...", phase="webpage")
            return

        match = _PAGE_RE.search(msg)
        if match:
            self.page = int(match.group(1))
            self._emit(self._default_message(), phase="page")
            return

        match = _ITEM_RE.search(msg)
        if match:
            current = int(match.group(1))
            total_raw = match.group(2)
            self.found = max(self.found, current)
            if total_raw != "N/A":
                self.total = int(total_raw)
            self._emit(self._default_message(), phase="items")
            return

        if "Finished downloading playlist:" in msg:
            self._emit(self._default_message(), phase="finalizing")

    def warning(self, msg: str) -> None:
        if msg.startswith("[debug] "):
            return

    def error(self, msg: str) -> None:
        if msg.startswith("[debug] "):
            return


def batch_list_opts(job: dict[str, Any]) -> dict[str, Any]:
    settings = job.get("cookie_settings") or load_settings()
    return base_ytdlp_opts(
        **ytdlp_cookie_opts(settings),
        noplaylist=False,
        ignoreerrors=False,
        no_warnings=False,
        quiet=True,
        nocheckcertificate=True,
        lazy_playlist=True,
    )


def extract_batch_entries(
    url: str,
    mode: str,
    job: dict[str, Any],
    *,
    on_progress: PrepareProgressFn | None = None,
    should_cancel: CancelCheckFn | None = None,
) -> tuple[str, list[dict[str, Any]], str | None, str | None, str | None, str | None]:
    """Return view name, flat entries, and path metadata for a playlist or channel."""
    if mode not in ("playlist", "channel"):
        raise ValueError(f"Unsupported batch mode: {mode}")

    def check_cancelled() -> None:
        if should_cancel and should_cancel():
            raise BatchPrepareCancelled()

    check_cancelled()
    if on_progress:
        on_progress({"message": "Starting fetch...", "found": 0, "total": None, "page": None, "phase": "start"})

    opts_base = batch_list_opts(job)
    list_opts = {**opts_base, "extract_flat": "flat"}
    browser = (job.get("cookie_settings") or {}).get("cookies_browser")

    class CancellingLogger(BatchPrepareLogger):
        def info(self, msg: str) -> None:
            check_cancelled()
            super().info(msg)

        def debug(self, msg: str) -> None:
            check_cancelled()
            super().debug(msg)

    logger = CancellingLogger(on_progress)
    info = extract_info(url, list_opts, cookie_browser=browser, logger=logger)
    check_cancelled()
    entries = list(info.get("entries") or [info])
    check_cancelled()

    playlist_title = info.get("title") if mode == "playlist" else None
    playlist_id = info.get("id") if mode == "playlist" else None
    channel_handle = info.get("uploader_id") or info.get("channel_id") or info.get("uploader")
    channel_id = info.get("channel_id") or info.get("id") if mode == "channel" else None
    if mode == "channel":
        channel_handle = info.get("channel") or info.get("uploader") or channel_handle

    if mode == "playlist":
        view_name = (info.get("title") or "Playlist").strip()
    else:
        view_name = (info.get("channel") or info.get("uploader") or "Channel").strip()

    normalized: list[dict[str, Any]] = []
    for idx, entry in enumerate(entries, start=1):
        check_cancelled()
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

    if on_progress:
        on_progress(
            {
                "message": f"Found {len(normalized)} videos",
                "found": len(normalized),
                "total": len(normalized),
                "page": logger.page,
                "phase": "done",
            }
        )

    if not normalized:
        raise DownloadError("No videos found in this playlist or channel.")

    return view_name, normalized, playlist_title, playlist_id, channel_handle, channel_id
