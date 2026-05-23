"""Launch browsers for YouTube sign-in (Windows and Linux)."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

from app.config import CHROMIUM_BROWSERS

UNLOCK_FLAG = "--disable-features=LockProfileCookieDatabase"
YOUTUBE_URL = "https://www.youtube.com/"

_LINUX_BIN_NAMES: dict[str, tuple[str, ...]] = {
    "firefox": ("firefox", "firefox-esr"),
    "chrome": ("google-chrome", "google-chrome-stable", "chrome"),
    "chromium": ("chromium", "chromium-browser"),
    "brave": ("brave-browser", "brave"),
    "opera": ("opera",),
    "vivaldi": ("vivaldi", "vivaldi-stable"),
    "edge": ("microsoft-edge", "microsoft-edge-stable"),
}

_WIN_SEARCH: dict[str, list[str]] = {
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
    "firefox": [
        r"%ProgramFiles%\Mozilla Firefox\firefox.exe",
        r"%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe",
    ],
}


def find_browser_exe(browser: str) -> Path | None:
    if sys.platform == "win32":
        for pattern in _WIN_SEARCH.get(browser, []):
            path = Path(os.path.expandvars(pattern))
            if path.is_file():
                return path
        return None

    for name in _LINUX_BIN_NAMES.get(browser, (browser,)):
        resolved = shutil.which(name)
        if resolved:
            return Path(resolved)
    return None


def launch_for_youtube_signin(browser: str) -> tuple[bool, str]:
    """Open browser at YouTube; Chromium builds get the cookie-unlock flag on Windows."""
    exe = find_browser_exe(browser)
    if exe is None:
        return False, (
            f"Could not find {browser}. Open YouTube in your browser manually and sign in."
        )

    args = [str(exe)]
    if browser in CHROMIUM_BROWSERS and sys.platform == "win32":
        args.append(UNLOCK_FLAG)
    args.append(YOUTUBE_URL)

    popen_kwargs: dict = {
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }
    if sys.platform == "win32":
        popen_kwargs["close_fds"] = True
    else:
        popen_kwargs["start_new_session"] = True

    try:
        subprocess.Popen(args, **popen_kwargs)
    except OSError as exc:
        return False, f"Failed to launch {browser}: {exc}"

    if browser in CHROMIUM_BROWSERS and sys.platform == "win32":
        return True, f"Launched {browser} with cookie unlock flag. Sign in, then retry."
    return True, f"Launched {browser}. Sign in to YouTube, then retry."
