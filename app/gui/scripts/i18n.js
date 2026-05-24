import en from "../i18n/en.js";
import pl from "../i18n/pl.js";
import zh from "../i18n/zh.js";
import cs from "../i18n/cs.js";
import ja from "../i18n/ja.js";
import ko from "../i18n/ko.js";
import szl from "../i18n/szl.js";
import { syncCustomSelect } from "./custom-select.js";
import { $ } from "./dom.js";

export const LOCALES = {
  en: { id: "en", label: "English", strings: en },
  pl: { id: "pl", label: "Polski", strings: pl },
  szl: { id: "szl", label: "Ślōnski", strings: szl },
  cs: { id: "cs", label: "Čeština", strings: cs },
  ja: { id: "ja", label: "日本語", strings: ja },
  ko: { id: "ko", label: "한국어", strings: ko },
  zh: { id: "zh", label: "中文 (简体)", strings: zh },
};

const TEXT_BY_ID = {
  saveSettingsBtn: "btn.saveSettings",
  restartBtn: "btn.restartProgram",
  browseBtn: "btn.browse",
  browseCookiesBtn: "settings.cookiesFile",
  signInBtn: "settings.signIn",
  installDenoBtn: "extras.downloadDeno",
  installFfmpegBtn: "extras.downloadFfmpeg",
  cancelViewBtn: "queue.cancelAll",
  downloadBtn: "btn.download",
  clearLogBtn: "btn.clear",
  copyLogBtn: "btn.copy",
  denoSourcePathLabel: "extras.path",
  denoSourceLocalLabel: "extras.local",
  ffmpegSourcePathLabel: "extras.path",
  ffmpegSourceLocalLabel: "extras.local",
  youtubeHintText: "settings.youtubeHint",
  youtubeHelpLink: "settings.help",
};

const PLACEHOLDER_BY_ID = {
  url: "url.placeholder",
  outputDir: "output.placeholder",
  cookiesFile: "settings.cookiesPlaceholder",
};

const TEXT_BY_SELECTOR = [
  ['button.page-tab[data-page="download"]', "tab.download"],
  ['button.page-tab[data-page="settings"]', "tab.settings"],
  ['button.page-tab[data-page="extras"]', "tab.extras"],
  ['button.mode-btn[data-mode="video"]', "mode.video"],
  ['button.mode-btn[data-mode="playlist"]', "mode.playlist"],
  ['button.mode-btn[data-mode="channel"]', "mode.channel"],
  ["#page-download .settings-section:nth-of-type(1) .settings-section-title", "section.items"],
  ["#page-download .settings-section:nth-of-type(2) .settings-section-title", "section.output"],
  ["#page-download .settings-section:nth-of-type(3) .settings-section-title", "section.organization"],
  ["#page-download .settings-section:nth-of-type(4) .settings-section-title", "section.concurrent"],
  ['label[for="videoQuality"]', "item.video"],
  ['label[for="audioQuality"]', "item.audio"],
  ["#page-download .option-group:nth-of-type(1) .option-group-label", "org.files"],
  ["#page-download .option-group:nth-of-type(2) .option-group-label", "org.layout"],
  ["label:has(#chkVideo) .toggle-label", "item.video"],
  ["label:has(#chkAudio) .toggle-label", "item.audio"],
  ["label:has(#chkMeta) .toggle-label", "item.metadata"],
  ["label:has(#chkThumb) .toggle-label", "item.thumbnail"],
  ["label:has(#chkBundle) .toggle-label", "toggle.bundle"],
  ["label:has(#chkGroupPlaylistChannel) .toggle-label", "toggle.groupPlaylistChannel"],
  ["label:has(#chkCombine) .toggle-label", "toggle.combineStreams"],
  ["label:has(#layoutRaw) .toggle-label", "toggle.flat"],
  ["label:has(#layoutOrg) .toggle-label", "toggle.organized"],
  ["label:has(#layoutIntelligent) .toggle-label", "toggle.intelligent"],
  ["#page-download .concurrency-head .option-group-label", "concurrency.parallelJobs"],
  ["#page-download .settings-section:nth-of-type(4) .hint", "concurrency.hint"],
  ["#page-settings .settings-section:nth-of-type(1) .settings-section-title", "section.appearance"],
  ["#page-settings .settings-section:nth-of-type(2) .settings-section-title", "section.window"],
  ["#page-settings .settings-section:nth-of-type(3) .settings-section-title", "section.downloads"],
  ["#page-settings .settings-section:nth-of-type(4) .settings-section-title", "section.fileNaming"],
  ["#page-settings .settings-section:nth-of-type(5) .settings-section-title", "section.youtube"],
  ["label:has(#chkFrameless) .toggle-label", "settings.frameless"],
  ["#page-settings .settings-section:nth-of-type(2) .hint", "settings.framelessHint"],
  ["label:has(#chkRemoveIfCancelled) .toggle-label", "settings.removeIfCancelled"],
  ["#page-settings .settings-section:nth-of-type(3) .hint", "settings.removeIfCancelledHint"],
  ['label[for="bundleFolderTemplate"]', "settings.bundleFolder"],
  ['label[for="fileNameTemplate"]', "settings.fileName"],
  ['label[for="channelFolder"]', "settings.channelFolder"],
  ['label[for="playlistFolder"]', "settings.playlistFolder"],
  ['label[for="channelNameTemplate"]', "settings.channelName"],
  ['label[for="playlistNameTemplate"]', "settings.playlistName"],
  ["#page-settings .settings-disclosure-trigger", "settings.namePlaceholders"],
  ["label:has(#chkBrowserCookies) .toggle-label", "settings.browserCookies"],
  ["#page-extras .settings-section:nth-of-type(1) .settings-section-title", "section.youtubeRuntime"],
  ["#page-extras .settings-section:nth-of-type(1) .hint", "extras.denoHint"],
  ["#page-extras .settings-section:nth-of-type(2) .settings-section-title", "section.streamMerging"],
  ["#page-extras .settings-section:nth-of-type(2) .hint", "extras.ffmpegHint"],
  [".side-pane .status-head > .label-inline", "queue.title"],
  [".console-head > .label-inline", "console.title"],
];

