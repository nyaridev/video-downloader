import { apiCall } from "./api.js";
import { $ } from "./dom.js";
import { getConcurrency, setConcurrency } from "./format.js";
import { log } from "./logger.js";
import { DOWNLOAD_SETTING_IDS, state } from "./state.js";

let saveTimer = null;

function readSaveLayout() {
  const selected = document.querySelector('input[name="layout"]:checked');
  return selected?.value || "flat";
}

export function applySettingsDefaults(defaults) {
  $("chkFrameless").checked = defaults.frameless !== false;
  $("chkRemoveIfCancelled").checked = defaults.remove_if_cancelled !== false;
  $("bundleFolderTemplate").value = defaults.bundle_folder_template || "{title}_{id}";
  $("fileNameTemplate").value = defaults.file_name_template || "{title}";
  $("playlistFolder").value = defaults.playlist_folder || "Playlists";
  $("playlistNameTemplate").value = defaults.playlist_name_template || "{playlist}_{id}";
  $("channelFolder").value = defaults.channel_folder || "Channel";
  $("channelNameTemplate").value = defaults.channel_name_template || "{channel}_{id}";
}

export function applyDownloadDefaults(defaults) {
  $("chkVideo").checked = defaults.want_video !== false;
  $("chkAudio").checked = defaults.want_audio !== false;
  $("chkMeta").checked = defaults.want_metadata !== false;
  $("chkThumb").checked = defaults.want_thumbnail !== false;
  $("videoQuality").value = defaults.video_quality || "Best";
  $("audioQuality").value = defaults.audio_quality || "Best";
  $("chkBundle").checked = defaults.bundle !== false;
  $("chkGroupPlaylistChannel").checked = defaults.group_playlist_channel !== false;
  $("chkCombine").checked = defaults.combine_streams !== false;
  const layout = defaults.save_layout || (defaults.organize ? "organized" : "flat");
  const layoutInput = $(`layout${layout === "organized" ? "Org" : layout === "intelligent" ? "Intelligent" : "Raw"}`);
  if (layoutInput) layoutInput.checked = true;
  setConcurrency(defaults.concurrency ?? 8);
}

export function readSettingsFromForm() {
  return {
    use_browser_cookies: $("chkBrowserCookies").checked,
    cookies_browser: $("cookieBrowser").value,
    cookies_file: $("cookiesFile").value,
    frameless: $("chkFrameless").checked,
    remove_if_cancelled: $("chkRemoveIfCancelled").checked,
    bundle_folder_template: $("bundleFolderTemplate").value.trim(),
    file_name_template: $("fileNameTemplate").value.trim(),
    playlist_folder: $("playlistFolder").value.trim(),
    playlist_name_template: $("playlistNameTemplate").value.trim(),
    channel_folder: $("channelFolder").value.trim(),
    channel_name_template: $("channelNameTemplate").value.trim(),
    want_video: $("chkVideo").checked,
    want_audio: $("chkAudio").checked,
    want_metadata: $("chkMeta").checked,
    want_thumbnail: $("chkThumb").checked,
    video_quality: $("videoQuality").value,
    audio_quality: $("audioQuality").value,
    output_dir: $("outputDir").value,
    bundle: $("chkBundle").checked,
    group_playlist_channel: $("chkGroupPlaylistChannel").checked,
    combine_streams: $("chkCombine").checked,
    save_layout: readSaveLayout(),
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
    group_playlist_channel: $("chkGroupPlaylistChannel").checked,
    save_layout: readSaveLayout(),
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
