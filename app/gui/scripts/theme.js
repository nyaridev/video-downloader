import { syncCustomSelect } from "./custom-select.js";
import { $ } from "./dom.js";

export const THEMES = {
  default: {
    id: "default",
    label: "Default",
    href: "themes/Default/theme.css",
  },
  meta: {
    id: "meta",
    label: "Meta",
    href: "themes/Meta/theme.css",
  },
};

const THEME_LINK_ID = "themeStylesheet";

export function normalizeThemeId(value) {
  const id = String(value || "default").trim().toLowerCase();
  return id in THEMES ? id : "default";
}

function themeHref(themeId) {
  const theme = THEMES[normalizeThemeId(themeId)];
  return new URL(theme.href, window.location.href).href;
}

export function applyTheme(themeId) {
  const id = normalizeThemeId(themeId);
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
}

export function setThemeSelectValue(themeId) {
  const select = $("themeSelect");
  if (!select) return;
  select.value = normalizeThemeId(themeId);
  syncCustomSelect(select);
}

export function readThemeFromForm() {
  return normalizeThemeId($("themeSelect")?.value);
}
