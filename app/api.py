"""Python API exposed to the webview GUI."""

from __future__ import annotations

import json
import threading
from typing import Any

from app.auth.browser import launch_for_youtube_signin
from app.config import BROWSER_OPTIONS, load_settings, normalize_concurrency, normalize_language, normalize_save_layout, normalize_theme, save_settings
from app.utils.naming import (
    DEFAULT_BUNDLE_FOLDER_TEMPLATE,
    DEFAULT_CHANNEL_NAME_TEMPLATE,
    DEFAULT_FILE_NAME_TEMPLATE,
    DEFAULT_PLAYLIST_NAME_TEMPLATE,
    normalize_name_template,
)
from app.gui.dialogs import pick_file, pick_folder
from app.paths import DEFAULT_CHANNEL_FOLDER, DEFAULT_OUTPUT, DEFAULT_PLAYLIST_FOLDER, ROOT, ensure_output_root, normalize_layout_folder_name, normalize_output_dir
from app.queue import DownloadQueue
from app.system.restart import restart_application
from app.tools.deno import install_local_deno
from app.tools.extras import get_extras_status, save_extras_settings
from app.tools.ffmpeg import install_local_ffmpeg
from app.utils import formats

_webview_window: Any = None


def bind_webview_window(window: Any) -> None:
    global _webview_window
    _webview_window = window


