import { apiCall } from "./api.js";
import { $ } from "./dom.js";
import { log } from "./logger.js";

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

export function applyExtrasStatus(status) {
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

export async function saveExtrasSettings({ silent = false } = {}) {
  const saved = await apiCall("save_extras_settings", readExtrasSettingsFromForm());
  applyExtrasStatus(saved);
  if (!silent) log("info", "Extras settings saved.");
}

export async function refreshExtrasStatus() {
  const status = await apiCall("get_extras_status");
  applyExtrasStatus(status);
  return status;
}
