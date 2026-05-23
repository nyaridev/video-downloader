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


DEFAULT_VIDEOS_FOLDER = "Videos"
DEFAULT_PLAYLIST_FOLDER = "Playlists"
DEFAULT_CHANNEL_FOLDER = "Channel"


def normalize_layout_folder_name(value: str | None, default: str) -> str:
    """Sanitize a user-configured layout folder name."""
    text = str(value or "").strip()
    if not text:
        return default
    cleaned = sanitize_name(text, max_len=60)
    return cleaned or default


def ensure_output_root(custom: str | None = None) -> Path:
    root = Path(custom) if custom else DEFAULT_OUTPUT
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def resolve_download_dir(
    *,
    output_root: Path,
    mode: str,
    save_layout: str,
    group_playlist_channel: bool,
    bundle: bool,
    bundle_folder_template: str,
    naming_context: dict[str, str],
    playlist_title: str | None,
    playlist_id: str | None,
    channel_handle: str | None,
    channel_id: str | None,
    playlist_folder: str = DEFAULT_PLAYLIST_FOLDER,
    channel_folder: str = DEFAULT_CHANNEL_FOLDER,
    playlist_name_template: str = "{playlist}_{id}",
    channel_name_template: str = "{channel}_{id}",
) -> Path:
    """Compute the directory where files for one video should land."""
    from app.utils.naming import build_channel_context, build_playlist_context, render_name_template

    layout = save_layout if save_layout in ("flat", "organized", "intelligent") else "flat"

    def playlist_subfolder() -> str:
        return render_name_template(
            playlist_name_template,
            build_playlist_context(playlist_title, playlist_id),
        )

    def channel_subfolder() -> str:
        return render_name_template(
            channel_name_template,
            build_channel_context(channel_handle, channel_id),
        )

    if layout == "intelligent":
        base = output_root / (naming_context.get("channel") or "unknown")
    elif layout == "organized":
        if mode == "video":
            base = output_root / DEFAULT_VIDEOS_FOLDER
        elif mode == "playlist":
            base = output_root / playlist_folder
            if playlist_title or playlist_id:
                base = base / playlist_subfolder()
        elif mode == "channel":
            base = output_root / channel_folder
            if channel_handle or channel_id:
                base = base / channel_subfolder()
        else:
            base = output_root / DEFAULT_VIDEOS_FOLDER
    else:
        base = output_root
        if mode == "playlist" and group_playlist_channel and (playlist_title or playlist_id):
            base = base / playlist_subfolder()
        elif mode == "channel" and group_playlist_channel and (channel_handle or channel_id):
            base = base / channel_subfolder()

    if bundle:
        folder_name = render_name_template(bundle_folder_template, naming_context)
        base = base / folder_name

    base.mkdir(parents=True, exist_ok=True)
    return base
