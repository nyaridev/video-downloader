"""Launch Chromium browsers with the cookie-database unlock flag."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

from app.config import CHROMIUM_BROWSERS

UNLOCK_FLAG = "--disable-features=LockProfileCookieDatabase"
YOUTUBE_URL = "https://www.youtube.com/"

# Common Windows install locations
_SEARCH_PATHS: dict[str, list[str]] = {
    "chrome": [
        r"%ProgramFiles%\Google\Chrome\Application\chrome.exe",
        r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe",
        r"%LocalAppData%\Google\Chrome\Application\chrome.exe",
    ],
    "edge": [
        r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe",
        r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe",
    ],
    "brave": [
        r"%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe",
        r"%LocalAppData%\BraveSoftware\Brave-Browser\Application\brave.exe",
    ],
    "chromium": [
        r"%ProgramFiles%\Chromium\Application\chrome.exe",
        r"%LocalAppData%\Chromium\Application\chrome.exe",
    ],
    "opera": [
        r"%ProgramFiles%\Opera\opera.exe",
        r"%LocalAppData%\Programs\Opera\opera.exe",
    ],
    "vivaldi": [
        r"%ProgramFiles%\Vivaldi\Application\vivaldi.exe",
        r"%LocalAppData%\Vivaldi\Application\vivaldi.exe",
    ],
}


def _expand(path: str) -> Path:
    return Path(os.path.expandvars(path))


def find_browser_exe(browser: str) -> Path | None:
    if browser == "firefox":
        for pattern in (
            r"%ProgramFiles%\Mozilla Firefox\firefox.exe",
            r"%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe",
        ):
            p = _expand(pattern)
            if p.is_file():
                return p
        return None

    for pattern in _SEARCH_PATHS.get(browser, []):
        p = _expand(pattern)
        if p.is_file():
            return p
    return None


def launch_for_youtube_signin(browser: str) -> tuple[bool, str]:
    """Open browser at YouTube; Chromium builds get the cookie-unlock flag."""
    exe = find_browser_exe(browser)
    if exe is None:
        return False, f"Could not find {browser} on this PC. Open it manually and sign in to YouTube."

    args = [str(exe)]
    if browser in CHROMIUM_BROWSERS:
        args.append(UNLOCK_FLAG)
    args.append(YOUTUBE_URL)

    try:
        subprocess.Popen(
            args,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
        )
    except OSError as exc:
        return False, f"Failed to launch {browser}: {exc}"

    if browser in CHROMIUM_BROWSERS:
        return (
            True,
            f"Launched {browser} with cookie unlock flag. Sign in, then try downloading "
            "(you can leave this window open).",
        )
    return True, f"Launched {browser}. Sign in to YouTube, then retry the download."
