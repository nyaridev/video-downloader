let state = {
  mode: "video",
  outputDir: "",
  frameless: true,
  allJobs: [],
  views: [],
  activeViewId: "main",
};

const MAIN_VIEW_ID = "main";

let queueRevision = 0;

let saveTimer = null;

const $ = (id) => document.getElementById(id);

function sanitizeLogText(text) {
  if (!text) return "";
  return String(text)
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/ERROR:\s*ERROR:\s*/gi, "ERROR: ")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u2022/g, "-");
}

function log(level, message) {
  const el = $("console");
  const time = new Date().toLocaleTimeString();
  const body = sanitizeLogText(message);
  const lines = body.split("\n");
  lines.forEach((line, index) => {
    const row = document.createElement("div");
    row.className = `log-line ${level}`;
    const prefix = index === 0 ? `[${time}] ` : "           ";
    row.textContent = prefix + line;
    el.appendChild(row);
  });
  if (lines.length === 0) {
    const row = document.createElement("div");
    row.className = `log-line ${level}`;
    row.textContent = `[${time}]`;
    el.appendChild(row);
  }
  el.scrollTop = el.scrollHeight;
}

function getConsoleText() {
  return Array.from($("console").querySelectorAll(".log-line"))
    .map((node) => node.textContent)
    .join("\n");
}

async function copyConsoleToClipboard() {
  const text = getConsoleText();
  if (!text) {
    log("warn", "Console is empty.");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    log("info", "Log copied to clipboard.");
  } catch {
    const range = document.createRange();
    range.selectNodeContents($("console"));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    log("info", "Log selected — press Ctrl+C to copy.");
  }
}

function fillSelect(select, options) {
  select.innerHTML = "";
  options.forEach((opt) => {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    select.appendChild(o);
  });
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return "";
  return `${formatBytes(bytesPerSec)}/s`;
}

function clampConcurrency(value) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return 8;
  return Math.max(1, Math.min(100, n));
}

function setConcurrency(value) {
  const v = clampConcurrency(value);
  $("concurrencySlider").value = v;
  $("concurrencyInput").value = v;
}

function getConcurrency() {
  return clampConcurrency($("concurrencyInput").value || $("concurrencySlider").value);
}

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

function truncateUrl(url, max = 48) {
  if (!url) return "";
  return url.length > max ? `${url.slice(0, max)}…` : url;
}

function truncateTitle(title, max = 20) {
  if (!title) return "";
  return title.length > max ? `${title.slice(0, max)}…` : title;
}

function queueItemDisplayTitle(job) {
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

const ITEM_LABELS = {
  video: "Video",
  audio: "Audio",
  metadata: "Metadata",
  thumbnail: "Thumbnail",
};

const ITEM_ORDER = ["metadata", "thumbnail", "audio", "video"];

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
    const state = itemTagState(job, key, activeItem);
    if (!state) return;
    const span = document.createElement("span");
    span.className = "item-tag";
    if (state === "active") span.classList.add("item-tag--active");
    if (state === "done") span.classList.add("item-tag--done");
    span.textContent = ITEM_LABELS[key] || key;
    tags.appendChild(span);
  });
  return tags;
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
}

function applyFramelessUi(frameless) {
  state.frameless = frameless;
  document.body.classList.toggle("frameless", frameless);
}

function setPage(page) {
  document.querySelectorAll(".page-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });
  document.querySelectorAll(".page-view").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `page-${page}`);
  });
  if (page === "extras") {
    refreshExtrasStatus().catch(() => {});
  }
}

function setSourceToggleLabels(pathLabel, localLabel, useLocal) {
  pathLabel?.classList.toggle("active", !useLocal);
  localLabel?.classList.toggle("active", useLocal);
}

function applyToolUi({ btn, text, source, pathStatus, localStatus, downloadLabel }) {
  if (!btn || !text) return;
  const useLocal = source === "local";
  const active = useLocal ? localStatus : pathStatus;

  btn.classList.remove("is-installed");
  if (active.installed) {
    btn.textContent = "Installed";
    btn.disabled = true;
    btn.classList.add("is-installed");
    text.textContent = active.version ? `${active.version} — ${active.path}` : active.path;
    return;
  }

  if (useLocal) {
    btn.textContent = downloadLabel;
    btn.disabled = false;
    text.textContent = "Not installed. Downloads a local copy into this app folder.";
  } else {
    btn.textContent = "Not in PATH";
    btn.disabled = true;
    text.textContent = "No system install found on PATH. Switch to Local to download one here.";
  }
}

