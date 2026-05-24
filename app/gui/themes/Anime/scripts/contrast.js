const LUMA_DARK = 0.22;
const LUMA_LIGHT = 0.58;
/** Raw mix at/above this flips snap vars (text) to the light-wallpaper palette. Lower = switch sooner. */
const SNAP_MIX_THRESHOLD = 0.32;
const SAMPLE_SIZE = 40;
const TRANSITION_MS = 3200;

/** @type {Record<string, [string, string]>} dark → light */
const CONTRAST_VARS = {
  "--text": ["#f5f0ff", "#0c0614"],
  "--muted": ["#c8bfe0", "#2a2038"],
  "--input-placeholder": ["rgba(255, 255, 255, 0.48)", "rgba(12, 6, 20, 0.58)"],
  "--on-accent": ["#ffffff", "#ffffff"],
  "--anime-btn-text": ["#ffffff", "#0c0614"],
  "--anime-btn-text-muted": ["rgba(255, 255, 255, 0.78)", "rgba(12, 6, 20, 0.72)"],
  "--accent": ["#ff4da6", "#ff2d95"],
  "--accent-hover": ["#ff6bb8", "#ff4da6"],
  "--download": ["#00c8ff", "#00b4eb"],
  "--download-hover": ["#5ee0ff", "#0099cc"],
  "--error": ["#fb7185", "#e11d48"],
  "--error-border-hover": ["#fda4af", "#be123c"],
  "--error-soft-bg": ["rgba(251, 113, 133, 0.18)", "rgba(225, 29, 72, 0.14)"],
  "--error-soft-bg-hover": ["rgba(251, 113, 133, 0.28)", "rgba(225, 29, 72, 0.22)"],
  "--success": ["#4ade80", "#16a34a"],
  "--combining": ["#d946ef", "#c026d3"],
  "--border": ["rgba(255, 255, 255, 0.18)", "rgba(0, 0, 0, 0.14)"],
  "--border-hover": ["rgba(255, 255, 255, 0.3)", "rgba(0, 0, 0, 0.24)"],
  "--input-bg": ["rgba(255, 255, 255, 0.05)", "rgba(255, 255, 255, 0.46)"],
  "--mode-idle": ["rgba(255, 255, 255, 0.08)", "rgba(255, 255, 255, 0.38)"],
  "--surface-hover": ["rgba(255, 255, 255, 0.12)", "rgba(255, 255, 255, 0.52)"],
  "--tab-active-bg": ["rgba(255, 45, 146, 0.58)", "rgba(255, 45, 146, 0.84)"],
  "--tag-active-text": ["#ffe4f3", "#831843"],
  "--menu-active-bg": ["rgba(255, 77, 166, 0.32)", "rgba(255, 45, 146, 0.26)"],
  "--frame-outline": ["rgba(255, 255, 255, 0.12)", "rgba(0, 0, 0, 0.1)"],
  "--anime-glass-panel": ["rgba(255, 255, 255, 0.06)", "rgba(255, 255, 255, 0.52)"],
  "--anime-glass-panel-raised": ["rgba(255, 255, 255, 0.09)", "rgba(255, 255, 255, 0.58)"],
  "--anime-queue-glass": ["rgba(255, 255, 255, 0.05)", "rgba(255, 255, 255, 0.48)"],
  "--anime-console-glass": ["rgba(255, 255, 255, 0.05)", "rgba(255, 255, 255, 0.48)"],
  "--anime-glass-border": ["rgba(255, 255, 255, 0.2)", "rgba(0, 0, 0, 0.12)"],
  "--anime-glass-border-bright": ["rgba(255, 255, 255, 0.32)", "rgba(0, 0, 0, 0.2)"],
  "--anime-glass-highlight": [
    "inset 0 1px 0 rgba(255, 255, 255, 0.22)",
    "inset 0 1px 0 rgba(255, 255, 255, 0.72)",
  ],
  "--anime-glass-shadow": ["0 8px 32px rgba(0, 0, 0, 0.28)", "0 8px 32px rgba(0, 0, 0, 0.12)"],
  "--anime-btn-border": ["rgba(255, 255, 255, 0.22)", "rgba(255, 255, 255, 0.28)"],
  "--anime-btn-border-hover": ["rgba(255, 255, 255, 0.34)", "rgba(255, 255, 255, 0.42)"],
  "--anime-btn-glass-bg": ["rgba(255, 255, 255, 0.1)", "rgba(255, 255, 255, 0.34)"],
  "--anime-btn-glass-hover": ["rgba(255, 255, 255, 0.16)", "rgba(255, 255, 255, 0.46)"],
  "--anime-btn-primary-bg": ["rgba(255, 45, 146, 0.58)", "rgba(255, 45, 146, 0.84)"],
  "--anime-btn-primary-hover": ["rgba(255, 77, 166, 0.72)", "rgba(255, 77, 166, 0.92)"],
  "--anime-btn-primary-border": ["rgba(255, 180, 220, 0.5)", "rgba(255, 180, 220, 0.62)"],
  "--anime-btn-download-bg": ["rgba(0, 200, 255, 0.54)", "rgba(0, 200, 255, 0.82)"],
  "--anime-btn-download-hover": ["rgba(94, 224, 255, 0.68)", "rgba(94, 224, 255, 0.92)"],
  "--anime-btn-download-border": ["rgba(180, 240, 255, 0.48)", "rgba(180, 240, 255, 0.52)"],
  "--anime-btn-edge-top": ["inset 0 1px 0 rgba(255, 255, 255, 0.58)", "inset 0 1px 0 rgba(255, 255, 255, 0.82)"],
  "--anime-btn-edge-bottom": [
    "inset 0 -1px 0 rgba(255, 255, 255, 0.24)",
    "inset 0 -1px 0 rgba(255, 255, 255, 0.34)",
  ],
  "--input-focus-ring": ["#ff4da6", "#ff2d95"],
  "--selection-bg": ["rgba(255, 77, 166, 0.42)", "rgba(255, 45, 146, 0.36)"],
  "--selection-color": ["#f5f0ff", "#0c0614"],
  "--anime-btn-error-bg": ["rgba(251, 113, 133, 0.2)", "rgba(225, 29, 72, 0.18)"],
  "--anime-btn-error-border": ["rgba(251, 113, 133, 0.48)", "rgba(225, 29, 72, 0.52)"],
  "--anime-titlebar-bg": ["rgba(255, 255, 255, 0.04)", "rgba(255, 255, 255, 0.44)"],
  "--anime-surface-hover-subtle": ["rgba(255, 255, 255, 0.1)", "rgba(255, 255, 255, 0.28)"],
  "--anime-surface-hover-faint": ["rgba(255, 255, 255, 0.06)", "rgba(255, 255, 255, 0.2)"],
  "--anime-download-pin-bg": ["rgba(255, 255, 255, 0.04)", "rgba(255, 255, 255, 0.4)"],
  "--anime-progress-wrap-bg": ["rgba(255, 255, 255, 0.08)", "rgba(0, 0, 0, 0.08)"],
  "--anime-hover-tip-bg": ["rgba(18, 14, 30, 0.78)", "rgba(255, 255, 255, 0.86)"],
  "--anime-select-menu-bg": ["rgba(255, 255, 255, 0.1)", "rgba(255, 255, 255, 0.34)"],
  "--anime-select-option-bg": ["transparent", "transparent"],
  "--anime-select-option-hover-bg": ["rgba(255, 255, 255, 0.16)", "rgba(255, 255, 255, 0.46)"],
  "--anime-pill-track-outline": ["rgba(255, 255, 255, 0.14)", "rgba(0, 0, 0, 0.24)"],
  "--anime-queue-filename-color": ["#ff85c8", "#ff2d95"],
  "--anime-scrim-top": ["0.14", "0.04"],
  "--anime-scrim-bottom": ["0.42", "0.12"],
  "--anime-scrim-tint-a": ["0.06", "0.03"],
  "--anime-scrim-tint-b": ["0.04", "0.02"],
};

