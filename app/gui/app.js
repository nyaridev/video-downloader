let state = {
  mode: "video",
  outputDir: "",
  frameless: true,
  jobs: [],
};

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

function truncateUrl(url, max = 48) {
  if (!url) return "";
  return url.length > max ? `${url.slice(0, max)}…` : url;
}

function queuePhase(job) {
  const p = job.progress || {};
  if (job.status === "running" && p.status === "combining") return "combining";
  return job.status;
}

function statusClass(status) {
  if (status === "combining") return "queue-item--combining";
  if (status === "running") return "queue-item--running";
  if (status === "done") return "queue-item--done";
  if (status === "error") return "queue-item--error";
  return "queue-item--queued";
}

function statusLabel(status) {
  const labels = {
    queued: "Queued",
    running: "Downloading",
    combining: "Combining",
    done: "Complete",
    error: "Error",
  };
  return labels[status] || status;
}

const ITEM_LABELS = {
  video: "Video",
  audio: "Audio",
  metadata: "Metadata",
  thumbnail: "Thumbnail",
  combining: "Combining",
};

function buildItemTags(job, activeItem) {
  const tags = document.createElement("div");
  tags.className = "queue-item-tags";
  const items = job.items || [];
  if (!items.length && activeItem !== "combining") {
    return tags;
  }
  items.forEach((key) => {
    const span = document.createElement("span");
    span.className = "item-tag";
    if (activeItem === key) span.classList.add("item-tag--active");
    if (job.status === "done") span.classList.add("item-tag--done");
    span.textContent = ITEM_LABELS[key] || key;
    tags.appendChild(span);
  });
  if (activeItem === "combining") {
    const span = document.createElement("span");
    span.className = "item-tag item-tag--active";
    span.textContent = ITEM_LABELS.combining;
    tags.appendChild(span);
  }
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
  $("chkAsync").checked = !!defaults.async_download;
  $("batchCount").value = defaults.batch_count ?? 8;
  $("batchCount").disabled = !$("chkAsync").checked;
}

