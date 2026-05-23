export const $ = (id) => document.getElementById(id);

export function fillSelect(select, options) {
  select.innerHTML = "";
  options.forEach((opt) => {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    select.appendChild(o);
  });
}
