"""Persisted app settings."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from app.paths import ROOT

SETTINGS_FILE = ROOT / "settings.json"

BROWSER_OPTIONS = ("edge", "firefox", "chrome", "brave", "chromium", "opera", "vivaldi")
CHROMIUM_BROWSERS = frozenset({"chrome", "edge", "brave", "chromium", "opera", "vivaldi"})

_DEFAULT_BROWSER = "edge" if sys.platform == "win32" else "firefox"

DEFAULTS: dict[str, Any] = {
    "use_browser_cookies": True,
    "cookies_browser": _DEFAULT_BROWSER,
    "cookies_file": "",
    "frameless": True,
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
        data["cookies_browser"] = _DEFAULT_BROWSER
    data["frameless"] = bool(data.get("frameless", True))
    data["use_browser_cookies"] = bool(data.get("use_browser_cookies", True))
    return data


def save_settings(updates: dict[str, Any]) -> dict[str, Any]:
    data = load_settings()
    data.update(updates)
    SETTINGS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data
