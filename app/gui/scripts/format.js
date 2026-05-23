import { $ } from "./dom.js";
import { refreshNumberInputFor } from "./number-input.js";
import { paintConcurrencySlider } from "./concurrency-slider.js?v=1";

export function sanitizeLogText(text) {
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

export function formatBytes(bytes) {
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

export function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return "";
  return `${formatBytes(bytesPerSec)}/s`;
}

export function clampConcurrency(value) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return 8;
  return Math.max(1, Math.min(100, n));
}

function updateConcurrencySliderFill(slider, value) {
  paintConcurrencySlider(slider, value);
}

export function setConcurrency(value) {
  const v = clampConcurrency(value);
  const slider = $("concurrencySlider");
  slider.value = v;
  updateConcurrencySliderFill(slider, v);
  const input = $("concurrencyInput");
  input.value = v;
  refreshNumberInputFor(input);
}

export function getConcurrency() {
  return clampConcurrency($("concurrencyInput").value || $("concurrencySlider").value);
}

export function truncateUrl(url, max = 48) {
  if (!url) return "";
  return url.length > max ? `${url.slice(0, max)}…` : url;
}

export function truncateTitle(title, max = 20) {
  if (!title) return "";
  return title.length > max ? `${title.slice(0, max)}…` : title;
}

export function formatElapsed(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins > 0) {
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  }
  return `${secs}s`;
}
