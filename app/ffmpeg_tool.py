"""Install and locate ffmpeg for stream merging."""

from __future__ import annotations

import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

from app.paths import FFMPEG_DIR, FFMPEG_EXE
from app.tool_env import env_executable_path
FFMPEG_DOWNLOAD_BASE = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest"


def local_ffmpeg_exe_path() -> Path:
    return FFMPEG_EXE


def _ffmpeg_asset_name() -> tuple[str, str]:
    machine = platform.machine().lower()
    arch = "arm64" if machine in ("arm64", "aarch64") else "64"
    if sys.platform == "win32":
        return f"ffmpeg-master-latest-win{arch}-gpl.zip", ".zip"
    if sys.platform == "darwin":
        suffix = "macosarm64" if machine == "arm64" else "macos64"
        return f"ffmpeg-master-latest-{suffix}-gpl.zip", ".zip"
    return f"ffmpeg-master-latest-linux{arch}-gpl.tar.xz", ".tar.xz"


def _read_ffmpeg_version(path: Path) -> str | None:
    try:
        proc = subprocess.run(
            [str(path), "-version"],
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
    version = _read_ffmpeg_version(resolved)
    return {
        "installed": bool(version),
        "path": str(resolved),
        "version": version or "",
    }


def path_ffmpeg_status() -> dict[str, str | bool]:
    custom = env_executable_path("FFMPEG")
    if custom:
        return _tool_status(custom)
    found = shutil.which("ffmpeg")
    return _tool_status(Path(found) if found else None)


def local_ffmpeg_status() -> dict[str, str | bool]:
    return _tool_status(local_ffmpeg_exe_path())


def is_local_ffmpeg_installed() -> bool:
    return bool(local_ffmpeg_status()["installed"])


def ffmpeg_available(source: str) -> bool:
    if source == "local":
        return is_local_ffmpeg_installed()
    return bool(path_ffmpeg_status()["installed"])


def resolve_ffmpeg_location(source: str) -> str | None:
    if source == "local":
        status = local_ffmpeg_status()
    else:
        status = path_ffmpeg_status()
    if not status["installed"]:
        return None
    return str(Path(str(status["path"])).parent)


def _extract_ffmpeg_from_zip(archive: zipfile.ZipFile) -> None:
    members = [name for name in archive.namelist() if Path(name).name == FFMPEG_EXE.name]
    if not members:
        raise ValueError(f"Archive did not contain {FFMPEG_EXE.name}.")
    FFMPEG_DIR.mkdir(parents=True, exist_ok=True)
    with archive.open(members[0]) as src, open(FFMPEG_EXE, "wb") as dst:
        shutil.copyfileobj(src, dst)


def _extract_ffmpeg_from_tar(archive: tarfile.TarFile) -> None:
    members = [member for member in archive.getmembers() if Path(member.name).name == FFMPEG_EXE.name]
    if not members:
        raise ValueError(f"Archive did not contain {FFMPEG_EXE.name}.")
    FFMPEG_DIR.mkdir(parents=True, exist_ok=True)
    extracted = archive.extractfile(members[0])
    if extracted is None:
        raise ValueError(f"Could not extract {FFMPEG_EXE.name}.")
    with extracted, open(FFMPEG_EXE, "wb") as dst:
        shutil.copyfileobj(extracted, dst)


def install_local_ffmpeg() -> dict[str, str | bool]:
    if is_local_ffmpeg_installed():
        status = local_ffmpeg_status()
        return {
            "ok": True,
            "installed": True,
            "message": "ffmpeg is already installed.",
            "version": status["version"],
            "path": status["path"],
        }

    asset, suffix = _ffmpeg_asset_name()
    url = f"{FFMPEG_DOWNLOAD_BASE}/{asset}"
    tmp_path: Path | None = None
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "video-downloader"})
        with urllib.request.urlopen(req, timeout=600) as response:
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp_path = Path(tmp.name)
                shutil.copyfileobj(response, tmp)

        if suffix == ".zip":
            with zipfile.ZipFile(tmp_path) as archive:
                _extract_ffmpeg_from_zip(archive)
        else:
            with tarfile.open(tmp_path, "r:*") as archive:
                _extract_ffmpeg_from_tar(archive)

        if sys.platform != "win32":
            FFMPEG_EXE.chmod(FFMPEG_EXE.stat().st_mode | 0o111)

        status = local_ffmpeg_status()
        if not status["installed"]:
            if FFMPEG_EXE.is_file():
                FFMPEG_EXE.unlink(missing_ok=True)
            return {"ok": False, "message": "Downloaded ffmpeg failed verification."}

        return {
            "ok": True,
            "installed": True,
            "message": "ffmpeg installed successfully.",
            "version": status["version"],
            "path": status["path"],
        }
    except urllib.error.HTTPError as exc:
        return {"ok": False, "message": f"Failed to download ffmpeg ({exc.code} {exc.reason})."}
    except urllib.error.URLError as exc:
        return {"ok": False, "message": f"Failed to download ffmpeg: {exc.reason}."}
    except (zipfile.BadZipFile, tarfile.TarError, ValueError) as exc:
        return {"ok": False, "message": f"Failed to install ffmpeg: {exc}"}
    except OSError as exc:
        return {"ok": False, "message": f"Failed to install ffmpeg: {exc}"}
    finally:
        if tmp_path and tmp_path.is_file():
            tmp_path.unlink(missing_ok=True)
