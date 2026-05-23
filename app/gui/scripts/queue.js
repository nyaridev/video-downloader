import { closeCustomSelect, toggleCustomSelect } from "./custom-select.js";
import { apiCall } from "./api.js";
import { $ } from "./dom.js";
import {
  formatBytes,
  formatElapsed,
  formatSpeed,
  sanitizeLogText,
  truncateTitle,
  truncateUrl,
} from "./format.js";
import { log } from "./logger.js";
import { ITEM_LABELS, ITEM_ORDER, MAIN_VIEW_ID, state } from "./state.js";

function displayActiveItem(job) {
  const p = job.progress || {};
  const item = p.item;
  if (item === "combining") {
    const items = job.items || [];
    if (items.includes("video")) return "video";
    return items.length ? items[items.length - 1] : null;
  }
  return item || null;
}

export function queueItemDisplayTitle(job) {
  if (job.title) return truncateTitle(job.title, 20);
  if (job.url) return truncateUrl(job.url, 20);
  return "Download";
}

function statusClass(status) {
  if (status === "running") return "queue-item--running";
  if (status === "done") return "queue-item--done";
  if (status === "error") return "queue-item--error";
  if (status === "cancelled") return "queue-item--cancelled";
  return "queue-item--queued";
}

function statusLabel(status) {
  const labels = {
    queued: "Queued",
    running: "Downloading",
    done: "Complete",
    error: "Error",
    cancelled: "Cancelled",
  };
  return labels[status] || status;
}

function isActiveJob(job) {
  return job.status === "running" || job.status === "queued";
}

function viewHasActiveWork(jobs, view) {
  if (view.status === "preparing") return true;
  if (jobs.some(isActiveJob)) return true;
  if (view.kind !== "main" && view.status === "running" && (view.pending || 0) > 0) {
    return true;
  }
  return false;
}

function prepareProgressMeta(view) {
  const prepare = view?.prepare || {};
  const found = prepare.found || 0;
  const total = prepare.total || 0;
  const elapsed = formatElapsed(prepare.elapsed || 0);
  const message = prepare.message || "Fetching entries...";
  let pct = null;
  if (total > 0) {
    pct = Math.min(100, (found / total) * 100);
  }
  return { prepare, found, total, elapsed, message, pct };
}

function prepareSummaryText(view) {
  const { message, found, total, elapsed } = prepareProgressMeta(view);
  const parts = [message];
  if (found > 0 && !message.includes(String(found))) {
    if (total > 0) {
      parts.push(`${found} / ${total} videos`);
    } else {
      parts.push(`${found} videos found`);
    }
  }
  parts.push(elapsed);
  return parts.join(" · ");
}

function prepareHeaderSummaryText(view) {
  const { found, total, elapsed, prepare } = prepareProgressMeta(view);
  const page = prepare.page;
  const parts = [];
  if (found > 0) {
    parts.push(total > 0 ? `${found}/${total} videos` : `${found} videos`);
  } else {
    parts.push("Fetching...");
  }
  if (page) parts.push(`page ${page}`);
  parts.push(elapsed);
  return parts.join(" · ");
}

function setPrepareProgressBar(bar, view) {
  const { pct } = prepareProgressMeta(view);
  bar.classList.remove("progress-bar--indeterminate");
  if (pct != null && pct > 0) {
    bar.style.width = `${pct}%`;
  } else {
    bar.classList.add("progress-bar--indeterminate");
    bar.style.width = "";
  }
}

function isPrepareView(view) {
  return view.status === "preparing" || (view.status === "cancelled" && view.prepare);
}

