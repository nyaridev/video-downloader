const OPEN_CLASS = "open";
let openPicker = null;

function closePicker(wrap) {
  if (!wrap) return;
  wrap.classList.remove(OPEN_CLASS);
  const menu = wrap.querySelector(".custom-select-menu");
  const trigger = wrap.querySelector(".custom-select-trigger");
  if (menu) menu.hidden = true;
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
  const menu = wrap.querySelector(".custom-select-menu");
  if (!trigger || !menu) return;
  if (select?.disabled) return;

  if (openPicker && openPicker !== wrap) closePicker(openPicker);

  wrap.classList.add(OPEN_CLASS);
  menu.hidden = false;
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
  const menu = wrap.querySelector(".custom-select-menu");
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
  if (!openPicker.contains(e.target)) closeAllCustomSelects();
});
