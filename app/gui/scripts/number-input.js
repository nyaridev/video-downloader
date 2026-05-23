function getLimits(input) {
  return {
    min: input.min !== "" ? Number(input.min) : -Infinity,
    max: input.max !== "" ? Number(input.max) : Infinity,
    step: input.step !== "" ? Number(input.step) : 1,
  };
}

function syncNumberInputButtons(wrapper) {
  const input = wrapper.querySelector('input[type="number"]');
  const up = wrapper.querySelector(".number-input-up");
  const down = wrapper.querySelector(".number-input-down");
  if (!input || !up || !down) return;

  const value = Number(input.value);
  const { min, max } = getLimits(input);
  up.disabled = !Number.isNaN(value) && value >= max;
  down.disabled = !Number.isNaN(value) && value <= min;
}

export function refreshNumberInputFor(input) {
  const wrapper = input?.closest(".number-input");
  if (wrapper) syncNumberInputButtons(wrapper);
}

export function initNumberInputs(root = document) {
  root.querySelectorAll(".number-input").forEach((wrapper) => {
    const input = wrapper.querySelector('input[type="number"]');
    const up = wrapper.querySelector(".number-input-up");
    const down = wrapper.querySelector(".number-input-down");
    if (!input || !up || !down || wrapper.dataset.numberInputInit) return;
    wrapper.dataset.numberInputInit = "1";

    const bump = (direction) => {
      const { min, max, step } = getLimits(input);
      let value = parseFloat(input.value);
      if (Number.isNaN(value)) value = min === -Infinity ? 0 : min;
      value = Math.min(max, Math.max(min, value + direction * step));
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      syncNumberInputButtons(wrapper);
    };

    up.addEventListener("click", () => bump(1));
    down.addEventListener("click", () => bump(-1));
    input.addEventListener("input", () => syncNumberInputButtons(wrapper));
    input.addEventListener("blur", () => syncNumberInputButtons(wrapper));

    const slider = document.getElementById("concurrencySlider");
    if (input.id === "concurrencyInput" && slider) {
      slider.addEventListener("input", () => syncNumberInputButtons(wrapper));
    }

    syncNumberInputButtons(wrapper);
  });
}
