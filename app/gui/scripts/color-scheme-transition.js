/** Smooth light/dark transitions (theme mode only — not full theme swaps). */

export const COLOR_SCHEME_TRANSITION_MS = 3500;

function fadeOverlayTransition(apply) {
  const overlay = document.createElement("div");
  overlay.className = "color-scheme-overlay";
  overlay.setAttribute("aria-hidden", "true");
  document.body.appendChild(overlay);

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      overlay.classList.add("is-active");
      window.setTimeout(() => {
        apply();
        overlay.classList.remove("is-active");
        window.setTimeout(() => {
          overlay.remove();
          resolve();
        }, COLOR_SCHEME_TRANSITION_MS / 2);
      }, COLOR_SCHEME_TRANSITION_MS / 2);
    });
  });
}

/** Run `apply` with a cross-fade; resolves when the transition finishes. */
export function runColorSchemeTransition(apply, { useViewTransition = true } = {}) {
  if (useViewTransition && typeof document.startViewTransition === "function") {
    try {
      const transition = document.startViewTransition(() => {
        apply();
      });
      return transition.finished.catch(() => fadeOverlayTransition(apply));
    } catch {
      return fadeOverlayTransition(apply);
    }
  }
  return fadeOverlayTransition(apply);
}
