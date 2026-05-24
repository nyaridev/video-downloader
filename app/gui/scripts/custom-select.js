const OPEN_CLASS = "open";
const DROP_UP_CLASS = "custom-select--drop-up";
const PORTAL_CLASS = "custom-select-menu--portal";
const MENU_GAP = 4;
const MENU_MAX_HEIGHT = 220;
let openPicker = null;
let portalListenersBound = false;

function getPlacementBounds(trigger) {
  let node = trigger.parentElement;
  while (node && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") {
      return node.getBoundingClientRect();
    }
    node = node.parentElement;
  }
  return {
    top: 0,
    bottom: window.innerHeight,
    left: 0,
    right: window.innerWidth,
  };
}

function getMenuNeededHeight(menu) {
  return Math.min(menu.scrollHeight, MENU_MAX_HEIGHT);
}

function shouldDropUp(trigger, menu) {
  const triggerRect = trigger.getBoundingClientRect();
  const bounds = getPlacementBounds(trigger);
  const neededHeight = getMenuNeededHeight(menu);
  const spaceBelow = bounds.bottom - triggerRect.bottom - MENU_GAP;
  const spaceAbove = triggerRect.top - bounds.top - MENU_GAP;

  if (spaceBelow >= neededHeight) return false;
  if (spaceAbove >= neededHeight) return true;
  return false;
}

function updateMenuPlacement(wrap) {
  const trigger = wrap.querySelector(".custom-select-trigger");
  const menu = getMenu(wrap);
  if (!trigger || !menu) return;

  wrap.classList.toggle(DROP_UP_CLASS, shouldDropUp(trigger, menu));
}

function getMenu(wrap) {
  if (wrap._portaledMenu) return wrap._portaledMenu;
  const local = wrap.querySelector(".custom-select-menu");
  if (local) return local;
  const trigger = wrap.querySelector(".custom-select-trigger");
  const menuId = trigger?.getAttribute("aria-controls");
  if (!menuId) return null;
  const byId = document.getElementById(menuId);
  return byId?.classList.contains("custom-select-menu") ? byId : null;
}

function ensureMenuHome(wrap) {
  const menu = getMenu(wrap);
  if (!menu) return null;
  if (wrap._portaledMenu || menu.classList.contains(PORTAL_CLASS)) {
    unportalMenu(wrap);
    return wrap.querySelector(".custom-select-menu");
  }
  return menu;
}

function bindPortalListeners() {
  if (portalListenersBound) return;
  portalListenersBound = true;
  window.addEventListener("scroll", repositionOpenPicker, true);
  window.addEventListener("resize", repositionOpenPicker);
}

function repositionOpenPicker() {
  if (!openPicker) return;
  const trigger = openPicker.querySelector(".custom-select-trigger");
  const menu = getMenu(openPicker);
  if (trigger && menu && !menu.hidden) {
    syncPortalPosition(openPicker, trigger, menu);
  }
}

function syncPortalPosition(wrap, trigger, menu) {
  const rect = trigger.getBoundingClientRect();
  const dropUp = wrap.classList.contains(DROP_UP_CLASS);
  const bounds = getPlacementBounds(trigger);

  menu.style.position = "fixed";
  menu.style.left = `${rect.left}px`;
  menu.style.width = `${rect.width}px`;
  menu.style.minWidth = `${rect.width}px`;
  menu.style.zIndex = "10000";

  if (dropUp) {
    const spaceAbove = rect.top - bounds.top - MENU_GAP;
    menu.style.top = "auto";
    menu.style.bottom = `${window.innerHeight - rect.top + MENU_GAP}px`;
    menu.style.maxHeight = `${Math.max(80, Math.min(MENU_MAX_HEIGHT, spaceAbove))}px`;
  } else {
    const spaceBelow = bounds.bottom - rect.bottom - MENU_GAP;
    menu.style.top = `${rect.bottom + MENU_GAP}px`;
    menu.style.bottom = "auto";
    menu.style.maxHeight = `${Math.max(80, Math.min(MENU_MAX_HEIGHT, spaceBelow))}px`;
  }
}

function portalMenu(wrap, trigger, menu) {
  if (!wrap._menuAnchor) {
    wrap._menuAnchor = document.createComment("custom-select-menu-anchor");
    menu.after(wrap._menuAnchor);
  }
  document.body.appendChild(menu);
  wrap._portaledMenu = menu;
  menu.classList.add(PORTAL_CLASS);
  syncPortalPosition(wrap, trigger, menu);
  bindPortalListeners();
}

function unportalMenu(wrap) {
  let menu = wrap._portaledMenu || getMenu(wrap);
  if (!menu || menu.parentElement === wrap) {
    wrap._portaledMenu = null;
    return;
  }

  menu.classList.remove(PORTAL_CLASS);
  menu.style.cssText = "";
  if (wrap._menuAnchor?.parentNode) {
    wrap._menuAnchor.parentNode.insertBefore(menu, wrap._menuAnchor);
  } else {
    wrap.appendChild(menu);
  }
  wrap._portaledMenu = null;
}

