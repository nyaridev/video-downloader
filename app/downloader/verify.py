"""Check whether a video was already fully downloaded."""

from __future__ import annotations

from pathlib import Path

from yt_dlp.utils import traverse_obj

from app.downloader.metadata import META_FILENAME


def _has_artifact(directory: Path, file_base: str, extensions: tuple[str, ...]) -> bool:
    for path in directory.iterdir():
        if not path.is_file() or path.stat().st_size == 0:
            continue
        if not path.name.startswith(file_base):
            continue
        if path.suffix.lower().lstrip(".") in extensions or path.suffix.lower() in extensions:
            return True
    return False


def _has_metadata(directory: Path, file_base: str) -> bool:
    path = directory / f"{file_base}{META_FILENAME}"
    return path.is_file() and path.stat().st_size > 0


def expected_files_present(
    directory: Path,
    file_base: str,
    *,
    want_video: bool,
    want_audio: bool,
    want_metadata: bool,
    want_thumbnail: bool,
) -> bool:
    """Return True only if every requested artifact exists and is non-empty."""
    if not directory.is_dir():
        return False

    checks: list[bool] = []

    if want_metadata:
        checks.append(_has_metadata(directory, file_base))

    if want_thumbnail:
        checks.append(_has_artifact(directory, file_base, (".jpg", ".jpeg", ".png", ".webp")))

    if want_audio:
        checks.append(_has_artifact(directory, file_base, (".m4a", ".opus", ".mp3", ".ogg", ".wav", ".aac")))

    if want_video:
        checks.append(_has_artifact(directory, file_base, (".mp4", ".mkv", ".mov")))

    return bool(checks) and all(checks)


def collect_heights(info: dict) -> list[int]:
    heights: list[int] = []
    for fmt in traverse_obj(info, ("formats",), default=[]) or []:
        h = fmt.get("height")
        if h and fmt.get("vcodec") not in ("none", None):
            heights.append(int(h))
    return sorted(set(heights))