function readSettingsFromForm() {
  return {
    use_browser_cookies: $("chkBrowserCookies").checked,
    cookies_browser: $("cookieBrowser").value,
    cookies_file: $("cookiesFile").value,
    frameless: $("chkFrameless").checked,
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
    async_download: $("chkAsync").checked,
    batch_count: parseInt($("batchCount").value, 10) || 8,
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

function aggregateQueueStats(jobs) {
  const totalJobs = jobs.length;
  const doneJobs = jobs.filter((j) => j.status === "done").length;
  const runningJobs = jobs.filter(
    (j) => j.status === "running" && (j.progress || {}).status !== "combining"
  ).length;
  const combiningJobs = jobs.filter(
    (j) => j.status === "running" && (j.progress || {}).status === "combining"
  ).length;
  const errorJobs = jobs.filter((j) => j.status === "error").length;

  let downloaded = 0;
  let total = 0;
  jobs.forEach((job) => {
    const p = job.progress || {};
    downloaded += p.downloaded_bytes || 0;
    total += p.total_bytes || 0;
  });

  const pct = total > 0 ? Math.min(100, (downloaded / total) * 100) : 0;
  const finishedCount = doneJobs + errorJobs;

  return {
    totalJobs,
    doneJobs,
    runningJobs,
    combiningJobs,
    errorJobs,
    finishedCount,
    downloaded,
    total,
    pct,
  };
}

function updateQueueSummary(jobs) {
  const stats = aggregateQueueStats(jobs);
  const summary = $("queueSummary");
  const bytes = $("queueBytes");

  if (!jobs.length) {
    summary.textContent = "0 / 0 files";
    bytes.textContent = "—";
    return;
  }

  summary.textContent = `${stats.finishedCount} / ${stats.totalJobs} files`;
  if (stats.runningJobs > 0) {
    summary.textContent += ` · ${stats.runningJobs} downloading`;
  }
  if (stats.combiningJobs > 0) {
    summary.textContent += ` · ${stats.combiningJobs} combining`;
  }

  if (stats.total > 0) {
    bytes.textContent = `${formatBytes(stats.downloaded)} / ${formatBytes(stats.total)}`;
  } else if (stats.combiningJobs > 0) {
    bytes.textContent = "Combining streams";
  } else if (stats.runningJobs > 0) {
    bytes.textContent = `${formatBytes(stats.downloaded)} downloaded`;
  } else {
    bytes.textContent = stats.doneJobs ? "All transfers finished" : "Waiting to start";
  }
}

function setOverallProgress(jobs, currentProgress) {
  const bar = $("overallProgressBar");
  const text = $("overallProgressText");
  const stats = aggregateQueueStats(jobs);

  let pct = stats.pct;
  const anyCombining = jobs.some(
    (j) => j.status === "running" && (j.progress || {}).status === "combining"
  );
  if (anyCombining && !currentProgress?.downloaded_bytes) {
    text.textContent = "Combining streams...";
    return;
  }

  if (currentProgress && currentProgress.status === "downloading") {
    const curTotal = currentProgress.total_bytes || 0;
    const curDone = currentProgress.downloaded_bytes || 0;
    if (curTotal > 0 && stats.total <= 0) {
      pct = Math.min(100, (curDone / curTotal) * 100);
    }
  }

  if (!jobs.length) {
    bar.style.width = "0%";
    text.textContent = "Idle";
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

  const speed =
    currentProgress && currentProgress.speed
      ? `${(currentProgress.speed / 1024 / 1024).toFixed(2)} MB/s`
      : "";
  const eta =
    currentProgress && currentProgress.eta != null ? `ETA ${currentProgress.eta}s` : "";
  const pctLabel = currentProgress
    ? sanitizeLogText(currentProgress._percent_str || "")
    : "";
  const parts = [
    pct > 0 ? `${pct.toFixed(1)}% overall` : null,
    pctLabel,
    speed,
    eta,
  ].filter(Boolean);
  text.textContent = parts.join(" · ") || "Downloading...";
}

function renderQueue(jobs) {
  state.jobs = jobs || [];
  const list = $("queueList");
  list.innerHTML = "";

  if (!state.jobs.length) {
    const li = document.createElement("li");
    li.className = "queue-item queue-item--empty";
    li.textContent = "Queue is empty";
    list.appendChild(li);
    updateQueueSummary([]);
    setOverallProgress([]);
    return;
  }

  [...state.jobs].reverse().forEach((job) => {
    const phase = queuePhase(job);
    const li = document.createElement("li");
    li.className = `queue-item ${statusClass(phase)}`;
    li.dataset.jobId = job.id;

    const head = document.createElement("div");
    head.className = "queue-item-head";
    head.innerHTML = `<strong>${job.mode || "video"}</strong><span class="queue-status-badge">${statusLabel(phase)}</span>`;

    const url = document.createElement("div");
    url.className = "queue-item-url";
    url.textContent = truncateUrl(job.url);
    url.title = job.url;

    const p = job.progress || {};
    const activeItem = p.item || (phase === "combining" ? "combining" : null);
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
        : phase === "combining"
          ? 100
          : p.percent != null
            ? Math.min(100, p.percent)
            : 0;
    progressBar.style.width = `${itemPct}%`;
    progressWrap.appendChild(progressBar);

    const meta = document.createElement("div");
    meta.className = "queue-item-meta";
    if (phase === "combining") {
      meta.textContent = "Merging video and audio";
    } else if (job.status === "running" && (p.total_bytes || p.downloaded_bytes)) {
      meta.textContent = `${formatBytes(p.downloaded_bytes || 0)} / ${formatBytes(p.total_bytes || 0)}`;
    } else if (job.title) {
      meta.textContent = job.title;
    } else {
      meta.textContent = statusLabel(phase);
    }

    const parts = [head, url, tags];
    if (fileLine.textContent) parts.push(fileLine);
    parts.push(progressWrap, meta);
    li.append(...parts);
    list.appendChild(li);
  });

  updateQueueSummary(state.jobs);
  setOverallProgress(state.jobs);
}

function setProgress(data) {
  if (!data) return;

  if (data.job_id && state.jobs.length) {
    const job = state.jobs.find((j) => j.id === data.job_id);
    if (job) {
      const prev = job.progress || {};
      if (data.status === "combining") {
        job.progress = {
          ...prev,
          status: "combining",
          item: data.item || "combining",
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
          speed: data.speed,
          eta: data.eta,
          label: data._percent_str || "",
        };
        if (data.status === "finished") {
          job.progress.percent = 100;
        }
      }
    }
    renderQueue(state.jobs);
  }

  setOverallProgress(state.jobs, data);
}

window.dispatchBackend = function (payload) {
  const { event, data } = payload;
  if (event === "log") log(data.level, data.message);
  if (event === "progress") setProgress(data);
  if (event === "queue") renderQueue(data.jobs);
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
  "chkAsync",
  "batchCount",
];

function bindDownloadSettingsAutosave() {
  DOWNLOAD_SETTING_IDS.forEach((id) => {
    const el = $(id);
    if (!el) return;
    const evt = el.type === "checkbox" || el.type === "radio" ? "change" : "input";
    el.addEventListener(evt, () => {
      if (id === "chkAsync") {
        $("batchCount").disabled = !$("chkAsync").checked;
      }
      scheduleSaveSettings();
    });
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
      applyFramelessUi(defaults.frameless !== false);
      applyDownloadDefaults(defaults);
      renderQueue([]);
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

  $("browseBtn").addEventListener("click", async () => {
    try {
      const path = await apiCall("browse_output_dir");
      $("outputDir").value = path;
      state.outputDir = path;
    } catch (err) {
      log("error", err.message);
    }
  });

  $("downloadBtn").addEventListener("click", async () => {
    try {
      const config = readConfig();
      if (!config.url) throw new Error("Enter a YouTube URL.");
      await saveAppSettings({ silent: true });
      const res = await apiCall("enqueue_download", config);
      renderQueue(res.queue);
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
