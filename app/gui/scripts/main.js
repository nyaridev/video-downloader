import { apiCall } from "./api.js";
import { $, fillSelect } from "./dom.js";
import { refreshExtrasStatus, saveExtrasSettings } from "./extras.js";
import { bindConcurrencySliderVisual } from "./concurrency-slider.js?v=1";
import { getConcurrency, setConcurrency } from "./format.js";
import { copyConsoleToClipboard, log } from "./logger.js";
import {
  applyQueueState,
  closeQueueViewMenu,
  handleCancelClearView,
  handleRetryAllFailed,
  removeQueueView,
  renderQueueList,
  setActiveView,
  setProgress,
  syncQueueLocalization,
  toggleQueueViewMenu,
} from "./queue.js";
import {
  applyDownloadDefaults,
  applySettingsDefaults,
  bindDownloadSettingsAutosave,
  readConfig,
  saveAppSettings,
  scheduleSaveSettings,
  syncCookiesFileMode,
  syncBrowserCookiesControls,
} from "./settings.js";
import { MAIN_VIEW_ID, state } from "./state.js";
import { applyTheme, applyThemeMode, bindThemeModeListener } from "./theme.js";
import { qualityLabel, setLanguage, t } from "./i18n.js";
import { initCustomSelects, syncCustomSelect } from "./custom-select.js";
import { initNumberInputs } from "./number-input.js";
import { bindAppFocusDim } from "./app-focus-dim.js";
import { applyFramelessUi, bindHoverTips, setMode, setPage } from "./ui.js";

window.dispatchBackend = function (payload) {
  const { event, data } = payload;
  if (event === "log") log(data.level, data.message);
  if (event === "progress") setProgress(data);
  if (event === "queue") applyQueueState(data);
  if (event === "job_status") log("info", t("log.jobStatus", { id: data.id, status: data.status }));
};

function init() {
  document.querySelectorAll(".page-tab").forEach((btn) => {
    btn.addEventListener("click", () => setPage(btn.dataset.page));
  });

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  bindDownloadSettingsAutosave();
  bindAppFocusDim();
  bindHoverTips();
  initNumberInputs();
  initCustomSelects();

  $("winMin")?.addEventListener("click", () => apiCall("minimize_window"));
  $("winMax")?.addEventListener("click", () => apiCall("toggle_maximize_window"));
  $("winClose")?.addEventListener("click", () => apiCall("close_window"));

  window.addEventListener("pywebviewready", async () => {
    try {
      const defaults = await apiCall("get_defaults");
      state.outputDir = defaults.output_dir;
      $("outputDir").value = defaults.output_dir;
      fillSelect($("videoQuality"), defaults.video_qualities, { labelFn: qualityLabel });
      fillSelect($("audioQuality"), defaults.audio_qualities, { labelFn: qualityLabel });
      fillSelect($("cookieBrowser"), defaults.browser_options);
      $("cookieBrowser").value = defaults.cookies_browser || "firefox";
      $("chkBrowserCookies").checked = defaults.use_browser_cookies !== false;
      $("cookiesFile").value = defaults.cookies_file || "";
      syncBrowserCookiesControls();
      syncCustomSelect($("cookieBrowser"));
      applySettingsDefaults(defaults);
      applyFramelessUi(defaults.frameless !== false);
      applyDownloadDefaults(defaults);
      await refreshExtrasStatus().catch(() => {});
      state.queueRevision = 0;
      state.views = [{ id: MAIN_VIEW_ID, name: t("queue.main"), kind: "main" }];
      state.activeViewId = MAIN_VIEW_ID;
      applyQueueState({ jobs: [], views: state.views, active_view: MAIN_VIEW_ID, revision: 0 });
      log("info", t("log.readyOutput", { path: defaults.output_dir }));
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
      log("info", t("log.restarting"));
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
      btn.textContent = t("extras.installing");
      log("info", t("log.installingDeno"));
      const result = await apiCall("install_deno");
      log(result.ok ? "info" : "error", result.message || t("log.denoFinished"));
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
      btn.textContent = t("extras.installing");
      log("info", t("log.installingFfmpeg"));
      const result = await apiCall("install_ffmpeg");
      log(result.ok ? "info" : "error", result.message || t("log.ffmpegFinished"));
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
    if (!$("chkBrowserCookies").checked || $("signInBtn").disabled) return;
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
      $("cookiesFile").value = path ? normalizeOutputPath(path) : "";
      syncCookiesFileMode($("cookiesFile").value);
      scheduleSaveSettings();
    } catch (err) {
      log("error", err.message);
    }
  });

  $("chkBrowserCookies").addEventListener("change", () => {
    if ($("chkBrowserCookies").checked) $("cookiesFile").value = "";
    syncBrowserCookiesControls();
    scheduleSaveSettings();
  });

  $("cookieBrowser").addEventListener("change", scheduleSaveSettings);
  bindThemeModeListener();
  $("themeSelect").addEventListener("change", () => {
    applyTheme($("themeSelect").value);
    scheduleSaveSettings();
  });
  $("themeModeSelect")?.addEventListener("change", () => {
    applyThemeMode($("themeModeSelect").value, $("themeSelect").value, { animate: true });
    scheduleSaveSettings();
  });
  $("languageSelect")?.addEventListener("change", () => {
    setLanguage($("languageSelect").value);
    scheduleSaveSettings();
  });
  $("chkFrameless").addEventListener("change", scheduleSaveSettings);
  $("chkRemoveIfCancelled").addEventListener("change", scheduleSaveSettings);
  $("bundleFolderTemplate").addEventListener("input", scheduleSaveSettings);
  $("fileNameTemplate").addEventListener("input", scheduleSaveSettings);
  $("playlistFolder").addEventListener("input", scheduleSaveSettings);
  $("playlistNameTemplate").addEventListener("input", scheduleSaveSettings);
  $("channelFolder").addEventListener("input", scheduleSaveSettings);
  $("channelNameTemplate").addEventListener("input", scheduleSaveSettings);

  $("browseBtn").addEventListener("click", async () => {
    try {
      const path = await apiCall("browse_output_dir");
      $("outputDir").value = path;
      state.outputDir = path;
      scheduleSaveSettings();
    } catch (err) {
      log("error", err.message);
    }
  });

  bindConcurrencySliderVisual();
  syncBrowserCookiesControls();

  $("concurrencySlider").addEventListener("input", (e) => {
    setConcurrency(e.target.value);
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

  $("retryAllBtn")?.addEventListener("click", () => {
    handleRetryAllFailed();
  });

  $("queueViewTrigger")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleQueueViewMenu();
  });

  $("queueViewMenu")?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".custom-select-option-remove");
    if (removeBtn) {
      e.stopPropagation();
      const option = removeBtn.closest(".custom-select-option");
      const viewId = option?.dataset.viewId;
      if (viewId) removeQueueView(viewId);
      return;
    }
    const selectBtn = e.target.closest(".custom-select-option-btn");
    if (!selectBtn) return;
    const option = selectBtn.closest(".custom-select-option");
    const viewId = option?.dataset.viewId;
    if (viewId) setActiveView(viewId);
  });

  $("downloadBtn").addEventListener("click", async () => {
    try {
      const config = readConfig();
      if (!config.url) throw new Error(t("log.enterUrl"));
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
      log("info", t("log.downloadQueued", { id: res.job_id }));
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

  window.addEventListener("languagechange", () => {
    syncQueueLocalization();
    renderQueueList();
    refreshExtrasStatus().catch(() => {});
  });
}

init();