/** Fixed black panels + purple/cyan accents when theme mode is dark. */
const DARK_MODE_VALUES = {
  "--text": "#f5f0ff",
  "--muted": "#a8a3b8",
  "--input-placeholder": "rgba(245, 240, 255, 0.42)",
  "--on-accent": "#ffffff",
  "--anime-btn-text": "#ffffff",
  "--anime-btn-text-muted": "rgba(255, 255, 255, 0.78)",
  "--accent": "#c084fc",
  "--accent-hover": "#e9d5ff",
  "--download": "#22d3ee",
  "--download-hover": "#67e8f9",
  "--error": "#fb7185",
  "--error-border-hover": "#fda4af",
  "--error-soft-bg": "rgba(251, 113, 133, 0.16)",
  "--error-soft-bg-hover": "rgba(251, 113, 133, 0.24)",
  "--success": "#4ade80",
  "--combining": "#e879f9",
  "--border": "rgba(255, 255, 255, 0.1)",
  "--border-hover": "rgba(255, 255, 255, 0.18)",
  "--input-bg": "rgba(0, 0, 0, 0.38)",
  "--mode-idle": "rgba(255, 255, 255, 0.07)",
  "--surface-hover": "rgba(255, 255, 255, 0.11)",
  "--tab-active-bg": "rgba(192, 132, 252, 0.42)",
  "--tag-active-text": "#f5f0ff",
  "--menu-active-bg": "rgba(192, 132, 252, 0.22)",
  "--frame-outline": "rgba(255, 255, 255, 0.08)",
  "--anime-glass-panel": "rgba(0, 0, 0, 0.42)",
  "--anime-glass-panel-raised": "rgba(0, 0, 0, 0.48)",
  "--anime-queue-glass": "rgba(0, 0, 0, 0.38)",
  "--anime-console-glass": "rgba(0, 0, 0, 0.38)",
  "--anime-glass-border": "rgba(255, 255, 255, 0.1)",
  "--anime-glass-border-bright": "rgba(192, 132, 252, 0.28)",
  "--anime-glass-highlight": "inset 0 1px 0 rgba(255, 255, 255, 0.08)",
  "--anime-glass-shadow": "0 8px 32px rgba(0, 0, 0, 0.5)",
  "--anime-btn-border": "rgba(255, 255, 255, 0.12)",
  "--anime-btn-border-hover": "rgba(192, 132, 252, 0.35)",
  "--anime-btn-glass-bg": "rgba(0, 0, 0, 0.38)",
  "--anime-btn-glass-hover": "rgba(0, 0, 0, 0.48)",
  "--anime-btn-primary-bg": "rgba(192, 132, 252, 0.48)",
  "--anime-btn-primary-hover": "rgba(192, 132, 252, 0.62)",
  "--anime-btn-primary-border": "rgba(216, 180, 254, 0.45)",
  "--anime-btn-download-bg": "rgba(34, 211, 238, 0.42)",
  "--anime-btn-download-hover": "rgba(34, 211, 238, 0.58)",
  "--anime-btn-download-border": "rgba(103, 232, 249, 0.4)",
  "--anime-btn-edge-top": "inset 0 1px 0 rgba(255, 255, 255, 0.12)",
  "--anime-btn-edge-bottom": "inset 0 -1px 0 rgba(0, 0, 0, 0.4)",
  "--input-focus-ring": "#c084fc",
  "--selection-bg": "rgba(192, 132, 252, 0.38)",
  "--selection-color": "#ffffff",
  "--anime-btn-error-bg": "rgba(251, 113, 133, 0.16)",
  "--anime-btn-error-border": "rgba(251, 113, 133, 0.38)",
  "--anime-titlebar-bg": "rgba(0, 0, 0, 0.32)",
  "--anime-surface-hover-subtle": "rgba(255, 255, 255, 0.08)",
  "--anime-surface-hover-faint": "rgba(255, 255, 255, 0.05)",
  "--anime-download-pin-bg": "rgba(0, 0, 0, 0.35)",
  "--anime-progress-wrap-bg": "rgba(255, 255, 255, 0.08)",
  "--anime-hover-tip-bg": "rgba(0, 0, 0, 0.72)",
  "--anime-select-menu-bg": "rgba(0, 0, 0, 0.55)",
  "--anime-select-option-bg": "transparent",
  "--anime-select-option-hover-bg": "rgba(192, 132, 252, 0.18)",
  "--anime-pill-track-outline": "rgba(255, 255, 255, 0.12)",
  "--anime-queue-filename-color": "#e879f9",
};

