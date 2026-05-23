"""Install and locate Deno for yt-dlp."""

from __future__ import annotations

import platform
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

from app.paths import DENO_DIR, DENO_EXE
from app.tool_env import env_executable_path
DENO_DOWNLOAD_BASE = "https://github.com/denoland/deno/releases/latest/download"


def local_deno_exe_path() -> Path:
    return DENO_EXE


def _deno_asset_name() -> str:
    machine = platform.machine().lower()
    arch = "aarch64" if machine in ("arm64", "aarch64") else "x86_64"
    if sys.platform == "win32":
        return f"deno-{arch}-pc-windows-msvc.zip"
    if sys.platform == "darwin":
        return f"deno-{arch}-apple-darwin.zip"
    return f"deno-{arch}-unknown-linux-gnu.zip"


def _read_deno_version(path: Path) -> str | None:
    try:
        proc = subprocess.run(
            [str(path), "--version"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0:
        return None
    first_line = (proc.stdout or proc.stderr or "").splitlines()
    if not first_line:
        return None
    return first_line[0].strip() or None


def _tool_status(path: Path | None) -> dict[str, str | bool]:
    if not path:
        return {"installed": False, "path": "", "version": ""}
    resolved = Path(path)
    if not resolved.is_file():
        return {"installed": False, "path": str(resolved), "version": ""}
    version = _read_deno_version(resolved)
    return {
        "installed": bool(version),
        "path": str(resolved),
        "version": version or "",
    }


def path_deno_status() -> dict[str, str | bool]:
    custom = env_executable_path("DENO")
    if custom:
        return _tool_status(custom)
    found = shutil.which("deno")
    return _tool_status(Path(found) if found else None)


def local_deno_status() -> dict[str, str | bool]:
    return _tool_status(local_deno_exe_path())


def is_local_deno_installed() -> bool:
    return bool(local_deno_status()["installed"])


def resolve_deno_runtime(source: str) -> dict[str, dict[str, str]]:
    if source == "local":
        status = local_deno_status()
    else:
        status = path_deno_status()
    if not status["installed"]:
        return {}
    return {"deno": {"path": str(status["path"])}}


def install_local_deno() -> dict[str, str | bool]:
    if is_local_deno_installed():
        status = local_deno_status()
        return {
            "ok": True,
            "installed": True,
            "message": "Deno is already installed.",
            "version": status["version"],
            "path": status["path"],
        }

    asset = _deno_asset_name()
    url = f"{DENO_DOWNLOAD_BASE}/{asset}"
    DENO_DIR.mkdir(parents=True, exist_ok=True)

    tmp_path: Path | None = None
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "video-downloader"})
        with urllib.request.urlopen(req, timeout=300) as response:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
                tmp_path = Path(tmp.name)
                shutil.copyfileobj(response, tmp)

        with zipfile.ZipFile(tmp_path) as archive:
            members = [name for name in archive.namelist() if Path(name).name == DENO_EXE.name]
            if not members:
                return {"ok": False, "message": f"Deno archive did not contain {DENO_EXE.name}."}
            member = members[0]
            with archive.open(member) as src, open(DENO_EXE, "wb") as dst:
                shutil.copyfileobj(src, dst)

        if sys.platform != "win32":
            DENO_EXE.chmod(DENO_EXE.stat().st_mode | 0o111)

        status = local_deno_status()
        if not status["installed"]:
            if DENO_EXE.is_file():
                DENO_EXE.unlink(missing_ok=True)
            return {"ok": False, "message": "Downloaded Deno failed verification."}

        return {
            "ok": True,
            "installed": True,
            "message": "Deno installed successfully.",
            "version": status["version"],
            "path": status["path"],
        }
    except urllib.error.HTTPError as exc:
        return {"ok": False, "message": f"Failed to download Deno ({exc.code} {exc.reason})."}
    except urllib.error.URLError as exc:
        return {"ok": False, "message": f"Failed to download Deno: {exc.reason}."}
    except zipfile.BadZipFile:
        return {"ok": False, "message": "Downloaded file was not a valid Deno archive."}
    except OSError as exc:
        return {"ok": False, "message": f"Failed to install Deno: {exc}"}
    finally:
        if tmp_path and tmp_path.is_file():
            tmp_path.unlink(missing_ok=True)
