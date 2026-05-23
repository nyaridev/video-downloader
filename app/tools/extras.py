"""Extras tab status and tool source resolution."""

from __future__ import annotations

from typing import Any

from app.config import load_settings, normalize_tool_source, save_settings
from app.tools.deno import install_local_deno, local_deno_status, path_deno_status, resolve_deno_runtime
from app.tools.ffmpeg import (
    install_local_ffmpeg,
    local_ffmpeg_status,
    path_ffmpeg_status,
    resolve_ffmpeg_location,
)


def get_extras_status() -> dict[str, Any]:
    settings = load_settings()
    deno_source = normalize_tool_source(settings.get("deno_source"))
    ffmpeg_source = normalize_tool_source(settings.get("ffmpeg_source"))
    return {
        "deno_source": deno_source,
        "ffmpeg_source": ffmpeg_source,
        "deno_path": path_deno_status(),
        "deno_local": local_deno_status(),
        "ffmpeg_path": path_ffmpeg_status(),
        "ffmpeg_local": local_ffmpeg_status(),
    }


def save_extras_settings(updates: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if "deno_source" in updates:
        payload["deno_source"] = normalize_tool_source(updates["deno_source"])
    if "ffmpeg_source" in updates:
        payload["ffmpeg_source"] = normalize_tool_source(updates["ffmpeg_source"])
    if payload:
        save_settings(payload)
    return get_extras_status()


def resolve_tooling_from_settings(settings: dict[str, Any] | None = None) -> dict[str, Any]:
    data = settings or load_settings()
    deno_source = normalize_tool_source(data.get("deno_source"))
    ffmpeg_source = normalize_tool_source(data.get("ffmpeg_source"))
    return {
        "deno_source": deno_source,
        "ffmpeg_source": ffmpeg_source,
        "js_runtimes": resolve_deno_runtime(deno_source),
        "ffmpeg_location": resolve_ffmpeg_location(ffmpeg_source),
        "ffmpeg_available": bool(resolve_ffmpeg_location(ffmpeg_source)),
    }