const SNAP_VARS = new Set([
  "--anime-btn-text",
  "--anime-btn-text-muted",
  "--text",
  "--muted",
  "--input-placeholder",
  "--selection-color",
  "--tag-active-text",
]);

const VIBRANT_FIXED = new Set([
  "--accent",
  "--accent-hover",
  "--download",
  "--download-hover",
  "--error",
  "--error-border-hover",
  "--success",
  "--combining",
  "--input-focus-ring",
  "--anime-queue-filename-color",
  "--on-accent",
]);

const TEXT_VARS = new Set([]);

const GLASS_VARS = new Set([
  "--input-bg",
  "--mode-idle",
  "--surface-hover",
  "--border",
  "--border-hover",
  "--menu-active-bg",
  "--frame-outline",
  "--anime-glass-panel",
  "--anime-glass-panel-raised",
  "--anime-queue-glass",
  "--anime-console-glass",
  "--anime-glass-border",
  "--anime-glass-border-bright",
  "--anime-titlebar-bg",
  "--anime-surface-hover-subtle",
  "--anime-surface-hover-faint",
  "--anime-download-pin-bg",
  "--anime-progress-wrap-bg",
  "--anime-hover-tip-bg",
  "--anime-pill-track-outline",
  "--error-soft-bg",
  "--error-soft-bg-hover",
  "--selection-bg",
]);

