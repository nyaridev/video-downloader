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
import { itemLabel, t } from "./i18n.js";
import { ITEM_ORDER, MAIN_VIEW_ID, state } from "./state.js";

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
  return t("queue.download");
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
    queued: t("status.queued"),
    running: t("status.running"),
    done: t("status.done"),
    error: t("status.error"),
    cancelled: t("status.cancelled"),
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

const PREPARE_MESSAGE_KEYS = {
  Cancelled: "status.cancelled",
  "Starting fetch...": "status.startingFetch",
  "Fetching entries...": "status.fetching",
  "Connecting to source...": "status.connecting",
  "Loading page...": "status.loadingPage",
  "fetching entries": "status.fetchingShort",
};

function prepareDisplayMessage(prepare) {
  if (!prepare) return t("status.fetching");

  const { found = 0, total, page, phase, message } = prepare;

  if (message === "Cancelled") return t("status.cancelled");
  if (phase === "connect") return t("status.connecting");
  if (phase === "webpage") return t("status.loadingPage");
  if (phase === "start") return t("status.startingFetch");
  if (phase === "finalizing") return t("status.finalizing");

  const parts = [];
  if (found > 0) {
    if (total != null && total > 0) {
      parts.push(t("queue.videosCount", { found, total }));
    } else {
      parts.push(t("queue.videosFound", { count: found }));
    }
  } else if (page != null) {
    parts.push(t("queue.fetchingPage", { page }));
  } else if (phase === "page" || phase === "items" || phase === "playlist") {
    parts.push(t("status.fetchingShort"));
  }

  if (parts.length) return parts.join(" · ");

  if (message && PREPARE_MESSAGE_KEYS[message]) {
    return t(PREPARE_MESSAGE_KEYS[message]);
  }

  const foundMatch = typeof message === "string" && message.match(/^Found (\d+) videos$/);
  if (foundMatch) {
    return t("queue.videosFoundComplete", { count: foundMatch[1] });
  }

  return message || t("status.fetching");
}

function normalizeView(view) {
  if (view?.kind === "main" || view?.id === MAIN_VIEW_ID) {
    return { ...view, id: MAIN_VIEW_ID, kind: "main", name: t("queue.main") };
  }
  return view;
}

export function syncQueueLocalization() {
  state.views = state.views.map(normalizeView);
  syncQueueViewTriggerLabel();
}