const TIP_BY_SELECTOR = [
  ["label:has(#chkVideo)", "tip.video"],
  ["label:has(#chkAudio)", "tip.audio"],
  ["label:has(#chkMeta)", "tip.metadata"],
  ["label:has(#chkThumb)", "tip.thumbnail"],
  ["label:has(#chkBundle)", "tip.bundle"],
  ["label:has(#chkGroupPlaylistChannel)", "tip.groupPlaylistChannel"],
  ["label:has(#chkCombine)", "tip.combineStreams"],
  ["label:has(#layoutRaw)", "tip.flat"],
  ["label:has(#layoutOrg)", "tip.organized"],
  ["label:has(#layoutIntelligent)", "tip.intelligent"],
  ["#concurrencySlider", "tip.concurrency"],
  ["label:has(#chkFrameless)", "tip.frameless"],
  ["label:has(#chkRemoveIfCancelled)", "tip.removeIfCancelled"],
  ["label:has(#chkBrowserCookies)", "tip.browserCookies"],
];

const ARIA_BY_ID = {
  winMin: "win.minimize",
  winMax: "win.maximize",
  winClose: "win.close",
  concurrencyInput: "concurrency.aria",
};

const TITLE_BY_ID = {
  winMin: "win.minimize",
  winMax: "win.maximize",
  winClose: "win.close",
  cancelViewBtn: "queue.cancelAllTitle",
};

let currentLocale = "en";
let strings = en;

export function normalizeLanguageId(value) {
  const id = String(value || "en").trim().toLowerCase();
  return id in LOCALES ? id : "en";
}

export function getLanguage() {
  return currentLocale;
}

function interpolate(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      return String(params[key]);
    }
    return `{${key}}`;
  });
}

export function t(key, params) {
  const template = strings[key] ?? LOCALES.en.strings[key] ?? key;
  if (params == null) return template;
  return interpolate(template, params);
}

export function itemLabel(key) {
  const map = {
    video: "item.video",
    audio: "item.audio",
    metadata: "item.metadata",
    thumbnail: "item.thumbnail",
  };
  return t(map[key] || key);
}

export function qualityLabel(value) {
  const key = `quality.${value}`;
  return strings[key] ?? LOCALES.en.strings[key] ?? value;
}