function buildPreparingQueueItem(view) {
  const cancelled = view.status === "cancelled";
  const li = document.createElement("li");
  li.className = cancelled
    ? "queue-item queue-item--preparing queue-item--cancelled"
    : "queue-item queue-item--preparing";
  const { message, found, total, elapsed } = prepareProgressMeta(view);
  const detail = cancelled
    ? "Fetch cancelled before downloads started"
    : found > 0
      ? total > 0
        ? `${found} / ${total} videos discovered`
        : `${found} videos discovered so far`
      : "This can take several minutes for large channels.";

  const head = document.createElement("div");
  head.className = "queue-item-head";
  const headLeft = document.createElement("div");
  headLeft.className = "queue-item-head-left";
  headLeft.innerHTML = cancelled
    ? '<strong>Preparing batch</strong><span class="queue-status-badge">Cancelled</span>'
    : '<strong>Preparing batch</strong><span class="queue-status-badge">Fetching</span>';
  head.appendChild(headLeft);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "queue-item-close";
  closeBtn.setAttribute("aria-label", cancelled ? "Remove from queue" : "Cancel fetch");
  closeBtn.title = cancelled ? "Remove from queue" : "Cancel fetch";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    handleCancelClearView();
  });
  head.appendChild(closeBtn);

  const statusLine = document.createElement("div");
  statusLine.className = "queue-item-url";
  statusLine.textContent = cancelled ? message || "Cancelled" : message;

  const meta = document.createElement("div");
  meta.className = "queue-item-meta";
  meta.textContent = `${detail} · ${elapsed}`;

  const progressWrap = document.createElement("div");
  progressWrap.className = "progress-wrap progress-wrap--item";
  const progressBar = document.createElement("div");
  progressBar.className = "progress-bar";
  if (cancelled) {
    progressBar.style.width = "0%";
  } else {
    setPrepareProgressBar(progressBar, view);
  }
  progressWrap.appendChild(progressBar);

  li.append(head, statusLine, meta, progressWrap);
  return li;
}

function updateCancelClearButton(jobs, view) {
  const btn = $("cancelViewBtn");
  if (!btn) return;
  const active = viewHasActiveWork(jobs, view);
  if (active) {
    btn.textContent = "Cancel all";
    btn.title = "Cancel all active downloads in this queue view";
  } else {
    btn.textContent = "Clear all";
    btn.title = "Remove all items from this queue view";
  }
}

function updateRetryAllButton(jobs, view) {
  const btn = $("retryAllBtn");
  if (!btn) return;
  if (isPrepareView(view)) {
    btn.hidden = true;
    return;
  }
  const errorJobs = jobs.filter((j) => j.status === "error").length;
  if (errorJobs > 0) {
    btn.hidden = false;
    btn.textContent = errorJobs === 1 ? "Retry failed download" : `Retry all failed downloads (${errorJobs})`;
    btn.title = `Retry ${errorJobs} failed download(s) in this view`;
  } else {
    btn.hidden = true;
  }
}

function itemTagState(job, key, activeItem) {
  const items = job.items || [];
  if (!items.includes(key)) return null;
  if (job.status === "done") return "done";
  if (activeItem === key) return "active";
  const activeIdx = ITEM_ORDER.indexOf(activeItem);
  const keyIdx = ITEM_ORDER.indexOf(key);
  if (activeIdx >= 0 && keyIdx >= 0 && keyIdx < activeIdx) return "done";
  return "pending";
}

function buildItemTags(job, activeItem) {
  const tags = document.createElement("div");
  tags.className = "queue-item-tags";
  const items = job.items || [];
  if (!items.length) {
    return tags;
  }
  items.forEach((key) => {
    const tagState = itemTagState(job, key, activeItem);
    if (!tagState) return;
    const span = document.createElement("span");
    span.className = "item-tag";
    if (tagState === "active") span.classList.add("item-tag--active");
    if (tagState === "done") span.classList.add("item-tag--done");
    span.textContent = ITEM_LABELS[key] || key;
    tags.appendChild(span);
  });
  return tags;
}

export function activeViewMeta() {
  return state.views.find((v) => v.id === state.activeViewId) || { id: MAIN_VIEW_ID, kind: "main" };
}

export function jobsForActiveView() {
  const viewId = state.activeViewId || MAIN_VIEW_ID;
  return state.allJobs.filter((j) => (j.view_id || MAIN_VIEW_ID) === viewId);
}

function queueViewLabel(view) {
  return view?.name || view?.id || "Main";
}

export function closeQueueViewMenu() {
  const picker = $("queueViewPicker");
  if (!picker) return;
  closeCustomSelect(picker);
}

