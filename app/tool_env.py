"""Optional executable paths from environment (e.g. start-user.bat)."""

from __future__ import annotations

import os
from pathlib import Path


def env_executable_path(var_name: str) -> Path | None:
    """Return a verified executable path from an env var, or None if unset/invalid."""
    raw = (os.environ.get(var_name) or "").strip().strip('"')
    if not raw:
        return None
    path = Path(raw).expanduser()
    return path if path.is_file() else None