const BUTTON_VARS = new Set([
  "--anime-btn-border",
  "--anime-btn-border-hover",
  "--anime-btn-glass-bg",
  "--anime-btn-glass-hover",
  "--anime-btn-primary-bg",
  "--anime-btn-primary-hover",
  "--anime-btn-primary-border",
  "--tab-active-bg",
  "--anime-btn-download-bg",
  "--anime-btn-download-hover",
  "--anime-btn-download-border",
  "--anime-btn-edge-top",
  "--anime-btn-edge-bottom",
  "--anime-btn-error-bg",
  "--anime-btn-error-border",
  "--anime-select-menu-bg",
  "--anime-select-option-hover-bg",
]);

const SCRIM_VARS = new Set([
  "--anime-scrim-top",
  "--anime-scrim-bottom",
  "--anime-scrim-tint-a",
  "--anime-scrim-tint-b",
]);

const SHADOW_VARS = new Set(["--anime-glass-shadow", "--anime-glass-highlight"]);

let currentVar = "";
let contrastReady = false;
let animationFrame = null;
/** @type {Record<string, unknown> | null} */
let activeState = null;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function parseColor(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((ch) => ch + ch)
            .join("")
        : hex.padEnd(6, "0").slice(0, 6);
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgbaMatch = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/,
  );
  if (rgbaMatch) {
    return {
      r: Number(rgbaMatch[1]),
      g: Number(rgbaMatch[2]),
      b: Number(rgbaMatch[3]),
      a: rgbaMatch[4] === undefined ? 1 : Number(rgbaMatch[4]),
    };
  }

  return null;
}

