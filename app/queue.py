"""Background download queue worker."""

from __future__ import annotations

import threading
import uuid
from typing import Any, Callable

from app.downloader.engine import DownloadEngine
from app.textutil import normalize_log_message

EventFn = Callable[[str, dict[str, Any]], None]


class DownloadQueue:
    def __init__(self, emit: EventFn):
        self._emit = emit
        self._jobs: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self._worker: threading.Thread | None = None
        self._engine = DownloadEngine(self._log, self._progress)

    def _log(self, level: str, message: str) -> None:
        self._emit("log", {"level": level, "message": normalize_log_message(message)})

    def _progress(self, data: dict[str, Any]) -> None:
        self._emit("progress", data)

    def list_jobs(self) -> list[dict[str, Any]]:
        with self._lock:
            return [
                {
                    "id": j["id"],
                    "url": j["url"],
                    "mode": j.get("mode"),
                    "status": j.get("status"),
                    "title": j.get("title"),
                }
                for j in self._jobs
            ]

    def add(self, job_config: dict[str, Any]) -> str:
        job_id = str(uuid.uuid4())[:8]
        job = {**job_config, "id": job_id, "status": "queued", "cancel_flag": {"cancel": False}}
        with self._lock:
            self._jobs.append(job)
        self._emit("queue", {"jobs": self.list_jobs()})
        self._ensure_worker()
        return job_id

    def _ensure_worker(self) -> None:
        if self._worker and self._worker.is_alive():
            return
        self._worker = threading.Thread(target=self._run_worker, daemon=True)
        self._worker.start()

    def _run_worker(self) -> None:
        while True:
            job = None
            with self._lock:
                for j in self._jobs:
                    if j["status"] == "queued":
                        job = j
                        j["status"] = "running"
                        break
                if not job:
                    return
            self._emit("queue", {"jobs": self.list_jobs()})
            self._emit("job_status", {"id": job["id"], "status": "running"})
            job["job_id"] = job["id"]
            try:
                result = self._engine.download_job(job)
                job["result"] = result
                job["status"] = "done" if result.get("ok") else "error"
            except Exception as exc:  # noqa: BLE001
                job["status"] = "error"
                self._log("error", normalize_log_message(str(exc)))
            self._emit("job_status", {"id": job["id"], "status": job["status"]})
            self._emit("queue", {"jobs": self.list_jobs()})