function applyExtrasStatus(status) {
  const denoLocal = status.deno_source === "local";
  const ffmpegLocal = status.ffmpeg_source === "local";

  $("denoSourceLocal").checked = denoLocal;
  $("ffmpegSourceLocal").checked = ffmpegLocal;
  setSourceToggleLabels($("denoSourcePathLabel"), $("denoSourceLocalLabel"), denoLocal);
  setSourceToggleLabels($("ffmpegSourcePathLabel"), $("ffmpegSourceLocalLabel"), ffmpegLocal);

  applyToolUi({
    btn: $("installDenoBtn"),
    text: $("denoStatusText"),
    source: status.deno_source,
    pathStatus: status.deno_path,
    localStatus: status.deno_local,
    downloadLabel: "Download Deno",
  });
  applyToolUi({
    btn: $("installFfmpegBtn"),
    text: $("ffmpegStatusText"),
    source: status.ffmpeg_source,
    pathStatus: status.ffmpeg_path,
    localStatus: status.ffmpeg_local,
    downloadLabel: "Download ffmpeg",
  });
}

function readExtrasSettingsFromForm() {
  return {
    deno_source: $("denoSourceLocal").checked ? "local" : "path",
    ffmpeg_source: $("ffmpegSourceLocal").checked ? "local" : "path",
  };
}

async function saveExtrasSettings({ silent = false } = {}) {
  const saved = await apiCall("save_extras_settings", readExtrasSettingsFromForm());
  applyExtrasStatus(saved);
  if (!silent) log("info", "Extras settings saved.");
}

async function refreshExtrasStatus() {
  const status = await apiCall("get_extras_status");
  applyExtrasStatus(status);
  return status;
}

function applyDownloadDefaults(defaults) {
  $("chkVideo").checked = defaults.want_video !== false;
  $("chkAudio").checked = defaults.want_audio !== false;
  $("chkMeta").checked = defaults.want_metadata !== false;
  $("chkThumb").checked = defaults.want_thumbnail !== false;
  $("videoQuality").value = defaults.video_quality || "Best";
  $("audioQuality").value = defaults.audio_quality || "Best";
  $("chkBundle").checked = defaults.bundle !== false;
  $("chkCombine").checked = defaults.combine_streams !== false;
  $("layoutOrg").checked = !!defaults.organize;
  $("layoutRaw").checked = !defaults.organize;
  setConcurrency(defaults.concurrency ?? 8);
}

function readSettingsFromForm() {
  return {
    use_browser_cookies: $("chkBrowserCookies").checked,
    cookies_browser: $("cookieBrowser").value,
    cookies_file: $("cookiesFile").value,
    frameless: $("chkFrameless").checked,
    remove_if_cancelled: $("chkRemoveIfCancelled").checked,
    want_video: $("chkVideo").checked,
    want_audio: $("chkAudio").checked,
    want_metadata: $("chkMeta").checked,
    want_thumbnail: $("chkThumb").checked,
    video_quality: $("videoQuality").value,
    audio_quality: $("audioQuality").value,
    output_dir: $("outputDir").value,
    bundle: $("chkBundle").checked,
    combine_streams: $("chkCombine").checked,
    organize: $("layoutOrg").checked,
    concurrency: getConcurrency(),
  };
}

function scheduleSaveSettings() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveAppSettings({ silent: true }).catch(() => {});
  }, 400);
}

async function saveAppSettings({ silent = false } = {}) {
  const s = readSettingsFromForm();
  await apiCall("save_app_settings", s);
  if (!silent) log("info", "Settings saved.");
}

function readConfig() {
  const wantVideo = $("chkVideo").checked;
  const wantAudio = $("chkAudio").checked;
  if (!wantVideo && !wantAudio && !$("chkMeta").checked && !$("chkThumb").checked) {
    throw new Error("Select at least one download item.");
  }
  return {
    url: $("url").value.trim(),
    mode: state.mode,
    want_video: wantVideo,
    want_audio: wantAudio,
    combine_streams: $("chkCombine").checked,
    want_metadata: $("chkMeta").checked,
    want_thumbnail: $("chkThumb").checked,
    video_quality: $("videoQuality").value,
    audio_quality: $("audioQuality").value,
    output_dir: $("outputDir").value,
    bundle: $("chkBundle").checked,
    organize: $("layoutOrg").checked,
    skip_existing: true,
  };
}

function activeViewMeta() {
  return state.views.find((v) => v.id === state.activeViewId) || { id: MAIN_VIEW_ID, kind: "main" };
}

function jobsForActiveView() {
  const viewId = state.activeViewId || MAIN_VIEW_ID;
  return state.allJobs.filter((j) => (j.view_id || MAIN_VIEW_ID) === viewId);
}

