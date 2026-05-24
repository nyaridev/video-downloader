"""Background download queue with per-view batch downloads."""

from __future__ import annotations

import threading
import time
import uuid
from collections import deque
from typing import Any, Callable

from yt_dlp.utils import DownloadError

from app.config import load_settings, normalize_concurrency
from app.downloader.batch_extract import BatchPrepareCancelled, extract_batch_entries
from app.downloader.engine import DownloadEngine
from app.utils.text import normalize_log_message

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

    def _emit_queue(self) -> None:
        self._revision += 1
        self._emit("queue", self.queue_state())

    def queue_state(self) -> dict[str, Any]:
        return {
            "jobs": self.list_jobs(),
            "views": self.list_views(),
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
        status = job.get("status")
        if status in ("queued", "running") and job.get("cancel_flag", {}).get("cancel"):
            status = "cancelled"
        return {
            "id": job["id"],
            "url": job["url"],
            "mode": job.get("mode"),
            "status": status,
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
        prepare = view.get("prepare")
        if prepare:
            view["prepare"] = dict(prepare)
        if view.get("kind") == "main":
            jobs = [j for j in self._jobs if j.get("view_id", MAIN_VIEW_ID) == MAIN_VIEW_ID]
            view["total"] = len(jobs)
            view["finished"] = sum(1 for j in jobs if j.get("status") in ("done", "error", "cancelled"))
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
            if j.get("batch_id") == batch_id and j.get("status") in ("done", "error", "cancelled")
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
                "prepare": {
                    "message": "Starting fetch...",
                    "found": 0,
                    "total": None,
                    "page": None,
                    "phase": "start",
                    "started_at": time.time(),
                    "elapsed": 0.0,
                },
            }
            if batch_id not in self._view_order:
                self._view_order.append(batch_id)
        self._emit_queue()
        threading.Thread(
            target=self._prepare_batch,
            args=(batch_id, dict(job_config)),
            daemon=True,
        ).start()
        return batch_id

    def _is_batch_cancelled(self, batch_id: str) -> bool:
        with self._lock:
            view = self._views.get(batch_id)
            return bool(view and view.get("cancel_flag", {}).get("cancel"))

    def _mark_prepare_cancelled_locked(self, batch_id: str) -> None:
        view = self._views.get(batch_id)
        if not view:
            return
        view["status"] = "cancelled"
        if view.get("name") == "Fetching...":
            view["name"] = "Cancelled"
        prepare = view.setdefault("prepare", {})
        prepare["message"] = "Cancelled"

    def _update_batch_prepare(self, batch_id: str, update: dict[str, Any]) -> None:
        with self._lock:
            view = self._views.get(batch_id)
            if not view or view.get("status") != "preparing":
                return
            prepare = view.setdefault("prepare", {})
            started_at = prepare.get("started_at") or time.time()
            prepare["started_at"] = started_at
            prepare.update(update)
            prepare["elapsed"] = time.time() - started_at
        self._emit_queue()

    def _prepare_batch(self, batch_id: str, job_config: dict[str, Any]) -> None:
        mode = job_config.get("mode", "playlist")
        stop_heartbeat = threading.Event()
        last_emit = 0.0

        def on_progress(update: dict[str, Any]) -> None:
            nonlocal last_emit
            if self._is_batch_cancelled(batch_id):
                raise BatchPrepareCancelled()
            now = time.time()
            if now - last_emit < 0.25 and update.get("phase") not in ("start", "done", "page"):
                return
            last_emit = now
            self._update_batch_prepare(batch_id, update)

        def should_cancel() -> bool:
            return self._is_batch_cancelled(batch_id)

        def heartbeat() -> None:
            while not stop_heartbeat.wait(1.0):
                with self._lock:
                    view = self._views.get(batch_id)
                    if not view or view.get("status") != "preparing":
                        return
                    if view.get("cancel_flag", {}).get("cancel"):
                        return
                    prepare = view.get("prepare") or {}
                    started_at = prepare.get("started_at") or time.time()
                    prepare["elapsed"] = time.time() - started_at
                self._emit_queue()

        heartbeat_thread = threading.Thread(target=heartbeat, daemon=True)
        heartbeat_thread.start()
        try:
            self._log("info", f"Fetching {'playlist' if mode == 'playlist' else 'channel'} entries...")
            view_name, entries, playlist_title, playlist_id, channel_handle, channel_id = extract_batch_entries(
                job_config["url"].strip(),
                mode,
                job_config,
                on_progress=on_progress,
                should_cancel=should_cancel,
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
                "playlist_id": playlist_id,
                "channel_handle": channel_handle,
                "channel_id": channel_id,
                "cancel_flag": {"cancel": False},
            }
            with self._lock:
                self._batches[batch_id] = batch
                self._views[batch_id]["name"] = view_name
                self._views[batch_id]["status"] = "running"
                self._views[batch_id]["total"] = len(entries)
                self._views[batch_id].pop("prepare", None)
                initial = min(concurrency, len(entries))
                for _ in range(initial):
                    self._spawn_batch_entry_locked(batch_id)
            self._log("info", f"Queued {len(entries)} video(s) in \"{view_name}\".")
            self._emit_queue()
            self._ensure_dispatcher()
        except BatchPrepareCancelled:
            with self._lock:
                if batch_id in self._views:
                    self._mark_prepare_cancelled_locked(batch_id)
            self._log("info", "Batch fetch cancelled.")
            self._emit_queue()
        except DownloadError as exc:
            self._log("error", str(exc))
            with self._lock:
                if batch_id in self._views:
                    self._views[batch_id]["status"] = "error"
                    self._views[batch_id]["name"] = self._views[batch_id].get("name") or "Failed"
                    self._views[batch_id].pop("prepare", None)
            self._emit_queue()
        except Exception as exc:  # noqa: BLE001
            self._log("error", normalize_log_message(str(exc)))
            with self._lock:
                if batch_id in self._views:
                    self._views[batch_id]["status"] = "error"
                    self._views[batch_id].pop("prepare", None)
            self._emit_queue()
        finally:
            stop_heartbeat.set()
            heartbeat_thread.join(timeout=0.1)

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
            "playlist_id": batch.get("playlist_id"),
            "channel_handle": batch.get("channel_handle"),
            "channel_id": batch.get("channel_id"),
            "status": "queued",
            "cancel_flag": {"cancel": False},
            "progress": {},
        }
        self._jobs.append(job)
        return job_id

    def _spawn_batch_entry(self, batch_id: str) -> str | None:
        with self._lock:
            return self._spawn_batch_entry_locked(batch_id)

    @staticmethod
    def _cancel_job_locked(job: dict[str, Any]) -> None:
        job.setdefault("cancel_flag", {"cancel": False})["cancel"] = True
        if job["status"] == "queued":
            job["status"] = "cancelled"

    @staticmethod
    def _reset_job_for_retry(job: dict[str, Any]) -> None:
        job["status"] = "queued"
        job["cancel_flag"] = {"cancel": False}
        job["progress"] = {}
        job.pop("result", None)

    def retry_job(self, job_id: str) -> bool:
        changed = False
        batch_id: str | None = None
        view_id = MAIN_VIEW_ID
        with self._lock:
            for job in self._jobs:
                if job["id"] != job_id:
                    continue
                if job["status"] != "error":
                    return False
                batch_id = job.get("batch_id")
                view_id = job.get("view_id", MAIN_VIEW_ID)
                self._reset_job_for_retry(job)
                changed = True
                break
            if changed:
                if view_id == MAIN_VIEW_ID:
                    self._refresh_main_view_status_locked()
                else:
                    self._refresh_batch_view_status_locked(batch_id)
        if changed:
            self._emit_queue()
            self._ensure_dispatcher()
        return changed

    def retry_failed_in_view(self, view_id: str | None = None) -> int:
        view_id = view_id or self._active_view
        retried = 0
        batch_id: str | None = None
        with self._lock:
            failed: list[dict[str, Any]] = []
            keep: list[dict[str, Any]] = []
            for job in self._jobs:
                if job.get("view_id", MAIN_VIEW_ID) != view_id:
                    keep.append(job)
                    continue
                if job["status"] != "error":
                    keep.append(job)
                    continue
                self._reset_job_for_retry(job)
                failed.append(job)
                retried += 1
                if batch_id is None and job.get("batch_id"):
                    batch_id = job.get("batch_id")
            if retried:
                self._jobs = keep + failed
                if view_id == MAIN_VIEW_ID:
                    self._refresh_main_view_status_locked()
                else:
                    self._refresh_batch_view_status_locked(batch_id or view_id)
        if retried:
            self._emit_queue()
            self._ensure_dispatcher()
        return retried

    def remove(self, job_id: str) -> bool:
        changed = False
        batch_id: str | None = None
        view_id = MAIN_VIEW_ID
        with self._lock:
            for idx, job in enumerate(self._jobs):
                if job["id"] != job_id:
                    continue
                batch_id = job.get("batch_id")
                view_id = job.get("view_id", MAIN_VIEW_ID)
                if job["status"] in ("queued", "running"):
                    self._cancel_job_locked(job)
                    changed = True
                else:
                    del self._jobs[idx]
                    changed = True
                break
            if changed:
                if view_id == MAIN_VIEW_ID:
                    self._refresh_main_view_status_locked()
                else:
                    self._refresh_batch_view_status_locked(batch_id)
        if changed:
            self._emit_queue()
        return changed

    def cancel_view(self, view_id: str | None = None) -> int:
        view_id = view_id or self._active_view
        cancelled = 0
        with self._lock:
            view = self._views.get(view_id)
            if view:
                view.setdefault("cancel_flag", {"cancel": False})["cancel"] = True
                if view.get("status") == "preparing":
                    self._mark_prepare_cancelled_locked(view_id)
            batch = self._batches.get(view_id)
            if batch:
                batch["cancel_flag"]["cancel"] = True
                batch["pending"] = deque()
            for job in self._jobs:
                if job.get("view_id", MAIN_VIEW_ID) != view_id:
                    continue
                if job["status"] in ("queued", "running"):
                    self._cancel_job_locked(job)
                    cancelled += 1
            if view_id == MAIN_VIEW_ID:
                self._refresh_main_view_status_locked()
            elif view_id in self._views and view.get("status") not in ("cancelled",):
                self._views[view_id]["status"] = "cancelled"
        if cancelled or (view and view.get("cancel_flag", {}).get("cancel")):
            self._emit_queue()
        return cancelled

    def clear_view(self, view_id: str | None = None) -> int:
        view_id = view_id or self._active_view
        removed = 0
        with self._lock:
            batch = self._batches.get(view_id)
            if batch:
                batch["pending"] = deque()
            keep: list[dict[str, Any]] = []
            for job in self._jobs:
                if job.get("view_id", MAIN_VIEW_ID) != view_id:
                    keep.append(job)
                    continue
                if job["status"] == "running":
                    self._cancel_job_locked(job)
                removed += 1
            self._jobs = keep
            if view_id == MAIN_VIEW_ID:
                self._refresh_main_view_status_locked()
            elif view_id in self._views:
                view = self._views[view_id]
                if view.get("prepare"):
                    view.pop("prepare", None)
                self._refresh_batch_view_status_locked(view_id)
        if removed:
            self._emit_queue()
        return removed

    def remove_view(self, view_id: str) -> bool:
        if view_id == MAIN_VIEW_ID:
            return False
        removed = False
        with self._lock:
            if view_id not in self._views:
                return False
            view = self._views[view_id]
            view.setdefault("cancel_flag", {"cancel": False})["cancel"] = True
            batch = self._batches.get(view_id)
            if batch:
                batch["pending"] = deque()
                batch.setdefault("cancel_flag", {"cancel": False})["cancel"] = True
            keep: list[dict[str, Any]] = []
            for job in self._jobs:
                if job.get("view_id", MAIN_VIEW_ID) != view_id:
                    keep.append(job)
                    continue
                if job["status"] in ("queued", "running"):
                    self._cancel_job_locked(job)
            self._jobs = keep
            self._views.pop(view_id, None)
            if view_id in self._view_order:
                self._view_order.remove(view_id)
            self._batches.pop(view_id, None)
            if self._active_view == view_id:
                self._active_view = MAIN_VIEW_ID
            self._refresh_main_view_status_locked()
            removed = True
        if removed:
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
        elif any(j["status"] == "cancelled" for j in jobs):
            self._views[MAIN_VIEW_ID]["status"] = "cancelled"
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
                        if job.get("cancel_flag", {}).get("cancel"):
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
                job["status"] = "cancelled"
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
