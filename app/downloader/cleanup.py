"""Remove download artifacts when a job is cancelled."""

from __future__ import annotations

import shutil
from pathlib import Path


def _matches_task_file(path: Path, video_id: str) -> bool:
    return path.is_file() and path.name.startswith(video_id)


def _safe_unlink(path: Path) -> None:
    try:
        if path.is_file():
            path.unlink()
    except OSError:
        pass


def cleanup_cancelled_job(
    target_dir: Path | str | None,
    video_id: str | None,
    *,
    bundle: bool = False,
) -> int:
    """Remove all files for a cancelled task. Returns number of files removed."""
    if not target_dir or not video_id:
        return 0

    root = Path(target_dir)
    if not root.exists():
        return 0

    if bundle:
        if not root.is_dir():
            return 0
        removed = sum(1 for path in root.rglob("*") if path.is_file())
        try:
            shutil.rmtree(root)
        except OSError:
            pass
        return removed

    removed = 0
    if root.is_dir():
        for path in list(root.iterdir()):
            if _matches_task_file(path, video_id):
                _safe_unlink(path)
                removed += 1
    return removed
