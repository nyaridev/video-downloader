import { $ } from "./dom.js";

function concurrencySliderColors(hovered) {
  return hovered
    ? {
        fill: "var(--slider-fill-hover, var(--accent-hover))",
        idle: "var(--slider-idle-hover, var(--surface-hover))",
      }
    : {
        fill: "var(--slider-fill, var(--accent))",
        idle: "var(--slider-idle, var(--mode-idle))",
      };
}

export function paintConcurrencySlider(slider, value, { hovered } = {}) {
  const wrap = slider?.closest(".concurrency-slider-wrap");
  const rail = wrap?.querySelector(".concurrency-slider-rail");
  if (!rail) return;
  const min = Number(slider.min) || 1;
  const max = Number(slider.max) || 100;
  const pct = ((Number(value) - min) / (max - min)) * 100;
  const isHovered = hovered ?? wrap.matches(":hover");
  const { fill, idle } = concurrencySliderColors(isHovered);
  rail.style.background = `linear-gradient(to right, ${fill} ${pct}%, ${idle} ${pct}%)`;
}

export function bindConcurrencySliderVisual() {
  const slider = $("concurrencySlider");
  const wrap = slider?.closest(".concurrency-slider-wrap");
  if (!slider || !wrap || wrap.dataset.sliderVisualInit) return;
  wrap.dataset.sliderVisualInit = "1";

  const paint = () => paintConcurrencySlider(slider, slider.value);

  slider.addEventListener("input", paint);
  wrap.addEventListener("mouseenter", () => paintConcurrencySlider(slider, slider.value, { hovered: true }));
  wrap.addEventListener("mouseleave", () => paintConcurrencySlider(slider, slider.value, { hovered: false }));
  paint();
}
