import { runColorSchemeTransition } from "./color-scheme-transition.js";
import { syncAppFocusDim } from "./app-focus-dim.js";
import { syncCustomSelect } from "./custom-select.js";
import { $ } from "./dom.js";
import {
  resyncAnimeContrastFromDom,
  seedAnimeLightGlass,
  startAnimeTheme,
  stopAnimeTheme,
  transitionAnimeColorScheme,
} from "../themes/Anime/scripts/index.js";

export const THEMES = {
  default: {
    id: "default",
    label: "Default",
    href: "themes/Default/theme.css",
    defaultColorScheme: "dark",
  },
  meta: {
    id: "meta",
    label: "Meta",
    href: "themes/Meta/theme.css",
    defaultColorScheme: "light",
  },
  anime: {
    id: "anime",
    label: "Anime",
    href: "themes/Anime/theme.css",
    defaultColorScheme: "dark",
  },
  terminal: {
    id: "terminal",
    label: "Terminal",
    href: "themes/Terminal/theme.css",
    defaultColorScheme: "dark",
  },
};

export const THEME_MODES = {
  system: "system",
  dark: "dark",
  light: "light",
};

const THEME_LINK_ID = "themeStylesheet";
let systemSchemeMedia = null;

export function normalizeThemeId(value) {
  const id = String(value || "default").trim().toLowerCase();
  if (id === "amethyst") return "default";
  return id in THEMES ? id : "default";
}

export function normalizeThemeModeId(value) {
  const mode = String(value || "system").trim().toLowerCase();
  return mode in THEME_MODES ? mode : "system";
}

function themeDefaultColorScheme(themeId) {
  return THEMES[normalizeThemeId(themeId)].defaultColorScheme;
}

export function resolveColorScheme(themeMode, themeId) {
  const mode = normalizeThemeModeId(themeMode);
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  if (window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return themeDefaultColorScheme(themeId);
}

export function getResolvedColorScheme() {
  return document.documentElement.dataset.colorScheme || "dark";
}

function applyColorScheme(scheme) {
  document.documentElement.dataset.colorScheme = scheme;
}

function commitColorSchemeInstant(commit) {
  const root = document.documentElement;
  root.classList.add("color-scheme-instant");
  commit();
  void root.offsetHeight;
  root.classList.remove("color-scheme-instant");
}

/** @param {{ animate?: boolean }} [options] */
export async function applyThemeMode(themeMode, themeId, { animate = false } = {}) {
  const id = normalizeThemeId(themeId ?? readThemeFromForm());
  const mode = normalizeThemeModeId(themeMode ?? readThemeModeFromForm());
  const previousScheme = getResolvedColorScheme();
  const scheme = resolveColorScheme(mode, id);
  if (scheme === previousScheme) return;

  const shouldAnimate = animate && id === "anime";

  if (shouldAnimate && document.documentElement.dataset.theme === "anime") {
    await transitionAnimeColorScheme(scheme);
    return;
  }

  const commit = () => {
    applyColorScheme(scheme);
    if (id === "anime") {
      if (scheme === "light") seedAnimeLightGlass();
      resyncAnimeContrastFromDom({ instant: !shouldAnimate });
    }
  };

  if (shouldAnimate) {
    await runColorSchemeTransition(commit);
    return;
  }

  commitColorSchemeInstant(commit);
}

function themeHref(themeId) {
  const theme = THEMES[normalizeThemeId(themeId)];
  return new URL(theme.href, window.location.href).href;
}

export function applyTheme(themeId, themeMode) {
  const id = normalizeThemeId(themeId);
  const previous = document.documentElement.dataset.theme;
  if (previous === "anime" && id !== "anime") {
    stopAnimeTheme();
  }
  const link = document.getElementById(THEME_LINK_ID);
  const href = themeHref(id);
  if (link) {
    if (link.href !== href) link.href = href;
  } else {
    const el = document.createElement("link");
    el.id = THEME_LINK_ID;
    el.rel = "stylesheet";
    el.href = href;
    document.head.appendChild(el);
  }
  document.documentElement.dataset.theme = id;
  applyThemeMode(themeMode, id);
  if (id === "anime") {
    startAnimeTheme();
  }
  syncAppFocusDim();
}

export function setThemeSelectValue(themeId) {
  const select = $("themeSelect");
  if (!select) return;
  select.value = normalizeThemeId(themeId);
  syncCustomSelect(select);
}

export function setThemeModeSelectValue(themeMode) {
  const select = $("themeModeSelect");
  if (!select) return;
  select.value = normalizeThemeModeId(themeMode);
  syncCustomSelect(select);
}

export function readThemeFromForm() {
  return normalizeThemeId($("themeSelect")?.value);
}

export function readThemeModeFromForm() {
  return normalizeThemeModeId($("themeModeSelect")?.value);
}

export function bindThemeModeListener() {
  if (systemSchemeMedia) return;
  systemSchemeMedia = window.matchMedia("(prefers-color-scheme: dark)");
  systemSchemeMedia.addEventListener("change", () => {
    if (readThemeModeFromForm() !== "system") return;
    applyThemeMode("system", readThemeFromForm(), { animate: true });
  });
}