export function toggleQueueViewMenu() {
  const picker = $("queueViewPicker");
  toggleCustomSelect(picker);
}

function syncQueueViewTriggerLabel() {
  const label = $("queueViewLabel");
  if (!label) return;
  const view = activeViewMeta();
  label.textContent = queueViewLabel(view);
}

function updateQueueViewPicker() {
  const picker = $("queueViewPicker");
  const menu = $("queueViewMenu");
  if (!picker || !menu) return;

  const hasBatchViews = state.views.some((v) => v.kind !== "main");
  picker.hidden = !hasBatchViews;
  if (!hasBatchViews) {
    closeQueueViewMenu();
    return;
  }

  const activeId = state.activeViewId || MAIN_VIEW_ID;
  menu.innerHTML = "";
  state.views.forEach((view) => {
    const li = document.createElement("li");
    li.className = "custom-select-option";
    li.dataset.viewId = view.id;
    li.setAttribute("role", "option");
    if (view.id === activeId) {
      li.classList.add("active");
      li.setAttribute("aria-selected", "true");
    }

    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = "custom-select-option-btn";
    selectBtn.textContent = queueViewLabel(view);
    li.appendChild(selectBtn);

    if (view.kind !== "main") {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "custom-select-option-remove";
      removeBtn.setAttribute("aria-label", `Remove ${queueViewLabel(view)}`);
      removeBtn.title = "Remove this queue view";
      removeBtn.textContent = "×";
      li.appendChild(removeBtn);
    }

    menu.appendChild(li);
  });

  syncQueueViewTriggerLabel();
}

export function setActiveView(viewId) {
  const nextId = viewId || MAIN_VIEW_ID;
  const exists = state.views.some((v) => v.id === nextId);
  state.activeViewId = exists ? nextId : MAIN_VIEW_ID;
  closeQueueViewMenu();
  updateQueueViewPicker();
  renderQueueList();
}

export async function removeQueueView(viewId) {
  if (!viewId || viewId === MAIN_VIEW_ID) return;
  try {
    const res = await apiCall("remove_queue_view", viewId);
    applyQueueState(res);
    if (res.active_view) {
      state.activeViewId = res.active_view;
    } else if (!state.views.some((v) => v.id === state.activeViewId)) {
      state.activeViewId = MAIN_VIEW_ID;
    }
    updateQueueViewPicker();
    renderQueueList();
    log("info", "Queue view removed.");
  } catch (err) {
    log("error", err.message);
  }
}

function aggregateQueueStats(jobs) {
  const totalJobs = jobs.length;
  const doneJobs = jobs.filter((j) => j.status === "done").length;
  const runningJobs = jobs.filter((j) => j.status === "running").length;
  const errorJobs = jobs.filter((j) => j.status === "error").length;
  const cancelledJobs = jobs.filter((j) => j.status === "cancelled").length;

  let downloaded = 0;
  let total = 0;
  let speed = 0;
  jobs.forEach((job) => {
    const p = job.progress || {};
    downloaded += p.downloaded_bytes || 0;
    total += p.total_bytes || 0;
    if (job.status === "running" && p.speed > 0) {
      speed += p.speed;
    }
  });

  const pct = total > 0 ? Math.min(100, (downloaded / total) * 100) : 0;
  const finishedCount = doneJobs + errorJobs + cancelledJobs;

  return {
    totalJobs,
    doneJobs,
    runningJobs,
    errorJobs,
    cancelledJobs,
    finishedCount,
    downloaded,
    total,
    speed,
    pct,
  };
}