function prepareProgressMeta(view) {
  const prepare = view?.prepare || {};
  const found = prepare.found || 0;
  const total = prepare.total || 0;
  const elapsed = formatElapsed(prepare.elapsed || 0);
  const message = prepareDisplayMessage(prepare);
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
      parts.push(t("queue.videosCount", { found, total }));
    } else {
      parts.push(t("queue.videosFound", { count: found }));
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
    parts.push(total > 0 ? t("queue.videosCount", { found, total }) : t("queue.videosFound", { count: found }));
  } else {
    parts.push(t("status.fetchingShort"));
  }
  if (page) parts.push(t("queue.page", { page }));
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
    ? t("queue.fetchCancelled")
    : found > 0
      ? total > 0
        ? t("queue.videosHeaderUi", { found, total })
        : t("queue.videosFoundSoFar", { found })
      : t("queue.largeChannelHint");

  const head = document.createElement("div");
  head.className = "queue-item-head";
  const headLeft = document.createElement("div");
  headLeft.className = "queue-item-head-left";
  headLeft.innerHTML = cancelled
    ? `<strong>${t("queue.preparingBatch")}</strong><span class="queue-status-badge">${t("status.cancelled")}</span>`
    : `<strong>${t("queue.preparingBatch")}</strong><span class="queue-status-badge">${t("queue.fetching")}</span>`;
  head.appendChild(headLeft);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "queue-item-close";
  closeBtn.setAttribute("aria-label", cancelled ? t("queue.removeFromQueue") : t("queue.cancelFetch"));
  closeBtn.title = cancelled ? t("queue.removeFromQueue") : t("queue.cancelFetch");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    handleCancelClearView();
  });
  head.appendChild(closeBtn);

  const statusLine = document.createElement("div");
  statusLine.className = "queue-item-url";
  statusLine.textContent = cancelled ? message || t("status.cancelled") : message;

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
    btn.textContent = t("queue.cancelAll");
    btn.title = t("queue.cancelAllTitle");
  } else {
    btn.textContent = t("queue.clearAll");
    btn.title = t("queue.clearAllTitle");
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
    btn.textContent = errorJobs === 1 ? t("queue.retryFailedOne") : t("queue.retryFailedAll", { count: errorJobs });
    btn.title = t("queue.retryFailedTitle", { count: errorJobs });
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
    span.textContent = itemLabel(key);
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
  if (view?.kind === "main") return t("queue.main");
  return view?.name || view?.id || t("queue.main");
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
    syncQueueViewTriggerLabel();
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
      removeBtn.setAttribute("aria-label", t("queue.removeViewAria", { name: queueViewLabel(view) }));
      removeBtn.title = t("queue.removeView");
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
    updateQueueViewPicker();
    renderQueueList();
    log("info", t("log.queueViewRemoved"));
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
      bytes.textContent = view.kind === "channel" ? t("queue.scanningChannel") : t("queue.scanningPlaylist");
      return;
    }

    if (view.status === "cancelled" && view.prepare) {
      summary.textContent = t("queue.cancelledElapsed", { elapsed: formatElapsed(view.prepare.elapsed || 0) });
      summary.title = prepareSummaryText(view);
      bytes.textContent = t("queue.fetchCancelledShort");
      return;
    }

    summary.textContent = t("queue.videosProgress", { finished, total });
    if (running > 0) {
      summary.textContent += ` · ${t("queue.downloadingCount", { count: running })}`;
    } else if (pending > 0) {
      summary.textContent += ` · ${t("queue.waitingCount", { count: pending })}`;
    }

    const byteParts = [];
    if (stats.total > 0) {
      byteParts.push(`${formatBytes(stats.downloaded)} / ${formatBytes(stats.total)}`);
    } else if (stats.runningJobs > 0) {
      byteParts.push(t("queue.downloadedBytes", { bytes: formatBytes(stats.downloaded) }));
    }
    if (stats.speed > 0) {
      byteParts.push(formatSpeed(stats.speed));
    }
    bytes.textContent = byteParts.length ? byteParts.join(" · ") : "—";
    return;
  }

  if (!jobs.length) {
    summary.textContent = t("queue.summaryFiles", { finished: 0, total: 0 });
    bytes.textContent = "—";
    return;
  }

  summary.textContent = t("queue.summaryFiles", { finished: stats.finishedCount, total: stats.totalJobs });
  if (stats.runningJobs > 0) {
    summary.textContent += ` · ${t("queue.downloadingCount", { count: stats.runningJobs })}`;
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
    bytes.textContent = stats.doneJobs ? t("queue.allTransfersComplete") : t("queue.waitingToStart");
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
      text.textContent = view.status === "cancelled" ? t("queue.batchCancelled") : t("queue.allComplete");
      return;
    }
    bar.style.width = "0%";
    bar.classList.remove("progress-bar--indeterminate");
    text.textContent = t("queue.idle");
    return;
  }

  if (isPrepareView(view)) {
    const { message, elapsed } = prepareProgressMeta(view);
    if (view.status === "cancelled") {
      bar.classList.remove("progress-bar--indeterminate");
      bar.style.width = "0%";
      text.textContent = t("queue.cancelledElapsed", { elapsed });
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
      ? t("queue.finishedWithErrors", { count: stats.errorJobs })
      : t("queue.allComplete");
    return;
  }

  bar.style.width = `${pct}%`;

  const eta =
    currentProgress && currentProgress.eta != null ? `ETA ${currentProgress.eta}s` : "";
  const pctLabel = currentProgress
    ? sanitizeLogText(currentProgress._percent_str || "")
    : "";
  const parts = [
    pct > 0 ? t("queue.overallPercent", { pct: pct.toFixed(1) }) : null,
    pctLabel,
    stats.speed > 0 ? formatSpeed(stats.speed) : null,
    eta,
  ].filter(Boolean);
  text.textContent = parts.join(" · ") || t("queue.downloadingEllipsis");
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
      log("info", t("log.retryQueued"));
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
      log("info", t("log.retryingFailed", { count: res.retried }));
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
      log("info", t("log.cancelledItems", { count: res.cancelled }));
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
      log("info", t("log.clearedItems", { count: res.removed }));
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

function snapshotQueueUiState() {
  return {
    jobs: state.allJobs,
    views: state.views,
  };
}

function queueUiNeedsRefresh(prev, viewId = state.activeViewId || MAIN_VIEW_ID) {
  const nextJobs = state.allJobs;
  const nextViews = state.views;

  const hadBatchViews = prev.views.some((v) => v.kind !== "main");
  const hasBatchViews = nextViews.some((v) => v.kind !== "main");
  if (hadBatchViews !== hasBatchViews) return true;

  const prevView = prev.views.find((v) => v.id === viewId);
  const nextView = nextViews.find((v) => v.id === viewId);
  if (!nextView) return true;
  if (JSON.stringify(prevView) !== JSON.stringify(nextView)) return true;

  const jobSignature = (job) =>
    `${job.id}:${job.status}:${JSON.stringify(job.progress || {})}`;
  const prevActiveJobs = prev.jobs
    .filter((j) => (j.view_id || MAIN_VIEW_ID) === viewId)
    .map(jobSignature)
    .join("|");
  const nextActiveJobs = nextJobs
    .filter((j) => (j.view_id || MAIN_VIEW_ID) === viewId)
    .map(jobSignature)
    .join("|");
  return prevActiveJobs !== nextActiveJobs;
}

export function applyQueueState(data, revision) {
  const rev = revision ?? data?.revision;
  if (rev != null && rev < state.queueRevision) {
    return;
  }
  if (rev != null) {
    state.queueRevision = rev;
  }

  const prev = snapshotQueueUiState();
  const prevActiveViewId = state.activeViewId;

  state.allJobs = data?.jobs || [];
  state.views = (data?.views || [{ id: MAIN_VIEW_ID, kind: "main" }]).map(normalizeView);

  // Queue view selection is client-controlled (download click or picker), not backend pushes.
  if (!state.views.some((v) => v.id === state.activeViewId)) {
    state.activeViewId = MAIN_VIEW_ID;
  }

  updateQueueViewPicker();
  if (prevActiveViewId !== state.activeViewId || queueUiNeedsRefresh(prev)) {
    renderQueueList();
  }
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
    li.textContent = view.kind === "main" ? t("queue.empty") : t("queue.noActiveInView");
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
      retryBtn.setAttribute("aria-label", t("queue.retryDownload"));
      retryBtn.title = t("queue.retryDownload");
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
      isActiveJob(job) ? t("queue.cancelDownload") : t("queue.removeFromQueue")
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
      fileLine.innerHTML = `<strong>${t("queue.file")}</strong> ${itemLabel(activeItem)}`;
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