class Api:
    def __init__(self) -> None:
        self._queue = DownloadQueue(self._emit)
        self._maximized = False
        settings = load_settings()
        saved_output = normalize_output_dir(settings.get("output_dir"))
        self._output_dir = saved_output or str(ensure_output_root())

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
        output_dir = normalize_output_dir(settings.get("output_dir")) or self._output_dir
        self._output_dir = output_dir
        return {
            "root": str(ROOT),
            "output_dir": output_dir,
            "video_qualities": formats.VIDEO_QUALITY_OPTIONS,
            "audio_qualities": formats.AUDIO_QUALITY_OPTIONS,
            "browser_options": list(BROWSER_OPTIONS),
            "use_browser_cookies": settings["use_browser_cookies"],
            "cookies_browser": settings["cookies_browser"],
            "cookies_file": settings["cookies_file"],
            "frameless": settings["frameless"],
            "theme": settings["theme"],
            "language": settings["language"],
            "want_video": settings["want_video"],
            "want_audio": settings["want_audio"],
            "want_metadata": settings["want_metadata"],
            "want_thumbnail": settings["want_thumbnail"],
            "video_quality": settings.get("video_quality") or "Best",
            "audio_quality": settings.get("audio_quality") or "Best",
            "bundle": settings["bundle"],
            "combine_streams": settings["combine_streams"],
            "save_layout": settings["save_layout"],
            "group_playlist_channel": settings["group_playlist_channel"],
            "concurrency": settings["concurrency"],
            "remove_if_cancelled": settings["remove_if_cancelled"],
            "bundle_folder_template": settings["bundle_folder_template"],
            "file_name_template": settings["file_name_template"],
            "playlist_folder": settings["playlist_folder"],
            "channel_folder": settings["channel_folder"],
            "playlist_name_template": settings["playlist_name_template"],
            "channel_name_template": settings["channel_name_template"],
        }

    def save_app_settings(self, settings: dict[str, Any]) -> dict[str, Any]:
        current = load_settings()
        browser = settings.get("cookies_browser") or current["cookies_browser"]
        if browser not in BROWSER_OPTIONS:
            browser = current["cookies_browser"]

        concurrency = normalize_concurrency(settings.get("concurrency", current["concurrency"]))

        output_dir = normalize_output_dir(settings.get("output_dir"))
        if output_dir:
            self._output_dir = output_dir
            ensure_output_root(output_dir)

        updates = {
            "use_browser_cookies": bool(settings.get("use_browser_cookies", True)),
            "cookies_browser": browser,
            "cookies_file": (settings.get("cookies_file") or "").strip(),
            "frameless": bool(settings.get("frameless", True)),
            "theme": normalize_theme(settings.get("theme", current.get("theme", "default"))),
            "language": normalize_language(settings.get("language", current.get("language", "en"))),
            "want_video": bool(settings.get("want_video", True)),
            "want_audio": bool(settings.get("want_audio", True)),
            "want_metadata": bool(settings.get("want_metadata", True)),
            "want_thumbnail": bool(settings.get("want_thumbnail", True)),
            "video_quality": settings.get("video_quality") or "Best",
            "audio_quality": settings.get("audio_quality") or "Best",
            "output_dir": self._output_dir,
            "bundle": bool(settings.get("bundle", True)),
            "combine_streams": bool(settings.get("combine_streams", True)),
            "save_layout": normalize_save_layout(
                settings.get("save_layout"),
                organize=bool(settings.get("organize")) if "save_layout" not in settings else None,
            ),
            "group_playlist_channel": bool(settings.get("group_playlist_channel", True)),
            "concurrency": concurrency,
            "remove_if_cancelled": bool(settings.get("remove_if_cancelled", True)),
            "bundle_folder_template": normalize_name_template(
                settings.get("bundle_folder_template"),
                DEFAULT_BUNDLE_FOLDER_TEMPLATE,
            ),
            "file_name_template": normalize_name_template(
                settings.get("file_name_template"),
                DEFAULT_FILE_NAME_TEMPLATE,
            ),
            "playlist_folder": normalize_layout_folder_name(
                settings.get("playlist_folder"),
                DEFAULT_PLAYLIST_FOLDER,
            ),
            "channel_folder": normalize_layout_folder_name(
                settings.get("channel_folder"),
                DEFAULT_CHANNEL_FOLDER,
            ),
            "playlist_name_template": normalize_name_template(
                settings.get("playlist_name_template"),
                DEFAULT_PLAYLIST_NAME_TEMPLATE,
            ),
            "channel_name_template": normalize_name_template(
                settings.get("channel_name_template"),
                DEFAULT_CHANNEL_NAME_TEMPLATE,
            ),
        }
        return save_settings(updates)

    def restart_program(self) -> dict[str, Any]:
        threading.Thread(target=restart_application, daemon=True).start()
        return {"ok": True, "message": "Restarting..."}

    def get_extras_status(self) -> dict[str, Any]:
        return get_extras_status()

    def save_extras_settings(self, settings: dict[str, Any]) -> dict[str, Any]:
        return save_extras_settings(settings)

    def install_deno(self) -> dict[str, Any]:
        result = install_local_deno()
        if result.get("ok") and result.get("installed"):
            threading.Thread(target=restart_application, daemon=True).start()
            result["message"] = "Deno installed. Restarting..."
        return result

    def install_ffmpeg(self) -> dict[str, Any]:
        result = install_local_ffmpeg()
        if result.get("ok") and result.get("installed"):
            threading.Thread(target=restart_application, daemon=True).start()
            result["message"] = "ffmpeg installed. Restarting..."
        return result

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
        path = pick_file(
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
        path = pick_folder(self._output_dir, DEFAULT_OUTPUT)
        if path:
            path = normalize_output_dir(path)
            self._output_dir = path
            ensure_output_root(path)
            save_settings({"output_dir": path})
        return self._output_dir

    def enqueue_download(self, config: dict[str, Any]) -> dict[str, Any]:
        config = dict(config)
        output_dir = normalize_output_dir(config.get("output_dir")) or self._output_dir
        config["output_dir"] = output_dir
        settings = load_settings()
        config["cookie_settings"] = settings
        config["concurrency"] = normalize_concurrency(config.get("concurrency", settings["concurrency"]))
        ensure_output_root(config["output_dir"])
        job_id = self._queue.add(config)
        return {"job_id": job_id, **self._queue.queue_state()}

    def get_queue(self) -> dict[str, Any]:
        return self._queue.queue_state()

    def remove_queue_job(self, job_id: str) -> dict[str, Any]:
        removed = self._queue.remove(job_id)
        return {"ok": removed, **self._queue.queue_state()}

    def retry_queue_job(self, job_id: str) -> dict[str, Any]:
        retried = self._queue.retry_job(job_id)
        return {"ok": retried, **self._queue.queue_state()}

    def retry_failed_in_view(self, view_id: str | None = None) -> dict[str, Any]:
        count = self._queue.retry_failed_in_view(view_id)
        return {"ok": count > 0, "retried": count, **self._queue.queue_state()}

    def cancel_queue_view(self, view_id: str | None = None) -> dict[str, Any]:
        count = self._queue.cancel_view(view_id)
        return {"ok": True, "cancelled": count, **self._queue.queue_state()}

    def clear_queue(self, view_id: str | None = None) -> dict[str, Any]:
        count = self._queue.clear_view(view_id)
        return {"ok": True, "removed": count, **self._queue.queue_state()}

    def remove_queue_view(self, view_id: str) -> dict[str, Any]:
        removed = self._queue.remove_view(view_id)
        return {"ok": removed, **self._queue.queue_state()}
