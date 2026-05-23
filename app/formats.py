"""Map GUI quality labels to yt-dlp format selectors."""

from __future__ import annotations

VIDEO_HEIGHTS: dict[str, int | None] = {
    "Best": None,
    "4320p": 4320,
    "2160p": 2160,
    "1440p": 1440,
    "1080p": 1080,
    "720p": 720,
    "480p": 480,
    "360p": 360,
    "240p": 240,
    "144p": 144,
    "Worst": -1,
}

AUDIO_QUALITIES = ("Best", "320k", "256k", "192k", "128k", "96k", "64k", "Worst")

VIDEO_QUALITY_OPTIONS = list(VIDEO_HEIGHTS.keys())
AUDIO_QUALITY_OPTIONS = list(AUDIO_QUALITIES)


def _video_sort(quality: str) -> str:
    height = VIDEO_HEIGHTS.get(quality)
    if height is None:
        return "bv*+ba/b"
    if height == -1:
        return "wv*+wa/w"
    return f"bv*[height<={height}]+ba/b[height<={height}]/b[height<={height}]"


def _audio_sort(quality: str) -> str:
    if quality == "Best":
        return "ba/b"
    if quality == "Worst":
        return "wa/w"
    kbps = quality.replace("k", "")
    return f"ba[abr<={kbps}]/ba/b"


def build_format_string(
    *,
    want_video: bool,
    want_audio: bool,
    video_quality: str,
    audio_quality: str,
) -> str:
    if want_video and want_audio:
        v = _video_sort(video_quality)
        return v
    if want_video:
        height = VIDEO_HEIGHTS.get(video_quality)
        if height is None:
            return "bv*/b"
        if height == -1:
            return "wv/w"
        return f"bv*[height<={height}]/b[height<={height}]/b"
    if want_audio:
        return _audio_sort(audio_quality)
    return "best"


def pick_nearest_height(requested: str, available_heights: list[int]) -> tuple[int | None, str | None]:
    """Return actual height and warning if requested height is unavailable."""
    target = VIDEO_HEIGHTS.get(requested)
    if target is None or target == -1 or not available_heights:
        return None, None
    if target in available_heights:
        return target, None
    best = max(available_heights)
    nearest = min(available_heights, key=lambda h: abs(h - target))
    msg = (
        f"{requested} is not available for this video. "
        f"Using {nearest}p instead (max available: {best}p)."
    )
    return nearest, msg
