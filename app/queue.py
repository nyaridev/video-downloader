"""Background download queue with per-view batch downloads."""

from __future__ import annotations

import threading
import time
import uuid
from collections import deque
from typing import Any, Callable

from yt_dlp.utils import DownloadError

from app.config import load_settings, normalize_concurrency
from app.downloader.batch_extract import extract_batch_entries
from app.downloader.engine import DownloadEngine
from app.textutil import normalize_log_message

EventFn = Callable[[str, dict[str, Any]], None]

ITEM_ORDER = ("metadata", "thumbnail", "audio", "video")
MAIN_VIEW_ID = "main"


class DownloadQueue:
    def __init__(self, emit: EventFn):
        self._emit = emit
        self._jobs: list[dict[str, Any]] = []
        self._views: dict[str, dict[str, Any]] = {
            MAIN_VIEW_ID: {
                "id": MAIN_VIEW_ID,
                "name": "Main",
                "kind": "main",
                "status": "idle",
            }
        }
        self._view_order: list[str] = [MAIN_VIEW_ID]
        self._batches: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._revision = 0
        self._active_view = MAIN_VIEW_ID
        self._dispatcher: threading.Thread | None = None
        self._active_threads: dict[str, threading.Thread] = {}
        self._engines: dict[str, DownloadEngine] = {}
        self._concurrency_limit = normalize_concurrency(load_settings().get("concurrency"))

    @property
    def revision(self) -> int:
        return self._revision

    @property
    def active_view(self) -> str:
        return self._active_view

    def _emit_queue(self, *, active_view: str | None = None) -> None:
        if active_view is not None:
            self._active_view = active_view
        self._revision += 1
        self._emit("queue", self.queue_state())

    def queue_state(self) -> dict[str, Any]:
        return {
            "jobs": self.list_jobs(),
            "views": self.list_views(),
            "active_view": self._active_view,
            "revision": self._revision,
        }

    def _log(self, level: str, message: str) -> None:
        self._emit("log", {"level": level, "message": normalize_log_message(message)})

    def _progress(self, data: dict[str, Any]) -> None:
        job_id = data.get("job_id")
        if job_id:
            with self._lock:
                for job in self._jobs:
                    if job["id"] == job_id:
                        phase = data.get("status")
                        prev = job.get("progress") or {}
                        if phase == "combining":
                            job["progress"] = {
                                **prev,
                                "status": "downloading",
                                "item": prev.get("item") or "video",
                            }
                        elif phase == "downloading" and not data.get("downloaded_bytes"):
                            job["progress"] = {
                                **prev,
                                "status": "downloading",
                                "item": data.get("item") or prev.get("item"),
                            }
                        else:
                            total = data.get("total_bytes") or 0
                            done = data.get("downloaded_bytes") or 0
                            pct = (done / total * 100) if total > 0 else prev.get("percent", 0)
                            job["progress"] = {
                                "status": phase or prev.get("status"),
                                "item": data.get("item") or prev.get("item"),
                                "downloaded_bytes": done,
                                "total_bytes": total,
                                "percent": pct,
                                "speed": data.get("speed") if data.get("speed") is not None else prev.get("speed"),
                                "eta": data.get("eta") if data.get("eta") is not None else prev.get("eta"),
                                "label": data.get("_percent_str") or prev.get("label") or "",
                            }
                        break
        self._emit("progress", data)
        self._emit_queue()

    def _engine_for(self, job_id: str) -> DownloadEngine:
        engine = self._engines.get(job_id)
        if engine is None:
            engine = DownloadEngine(self._log, self._progress)
            self._engines[job_id] = engine
        return engine

    @staticmethod
    def _job_items(job: dict[str, Any]) -> list[str]:
        flags = {
            "metadata": job.get("want_metadata"),
            "thumbnail": job.get("want_thumbnail"),
            "audio": job.get("want_audio"),
            "video": job.get("want_video"),
        }
        return [key for key in ITEM_ORDER if flags.get(key)]

    def _job_snapshot(self, job: dict[str, Any]) -> dict[str, Any]:
        progress = job.get("progress") or {}
        return {
            "id": job["id"],
            "url": job["url"],
            "mode": job.get("mode"),
            "status": job.get("status"),
            "title": job.get("title"),
            "items": self._job_items(job),
            "progress": progress,
            "view_id": job.get("view_id", MAIN_VIEW_ID),
            "batch_id": job.get("batch_id"),
            "entry_index": job.get("entry_index"),
            "entry_total": job.get("entry_total"),
        }

    def _view_snapshot(self, view_id: str) -> dict[str, Any]:
        view = dict(self._views[view_id])
        if view.get("kind") == "main":
            jobs = [j for j in self._jobs if j.get("view_id", MAIN_VIEW_ID) == MAIN_VIEW_ID]
            view["total"] = len(jobs)
            view["finished"] = sum(1 for j in jobs if j.get("status") in ("done", "error"))
            view["running"] = sum(1 for j in jobs if j.get("status") == "running")
            view["pending"] = sum(1 for j in jobs if j.get("status") == "queued")
            return view

        batch = self._batches.get(view_id)
        if batch:
            view["total"] = batch.get("total", 0)
            view["pending"] = len(batch.get("pending") or [])
            view["finished"] = self._batch_finished_count(view_id)
            view["running"] = sum(
                1 for j in self._jobs if j.get("batch_id") == view_id and j.get("status") == "running"
            )
        return view

    def _batch_finished_count(self, batch_id: str) -> int:
        return sum(
            1
            for j in self._jobs
            if j.get("batch_id") == batch_id and j.get("status") in ("done", "error")
        )

    def list_jobs(self) -> list[dict[str, Any]]:
        with self._lock:
            return [self._job_snapshot(j) for j in self._jobs]

    def list_views(self) -> list[dict[str, Any]]:
        with self._lock:
            return [self._view_snapshot(view_id) for view_id in self._view_order if view_id in self._views]

    def add(self, job_config: dict[str, Any]) -> str:
        mode = job_config.get("mode", "video")
        if "concurrency" in job_config:
            self._concurrency_limit = normalize_concurrency(job_config["concurrency"])
        if mode in ("playlist", "channel"):
            return self._start_batch(job_config)
        return self._add_main_job(job_config)

    def _add_main_job(self, job_config: dict[str, Any]) -> str:
        job_id = str(uuid.uuid4())[:8]
        job = {
            **job_config,
            "id": job_id,
            "view_id": MAIN_VIEW_ID,
            "status": "queued",
            "cancel_flag": {"cancel": False},
            "progress": {},
        }
        with self._lock:
            self._jobs.append(job)
            self._views[MAIN_VIEW_ID]["status"] = "running"
        self._emit_queue()
        self._ensure_dispatcher()
        return job_id

    def _start_batch(self, job_config: dict[str, Any]) -> str:
        batch_id = str(uuid.uuid4())[:8]
        mode = job_config.get("mode", "playlist")
        with self._lock:
            self._views[batch_id] = {
                "id": batch_id,
                "name": "Fetching...",
                "kind": mode,
                "status": "preparing",
                "cancel_flag": {"cancel": False},
            }
            if batch_id not in self._view_order:
                self._view_order.append(batch_id)
        self._emit_queue(active_view=batch_id)
        threading.Thread(
            target=self._prepare_batch,
            args=(batch_id, dict(job_config)),
            daemon=True,
        ).start()
        return batch_id

    def _prepare_batch(self, batch_id: str, job_config: dict[str, Any]) -> None:
        mode = job_config.get("mode", "playlist")
        try:
            self._log("info", f"Fetching {'playlist' if mode == 'playlist' else 'channel'} entries...")
            view_name, entries, playlist_title, channel_handle = extract_batch_entries(
                job_config["url"].strip(),
                mode,
                job_config,
            )
            with self._lock:
                view = self._views.get(batch_id)
                if not view or view.get("cancel_flag", {}).get("cancel"):
                    return
            concurrency = normalize_concurrency(job_config.get("concurrency", self._concurrency_limit))
            template = {
                key: job_config[key]
                for key in job_config
                if key not in ("url", "mode", "concurrency")
            }
            batch = {
                "view_id": batch_id,
                "layout_mode": mode,
                "template": template,
                "pending": deque(entries),
                "total": len(entries),
                "concurrency": concurrency,
                "playlist_title": playlist_title,
                "channel_handle": channel_handle,
                "cancel_flag": {"cancel": False},
            }
            with self._lock:
                self._batches[batch_id] = batch
                self._views[batch_id]["name"] = view_name
                self._views[batch_id]["status"] = "running"
                self._views[batch_id]["total"] = len(entries)
                initial = min(concurrency, len(entries))
                for _ in range(initial):
                    self._spawn_batch_entry_locked(batch_id)
            self._log("info", f"Queued {len(entries)} video(s) in \"{view_name}\".")
            self._emit_queue(active_view=batch_id)
            self._ensure_dispatcher()
        except DownloadError as exc:
            self._log("error", str(exc))
            with self._lock:
                if batch_id in self._views:
                    self._views[batch_id]["status"] = "error"
                    self._views[batch_id]["name"] = self._views[batch_id].get("name") or "Failed"
            self._emit_queue()
        except Exception as exc:  # noqa: BLE001
            self._log("error", normalize_log_message(str(exc)))
            with self._lock:
                if batch_id in self._views:
                    self._views[batch_id]["status"] = "error"
            self._emit_queue()

    def _spawn_batch_entry_locked(self, batch_id: str) -> str | None:
        batch = self._batches.get(batch_id)
        if not batch or batch["cancel_flag"]["cancel"]:
            return None
        pending: deque = batch["pending"]
        if not pending:
            return None

        entry = pending.popleft()
        job_id = str(uuid.uuid4())[:8]
        job = {
            **batch["template"],
            "id": job_id,
            "url": entry["url"],
            "title": entry.get("title"),
            "mode": batch["layout_mode"],
            "batch_entry": True,
            "view_id": batch_id,
            "batch_id": batch_id,
            "entry_index": entry.get("index"),
            "entry_total": batch["total"],
            "playlist_title": batch.get("playlist_title"),
            "channel_handle": batch.get("channel_handle"),
            "status": "queued",
            "cancel_flag": {"cancel": False},
            "progress": {},
        }
        self._jobs.append(job)
        return job_id

    def _spawn_batch_entry(self, batch_id: str) -> str | None:
        with self._lock:
            return self._spawn_batch_entry_locked(batch_id)

    def remove(self, job_id: str) -> bool:
        removed = False
        batch_id: str | None = None
        view_id = MAIN_VIEW_ID
        with self._lock:
            for idx, job in enumerate(self._jobs):
                if job["id"] != job_id:
                    continue
                batch_id = job.get("batch_id")
                view_id = job.get("view_id", MAIN_VIEW_ID)
                if job["status"] == "running":
                    job["cancel_flag"]["cancel"] = True
                del self._jobs[idx]
                removed = True
                break
            if removed:
                if view_id == MAIN_VIEW_ID:
                    self._refresh_main_view_status_locked()
                else:
                    self._refresh_batch_view_status_locked(batch_id)
        if removed:
            self._emit_queue()
        return removed

    def clear_view(self, view_id: str | None = None) -> int:
        view_id = view_id or self._active_view
        removed = 0
        with self._lock:
            batch = self._batches.get(view_id)
            view = self._views.get(view_id)
            if view and view_id != MAIN_VIEW_ID:
                view.setdefault("cancel_flag", {"cancel": False})["cancel"] = True
            if batch:
                batch["cancel_flag"]["cancel"] = True
                batch["pending"] = deque()

            keep: list[dict[str, Any]] = []
            for job in self._jobs:
                if job.get("view_id", MAIN_VIEW_ID) != view_id:
                    keep.append(job)
                    continue
                if job["status"] == "running":
                    job["cancel_flag"]["cancel"] = True
                removed += 1
            self._jobs = keep

            if view_id == MAIN_VIEW_ID:
                self._refresh_main_view_status_locked()
            elif view_id in self._views:
                self._views[view_id]["status"] = "cancelled"
        if removed or (view_id != MAIN_VIEW_ID and view_id in self._views):
            self._emit_queue()
        return removed

    def clear(self) -> int:
        return self.clear_view(self._active_view)

    def _refresh_main_view_status_locked(self) -> None:
        jobs = [j for j in self._jobs if j.get("view_id", MAIN_VIEW_ID) == MAIN_VIEW_ID]
        if not jobs:
            self._views[MAIN_VIEW_ID]["status"] = "idle"
        elif any(j["status"] in ("queued", "running") for j in jobs):
            self._views[MAIN_VIEW_ID]["status"] = "running"
        else:
            self._views[MAIN_VIEW_ID]["status"] = "done"

    def _refresh_batch_view_status_locked(self, batch_id: str | None) -> None:
        if not batch_id or batch_id not in self._views:
            return
        batch = self._batches.get(batch_id)
        if batch and batch["cancel_flag"]["cancel"]:
            self._views[batch_id]["status"] = "cancelled"
            return
        pending = len(batch["pending"]) if batch else 0
        active = any(
            j.get("batch_id") == batch_id and j["status"] in ("queued", "running") for j in self._jobs
        )
        if pending or active:
            self._views[batch_id]["status"] = "running"
        else:
            self._views[batch_id]["status"] = "done"

    def _batch_size(self) -> int:
        return self._concurrency_limit

    def _ensure_dispatcher(self) -> None:
        if self._dispatcher and self._dispatcher.is_alive():
            return
        self._dispatcher = threading.Thread(target=self._run_dispatcher, daemon=True)
        self._dispatcher.start()

    def _run_dispatcher(self) -> None:
        while True:
            to_start: list[dict[str, Any]] = []
            with self._lock:
                view_ids = list(self._view_order)
                for view_id in view_ids:
                    running = sum(
                        1
                        for j in self._jobs
                        if j.get("view_id", MAIN_VIEW_ID) == view_id and j["status"] == "running"
                    )
                    limit = self._view_concurrency(view_id)
                    slots = limit - running
                    if slots <= 0:
                        continue
                    for job in self._jobs:
                        if job.get("view_id", MAIN_VIEW_ID) != view_id:
                            continue
                        if job["status"] != "queued":
                            continue
                        to_start.append(job)
                        job["status"] = "running"
                        slots -= 1
                        if slots <= 0:
                            break

                has_work = any(j["status"] in ("queued", "running") for j in self._jobs)
                if not has_work and not self._active_threads:
                    return

            for job in to_start:
                self._emit("job_status", {"id": job["id"], "status": "running"})
                thread = threading.Thread(target=self._run_job, args=(job,), daemon=True)
                with self._lock:
                    self._active_threads[job["id"]] = thread
                thread.start()

            if to_start:
                self._emit_queue()

            with self._lock:
                if not any(j["status"] in ("queued", "running") for j in self._jobs):
                    if not self._active_threads:
                        return
            time.sleep(0.15)

    def _view_concurrency(self, view_id: str) -> int:
        batch = self._batches.get(view_id)
        if batch:
            return normalize_concurrency(batch.get("concurrency", self._concurrency_limit))
        return self._batch_size()

    def _run_job(self, job: dict[str, Any]) -> None:
        job_id = job["id"]
        job["job_id"] = job_id
        batch_id = job.get("batch_id")
        try:
            engine = self._engine_for(job_id)
            result = engine.download_single(job)
            if job.get("cancel_flag", {}).get("cancel"):
                job["status"] = "error"
                job["result"] = {"ok": False, "error": "Cancelled"}
            else:
                job["result"] = result
                job["status"] = "done" if result.get("ok") else "error"
            if job["status"] == "done":
                job["progress"] = {
                    **(job.get("progress") or {}),
                    "status": "finished",
                    "percent": 100,
                }
                if result.get("title"):
                    job["title"] = result["title"]
        except Exception as exc:  # noqa: BLE001
            job["status"] = "error"
            self._log("error", normalize_log_message(str(exc)))
        finally:
            with self._lock:
                self._active_threads.pop(job_id, None)
                self._engines.pop(job_id, None)
                if batch_id:
                    self._after_batch_job_locked(job)
                else:
                    self._refresh_main_view_status_locked()
            self._emit("job_status", {"id": job_id, "status": job["status"]})
            self._emit_queue()
            self._ensure_dispatcher()

    def _after_batch_job_locked(self, job: dict[str, Any]) -> None:
        batch_id = job.get("batch_id")
        if not batch_id:
            return
        batch = self._batches.get(batch_id)
        if not batch or batch["cancel_flag"]["cancel"]:
            self._refresh_batch_view_status_locked(batch_id)
            return

        if job.get("status") in ("done", "error") and not job.get("cancel_flag", {}).get("cancel"):
            self._spawn_batch_entry_locked(batch_id)
        self._refresh_batch_view_status_locked(batch_id)
