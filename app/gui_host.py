"""Launch pywebview window with the local GUI."""

from __future__ import annotations

import sys

import webview

from app.api import Api, bind_webview_window
from app.config import load_settings
from app.paths import GUI_DIR, ROOT

_STORAGE = ROOT / ".webview"


def _preferred_gui() -> str | None:
    if sys.platform == "win32":
        return "edgechromium"
    return None


def run_app() -> None:
    settings = load_settings()
    frameless = bool(settings.get("frameless", True))
    api = Api()
    index_html = GUI_DIR / "index.html"
    _STORAGE.mkdir(parents=True, exist_ok=True)

    window = webview.create_window(
        "Video Downloader",
        url=str(index_html),
        js_api=api,
        width=1180,
        height=880,
        min_size=(960, 720),
        frameless=frameless,
        easy_drag=False,
        shadow=frameless and sys.platform == "win32",
    )

    def on_loaded() -> None:
        bind_webview_window(window)

    window.events.loaded += on_loaded

    start_kwargs: dict = {
        "debug": False,
        "http_server": True,
        "private_mode": False,
        "storage_path": str(_STORAGE),
    }
    gui = _preferred_gui()
    if gui:
        start_kwargs["gui"] = gui

    webview.start(**start_kwargs)