export function refreshQualitySelectLabels() {
  ["videoQuality", "audioQuality"].forEach((id) => {
    const select = $(id);
    if (!select) return;
    select.querySelectorAll("option").forEach((option) => {
      option.textContent = qualityLabel(option.value);
    });
    syncCustomSelect(select);
  });
}

function setElementText(el, key, mode = "text") {
  if (!el || !key) return;
  const value = t(key);
  if (mode === "html") {
    el.innerHTML = value;
  } else {
    el.textContent = value;
  }
}

export function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    setElementText(el, el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    setElementText(el, el.getAttribute("data-i18n-html"), "html");
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.getAttribute("data-i18n-title"));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
  });
  document.querySelectorAll("[data-i18n-tip]").forEach((el) => {
    const key = el.getAttribute("data-i18n-tip");
    if (key) el.setAttribute("data-tip", t(key));
  });

  Object.entries(TEXT_BY_ID).forEach(([id, key]) => {
    setElementText($(id), key);
  });
  Object.entries(PLACEHOLDER_BY_ID).forEach(([id, key]) => {
    const el = $(id);
    if (el) el.placeholder = t(key);
  });
  Object.entries(ARIA_BY_ID).forEach(([id, key]) => {
    const el = $(id);
    if (el) el.setAttribute("aria-label", t(key));
  });
  Object.entries(TITLE_BY_ID).forEach(([id, key]) => {
    const el = $(id);
    if (el) el.title = t(key);
  });

  TEXT_BY_SELECTOR.forEach((entry) => {
    const [selector, key, mode = "text"] = entry;
    document.querySelectorAll(selector).forEach((el) => setElementText(el, key, mode));
  });
  TIP_BY_SELECTOR.forEach(([selector, key]) => {
    document.querySelectorAll(selector).forEach((el) => {
      el.setAttribute("data-tip", t(key));
    });
  });

  document.title = "Nari's Video Downloader";
  updateLanguageSelectLabels();
  updateThemeSelectLabels();
  updateThemeModeSelectLabels();
  refreshQualitySelectLabels();
  window.dispatchEvent(new CustomEvent("languagechange"));
}

function updateLanguageSelectLabels() {
  const select = $("languageSelect");
  if (!select) return;
  select.querySelectorAll("option").forEach((option) => {
    const locale = LOCALES[option.value];
    if (locale) option.textContent = locale.label;
  });
  syncCustomSelect(select);
}

function updateThemeSelectLabels() {
  const select = $("themeSelect");
  if (!select) return;
  const labels = {
    default: t("settings.themeDefault"),
    meta: t("settings.themeMeta"),
    anime: t("settings.themeAnime"),
  };
  select.querySelectorAll("option").forEach((option) => {
    if (labels[option.value]) option.textContent = labels[option.value];
  });
  syncCustomSelect(select);
}

function updateThemeModeSelectLabels() {
  const select = $("themeModeSelect");
  if (!select) return;
  const labels = {
    system: t("settings.themeModeSystem"),
    dark: t("settings.themeModeDark"),
    light: t("settings.themeModeLight"),
  };
  select.querySelectorAll("option").forEach((option) => {
    if (labels[option.value]) option.textContent = labels[option.value];
  });
  syncCustomSelect(select);
}

export function setLanguageSelectValue(languageId) {
  const select = $("languageSelect");
  if (!select) return;
  select.value = normalizeLanguageId(languageId);
  syncCustomSelect(select);
}

export function readLanguageFromForm() {
  return normalizeLanguageId($("languageSelect")?.value);
}

const HTML_LANG_BY_LOCALE = {
  en: "en",
  pl: "pl",
  szl: "szl",
  cs: "cs",
  ja: "ja",
  ko: "ko",
  zh: "zh-CN",
};

export function setLanguage(localeId) {
  const id = normalizeLanguageId(localeId);
  currentLocale = id;
  strings = LOCALES[id].strings;
  document.documentElement.lang = HTML_LANG_BY_LOCALE[id] ?? id;
  applyTranslations();
  return id;
}

export function initLanguage(languageId) {
  setLanguageSelectValue(languageId);
  return setLanguage(languageId);
}