function updateQueueSummary(jobs) {
  const view = activeViewMeta();
  const stats = aggregateQueueStats(jobs);
  const summary = $("queueSummary");
  const bytes = $("queueBytes");

  if (view.status !== "preparing" && !(view.status === "cancelled" && view.prepare)) {
    summary.title = "";
  }

  if (view.kind !== "main") {
    const finished = view.finished || 0;
    const total = view.total || 0;
    const pending = view.pending || 0;
    const running = view.running || 0;

    if (view.status === "preparing") {
      summary.textContent = prepareHeaderSummaryText(view);
      summary.title = prepareSummaryText(view);
      bytes.textContent = view.kind === "channel" ? "Scanning channel videos" : "Scanning playlist videos";
      return;
    }

    if (view.status === "cancelled" && view.prepare) {
      summary.textContent = `Cancelled · ${formatElapsed(view.prepare.elapsed || 0)}`;
      summary.title = prepareSummaryText(view);
      bytes.textContent = "Fetch cancelled";
      return;
    }

    summary.textContent = `${finished} / ${total} videos`;
    if (running > 0) {
      summary.textContent += ` · ${running} downloading`;
    } else if (pending > 0) {
      summary.textContent += ` · ${pending} waiting`;
    }

    const byteParts = [];
    if (stats.total > 0) {
      byteParts.push(`${formatBytes(stats.downloaded)} / ${formatBytes(stats.total)}`);
    } else if (stats.runningJobs > 0) {
      byteParts.push(`${formatBytes(stats.downloaded)} downloaded`);
    }
    if (stats.speed > 0) {
      byteParts.push(formatSpeed(stats.speed));
    }
    bytes.textContent = byteParts.length ? byteParts.join(" · ") : "—";
    return;
  }

  if (!jobs.length) {
    summary.textContent = "0 / 0 files";
    bytes.textContent = "—";
    return;
  }

  summary.textContent = `${stats.finishedCount} / ${stats.totalJobs} files`;
  if (stats.runningJobs > 0) {
    summary.textContent += ` · ${stats.runningJobs} downloading`;
  }

  const byteParts = [];
  if (stats.total > 0) {
    byteParts.push(`${formatBytes(stats.downloaded)} / ${formatBytes(stats.total)}`);
  } else if (stats.runningJobs > 0) {
    byteParts.push(`${formatBytes(stats.downloaded)} downloaded`);
  }
  if (stats.speed > 0) {
    byteParts.push(formatSpeed(stats.speed));
  }
  if (byteParts.length) {
    bytes.textContent = byteParts.join(" · ");
  } else {
    bytes.textContent = stats.doneJobs ? "All transfers finished" : "Waiting to start";
  }
}

function setOverallProgress(jobs, currentProgress) {
  const bar = $("overallProgressBar");
  const text = $("overallProgressText");
  const view = activeViewMeta();
  const stats = aggregateQueueStats(jobs);

  let pct = stats.pct;

  if (view.kind !== "main" && view.total > 0) {
    pct = Math.min(100, ((view.finished || 0) / view.total) * 100);
  }

  if (currentProgress && currentProgress.status === "downloading") {
    const curTotal = currentProgress.total_bytes || 0;
    const curDone = currentProgress.downloaded_bytes || 0;
    if (curTotal > 0 && stats.total <= 0) {
      pct = Math.min(100, (curDone / curTotal) * 100);
    }
  }

  if (!jobs.length && !isPrepareView(view)) {
    if (view.kind !== "main" && view.total > 0 && (view.finished || 0) >= view.total) {
      bar.style.width = "100%";
      text.textContent = view.status === "cancelled" ? "Batch cancelled" : "All downloads complete";
      return;
    }
    bar.style.width = "0%";
    bar.classList.remove("progress-bar--indeterminate");
    text.textContent = "Idle";
    return;
  }

  if (isPrepareView(view)) {
    const { message, elapsed } = prepareProgressMeta(view);
    if (view.status === "cancelled") {
      bar.classList.remove("progress-bar--indeterminate");
      bar.style.width = "0%";
      text.textContent = `Cancelled · ${elapsed}`;
      return;
    }
    setPrepareProgressBar(bar, view);
    text.textContent = `${message} · ${elapsed}`;
    return;
  }

  bar.classList.remove("progress-bar--indeterminate");

  if (stats.finishedCount === stats.totalJobs && stats.totalJobs > 0) {
    bar.style.width = "100%";
    text.textContent = stats.errorJobs
      ? `Finished with ${stats.errorJobs} error(s)`
      : "All downloads complete";
    return;
  }

  bar.style.width = `${pct}%`;

  const eta =
    currentProgress && currentProgress.eta != null ? `ETA ${currentProgress.eta}s` : "";
  const pctLabel = currentProgress
    ? sanitizeLogText(currentProgress._percent_str || "")
    : "";
  const parts = [
    pct > 0 ? `${pct.toFixed(1)}% overall` : null,
    pctLabel,
    stats.speed > 0 ? formatSpeed(stats.speed) : null,
    eta,
  ].filter(Boolean);
  text.textContent = parts.join(" · ") || "Downloading...";
}

