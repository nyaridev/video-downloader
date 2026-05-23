"""Background download queue with optional concurrent batch downloads."""

from __future__ import annotations

import threading
import time
import uuid
from typing import Any, Callable

from app.config import load_settings, normalize_concurrency
from app.downloader.engine import DownloadEngine
from app.textutil import normalize_log_message

EventFn = Callable[[str, dict[str, Any]], None]

ITEM_ORDER = ("metadata", "thumbnail", "audio", "video")


class DownloadQueue:
    def __init__(self, emit: EventFn):
        self._emit = emit
        self._jobs: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self._dispatcher: threading.Thread | None = None
        self._active_threads: dict[str, threading.Thread] = {}
        self._engines: dict[str, DownloadEngine] = {}
        self._concurrency_limit = normalize_concurrency(load_settings().get("concurrency"))

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
        self._emit("queue", {"jobs": self.list_jobs()})

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
        }

    def list_jobs(self) -> list[dict[str, Any]]:
        with self._lock:
            return [self._job_snapshot(j) for j in self._jobs]

    def add(self, job_config: dict[str, Any]) -> str:
        job_id = str(uuid.uuid4())[:8]
        job = {
            **job_config,
            "id": job_id,
            "status": "queued",
            "cancel_flag": {"cancel": False},
            "progress": {},
        }
        with self._lock:
            if "concurrency" in job_config:
                self._concurrency_limit = normalize_concurrency(job_config["concurrency"])
            self._jobs.append(job)
        self._emit("queue", {"jobs": self.list_jobs()})
        self._ensure_dispatcher()
        return job_id

    def remove(self, job_id: str) -> bool:
        with self._lock:
            for idx, job in enumerate(self._jobs):
                if job["id"] != job_id:
                    continue
                if job["status"] == "running":
                    job["cancel_flag"]["cancel"] = True
                del self._jobs[idx]
                self._emit("queue", {"jobs": self.list_jobs()})
                return True
        return False

    def clear(self) -> int:
        with self._lock:
            for job in self._jobs:
                if job["status"] == "running":
                    job["cancel_flag"]["cancel"] = True
            removed = len(self._jobs)
            self._jobs = []
        if removed:
            self._emit("queue", {"jobs": self.list_jobs()})
        return removed

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
                running = sum(1 for j in self._jobs if j["status"] == "running")
                slots = self._batch_size() - running
                if slots > 0:
                    for job in self._jobs:
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
                self._emit("queue", {"jobs": self.list_jobs()})

            with self._lock:
                if not any(j["status"] in ("queued", "running") for j in self._jobs):
                    if not self._active_threads:
                        return
            time.sleep(0.15)

    def _run_job(self, job: dict[str, Any]) -> None:
        job_id = job["id"]
        job["job_id"] = job_id
        try:
            engine = self._engine_for(job_id)
            result = engine.download_job(job)
            job["result"] = result
            job["status"] = "done" if result.get("ok") else "error"
            if job["status"] == "done":
                job["progress"] = {
                    **(job.get("progress") or {}),
                    "status": "finished",
                    "percent": 100,
                }
        except Exception as exc:  # noqa: BLE001
            job["status"] = "error"
            self._log("error", normalize_log_message(str(exc)))
        finally:
            with self._lock:
                self._active_threads.pop(job_id, None)
                self._engines.pop(job_id, None)
            self._emit("job_status", {"id": job_id, "status": job["status"]})
            self._emit("queue", {"jobs": self.list_jobs()})
            self._ensure_dispatcher()
