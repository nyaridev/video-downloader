"""Native file/folder pickers for the webview API."""

from __future__ import annotations

import threading
from pathlib import Path


def pick_file(filetypes: list[tuple[str, str]], initial: str) -> str | None:
    result: list[str | None] = [None]

    def _dialog() -> None:
        try:
            import tkinter as tk
            from tkinter import filedialog

            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            chosen = filedialog.askopenfilename(initialdir=initial, filetypes=filetypes)
            root.destroy()
            result[0] = chosen or None
        except Exception:
            result[0] = None

    t = threading.Thread(target=_dialog)
    t.start()
    t.join(timeout=120)
    return result[0]


def pick_folder(initial: str, fallback: Path) -> str | None:
    result: list[str | None] = [None]

    def _dialog() -> None:
        try:
            import tkinter as tk
            from tkinter import filedialog

            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            chosen = filedialog.askdirectory(initialdir=initial or str(fallback))
            root.destroy()
            result[0] = chosen or None
        except Exception:
            result[0] = None

    t = threading.Thread(target=_dialog)
    t.start()
    t.join(timeout=120)
    return result[0]
