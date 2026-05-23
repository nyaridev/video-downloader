"""yt-dlp download orchestration for single videos."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any, Callable

import yt_dlp
from yt_dlp.utils import DownloadError, DownloadCancelled

from app.config import load_settings, normalize_save_layout, normalize_tool_source
from app.auth.cookies import CookieExportError, ytdlp_cookie_opts
from app.utils.text import normalize_log_message, strip_ansi
from app.utils.formats import build_format_string, pick_nearest_height
from app.utils.naming import (
    DEFAULT_CHANNEL_NAME_TEMPLATE,
    DEFAULT_FILE_NAME_TEMPLATE,
    DEFAULT_PLAYLIST_NAME_TEMPLATE,
    build_naming_context,
    render_name_template,
)
from app.paths import DEFAULT_CHANNEL_FOLDER, DEFAULT_PLAYLIST_FOLDER, resolve_download_dir
from app.downloader.extract import extract_info
from app.downloader.ytdlp_opts import base_ytdlp_opts
from app.downloader.metadata import write_metadata
from app.downloader.verify import collect_heights, expected_files_present
from app.downloader.cleanup import cleanup_cancelled_job
from app.tools.ffmpeg import ffmpeg_available

LogFn = Callable[[str, str], None]
ProgressFn = Callable[[dict[str, Any]], None]

# Postprocessors that merge/remux separate video+audio streams.
_MERGE_POSTPROCESSORS = frozenset({"FFmpegMerger", "Merger", "VideoRemuxer"})


def _cleanup_merge_leftovers(target_dir: Path, file_base: str, *, keep_separate_audio: bool) -> None:
    """Remove intermediate .webm / partial files after merge into a single video."""
    has_merged = any(
        p.is_file()
        and p.name.startswith(file_base)
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
        if not path.is_file() or not path.name.startswith(file_base):
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

    @staticmethod
    def _remove_if_cancelled(job: dict[str, Any]) -> bool:
        settings = job.get("cookie_settings") or load_settings()
        return bool(settings.get("remove_if_cancelled", True))

    def _cleanup_if_cancelled(self, job: dict[str, Any]) -> None:
        if not self._cancelled(job) or not self._remove_if_cancelled(job):
            return
        if not job.get("download_dir") or not job.get("video_id"):
            return
        removed = cleanup_cancelled_job(
            job.get("download_dir"),
            job.get("video_id"),
            file_base_name=job.get("file_base_name"),
            bundle=bool(job.get("bundle")),
        )
        if removed or job.get("bundle"):
            title = job.get("title") or job.get("video_id") or "download"
            if job.get("bundle"):
                self._log("info", f"Removed download folder for cancelled: {title}")
            else:
                self._log("info", f"Removed {removed} file(s) for cancelled: {title}")

    def _return_cancelled(
        self,
        job: dict[str, Any],
        *,
        title: str | None = None,
        video_id: str | None = None,
    ) -> dict[str, Any]:
        self._cleanup_if_cancelled(job)
        result: dict[str, Any] = {"ok": False, "error": "Cancelled"}
        if title:
            result["title"] = title
        if video_id:
            result["id"] = video_id
        return result

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
        settings = job.get("cookie_settings") or load_settings()
        save_layout = normalize_save_layout(
            job.get("save_layout", settings.get("save_layout", "flat")),
            organize=bool(job.get("organize")) if "save_layout" not in job else None,
        )
        group_playlist_channel = bool(
            job.get("group_playlist_channel", settings.get("group_playlist_channel", True))
        )
        channel_override = None if save_layout == "intelligent" else channel_handle
        naming_context = build_naming_context(
            info=info,
            playlist_title=playlist_title,
            channel_handle=channel_override,
        )
        file_base_name = render_name_template(
            settings.get("file_name_template", DEFAULT_FILE_NAME_TEMPLATE),
            naming_context,
        )
        job["file_base_name"] = file_base_name
        output_root = Path(job["output_dir"])
        bundle = job.get("bundle", False)
        mode = job.get("mode", "video")
        playlist_id = job.get("playlist_id")

        target_dir = resolve_download_dir(
            output_root=output_root,
            mode=mode,
            save_layout=save_layout,
            group_playlist_channel=group_playlist_channel,
            bundle=bundle,
            bundle_folder_template=settings.get("bundle_folder_template", "{title}_{id}"),
            naming_context=naming_context,
            playlist_title=playlist_title,
            playlist_id=playlist_id,
            channel_handle=channel_handle,
            channel_id=job.get("channel_id"),
            playlist_folder=settings.get("playlist_folder", DEFAULT_PLAYLIST_FOLDER),
            channel_folder=settings.get("channel_folder", DEFAULT_CHANNEL_FOLDER),
            playlist_name_template=settings.get("playlist_name_template", DEFAULT_PLAYLIST_NAME_TEMPLATE),
            channel_name_template=settings.get("channel_name_template", DEFAULT_CHANNEL_NAME_TEMPLATE),
        )
        job["download_dir"] = str(target_dir)
        job["video_id"] = video_id
        job["bundle"] = bundle

        if job.get("skip_existing", True) and expected_files_present(
            target_dir,
            file_base_name,
            want_video=want_video,
            want_audio=want_audio,
            want_metadata=want_metadata,
            want_thumbnail=want_thumbnail,
        ):
            msg = f"Skipped (already complete): {title}"
            self._log("warn", msg)
            return {"ok": True, "skipped": True, "title": title, "id": video_id}

        if self._cancelled(job):
            return self._return_cancelled(job, title=title, video_id=video_id)

        heights = collect_heights(info)
        _, warn = pick_nearest_height(video_quality, heights)
        if warn:
            self._log("warn", warn)

        outtmpl = str(target_dir / f"{file_base_name}.%(ext)s")
        job_id = job.get("job_id")
        hooks = self._download_hooks(job, target_dir, file_base_name, combine_streams=combine_streams and want_video)

        self._log("info", f"Downloading: {title}")

        try:
            if want_metadata:
                if self._cancelled(job):
                    return self._return_cancelled(job, title=title, video_id=video_id)
                self._set_item(job_id, "metadata")
                write_metadata(target_dir, file_base_name, info)

            if want_thumbnail:
                if self._cancelled(job):
                    return self._return_cancelled(job, title=title, video_id=video_id)
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
                    return self._return_cancelled(job, title=title, video_id=video_id)
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
                        **self._download_hooks(job, target_dir, file_base_name, combine_streams=False),
                    },
                )

            if want_video:
                if self._cancelled(job):
                    return self._return_cancelled(job, title=title, video_id=video_id)
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
                        file_base_name,
                        keep_separate_audio=want_audio,
                    )

        except DownloadCancelled:
            return self._return_cancelled(job, title=title, video_id=video_id)
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

    def _download_hooks(
        self,
        job: dict[str, Any],
        target_dir: Path,
        file_base: str,
        *,
        combine_streams: bool,
    ) -> dict[str, list[Any]]:
        job_id = job.get("job_id")
        opts: dict[str, list[Any]] = {"progress_hooks": [self._make_hook(job, target_dir, file_base)]}
        if combine_streams and job_id:
            opts["postprocessor_hooks"] = [self._make_post_hook(job, target_dir, file_base)]
        return opts

    def _make_hook(self, job: dict[str, Any], target_dir: Path, file_base: str):
        job_id = job.get("job_id")

        def hook(status: dict[str, Any]) -> None:
            if self._cancelled(job):
                self._cleanup_if_cancelled(job)
                raise DownloadCancelled("Cancelled")
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

    def _make_post_hook(self, job: dict[str, Any], target_dir: Path, file_base: str):
        job_id = job.get("job_id")

        def hook(status: dict[str, Any]) -> None:
            if self._cancelled(job):
                self._cleanup_if_cancelled(job)
                raise DownloadCancelled("Cancelled")
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
