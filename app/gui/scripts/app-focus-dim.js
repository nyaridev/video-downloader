/** Dim app chrome on anime theme: instant when unfocused, 3s after pointer leaves. */

const CURSOR_DIM_DELAY_MS = 3000;

let windowFocused = typeof document.hasFocus === "function" ? document.hasFocus() : true;
let pointerInside = true;
let syncFrame = null;
let cursorDimTimer = null;

function isAnimeTheme() {
  return document.documentElement.dataset.theme === "anime";
}

function setDimmed(dimmed) {
  document.documentElement.classList.toggle("app-inactive", dimmed);
}

function clearCursorDimTimer() {
  if (cursorDimTimer !== null) {
    clearTimeout(cursorDimTimer);
    cursorDimTimer = null;
  }
}

function startCursorDimTimer() {
  clearCursorDimTimer();
  cursorDimTimer = window.setTimeout(() => {
    cursorDimTimer = null;
    if (isAnimeTheme() && windowFocused && !pointerInside) {
      setDimmed(true);
    }
  }, CURSOR_DIM_DELAY_MS);
}

function applyDimState() {
  syncFrame = null;

  if (!isAnimeTheme()) {
    clearCursorDimTimer();
    setDimmed(false);
    return;
  }

  if (!windowFocused) {
    clearCursorDimTimer();
    setDimmed(true);
    return;
  }

  if (pointerInside) {
    clearCursorDimTimer();
    setDimmed(false);
    return;
  }

  // Focused with pointer outside — stay dimmed if already faded from cursor timeout.
  if (document.documentElement.classList.contains("app-inactive")) {
    return;
  }

  if (cursorDimTimer === null) {
    startCursorDimTimer();
  }
}

function scheduleSync() {
  if (syncFrame !== null) cancelAnimationFrame(syncFrame);
  syncFrame = requestAnimationFrame(applyDimState);
}

export function syncAppFocusDim() {
  if (syncFrame !== null) {
    cancelAnimationFrame(syncFrame);
    syncFrame = null;
  }
  applyDimState();
}

export function bindAppFocusDim() {
  window.addEventListener("focus", () => {
    windowFocused = true;
    if (isAnimeTheme() && !pointerInside) {
      setDimmed(false);
      startCursorDimTimer();
    }
    scheduleSync();
  });

  window.addEventListener("blur", () => {
    windowFocused = false;
    scheduleSync();
  });

  document.documentElement.addEventListener("mouseleave", () => {
    pointerInside = false;
    scheduleSync();
  });

  document.documentElement.addEventListener("mouseenter", () => {
    pointerInside = true;
    scheduleSync();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      windowFocused = false;
    } else if (document.hasFocus()) {
      windowFocused = true;
      if (isAnimeTheme() && !pointerInside) {
        setDimmed(false);
        startCursorDimTimer();
      }
    }
    scheduleSync();
  });

  syncAppFocusDim();
}