async function removeQueueJob(jobId) {
  try {
    const res = await apiCall("remove_queue_job", jobId);
    applyQueueState(res);
  } catch (err) {
    log("error", err.message);
  }
}

async function handleQueueItemAction(job) {
  await removeQueueJob(job.id);
}

async function retryQueueJob(jobId) {
  try {
    const res = await apiCall("retry_queue_job", jobId);
    applyQueueState(res);
    if (res.ok) {
      log("info", "Download queued for retry.");
    }
  } catch (err) {
    log("error", err.message);
  }
}

export async function handleRetryAllFailed() {
  try {
    const res = await apiCall("retry_failed_in_view", state.activeViewId);
    applyQueueState(res);
    if (res.retried > 0) {
      const list = $("queueList");
      if (list) list.scrollTop = 0;
      log("info", `Retrying ${res.retried} failed download(s).`);
    }
  } catch (err) {
    log("error", err.message);
  }
}

async function cancelActiveView() {
  try {
    const res = await apiCall("cancel_queue_view", state.activeViewId);
    applyQueueState(res);
    if (res.cancelled > 0) {
      log("info", `Cancelled ${res.cancelled} active item(s) in this queue view.`);
    }
  } catch (err) {
    log("error", err.message);
  }
}

async function clearActiveView() {
  try {
    const res = await apiCall("clear_queue", state.activeViewId);
    applyQueueState(res);
    if (res.removed > 0) {
      log("info", `Cleared ${res.removed} item(s) from this queue view.`);
    }
  } catch (err) {
    log("error", err.message);
  }
}

export async function handleCancelClearView() {
  const jobs = jobsForActiveView();
  const view = activeViewMeta();
  if (viewHasActiveWork(jobs, view)) {
    await cancelActiveView();
  } else {
    await clearActiveView();
  }
}

export function applyQueueState(data, revision) {
  const rev = revision ?? data?.revision;
  if (rev != null && rev < state.queueRevision) {
    return;
  }
  if (rev != null) {
    state.queueRevision = rev;
  }

  state.allJobs = data?.jobs || [];
  state.views = data?.views || [{ id: MAIN_VIEW_ID, name: "Main", kind: "main" }];

  if (data?.active_view) {
    state.activeViewId = data.active_view;
  }
  if (!state.views.some((v) => v.id === state.activeViewId)) {
    state.activeViewId = MAIN_VIEW_ID;
  }

  updateQueueViewPicker();
  renderQueueList();
}

