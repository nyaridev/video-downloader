import { $ } from "./dom.js";
import { sanitizeLogText } from "./format.js";

export function log(level, message) {
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

export async function copyConsoleToClipboard() {
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
