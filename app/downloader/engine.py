"""yt-dlp download orchestration for single videos."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any, Callable

import yt_dlp
from yt_dlp.utils import DownloadError

from app.config import load_settings, normalize_tool_source
from app.cookies import CookieExportError, ytdlp_cookie_opts
from app.textutil import normalize_log_message, strip_ansi
from app.formats import build_format_string, pick_nearest_height
from app.paths import resolve_download_dir
from app.downloader.extract import extract_info
from app.downloader.ytdlp_opts import base_ytdlp_opts
from app.downloader.metadata import write_metadata
from app.downloader.verify import collect_heights, expected_files_present
from app.ffmpeg_tool import ffmpeg_available

LogFn = Callable[[str, str], None]
ProgressFn = Callable[[dict[str, Any]], None]

# Postprocessors that merge/remux separate video+audio streams.
_MERGE_POSTPROCESSORS = frozenset({"FFmpegMerger", "Merger", "VideoRemuxer"})


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
        self._active_item: dict[str, str] = {}

    def _log(self, level: str, message: str) -> None:
        self._log_raw(level, normalize_log_message(message))

    def _warn_ffmpeg_once(self) -> None:
        settings = load_settings()
        source = normalize_tool_source(settings.get("ffmpeg_source"))
        if self._warned_ffmpeg or ffmpeg_available(source):
            return
        self._warned_ffmpeg = True
        if source == "local":
            self._log(
                "warn",
                "Local ffmpeg was not found. Install it from Extras to merge streams into .mp4.",
            )
        else:
            self._log(
                "warn",
                "ffmpeg was not found in PATH. Install ffmpeg or switch to a local copy in Extras.",
            )

    def download_job(self, job: dict[str, Any]) -> dict[str, Any]:
        self._warn_ffmpeg_once()
        return self.download_single(job)

    def download_single(self, job: dict[str, Any]) -> dict[str, Any]:
        if self._cancelled(job):
            return {"ok": False, "error": "Cancelled"}
        url = job["url"].strip()
        opts_base = self._base_opts(job)
        return self._download_one(
            url,
            job,
            opts_base,
            playlist_title=job.get("playlist_title"),
            channel_handle=job.get("channel_handle"),
        )

    @staticmethod
    def _cancelled(job: dict[str, Any]) -> bool:
        return bool(job.get("cancel_flag", {}).get("cancel"))

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
        job["title"] = title
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

        if self._cancelled(job):
            return {"ok": False, "error": "Cancelled"}

        heights = collect_heights(info)
        _, warn = pick_nearest_height(video_quality, heights)
        if warn:
            self._log("warn", warn)

        outtmpl = str(target_dir / f"{video_id}.%(ext)s")
        job_id = job.get("job_id")
        hooks = self._download_hooks(job_id, combine_streams=combine_streams and want_video)

        self._log("info", f"Downloading: {title}")

        try:
            if want_metadata:
                if self._cancelled(job):
                    return {"ok": False, "error": "Cancelled"}
                self._set_item(job_id, "metadata")
                write_metadata(target_dir, video_id, info)

            if want_thumbnail:
                if self._cancelled(job):
                    return {"ok": False, "error": "Cancelled"}
                self._set_item(job_id, "thumbnail")
                self._run_download(
                    url,
                    {
                        **opts_base,
                        "skip_download": True,
                        "writethumbnail": True,
                        "writeinfojson": False,
                        "outtmpl": {"default": outtmpl},
                        **hooks,
                    },
                )

            if want_audio:
                if self._cancelled(job):
                    return {"ok": False, "error": "Cancelled"}
                self._set_item(job_id, "audio")
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
                        **self._download_hooks(job_id, combine_streams=False),
                    },
                )

            if want_video:
                if self._cancelled(job):
                    return {"ok": False, "error": "Cancelled"}
                self._set_item(job_id, "video")
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
                        **hooks,
                    },
                )
                if combine_streams:
                    _cleanup_merge_leftovers(
                        target_dir,
                        video_id,
                        keep_separate_audio=want_audio,
                    )

        except (DownloadError, CookieExportError) as exc:
            self._log("error", str(exc))
            return {"ok": False, "error": normalize_log_message(str(exc)), "title": title, "id": video_id}

        self._log("success", f"Finished: {title}")
        return {"ok": True, "title": title, "id": video_id, "path": str(target_dir)}

    def _run_download(self, url: str, opts: dict[str, Any]) -> None:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])

    def _base_opts(self, job: dict[str, Any]) -> dict[str, Any]:
        settings = job.get("cookie_settings") or load_settings()
        opts = base_ytdlp_opts(
            noplaylist=True,
            ignoreerrors=False,
            no_warnings=False,
            quiet=True,
            nocheckcertificate=True,
        )
        opts.update(ytdlp_cookie_opts(settings))
        return opts

    def _set_item(self, job_id: str | None, item: str) -> None:
        if not job_id:
            return
        self._active_item[job_id] = item
        self._progress({"job_id": job_id, "status": "downloading", "item": item})

    def _download_hooks(self, job_id: str | None, *, combine_streams: bool) -> dict[str, list[Any]]:
        opts: dict[str, list[Any]] = {"progress_hooks": [self._make_hook(job_id)]}
        if combine_streams and job_id:
            opts["postprocessor_hooks"] = [self._make_post_hook(job_id)]
        return opts

    def _make_hook(self, job_id: str | None):
        def hook(status: dict[str, Any]) -> None:
            if status.get("status") not in ("downloading", "finished"):
                return
            payload = {
                "job_id": job_id,
                "status": status.get("status"),
                "item": self._active_item.get(job_id) if job_id else None,
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

    def _make_post_hook(self, job_id: str | None):
        def hook(status: dict[str, Any]) -> None:
            pp_name = status.get("postprocessor") or ""
            if pp_name not in _MERGE_POSTPROCESSORS:
                return
            pp_status = status.get("status")
            if pp_status in ("started", "processing"):
                if job_id:
                    self._active_item[job_id] = "combining"
                self._progress({"job_id": job_id, "status": "combining", "item": "combining"})
            elif pp_status == "finished":
                if job_id:
                    self._active_item.pop(job_id, None)
                self._progress({"job_id": job_id, "status": "downloading"})

        return hook
