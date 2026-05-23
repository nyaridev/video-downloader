"""Safe yt-dlp info extraction with clear errors."""

from __future__ import annotations

from typing import Any

import yt_dlp
from yt_dlp.utils import DownloadError, ExtractorError

from app.auth.cookies import CookieExportError, cookie_copy_help, export_browser_cookies, is_cookie_copy_error
from app.downloader.ytdlp_opts import base_ytdlp_opts
from app.utils.text import normalize_log_message


def _bot_check_hint(msg: str) -> bool:
    lower = msg.lower()
    return "not a bot" in lower or "sign in" in lower or (
        "cookies" in lower and "could not copy" not in lower
    )


def extract_info(
    url: str,
    opts: dict[str, Any],
    *,
    cookie_browser: str | None = None,
    logger: Any | None = None,
) -> dict[str, Any]:
    probe = base_ytdlp_opts(**opts, skip_download=True)
    if logger is not None:
        probe["logger"] = logger
    try:
        with yt_dlp.YoutubeDL(probe) as ydl:
            info = ydl.extract_info(url, download=False)
    except CookieExportError as exc:
        raise DownloadError(normalize_log_message(str(exc))) from exc
    except (DownloadError, ExtractorError) as exc:
        msg = normalize_log_message(str(exc))
        if is_cookie_copy_error(msg) and cookie_browser and not opts.get("cookiefile"):
            exported = export_browser_cookies(cookie_browser)
            if exported:
                retry_opts = {
                    k: v
                    for k, v in opts.items()
                    if k not in ("cookiesfrombrowser", "cookiefile")
                }
                retry_opts["cookiefile"] = str(exported)
                return extract_info(url, retry_opts, cookie_browser=cookie_browser)
            raise DownloadError(cookie_copy_help()) from exc
        if _bot_check_hint(msg):
            raise DownloadError(
                f"{msg}\n\n"
                "Tip: Use browser cookies, sign in via the app button, then retry. "
                "For Chrome/Edge use the app's Sign in button (unlock flag) or Firefox."
            ) from exc
        raise DownloadError(msg) from exc

    if not info:
        raise DownloadError(
            "Could not fetch video info. Enable browser cookies, sign in to YouTube, then retry."
        )
    return info
