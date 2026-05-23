"""Restart the application (Windows and Linux)."""

from __future__ import annotations

import subprocess
import sys

from app.paths import ROOT


def restart_application() -> None:
    """Spawn a new app instance and exit the current process."""
    import webview

    python = sys.executable
    main_script = ROOT / "main.py"
    popen_kwargs: dict = {
        "cwd": str(ROOT),
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }
    if sys.platform == "win32":
        popen_kwargs["creationflags"] = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        popen_kwargs["start_new_session"] = True

    subprocess.Popen([python, str(main_script)], **popen_kwargs)

    for window in list(webview.windows):
        try:
            window.destroy()
        except Exception:
            pass
    sys.exit(0)
