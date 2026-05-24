"""Theme-locked Nekos API helper for the Anime background."""

from __future__ import annotations

import base64
import json
import random
import urllib.error
import urllib.parse
import urllib.request

NEKOS_RANDOM_BASE = "https://api.nekosapi.com/v4/images/random"
USER_AGENT = "NariVideoDownloader/1.0"
MAX_IMAGE_BYTES = 8 * 1024 * 1024

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
        "sunny",
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


def _random_url(*, tags: str | None = None) -> str:
    params: dict[str, str | int] = {"limit": 1, "rating": "safe"}
    if tags:
        params["tags"] = tags
    return f"{NEKOS_RANDOM_BASE}?{urllib.parse.urlencode(params)}"


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


def _pick_image_url(color_scheme: str) -> str | None:
    tag_pool = list(_COLOR_SCHEME_TAG_CANDIDATES.get(color_scheme, ()))
    random.shuffle(tag_pool)
    tag_pool.append(None)  # untagged safe random as final fallback

    for tag in tag_pool:
        try:
            items = _fetch_metadata(_random_url(tags=tag))
        except urllib.error.HTTPError:
            continue
        if items:
            url = items[0].get("url")
            if url:
                return str(url)
    return None


def fetch_random_background_image(color_scheme: str = "dark") -> dict[str, str | bool]:
    scheme = color_scheme if color_scheme in _COLOR_SCHEME_TAG_CANDIDATES else "dark"
    try:
        image_url = _pick_image_url(scheme)
        if not image_url:
            return {"ok": False, "error": "Nekos API returned no image URL"}

        image_req = urllib.request.Request(
            image_url,
            headers={"User-Agent": USER_AGENT, "Accept": "image/*"},
        )
        with urllib.request.urlopen(image_req, timeout=30) as response:
            content_type = response.headers.get("Content-Type", "image/webp").split(";", 1)[0].strip()
            data = response.read(MAX_IMAGE_BYTES + 1)

        if len(data) > MAX_IMAGE_BYTES:
            return {"ok": False, "error": "Background image is too large"}

        encoded = base64.b64encode(data).decode("ascii")
        return {"ok": True, "url": f"data:{content_type};base64,{encoded}"}
    except urllib.error.HTTPError as exc:
        return {"ok": False, "error": f"Nekos API responded with {exc.code}"}
    except urllib.error.URLError as exc:
        return {"ok": False, "error": f"Network error: {exc.reason}"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