export function renderQueueList() {
  const jobs = jobsForActiveView();
  const view = activeViewMeta();
  const list = $("queueList");
  list.innerHTML = "";

  updateCancelClearButton(jobs, view);
  updateRetryAllButton(jobs, view);

  if (isPrepareView(view)) {
    list.appendChild(buildPreparingQueueItem(view));
    updateQueueSummary(jobs);
    setOverallProgress(jobs);
    return;
  }

  if (!jobs.length) {
    const li = document.createElement("li");
    li.className = "queue-item queue-item--empty";
    li.textContent = view.kind === "main" ? "Queue is empty" : "No active downloads in this view";
    list.appendChild(li);
    updateQueueSummary(jobs);
    setOverallProgress(jobs);
    return;
  }

  [...jobs].reverse().forEach((job) => {
    const status = job.status;
    const li = document.createElement("li");
    li.className = `queue-item ${statusClass(status)}`;
    li.dataset.jobId = job.id;

    const head = document.createElement("div");
    head.className = "queue-item-head";

    const headLeft = document.createElement("div");
    headLeft.className = "queue-item-head-left";
    const indexLabel =
      job.entry_index != null && job.entry_total != null
        ? `<span class="queue-item-index">${job.entry_index}/${job.entry_total}</span>`
        : "";
    headLeft.innerHTML = `${indexLabel}<strong>${queueItemDisplayTitle(job)}</strong><span class="queue-status-badge">${statusLabel(status)}</span>`;

    const headActions = document.createElement("div");
    headActions.className = "queue-item-head-actions";

    if (status === "error") {
      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "queue-item-retry";
      retryBtn.setAttribute("aria-label", "Retry download");
      retryBtn.title = "Retry download";
      retryBtn.textContent = "↻";
      retryBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        retryQueueJob(job.id);
      });
      headActions.appendChild(retryBtn);
    }

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "queue-item-close";
    closeBtn.setAttribute(
      "aria-label",
      isActiveJob(job) ? "Cancel download" : "Remove from queue"
    );
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleQueueItemAction(job);
    });

    headActions.appendChild(closeBtn);
    head.append(headLeft, headActions);

    const url = document.createElement("div");
    url.className = "queue-item-url";
    if (job.url) {
      url.textContent = truncateUrl(job.url, 56);
      url.title = job.url;
    }

    const p = job.progress || {};
    const activeItem = displayActiveItem(job);
    const tags = buildItemTags(job, activeItem);

    const fileLine = document.createElement("div");
    fileLine.className = "queue-item-file";
    if (job.status === "running" && activeItem) {
      fileLine.innerHTML = `<strong>File</strong> ${ITEM_LABELS[activeItem] || activeItem}`;
    }

    const progressWrap = document.createElement("div");
    progressWrap.className = "progress-wrap progress-wrap--item";
    const progressBar = document.createElement("div");
    progressBar.className = "progress-bar";

    const itemPct =
      job.status === "done"
        ? 100
        : p.percent != null
          ? Math.min(100, p.percent)
          : 0;
    progressBar.style.width = `${itemPct}%`;
    progressWrap.appendChild(progressBar);

    const meta = document.createElement("div");
    meta.className = "queue-item-meta";
    const metaParts = [];
    if (job.status === "running" && (p.total_bytes || p.downloaded_bytes)) {
      metaParts.push(
        `${formatBytes(p.downloaded_bytes || 0)} / ${formatBytes(p.total_bytes || 0)}`
      );
    }
    if (job.status === "running" && p.speed > 0) {
      metaParts.push(formatSpeed(p.speed));
    }
    if (metaParts.length) {
      meta.textContent = metaParts.join(" · ");
    }

    const parts = [head];
    if (url.textContent) parts.push(url);
    parts.push(tags);
    if (fileLine.textContent) parts.push(fileLine);
    parts.push(progressWrap, meta);
    li.append(...parts);
    list.appendChild(li);
  });

  updateQueueSummary(jobs);
  setOverallProgress(jobs);
}

export function setProgress(data) {
  if (!data) return;

  if (data.job_id && state.allJobs.length) {
    const job = state.allJobs.find((j) => j.id === data.job_id);
    if (job) {
      const prev = job.progress || {};
      if (data.status === "combining") {
        job.progress = {
          ...prev,
          status: "downloading",
          item: prev.item || "video",
        };
      } else if (data.status === "downloading" && !data.downloaded_bytes && !data.total_bytes) {
        job.progress = {
          ...prev,
          status: "downloading",
          item: data.item || prev.item,
        };
      } else {
        const total = data.total_bytes || 0;
        const done = data.downloaded_bytes || 0;
        job.progress = {
          status: data.status,
          item: data.item || prev.item,
          downloaded_bytes: done,
          total_bytes: total,
          percent: total > 0 ? (done / total) * 100 : prev.percent || 0,
          speed: data.speed ?? prev.speed,
          eta: data.eta ?? prev.eta,
          label: data._percent_str || prev.label || "",
        };
        if (data.status === "finished") {
          job.progress.percent = 100;
        }
      }
      if ((job.view_id || MAIN_VIEW_ID) === state.activeViewId) {
        renderQueueList();
      }
    }
  }

  setOverallProgress(jobsForActiveView(), data);
}