function queueViewLabel(view) {
  return view?.name || view?.id || "Main";
}

function closeQueueViewMenu() {
  const picker = $("queueViewPicker");
  const menu = $("queueViewMenu");
  const trigger = $("queueViewTrigger");
  if (!picker || !menu || !trigger) return;
  picker.classList.remove("open");
  menu.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
}

function openQueueViewMenu() {
  const picker = $("queueViewPicker");
  const menu = $("queueViewMenu");
  const trigger = $("queueViewTrigger");
  if (!picker || !menu || !trigger || picker.hidden) return;
  picker.classList.add("open");
  menu.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
}

function toggleQueueViewMenu() {
  const picker = $("queueViewPicker");
  if (!picker || picker.hidden) return;
  if (picker.classList.contains("open")) {
    closeQueueViewMenu();
  } else {
    openQueueViewMenu();
  }
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
    li.className = "queue-view-option";
    li.dataset.viewId = view.id;
    li.setAttribute("role", "option");
    if (view.id === activeId) {
      li.classList.add("active");
      li.setAttribute("aria-selected", "true");
    }

    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = "queue-view-option-btn";
    selectBtn.textContent = queueViewLabel(view);
    li.appendChild(selectBtn);

    if (view.kind !== "main") {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "queue-view-option-remove";
      removeBtn.setAttribute("aria-label", `Remove ${queueViewLabel(view)}`);
      removeBtn.title = "Remove this queue view";
      removeBtn.textContent = "×";
      li.appendChild(removeBtn);
    }

    menu.appendChild(li);
  });

  syncQueueViewTriggerLabel();
}

function setActiveView(viewId) {
  const nextId = viewId || MAIN_VIEW_ID;
  const exists = state.views.some((v) => v.id === nextId);
  state.activeViewId = exists ? nextId : MAIN_VIEW_ID;
  closeQueueViewMenu();
  updateQueueViewPicker();
  renderQueueList();
}

