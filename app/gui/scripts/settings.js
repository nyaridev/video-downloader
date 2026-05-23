import { apiCall } from "./api.js";
import { $ } from "./dom.js";
import { getConcurrency, setConcurrency } from "./format.js";
import { log } from "./logger.js";
import { DOWNLOAD_SETTING_IDS, state } from "./state.js";

let saveTimer = null;

export function applyDownloadDefaults(defaults) {
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

export function readSettingsFromForm() {
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

export function scheduleSaveSettings() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveAppSettings({ silent: true }).catch(() => {});
  }, 400);
}

export async function saveAppSettings({ silent = false } = {}) {
  const s = readSettingsFromForm();
  await apiCall("save_app_settings", s);
  if (!silent) log("info", "Settings saved.");
}

export function readConfig() {
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

export function bindDownloadSettingsAutosave() {
  DOWNLOAD_SETTING_IDS.forEach((id) => {
    const el = $(id);
    if (!el) return;
    const evt = el.type === "checkbox" || el.type === "radio" ? "change" : "input";
    el.addEventListener(evt, scheduleSaveSettings);
  });
  $("outputDir").addEventListener("change", scheduleSaveSettings);
}