function formatColor(color) {
  if (color.a >= 0.999) {
    const toHex = (n) => Math.round(n).toString(16).padStart(2, "0");
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
  }
  const r = Math.round(color.r);
  const g = Math.round(color.g);
  const b = Math.round(color.b);
  const a = Number(color.a.toFixed(3));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function interpolateColor(from, to, t) {
  const a = parseColor(from);
  const b = parseColor(to);
  if (!a || !b) return t < 0.5 ? from : to;

  return formatColor({
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
    a: lerp(a.a, b.a, t),
  });
}

function interpolateScalar(from, to, t) {
  const a = Number(from);
  const b = Number(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return t < 0.5 ? from : to;
  return String(Number(lerp(a, b, t).toFixed(3)));
}

function interpolateValue(from, to, t, name = "") {
  if (SNAP_VARS.has(name)) {
    return t < 0.5 ? from : to;
  }
  if (/^inset\s/.test(from) || /^inset\s/.test(to) || /^0\s/.test(from)) {
    return t < 0.5 ? from : to;
  }
  if (/^[\d.]+$/.test(from) && /^[\d.]+$/.test(to)) {
    return interpolateScalar(from, to, t);
  }
  return interpolateColor(from, to, t);
}

function parseStateValue(name, value) {
  if (/^inset\s/.test(value) || /^0\s/.test(value)) {
    return { kind: "discrete", css: value };
  }
  if (/^[\d.]+$/.test(value)) {
    return { kind: "scalar", value: Number(value) };
  }
  const color = parseColor(value);
  if (color) return { kind: "color", ...color };
  return { kind: "discrete", css: value };
}

function stateToCss(state) {
  if (state.kind === "discrete") return state.css;
  if (state.kind === "scalar") return String(Number(state.value.toFixed(3)));
  return formatColor(state);
}

function lerpState(from, to, t, name = "") {
  if (SNAP_VARS.has(name)) {
    return t < 0.5 ? from : to;
  }
  if (from.kind === "discrete" || to.kind === "discrete") {
    return t < 0.5 ? from : to;
  }
  if (from.kind === "scalar" && to.kind === "scalar") {
    return { kind: "scalar", value: lerp(from.value, to.value, t) };
  }
  if (from.kind === "color" && to.kind === "color") {
    return {
      kind: "color",
      r: lerp(from.r, to.r, t),
      g: lerp(from.g, to.g, t),
      b: lerp(from.b, to.b, t),
      a: lerp(from.a, to.a, t),
    };
  }
  return t < 0.5 ? from : to;
}

function lumaToMix(luma) {
  return clamp01((luma - LUMA_DARK) / (LUMA_LIGHT - LUMA_DARK));
}

function snapMix(raw) {
  return raw >= SNAP_MIX_THRESHOLD ? 1 : 0;
}

function textMix(raw) {
  return snapMix(raw);
}

function glassMix(raw) {
  const eased = smoothstep(raw);
  if (eased < 0.5) return eased * 0.72;
  return 0.36 + eased * 0.64;
}

function buttonMix(raw) {
  return smoothstep(raw) * 0.28;
}

function shadowMix(raw) {
  return smoothstep(raw) * 0.45;
}

function scrimMix(raw) {
  const eased = smoothstep(raw);
  const midPull = (1 - Math.abs(eased - 0.5) * 2) * 0.32;
  return clamp01(eased - midPull);
}

function vibrantMix(raw) {
  return raw >= 0.5 ? 1 : 0;
}

function mixForVar(name, raw) {
  if (SNAP_VARS.has(name)) return snapMix(raw);
  if (VIBRANT_FIXED.has(name)) return vibrantMix(raw);
  if (TEXT_VARS.has(name)) return textMix(raw);
  if (BUTTON_VARS.has(name)) return buttonMix(raw);
  if (GLASS_VARS.has(name)) return glassMix(raw);
  if (SCRIM_VARS.has(name)) return scrimMix(raw);
  if (SHADOW_VARS.has(name)) return shadowMix(raw);
  return smoothstep(raw);
}

function sampleImageLuma(img) {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0.35;

  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  return sum / (data.length / 4);
}

function contrastLabel(raw) {
  const mix = smoothstep(raw);
  if (mix >= 0.52) return "light";
  if (mix <= 0.28) return "dark";
  return "medium";
}

function readColorScheme() {
  return document.documentElement.dataset.colorScheme === "light" ? "light" : "dark";
}

/** Brighter wallpaper → stronger darkening overlay (dark theme mode only). */
function darkBackgroundFilter(raw) {
  const t = smoothstep(raw);
  return {
    "--anime-scrim-top": String(Number((0.1 + t * 0.42).toFixed(3))),
    "--anime-scrim-bottom": String(Number((0.34 + t * 0.42).toFixed(3))),
    "--anime-scrim-tint-a": String(Number((0.03 + t * 0.07).toFixed(3))),
    "--anime-scrim-tint-b": String(Number((0.02 + t * 0.06).toFixed(3))),
    "--anime-bg-dim": String(Number((0.08 + t * 0.52).toFixed(3))),
  };
}

function buildAnimeDarkState(raw) {
  /** @type {Record<string, unknown>} */
  const state = {
    __raw: raw,
    __label: raw >= 0.55 ? "bright-bg" : "dark-bg",
  };

  for (const [name, value] of Object.entries(DARK_MODE_VALUES)) {
    state[name] = parseStateValue(name, value);
  }

  for (const [name, value] of Object.entries(darkBackgroundFilter(raw))) {
    state[name] = parseStateValue(name, value);
  }

  return state;
}

function buildAnimeLightAdaptiveState(raw, { forceBrightGlass = false } = {}) {
  /** @type {Record<string, unknown>} */
  const state = { __raw: raw, __label: contrastLabel(raw) };

  for (const [name, [darkValue, lightValue]] of Object.entries(CONTRAST_VARS)) {
    currentVar = name;
    let mix = mixForVar(name, raw);
    if (forceBrightGlass && (GLASS_VARS.has(name) || SHADOW_VARS.has(name))) {
      mix = 1;
    }
    state[name] = parseStateValue(name, interpolateValue(darkValue, lightValue, mix, name));
  }
  currentVar = "";
  state["--anime-bg-dim"] = parseStateValue("--anime-bg-dim", "0");
  return state;
}

function computeTargetState(img, { forceBrightGlass = false } = {}) {
  const raw = lumaToMix(sampleImageLuma(img));
  if (readColorScheme() === "dark") {
    return buildAnimeDarkState(raw);
  }
  return buildAnimeLightAdaptiveState(raw, { forceBrightGlass });
}

function applyState(state) {
  const root = document.documentElement;
  root.dataset.animeContrast = state.__label;
  root.dataset.animeContrastMode = readColorScheme();
  root.style.setProperty("--anime-bg-luma", String(state.__raw));

  const keys = new Set([...Object.keys(CONTRAST_VARS), "--anime-bg-dim"]);
  for (const name of keys) {
    if (state[name] !== undefined) {
      root.style.setProperty(name, stateToCss(state[name]));
    }
  }
}

function cancelAnimation() {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
}

function animateToState(targetState) {
  cancelAnimation();
  const root = document.documentElement;
  const stateKeys = [...new Set([...Object.keys(CONTRAST_VARS), "--anime-bg-dim"])];
  const fromState =
    activeState ??
    Object.fromEntries(
      stateKeys.map((name) => {
        const css = root.style.getPropertyValue(name) || getComputedStyle(root).getPropertyValue(name);
        const fallback =
          CONTRAST_VARS[name]?.[0] ?? DARK_MODE_VALUES[name] ?? darkBackgroundFilter(0)["--anime-bg-dim"];
        return [name, parseStateValue(name, css.trim() || fallback || "0")];
      }),
    );

  if (!fromState.__raw) fromState.__raw = targetState.__raw;
  if (!fromState.__label) fromState.__label = contrastLabel(fromState.__raw);

  const start = performance.now();

  const tick = (now) => {
    if (document.documentElement.dataset.theme !== "anime") {
      cancelAnimation();
      return;
    }

    const progress = easeInOutCubic(clamp01((now - start) / TRANSITION_MS));
    /** @type {Record<string, unknown>} */
    const frame = {
      __raw: lerp(fromState.__raw, targetState.__raw, progress),
      __label: progress >= 0.5 ? targetState.__label : fromState.__label,
    };

    const animKeys = new Set([...Object.keys(CONTRAST_VARS), "--anime-bg-dim"]);
    for (const name of animKeys) {
      if (fromState[name] === undefined || targetState[name] === undefined) continue;
      if (SNAP_VARS.has(name)) {
        frame[name] = progress > 0 ? targetState[name] : fromState[name];
      } else {
        frame[name] = lerpState(fromState[name], targetState[name], progress, name);
      }
    }

    applyState(frame);
    activeState = frame;

    if (progress < 1) {
      animationFrame = requestAnimationFrame(tick);
      return;
    }

    applyState(targetState);
    activeState = targetState;
    animationFrame = null;
  };

  animationFrame = requestAnimationFrame(tick);
}

/** Bright glass before the first wallpaper sample so panels don't flash grey on open. */
export function seedAnimeLightGlass() {
  if (document.documentElement.dataset.theme !== "anime") return;
  if (readColorScheme() !== "light") return;

  contrastReady = false;

  const root = document.documentElement;
  root.dataset.animeContrast = "light";
  root.dataset.animeContrastMode = "light";

  for (const name of [...GLASS_VARS, ...SHADOW_VARS]) {
    const lightValue = CONTRAST_VARS[name]?.[1];
    if (lightValue) root.style.setProperty(name, lightValue);
  }
}

export function applyAdaptiveContrast(img, { instant = false } = {}) {
  if (document.documentElement.dataset.theme !== "anime" || !img?.naturalWidth) return;

  const isFirstApply = !contrastReady;
  const forceBrightGlass = isFirstApply && readColorScheme() === "light";
  const targetState = computeTargetState(img, { forceBrightGlass });

  if (instant || !contrastReady) {
    cancelAnimation();
    applyState(targetState);
    activeState = targetState;
    contrastReady = true;
    return;
  }

  animateToState(targetState);
}

export function clearAdaptiveContrast() {
  cancelAnimation();
  contrastReady = false;
  activeState = null;

  const root = document.documentElement;
  delete root.dataset.animeContrast;
  delete root.dataset.animeContrastMode;
  root.style.removeProperty("--anime-bg-luma");
  const keys = new Set([...Object.keys(CONTRAST_VARS), "--anime-bg-dim"]);
  for (const name of keys) {
    root.style.removeProperty(name);
  }
}

export function syncAdaptiveContrast(img, { instant = false } = {}) {
  if (!img) return;

  const run = () => applyAdaptiveContrast(img, { instant });

  if (img.complete && img.naturalWidth) {
    run();
    return;
  }

  img.addEventListener("load", run, { once: true });
}