function closePicker(wrap) {
  if (!wrap) return;
  const menu = getMenu(wrap);
  unportalMenu(wrap);
  wrap.classList.remove(OPEN_CLASS);
  if (menu) menu.hidden = true;
  const trigger = wrap.querySelector(".custom-select-trigger");
  if (trigger) trigger.setAttribute("aria-expanded", "false");
  if (openPicker === wrap) openPicker = null;
}

export function closeAllCustomSelects() {
  if (openPicker) closePicker(openPicker);
}

export function closeCustomSelect(wrap) {
  closePicker(wrap);
}

export function toggleCustomSelect(wrap) {
  if (!wrap || wrap.hidden) return;
  if (wrap.classList.contains(OPEN_CLASS)) closePicker(wrap);
  else openPickerMenu(wrap);
}

function openPickerMenu(wrap) {
  const select = wrap.querySelector("select");
  const trigger = wrap.querySelector(".custom-select-trigger");
  if (!trigger) return;
  if (select?.disabled) return;

  if (openPicker && openPicker !== wrap) closePicker(openPicker);

  const menu = ensureMenuHome(wrap);
  if (!menu) return;

  menu.hidden = false;
  menu.style.visibility = "hidden";
  updateMenuPlacement(wrap);
  portalMenu(wrap, trigger, menu);
  menu.style.visibility = "";
  wrap.classList.add(OPEN_CLASS);
  trigger.setAttribute("aria-expanded", "true");
  openPicker = wrap;
}

function syncLabel(wrap) {
  const select = wrap.querySelector("select");
  const label = wrap.querySelector(".custom-select-label");
  if (!select || !label) return;
  const opt = select.selectedOptions[0];
  label.textContent = opt ? opt.textContent : "";
}

function syncDisabled(wrap) {
  const select = wrap.querySelector("select");
  const trigger = wrap.querySelector(".custom-select-trigger");
  if (!select || !trigger) return;
  const disabled = select.disabled;
  trigger.disabled = disabled;
  wrap.classList.toggle("custom-select--disabled", disabled);
}

function buildMenu(wrap) {
  const select = wrap.querySelector("select");
  const menu = getMenu(wrap);
  if (!select || !menu || wrap.dataset.queueViewPicker) return;

  menu.innerHTML = "";
  [...select.options].forEach((opt) => {
    const li = document.createElement("li");
    li.className = "custom-select-option";
    li.dataset.value = opt.value;
    li.setAttribute("role", "option");
    if (opt.value === select.value) {
      li.classList.add("active");
      li.setAttribute("aria-selected", "true");
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "custom-select-option-btn";
    btn.textContent = opt.textContent;
    li.appendChild(btn);
    menu.appendChild(li);
  });

  syncLabel(wrap);
  syncDisabled(wrap);
}

export function syncCustomSelect(select) {
  if (!select) return;
  const wrap = select.closest(".custom-select");
  if (!wrap || wrap.dataset.queueViewPicker) return;
  buildMenu(wrap);
}

export function enhanceSelect(select) {
  if (!select || select.dataset.customSelectEnhanced) return null;

  const wrap = document.createElement("div");
  wrap.className = "custom-select custom-select--compact";
  if (select.classList.contains("theme-select")) {
    wrap.classList.add("theme-select");
  }

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "custom-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  if (select.getAttribute("aria-label")) {
    trigger.setAttribute("aria-label", select.getAttribute("aria-label"));
  }

  const label = document.createElement("span");
  label.className = "custom-select-label";

  const chevron = document.createElement("span");
  chevron.className = "custom-select-chevron";
  chevron.setAttribute("aria-hidden", "true");

  trigger.append(label, chevron);

  const menu = document.createElement("ul");
  menu.className = "custom-select-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  if (select.id) {
    menu.id = `${select.id}Menu`;
    trigger.setAttribute("aria-controls", menu.id);
  }

  select.classList.add("custom-select-native");
  select.dataset.customSelectEnhanced = "1";

  const parent = select.parentNode;
  parent.insertBefore(wrap, select);
  wrap.append(trigger, menu, select);

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (wrap.classList.contains(OPEN_CLASS)) closePicker(wrap);
    else openPickerMenu(wrap);
  });

  menu.addEventListener("click", (e) => {
    const btn = e.target.closest(".custom-select-option-btn");
    if (!btn) return;
    const option = btn.closest(".custom-select-option");
    const value = option?.dataset.value;
    if (value == null) return;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    buildMenu(wrap);
    closePicker(wrap);
  });

  select.addEventListener("change", () => buildMenu(wrap));

  const observer = new MutationObserver(() => {
    buildMenu(wrap);
  });
  observer.observe(select, {
    childList: true,
    attributes: true,
    attributeFilter: ["disabled"],
  });

  buildMenu(wrap);
  return wrap;
}

export function initCustomSelects(root = document) {
  root.querySelectorAll("select.select-compact").forEach((select) => enhanceSelect(select));
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAllCustomSelects();
});

document.addEventListener("click", (e) => {
  if (!openPicker) return;
  const menu = getMenu(openPicker);
  if (openPicker.contains(e.target) || menu?.contains(e.target)) return;
  closeAllCustomSelects();
});
