"""Launch pywebview window with the local GUI."""

from __future__ import annotations

import webview

from app.api import Api, bind_webview_window
from app.paths import GUI_DIR, ROOT

_STORAGE = ROOT / ".webview"


def run_app() -> None:
    api = Api()
    index_html = GUI_DIR / "index.html"
    _STORAGE.mkdir(parents=True, exist_ok=True)

    window = webview.create_window(
        "Video Downloader",
        url=str(index_html),
        js_api=api,
        width=1180,
        height=780,
        min_size=(960, 680),
    )

    def on_loaded() -> None:
        bind_webview_window(window)

    window.events.loaded += on_loaded

    webview.start(
        gui="edgechromium",
        debug=False,
        http_server=True,
        private_mode=False,
        storage_path=str(_STORAGE),
    )
