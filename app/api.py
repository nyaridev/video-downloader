"""Python API exposed to the webview GUI."""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from app import formats
from app.browser_launch import launch_for_youtube_signin
from app.config import BROWSER_OPTIONS, load_settings, save_settings
from app.paths import DEFAULT_OUTPUT, ROOT, ensure_output_root
from app.queue import DownloadQueue
from app.restart import restart_application

_webview_window: Any = None


def bind_webview_window(window: Any) -> None:
    global _webview_window
    _webview_window = window


class Api:
    def __init__(self) -> None:
        self._queue = DownloadQueue(self._emit)
        self._output_dir = str(ensure_output_root())
        self._maximized = False

    def _emit(self, event: str, data: dict[str, Any]) -> None:
        win = _webview_window
        if win is None:
            return
        payload = json.dumps({"event": event, "data": data})
        try:
            win.evaluate_js(f"window.dispatchBackend({payload})")
        except Exception:
            pass

    def get_defaults(self) -> dict[str, Any]:
        settings = load_settings()
        return {
            "root": str(ROOT),
            "output_dir": self._output_dir,
            "video_qualities": formats.VIDEO_QUALITY_OPTIONS,
            "audio_qualities": formats.AUDIO_QUALITY_OPTIONS,
            "browser_options": list(BROWSER_OPTIONS),
            "use_browser_cookies": settings["use_browser_cookies"],
            "cookies_browser": settings["cookies_browser"],
            "cookies_file": settings["cookies_file"],
            "frameless": settings["frameless"],
        }

    def save_app_settings(
        self,
        use_browser_cookies: bool,
        cookies_browser: str,
        cookies_file: str,
        frameless: bool,
    ) -> dict[str, Any]:
        browser = cookies_browser if cookies_browser in BROWSER_OPTIONS else load_settings()["cookies_browser"]
        return save_settings(
            {
                "use_browser_cookies": bool(use_browser_cookies),
                "cookies_browser": browser,
                "cookies_file": (cookies_file or "").strip(),
                "frameless": bool(frameless),
            }
        )

    def restart_program(self) -> dict[str, Any]:
        threading.Thread(target=restart_application, daemon=True).start()
        return {"ok": True, "message": "Restarting..."}

    def minimize_window(self) -> None:
        if _webview_window:
            _webview_window.minimize()

    def toggle_maximize_window(self) -> None:
        if not _webview_window:
            return
        if self._maximized:
            _webview_window.restore()
            self._maximized = False
        else:
            _webview_window.maximize()
            self._maximized = True

    def close_window(self) -> None:
        if _webview_window:
            _webview_window.destroy()

    def browse_cookies_file(self) -> str:
        path = self._pick_file(
            [("Cookies", "*.txt"), ("All files", "*.*")],
            load_settings().get("cookies_file") or str(ROOT),
        )
        return path or load_settings().get("cookies_file", "")

    def open_youtube_signin(self) -> dict[str, Any]:
        settings = load_settings()
        browser = settings.get("cookies_browser") or "firefox"
        ok, message = launch_for_youtube_signin(browser)
        return {"ok": ok, "message": message}

    def browse_output_dir(self) -> str:
        path = self._pick_folder(self._output_dir)
        if path:
            self._output_dir = path
            ensure_output_root(path)
        return self._output_dir

    def enqueue_download(self, config: dict[str, Any]) -> dict[str, Any]:
        config = dict(config)
        config["output_dir"] = config.get("output_dir") or self._output_dir
        config["cookie_settings"] = load_settings()
        ensure_output_root(config["output_dir"])
        job_id = self._queue.add(config)
        return {"job_id": job_id, "queue": self._queue.list_jobs()}

    def get_queue(self) -> list[dict[str, Any]]:
        return self._queue.list_jobs()

    def _pick_file(self, filetypes: list[tuple[str, str]], initial: str) -> str | None:
        result: list[str | None] = [None]

        def _dialog() -> None:
            try:
                import tkinter as tk
                from tkinter import filedialog

                root = tk.Tk()
                root.withdraw()
                root.attributes("-topmost", True)
                chosen = filedialog.askopenfilename(initialdir=initial, filetypes=filetypes)
                root.destroy()
                result[0] = chosen or None
            except Exception:
                result[0] = None

        t = threading.Thread(target=_dialog)
        t.start()
        t.join(timeout=120)
        return result[0]

    def _pick_folder(self, initial: str) -> str | None:
        result: list[str | None] = [None]

        def _dialog() -> None:
            try:
                import tkinter as tk
                from tkinter import filedialog

                root = tk.Tk()
                root.withdraw()
                root.attributes("-topmost", True)
                chosen = filedialog.askdirectory(initialdir=initial or str(DEFAULT_OUTPUT))
                root.destroy()
                result[0] = chosen or None
            except Exception:
                result[0] = None

        t = threading.Thread(target=_dialog)
        t.start()
        t.join(timeout=120)
        return result[0]