async function removeQueueView(viewId) {
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

  if (view.kind !== "main") {
    const finished = view.finished || 0;
    const total = view.total || 0;
    const pending = view.pending || 0;
    const running = view.running || 0;

    if (view.status === "preparing") {
      summary.textContent = "Fetching entries...";
      bytes.textContent = "—";
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

  if (!jobs.length && view.status !== "preparing") {
    if (view.kind !== "main" && view.total > 0 && (view.finished || 0) >= view.total) {
      bar.style.width = "100%";
      text.textContent = view.status === "cancelled" ? "Batch cancelled" : "All downloads complete";
      return;
    }
    bar.style.width = "0%";
    text.textContent = "Idle";
    return;
  }

  if (view.status === "preparing") {
    bar.style.width = "0%";
    text.textContent = "Preparing batch...";
    return;
  }

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

async function handleCancelClearView() {
  const jobs = jobsForActiveView();
  const view = activeViewMeta();
  if (viewHasActiveWork(jobs, view)) {
    await cancelActiveView();
  } else {
    await clearActiveView();
  }
}

function applyQueueState(data, revision) {
  const rev = revision ?? data?.revision;
  if (rev != null && rev < queueRevision) {
    return;
  }
  if (rev != null) {
    queueRevision = rev;
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

function renderQueueList() {
  const jobs = jobsForActiveView();
  const view = activeViewMeta();
  const list = $("queueList");
  list.innerHTML = "";

  updateCancelClearButton(jobs, view);

  if (view.status === "preparing") {
    const li = document.createElement("li");
    li.className = "queue-item queue-item--empty";
    li.textContent = "Fetching playlist or channel entries...";
    list.appendChild(li);
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

    head.append(headLeft, closeBtn);

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

function setProgress(data) {
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

window.dispatchBackend = function (payload) {
  const { event, data } = payload;
  if (event === "log") log(data.level, data.message);
  if (event === "progress") setProgress(data);
  if (event === "queue") applyQueueState(data);
  if (event === "job_status") log("info", `Job ${data.id}: ${data.status}`);
};

async function apiCall(method, ...args) {
  if (!window.pywebview || !window.pywebview.api) {
    throw new Error("Backend not ready yet.");
  }
  return await window.pywebview.api[method](...args);
}

const TIP_DELAY_MS = 650;
let tipTimer = null;
let tipEl = null;
let tipAnchor = null;

function ensureTipEl() {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "hover-tip";
    tipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function hideTip() {
  if (tipTimer) {
    clearTimeout(tipTimer);
    tipTimer = null;
  }
  tipAnchor = null;
  tipEl?.classList.remove("visible");
}

function positionTip(anchor) {
  const tip = ensureTipEl();
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  tip.style.left = "0";
  tip.style.top = "0";
  tip.classList.add("visible");

  const tipRect = tip.getBoundingClientRect();
  let left = rect.left;
  let top = rect.top - margin - tipRect.height;

  if (top < margin) {
    top = rect.bottom + margin;
  }
  if (left + tipRect.width > window.innerWidth - margin) {
    left = window.innerWidth - margin - tipRect.width;
  }
  if (left < margin) left = margin;

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function bindHoverTips() {
  document.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("mouseenter", () => {
      const text = el.getAttribute("data-tip");
      if (!text) return;
      hideTip();
      tipAnchor = el;
      tipTimer = setTimeout(() => {
        if (tipAnchor !== el) return;
        const tip = ensureTipEl();
        tip.textContent = text;
        positionTip(el);
      }, TIP_DELAY_MS);
    });
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("mousedown", hideTip);
  });
}

const DOWNLOAD_SETTING_IDS = [
  "chkVideo",
  "chkAudio",
  "chkMeta",
  "chkThumb",
  "videoQuality",
  "audioQuality",
  "chkBundle",
  "chkCombine",
  "layoutRaw",
  "layoutOrg",
];

function bindDownloadSettingsAutosave() {
  DOWNLOAD_SETTING_IDS.forEach((id) => {
    const el = $(id);
    if (!el) return;
    const evt = el.type === "checkbox" || el.type === "radio" ? "change" : "input";
    el.addEventListener(evt, scheduleSaveSettings);
  });
  $("outputDir").addEventListener("change", scheduleSaveSettings);
}

async function init() {
  document.querySelectorAll(".page-tab").forEach((btn) => {
    btn.addEventListener("click", () => setPage(btn.dataset.page));
  });

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  bindDownloadSettingsAutosave();
  bindHoverTips();

  $("winMin")?.addEventListener("click", () => apiCall("minimize_window"));
  $("winMax")?.addEventListener("click", () => apiCall("toggle_maximize_window"));
  $("winClose")?.addEventListener("click", () => apiCall("close_window"));

  window.addEventListener("pywebviewready", async () => {
    try {
      const defaults = await apiCall("get_defaults");
      state.outputDir = defaults.output_dir;
      $("outputDir").value = defaults.output_dir;
      fillSelect($("videoQuality"), defaults.video_qualities);
      fillSelect($("audioQuality"), defaults.audio_qualities);
      fillSelect($("cookieBrowser"), defaults.browser_options);
      $("cookieBrowser").value = defaults.cookies_browser || "firefox";
      $("chkBrowserCookies").checked = defaults.use_browser_cookies !== false;
      $("cookieBrowser").disabled = !$("chkBrowserCookies").checked;
      $("cookiesFile").value = defaults.cookies_file || "";
      $("chkFrameless").checked = defaults.frameless !== false;
      $("chkRemoveIfCancelled").checked = defaults.remove_if_cancelled !== false;
      applyFramelessUi(defaults.frameless !== false);
      applyDownloadDefaults(defaults);
      await refreshExtrasStatus().catch(() => {});
      queueRevision = 0;
      state.views = [{ id: MAIN_VIEW_ID, name: "Main", kind: "main" }];
      state.activeViewId = MAIN_VIEW_ID;
      applyQueueState({ jobs: [], views: state.views, active_view: MAIN_VIEW_ID, revision: 0 });
      log("info", `Ready. Output: ${defaults.output_dir}`);
    } catch (err) {
      log("error", err.message);
    }
  });

  $("saveSettingsBtn").addEventListener("click", async () => {
    try {
      await saveAppSettings();
    } catch (err) {
      log("error", err.message);
    }
  });

  $("restartBtn").addEventListener("click", async () => {
    try {
      await saveAppSettings({ silent: true });
      log("info", "Restarting program...");
      await apiCall("restart_program");
    } catch (err) {
      log("error", err.message);
    }
  });

  $("installDenoBtn")?.addEventListener("click", async () => {
    const btn = $("installDenoBtn");
    if (!btn || btn.disabled || !$("denoSourceLocal").checked) return;
    try {
      btn.disabled = true;
      btn.textContent = "Installing...";
      log("info", "Downloading Deno...");
      const result = await apiCall("install_deno");
      log(result.ok ? "info" : "error", result.message || "Deno install finished.");
      if (!result.ok) {
        await refreshExtrasStatus();
      }
    } catch (err) {
      log("error", err.message);
      await refreshExtrasStatus();
    }
  });

  $("installFfmpegBtn")?.addEventListener("click", async () => {
    const btn = $("installFfmpegBtn");
    if (!btn || btn.disabled || !$("ffmpegSourceLocal").checked) return;
    try {
      btn.disabled = true;
      btn.textContent = "Installing...";
      log("info", "Downloading ffmpeg...");
      const result = await apiCall("install_ffmpeg");
      log(result.ok ? "info" : "error", result.message || "ffmpeg install finished.");
      if (!result.ok) {
        await refreshExtrasStatus();
      }
    } catch (err) {
      log("error", err.message);
      await refreshExtrasStatus();
    }
  });

  $("denoSourceLocal")?.addEventListener("change", async () => {
    try {
      await saveExtrasSettings({ silent: true });
    } catch (err) {
      log("error", err.message);
    }
  });

  $("ffmpegSourceLocal")?.addEventListener("change", async () => {
    try {
      await saveExtrasSettings({ silent: true });
    } catch (err) {
      log("error", err.message);
    }
  });

  $("signInBtn").addEventListener("click", async () => {
    try {
      const result = await apiCall("open_youtube_signin");
      log(result.ok ? "info" : "error", result.message);
    } catch (err) {
      log("error", err.message);
    }
  });

  $("browseCookiesBtn").addEventListener("click", async () => {
    try {
      const path = await apiCall("browse_cookies_file");
      $("cookiesFile").value = path || "";
      if (path) $("chkBrowserCookies").checked = false;
      scheduleSaveSettings();
    } catch (err) {
      log("error", err.message);
    }
  });

  $("chkBrowserCookies").addEventListener("change", () => {
    $("cookieBrowser").disabled = !$("chkBrowserCookies").checked;
    if ($("chkBrowserCookies").checked) $("cookiesFile").value = "";
    scheduleSaveSettings();
  });

  $("cookieBrowser").addEventListener("change", scheduleSaveSettings);
  $("chkFrameless").addEventListener("change", scheduleSaveSettings);
  $("chkRemoveIfCancelled").addEventListener("change", scheduleSaveSettings);

  $("browseBtn").addEventListener("click", async () => {
    try {
      const path = await apiCall("browse_output_dir");
      $("outputDir").value = path;
      state.outputDir = path;
    } catch (err) {
      log("error", err.message);
    }
  });

  $("concurrencySlider").addEventListener("input", () => {
    setConcurrency($("concurrencySlider").value);
  });

  $("concurrencyInput").addEventListener("input", () => {
    setConcurrency($("concurrencyInput").value);
  });

  $("concurrencyInput").addEventListener("blur", () => {
    setConcurrency($("concurrencyInput").value);
  });

  $("cancelViewBtn").addEventListener("click", () => {
    handleCancelClearView();
  });

  $("queueViewTrigger")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleQueueViewMenu();
  });

  $("queueViewMenu")?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".queue-view-option-remove");
    if (removeBtn) {
      e.stopPropagation();
      const option = removeBtn.closest(".queue-view-option");
      const viewId = option?.dataset.viewId;
      if (viewId) removeQueueView(viewId);
      return;
    }
    const selectBtn = e.target.closest(".queue-view-option-btn");
    if (!selectBtn) return;
    const option = selectBtn.closest(".queue-view-option");
    const viewId = option?.dataset.viewId;
    if (viewId) setActiveView(viewId);
  });

  document.addEventListener("click", (e) => {
    const picker = $("queueViewPicker");
    if (!picker || picker.hidden || !picker.classList.contains("open")) return;
    if (!picker.contains(e.target)) {
      closeQueueViewMenu();
    }
  });

  $("downloadBtn").addEventListener("click", async () => {
    try {
      const config = readConfig();
      if (!config.url) throw new Error("Enter a YouTube URL.");
      config.concurrency = getConcurrency();
      await saveAppSettings({ silent: true });
      const res = await apiCall("enqueue_download", config);
      applyQueueState(res);
      const isBatch = config.mode === "playlist" || config.mode === "channel";
      if (isBatch && res.active_view) {
        setActiveView(res.active_view);
      } else {
        setActiveView(MAIN_VIEW_ID);
      }
      log("info", `Download queued (${res.job_id})`);
      $("url").value = "";
      setPage("download");
    } catch (err) {
      log("error", err.message);
    }
  });

  $("clearLogBtn").addEventListener("click", () => {
    $("console").innerHTML = "";
  });

  $("copyLogBtn").addEventListener("click", () => {
    copyConsoleToClipboard();
  });
}

init();
