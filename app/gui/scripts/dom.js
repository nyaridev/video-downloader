import { syncCustomSelect } from "./custom-select.js";

export const $ = (id) => document.getElementById(id);

export function fillSelect(select, options, { labelFn } = {}) {
  if (!select) return;
  select.innerHTML = "";
  options.forEach((opt) => {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = labelFn ? labelFn(opt) : opt;
    select.appendChild(o);
  });
  syncCustomSelect(select);
}
