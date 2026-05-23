let state = {
  mode: "video",
  outputDir: "",
  frameless: true,
};

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

function readSettingsFromForm() {
  return {
    use_browser_cookies: $("chkBrowserCookies").checked,
    cookies_browser: $("cookieBrowser").value,
    cookies_file: $("cookiesFile").value,
    frameless: $("chkFrameless").checked,
  };
}

async function saveAppSettings() {
  const s = readSettingsFromForm();
  await apiCall(
    "save_app_settings",
    s.use_browser_cookies,
    s.cookies_browser,
    s.cookies_file,
    s.frameless
  );
  log("info", "Settings saved.");
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

function renderQueue(jobs) {
  const list = $("queueList");
  list.innerHTML = "";
  if (!jobs || !jobs.length) {
    const li = document.createElement("li");
    li.textContent = "Queue is empty";
    list.appendChild(li);
    return;
  }
  [...jobs].reverse().forEach((job) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${job.mode}</strong> — ${job.url}<br><span class="status">${job.status}</span>`;
    list.appendChild(li);
  });
}

function setProgress(data) {
  const bar = $("progressBar");
  const text = $("progressText");
  if (!data || data.status === "finished") {
    if (data && data.status === "finished") {
      bar.style.width = "100%";
      text.textContent = "Finished current file";
    }
    return;
  }
  const total = data.total_bytes || 0;
  const done = data.downloaded_bytes || 0;
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  bar.style.width = `${pct}%`;
  const speed = data.speed ? `${(data.speed / 1024 / 1024).toFixed(2)} MB/s` : "";
  const eta = data.eta != null ? `ETA ${data.eta}s` : "";
  const pctLabel = sanitizeLogText(data._percent_str || "");
  text.textContent = [pctLabel, speed, eta].filter(Boolean).join(" · ") || "Downloading...";
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

async function init() {
  document.querySelectorAll(".page-tab").forEach((btn) => {
    btn.addEventListener("click", () => setPage(btn.dataset.page));
  });

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

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
      await saveAppSettings();
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
    } catch (err) {
      log("error", err.message);
    }
  });

  $("chkBrowserCookies").addEventListener("change", () => {
    $("cookieBrowser").disabled = !$("chkBrowserCookies").checked;
    if ($("chkBrowserCookies").checked) $("cookiesFile").value = "";
  });

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
