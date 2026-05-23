import { $ } from "./dom.js";
import { refreshExtrasStatus } from "./extras.js";
import { state } from "./state.js";

export function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
}

export function applyFramelessUi(frameless) {
  state.frameless = frameless;
  document.body.classList.toggle("frameless", frameless);
}

export function setPage(page) {
  document.querySelectorAll(".page-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });
  document.querySelectorAll(".page-view").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `page-${page}`);
  });
  if (page === "extras") {
    refreshExtrasStatus().catch(() => {});
  }
}

const TIP_DELAY_MS = 650;
let tipTimer = null;
let tipEl = null;
let tipAnchor = null;

function ensureTipEl() {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "hover-tip";
    tipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function hideTip() {
  if (tipTimer) {
    clearTimeout(tipTimer);
    tipTimer = null;
  }
  tipAnchor = null;
  tipEl?.classList.remove("visible");
}

function positionTip(anchor) {
  const tip = ensureTipEl();
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  tip.style.left = "0";
  tip.style.top = "0";
  tip.classList.add("visible");

  const tipRect = tip.getBoundingClientRect();
  let left = rect.left;
  let top = rect.top - margin - tipRect.height;

  if (top < margin) {
    top = rect.bottom + margin;
  }
  if (left + tipRect.width > window.innerWidth - margin) {
    left = window.innerWidth - margin - tipRect.width;
  }
  if (left < margin) left = margin;

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

export function bindHoverTips() {
  document.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("mouseenter", () => {
      const text = el.getAttribute("data-tip");
      if (!text) return;
      hideTip();
      tipAnchor = el;
      tipTimer = setTimeout(() => {
        if (tipAnchor !== el) return;
        const tip = ensureTipEl();
        tip.textContent = text;
        positionTip(el);
      }, TIP_DELAY_MS);
    });
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("mousedown", hideTip);
  });
}
