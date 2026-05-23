"""Theme-locked Nekos API helper for the Anime background."""

from __future__ import annotations

import base64
import json
import urllib.error
import urllib.request

NEKOS_RANDOM_URL = "https://api.nekosapi.com/v4/images/random?limit=1&rating=safe"
USER_AGENT = "NariVideoDownloader/1.0"
MAX_IMAGE_BYTES = 8 * 1024 * 1024


def fetch_random_background_image() -> dict[str, str | bool]:
    try:
        api_req = urllib.request.Request(
            NEKOS_RANDOM_URL,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        )
        with urllib.request.urlopen(api_req, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))

        item = payload[0] if isinstance(payload, list) else payload.get("items", [{}])[0]
        image_url = item.get("url")
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
