"""Workspace-relative paths and safe folder names."""

from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

# Directory containing main.py / start.bat (project root)
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = ROOT / "output"
GUI_DIR = Path(__file__).resolve().parent / "gui"

USER_DIR = ROOT / ".user"
EXTRAS_DIR = USER_DIR / "extras"
DENO_DIR = EXTRAS_DIR / "deno"
FFMPEG_DIR = EXTRAS_DIR / "ffmpeg"
WEBVIEW_DIR = USER_DIR / "webview"
DENO_EXE = DENO_DIR / ("deno.exe" if sys.platform == "win32" else "deno")
FFMPEG_EXE = FFMPEG_DIR / ("ffmpeg.exe" if sys.platform == "win32" else "ffmpeg")

_INVALID_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_WHITESPACE = re.compile(r"\s+")


def _migrate_dir_contents(old: Path, new: Path) -> None:
    if not old.is_dir():
        return
    new.mkdir(parents=True, exist_ok=True)
    for item in old.iterdir():
        target = new / item.name
        if target.exists():
            continue
        try:
            shutil.move(str(item), str(target))
        except OSError:
            continue
    try:
        old.rmdir()
    except OSError:
        pass


def migrate_legacy_user_dirs() -> None:
    """Move legacy root-level app data folders into .user/."""
    _migrate_dir_contents(ROOT / ".deno", DENO_DIR)
    _migrate_dir_contents(ROOT / ".ffmpeg", FFMPEG_DIR)
    _migrate_dir_contents(ROOT / ".webview", WEBVIEW_DIR)


def ensure_user_layout() -> None:
    migrate_legacy_user_dirs()
    USER_DIR.mkdir(parents=True, exist_ok=True)
    EXTRAS_DIR.mkdir(parents=True, exist_ok=True)
    WEBVIEW_DIR.mkdir(parents=True, exist_ok=True)


def sanitize_name(name: str, max_len: int = 120) -> str:
    """Make a string safe for Windows folder names."""
    cleaned = _INVALID_CHARS.sub("", name or "untitled")
    cleaned = _WHITESPACE.sub(" ", cleaned).strip().rstrip(".")
    if not cleaned:
        cleaned = "untitled"
    return cleaned[:max_len]


def ensure_output_root(custom: str | None = None) -> Path:
    root = Path(custom) if custom else DEFAULT_OUTPUT
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def resolve_download_dir(
    *,
    output_root: Path,
    mode: str,
    organize: bool,
    bundle: bool,
    video_id: str,
    title: str,
    playlist_title: str | None,
    channel_handle: str | None,
) -> Path:
    """Compute the directory where files for one video should land."""
    safe_title = sanitize_name(title)
    folder_name = f"{safe_title}_{video_id}" if bundle else ""

    if not organize:
        base = output_root
        if bundle:
            base = base / folder_name
        base.mkdir(parents=True, exist_ok=True)
        return base

    if mode == "playlist" and playlist_title:
        base = output_root / "playlists" / sanitize_name(playlist_title)
    elif mode == "channel" and channel_handle:
        handle = channel_handle if channel_handle.startswith("@") else f"@{channel_handle}"
        base = output_root / "channels" / sanitize_name(handle)
    else:
        base = output_root / "videos"

    if bundle:
        base = base / folder_name
    base.mkdir(parents=True, exist_ok=True)
    return base
