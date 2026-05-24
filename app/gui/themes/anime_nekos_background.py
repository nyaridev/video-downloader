"""Theme-locked Nekos API helper for the Anime background."""

from __future__ import annotations

import base64
import json
import random
import struct
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

from app.paths import USER_DIR

NEKOS_RANDOM_BASE = "https://api.nekosapi.com/v4/images/random"
USER_AGENT = "NariVideoDownloader/1.0"
MAX_IMAGE_BYTES = 8 * 1024 * 1024
CANDIDATE_LIMIT = 15
HEADER_BYTES = 65536
MIN_LANDSCAPE_RATIO = 1.0
ANIME_BACKGROUND_LOG = USER_DIR / "anime_background_images.log"
MAX_LOG_LINES = 1000

# Tags are shuffled per request; invalid tags are skipped automatically.
_COLOR_SCHEME_TAG_CANDIDATES: dict[str, tuple[str, ...]] = {
    "dark": (
        "night",
        "rain",
        "evening",
        "moon",
        "emo",
        "goth",
        "gothic",
        "starry_sky",
        "city_lights",
        "neon",
        "indoors",
        "purple_hair",
        "black_hair",
        "vampire",
        "witch",
        "sad",
        "lonely",
        "catgirl",
    ),
    "light": (
        "blue_archive",
        "loli",
        "beach",
        "blue_sky",
        "day",
        "flower",
        "spring",
        "summer",
        "outdoors",
        "school_uniform",
        "smile",
        "cloud",
        "sky",
        "sunlight",
        "white_dress",
        "blonde_hair",
        "catgirl",
        "sunset",
    ),
}


def _random_url(*, tags: str | None = None, limit: int = CANDIDATE_LIMIT) -> str:
    params: dict[str, str | int] = {"limit": limit, "rating": "safe"}
    if tags:
        params["tags"] = tags
    return f"{NEKOS_RANDOM_BASE}?{urllib.parse.urlencode(params)}"


def _webp_size(data: bytes) -> tuple[int, int] | None:
    if len(data) < 30 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None

    chunk = data[12:16]
    if chunk == b"VP8 ":
        width = struct.unpack_from("<H", data, 26)[0] & 0x3FFF
        height = struct.unpack_from("<H", data, 28)[0] & 0x3FFF
        return width, height
    if chunk == b"VP8L" and len(data) >= 25:
        bits = struct.unpack_from("<I", data, 21)[0]
        width = (bits & 0x3FFF) + 1
        height = ((bits >> 14) & 0x3FFF) + 1
        return width, height
    if chunk == b"VP8X" and len(data) >= 30:
        width = 1 + int.from_bytes(data[24:27], "little")
        height = 1 + int.from_bytes(data[27:30], "little")
        return width, height
    return None


def _jpeg_size(data: bytes) -> tuple[int, int] | None:
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        return None

    index = 2
    while index + 8 < len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            height = int.from_bytes(data[index + 5 : index + 7], "big")
            width = int.from_bytes(data[index + 7 : index + 9], "big")
            return width, height
        if marker in (0xD8, 0xD9):
            return None
        segment_length = int.from_bytes(data[index + 2 : index + 4], "big")
        index += 2 + segment_length
    return None


def _png_size(data: bytes) -> tuple[int, int] | None:
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    return width, height


def _read_image_size(data: bytes) -> tuple[int, int] | None:
    for reader in (_webp_size, _png_size, _jpeg_size):
        size = reader(data)
        if size:
            return size
    return None


def _is_landscape(width: int, height: int) -> bool:
    if width <= 0 or height <= 0:
        return False
    return width / height >= MIN_LANDSCAPE_RATIO


def _log_selected_background_image(image_url: str) -> None:
    try:
        USER_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S.%f")
        entry = f"{timestamp} {image_url}"

        lines: list[str] = []
        if ANIME_BACKGROUND_LOG.is_file():
            lines = ANIME_BACKGROUND_LOG.read_text(encoding="utf-8").splitlines()

        lines.insert(0, entry)
        ANIME_BACKGROUND_LOG.write_text(
            "\n".join(lines[:MAX_LOG_LINES]) + ("\n" if lines[:MAX_LOG_LINES] else ""),
            encoding="utf-8",
        )
    except OSError:
        return


def _fetch_metadata(url: str) -> list[dict]:
    api_req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    with urllib.request.urlopen(api_req, timeout=15) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if isinstance(payload, list):
        return payload
    return payload.get("items") or []


def _fetch_image_bytes(url: str, *, max_bytes: int | None = None) -> bytes:
    image_req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "image/*"},
    )
    with urllib.request.urlopen(image_req, timeout=30) as response:
        if max_bytes is None:
            return response.read()
        return response.read(max_bytes)


def _pick_image_url(color_scheme: str) -> str | None:
    tag_pool = list(_COLOR_SCHEME_TAG_CANDIDATES.get(color_scheme, ()))
    random.shuffle(tag_pool)
    tag_pool.append(None)  # untagged safe random as final fallback

    for tag in tag_pool:
        try:
            items = _fetch_metadata(_random_url(tags=tag))
        except urllib.error.HTTPError:
            continue

        random.shuffle(items)
        for item in items:
            url = item.get("url")
            if not url:
                continue
            try:
                header = _fetch_image_bytes(str(url), max_bytes=HEADER_BYTES)
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
                continue

            size = _read_image_size(header)
            if not size or not _is_landscape(*size):
                continue
            return str(url)
    return None


def fetch_random_background_image(color_scheme: str = "dark") -> dict[str, str | bool]:
    scheme = color_scheme if color_scheme in _COLOR_SCHEME_TAG_CANDIDATES else "dark"
    try:
        image_url = _pick_image_url(scheme)
        if not image_url:
            return {"ok": False, "error": "Nekos API returned no landscape image URL"}

        image_req = urllib.request.Request(
            image_url,
            headers={"User-Agent": USER_AGENT, "Accept": "image/*"},
        )
        with urllib.request.urlopen(image_req, timeout=30) as response:
            content_type = response.headers.get("Content-Type", "image/webp").split(";", 1)[0].strip()
            data = response.read(MAX_IMAGE_BYTES + 1)

        if len(data) > MAX_IMAGE_BYTES:
            return {"ok": False, "error": "Background image is too large"}

        _log_selected_background_image(image_url)
        encoded = base64.b64encode(data).decode("ascii")
        return {"ok": True, "url": f"data:{content_type};base64,{encoded}"}
    except urllib.error.HTTPError as exc:
        return {"ok": False, "error": f"Nekos API responded with {exc.code}"}
    except urllib.error.URLError as exc:
        return {"ok": False, "error": f"Network error: {exc.reason}"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
