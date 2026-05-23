"""Clean text for GUI logs (strip ANSI, normalize yt-dlp errors)."""

from __future__ import annotations

import re

_ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
_ERROR_DUP_RE = re.compile(r"(ERROR:\s*)+", re.IGNORECASE)


def strip_ansi(text: str) -> str:
    return _ANSI_RE.sub("", text or "")


def normalize_log_message(text: str) -> str:
    """Plain text safe for the webview console."""
    msg = strip_ansi(text)
    msg = msg.replace("\r\n", "\n").replace("\r", "\n")
    # Straight quotes (avoid odd glyphs in some fonts)
    msg = msg.replace("\u201c", '"').replace("\u201d", '"').replace("\u2018", "'").replace("\u2019", "'")
    msg = msg.replace("\u2022", "-")
    msg = _ERROR_DUP_RE.sub("ERROR: ", msg)
    lines: list[str] = []
    seen: set[str] = set()
    for line in msg.split("\n"):
        line = line.strip()
        if not line:
            if lines and lines[-1] != "":
                lines.append("")
            continue
        if line in seen:
            continue
        seen.add(line)
        lines.append(line)
    return "\n".join(lines).strip()
