"""Shared yt-dlp option defaults."""

from __future__ import annotations

from typing import Any

from app.tools.extras import resolve_tooling_from_settings


def base_ytdlp_opts(**extra: Any) -> dict[str, Any]:
    """Build common yt-dlp options (no ANSI color, selected Deno/ffmpeg sources)."""
    opts: dict[str, Any] = {"no_color": True}
    tooling = resolve_tooling_from_settings()
    if tooling["js_runtimes"]:
        opts["js_runtimes"] = tooling["js_runtimes"]
    if tooling["ffmpeg_location"]:
        opts["ffmpeg_location"] = tooling["ffmpeg_location"]
    opts.update(extra)
    return opts
