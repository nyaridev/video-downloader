"""yt-dlp download orchestration for single videos."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any, Callable

import yt_dlp
from yt_dlp.utils import DownloadError

from app.config import load_settings
from app.cookies import CookieExportError, ytdlp_cookie_opts
from app.textutil import normalize_log_message, strip_ansi
from app.formats import build_format_string, pick_nearest_height
from app.paths import resolve_download_dir
from app.downloader.extract import extract_info
from app.downloader.metadata import write_metadata
from app.downloader.verify import collect_heights, expected_files_present

LogFn = Callable[[str, str], None]
ProgressFn = Callable[[dict[str, Any]], None]


def _cleanup_merge_leftovers(target_dir: Path, video_id: str, *, keep_separate_audio: bool) -> None:
    """Remove intermediate .webm / partial files after merge into a single video."""
    has_merged = any(
        p.is_file()
        and p.name.startswith(video_id)
        and p.suffix.lower() in (".mp4", ".mkv", ".mov")
        and p.stat().st_size > 0
        for p in target_dir.iterdir()
    )
    if not has_merged:
        return
    audio_suffixes = {".m4a", ".opus", ".mp3", ".ogg", ".wav", ".aac"}
    keep_suffixes = {".mp4", ".mkv", ".mov", ".meta.json", ".jpg", ".jpeg", ".png", ".webp"}
    if keep_separate_audio:
        keep_suffixes |= audio_suffixes
    for path in target_dir.iterdir():
        if not path.is_file() or not path.name.startswith(video_id):
            continue
        if path.suffix.lower() in keep_suffixes or path.name.endswith(".meta.json"):
            continue
        try:
            path.unlink()
        except OSError:
            pass


class DownloadEngine:
    def __init__(self, log: LogFn, progress: ProgressFn):
        self._log_raw = log
        self._progress = progress
        self._warned_ffmpeg = False

    def _log(self, level: str, message: str) -> None:
        self._log_raw(level, normalize_log_message(message))

    def _warn_ffmpeg_once(self) -> None:
        if self._warned_ffmpeg or shutil.which("ffmpeg"):
            return
        self._warned_ffmpeg = True
        self._log(
            "warn",
            "ffmpeg was not found in PATH. Install ffmpeg to merge streams into .mp4.",
        )

    def download_job(self, job: dict[str, Any]) -> dict[str, Any]:
        self._warn_ffmpeg_once()
        url = job["url"].strip()
        mode = job.get("mode", "video")
        opts_base = self._base_opts(job)

        if mode == "video":
            return self._download_one(url, job, opts_base, playlist_title=None, channel_handle=None)

        extract_mode = "flat" if mode in ("playlist", "channel") else "default"
        list_opts = {**opts_base, "extract_flat": extract_mode}
        browser = (job.get("cookie_settings") or {}).get("cookies_browser")
        try:
            info = extract_info(url, list_opts, cookie_browser=browser)
        except DownloadError as exc:
            self._log("error", str(exc))
            return {"ok": False, "error": str(exc)}

        entries = list(info.get("entries") or [info])
        playlist_title = info.get("title") if mode == "playlist" else None
        channel_handle = info.get("uploader_id") or info.get("channel_id") or info.get("uploader")
        if mode == "channel":
            channel_handle = info.get("channel") or info.get("uploader") or channel_handle

        results = []
        for idx, entry in enumerate(entries, start=1):
            if not entry:
                continue
            entry = dict(entry)
            vid = entry.get("id")
            video_url = entry.get("webpage_url") or entry.get("url")
            if vid and (not video_url or "watch" not in str(video_url)):
                video_url = f"https://www.youtube.com/watch?v={vid}"
            if not video_url:
                continue

            self._log("info", f"Processing item {idx}/{len(entries)}...")
            result = self._download_one(
                video_url,
                job,
                opts_base,
                playlist_title=playlist_title,
                channel_handle=channel_handle,
            )
            results.append(result)
            if job.get("cancel_flag", {}).get("cancel"):
                break

        return {"ok": True, "results": results}

    def _download_one(
        self,
        url: str,
        job: dict[str, Any],
        opts_base: dict[str, Any],
        *,
        playlist_title: str | None,
        channel_handle: str | None,
    ) -> dict[str, Any]:
        want_video = job.get("want_video", True)
        want_audio = job.get("want_audio", True)
        combine_streams = job.get("combine_streams", True)
        want_metadata = job.get("want_metadata", True)
        want_thumbnail = job.get("want_thumbnail", True)
        video_quality = job.get("video_quality", "Best")
        audio_quality = job.get("audio_quality", "Best")

        browser = (job.get("cookie_settings") or {}).get("cookies_browser")
        try:
            info = extract_info(url, opts_base, cookie_browser=browser)
        except DownloadError as exc:
            self._log("error", str(exc))
            return {"ok": False, "error": str(exc)}

        video_id = info.get("id") or "unknown"
        title = info.get("title") or video_id
        output_root = Path(job["output_dir"])
        organize = job.get("organize", False)
        bundle = job.get("bundle", False)
        mode = job.get("mode", "video")

        target_dir = resolve_download_dir(
            output_root=output_root,
            mode=mode,
            organize=organize,
            bundle=bundle,
            video_id=video_id,
            title=title,
            playlist_title=playlist_title,
            channel_handle=channel_handle,
        )

        if job.get("skip_existing", True) and expected_files_present(
            target_dir,
            video_id,
            want_video=want_video,
            want_audio=want_audio,
            want_metadata=want_metadata,
            want_thumbnail=want_thumbnail,
        ):
            msg = f"Skipped (already complete): {title}"
            self._log("warn", msg)
            return {"ok": True, "skipped": True, "title": title, "id": video_id}

        heights = collect_heights(info)
        _, warn = pick_nearest_height(video_quality, heights)
        if warn:
            self._log("warn", warn)

        outtmpl = str(target_dir / f"{video_id}.%(ext)s")
        hook = self._make_hook(job.get("job_id"))

        self._log("info", f"Downloading: {title}")

        try:
            if want_metadata:
                write_metadata(target_dir, video_id, info)

            if want_thumbnail:
                self._run_download(
                    url,
                    {
                        **opts_base,
                        "skip_download": True,
                        "writethumbnail": True,
                        "writeinfojson": False,
                        "outtmpl": {"default": outtmpl},
                        "progress_hooks": [hook],
                    },
                )

            if want_video:
                self._run_download(
                    url,
                    {
                        **opts_base,
                        "format": build_format_string(
                            want_video=True,
                            want_audio=True,
                            video_quality=video_quality,
                            audio_quality=audio_quality,
                        ),
                        "merge_output_format": "mp4",
                        "postprocessors": [],
                        "outtmpl": {"default": outtmpl},
                        "writethumbnail": False,
                        "writeinfojson": False,
                        "progress_hooks": [hook],
                    },
                )
                if combine_streams:
                    _cleanup_merge_leftovers(
                        target_dir,
                        video_id,
                        keep_separate_audio=want_audio,
                    )

            if want_audio:
                self._run_download(
                    url,
                    {
                        **opts_base,
                        "format": build_format_string(
                            want_video=False,
                            want_audio=True,
                            video_quality=video_quality,
                            audio_quality=audio_quality,
                        ),
                        "postprocessors": [
                            {"key": "FFmpegExtractAudio", "preferredcodec": "m4a", "preferredquality": "0"}
                        ],
                        "outtmpl": {"default": outtmpl},
                        "writethumbnail": False,
                        "writeinfojson": False,
                        "progress_hooks": [hook],
                    },
                )

        except (DownloadError, CookieExportError) as exc:
            self._log("error", str(exc))
            return {"ok": False, "error": normalize_log_message(str(exc)), "title": title, "id": video_id}

        self._log("success", f"Finished: {title}")
        return {"ok": True, "title": title, "id": video_id, "path": str(target_dir)}

    def _run_download(self, url: str, opts: dict[str, Any]) -> None:
        run_opts = {**opts, "no_color": True, "color": "no"}
        with yt_dlp.YoutubeDL(run_opts) as ydl:
            ydl.download([url])

    def _base_opts(self, job: dict[str, Any]) -> dict[str, Any]:
        settings = job.get("cookie_settings") or load_settings()
        opts: dict[str, Any] = {
            "noplaylist": job.get("mode") == "video",
            "ignoreerrors": False,
            "no_warnings": False,
            "quiet": True,
            "nocheckcertificate": True,
            "no_color": True,
            "color": "no",
        }
        opts.update(ytdlp_cookie_opts(settings))
        return opts

    def _make_hook(self, job_id: str | None):
        def hook(status: dict[str, Any]) -> None:
            if status.get("status") not in ("downloading", "finished"):
                return
            payload = {
                "job_id": job_id,
                "status": status.get("status"),
                "filename": status.get("filename")
                or (status.get("info_dict") or {}).get("title"),
                "downloaded_bytes": status.get("downloaded_bytes", 0),
                "total_bytes": status.get("total_bytes") or status.get("total_bytes_estimate"),
                "speed": status.get("speed"),
                "eta": status.get("eta"),
                "_percent_str": strip_ansi(status.get("_percent_str") or ""),
            }
            self._progress(payload)

        return hook
