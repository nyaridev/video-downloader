"""Persisted app settings (cookies, etc.)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.paths import ROOT

SETTINGS_FILE = ROOT / "settings.json"

# Edge/Firefox first — Chromium browsers lock cookies while open (yt-dlp #7271).
BROWSER_OPTIONS = ("edge", "firefox", "chrome", "brave", "opera", "vivaldi", "chromium")
CHROMIUM_BROWSERS = frozenset({"chrome", "edge", "brave", "chromium", "opera", "vivaldi"})

DEFAULTS: dict[str, Any] = {
    "use_browser_cookies": True,
    "cookies_browser": "edge",
    "cookies_file": "",
}


def load_settings() -> dict[str, Any]:
    data = dict(DEFAULTS)
    if SETTINGS_FILE.is_file():
        try:
            loaded = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data.update(loaded)
        except (json.JSONDecodeError, OSError):
            pass
    if data.get("cookies_browser") not in BROWSER_OPTIONS:
        data["cookies_browser"] = DEFAULTS["cookies_browser"]
    return data


def save_settings(updates: dict[str, Any]) -> dict[str, Any]:
    data = load_settings()
    data.update(updates)
    SETTINGS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data
