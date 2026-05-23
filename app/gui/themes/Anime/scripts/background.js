import { fetchRandomImageUrl } from "./nekos-api.js";

const ROTATE_MS = 15_000;
const FADE_MS = 3_500;
const RETRY_MS = 5_000;
const ROOT_ID = "animeBackground";

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(url);
    img.onerror = () => reject(new Error("Failed to load background image"));
    img.src = url;
  });
}

class AnimeBackgroundController {
  constructor() {
    this.root = null;
    this.layerA = null;
    this.layerB = null;
    this.activeIsA = true;
    this.rotateTimer = null;
    this.retryTimer = null;
    this.transitioning = false;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.mount();
    this.loadNextImage(false);
    this.rotateTimer = window.setInterval(() => {
      this.loadNextImage(true);
    }, ROTATE_MS);
  }

  stop() {
    this.running = false;
    if (this.rotateTimer) {
      window.clearInterval(this.rotateTimer);
      this.rotateTimer = null;
    }
    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.unmount();
  }

  mount() {
    if (this.root) return;

    this.root = document.createElement("div");
    this.root.id = ROOT_ID;
    this.root.className = "anime-background";
    this.root.setAttribute("aria-hidden", "true");

    this.layerA = document.createElement("img");
    this.layerA.className = "anime-background__layer anime-background__layer--a";
    this.layerA.alt = "";
    this.layerA.decoding = "async";

    this.layerB = document.createElement("img");
    this.layerB.className = "anime-background__layer anime-background__layer--b";
    this.layerB.alt = "";
    this.layerB.decoding = "async";

    const scrim = document.createElement("div");
    scrim.className = "anime-background__scrim";

    this.root.append(this.layerA, this.layerB, scrim);
    document.body.insertBefore(this.root, document.body.firstChild);
  }

  unmount() {
    this.root?.remove();
    this.root = null;
    this.layerA = null;
    this.layerB = null;
    this.activeIsA = true;
    this.transitioning = false;
  }

  scheduleRetry() {
    if (!this.running || this.retryTimer) return;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      this.loadNextImage(this.layerA?.classList.contains("is-visible") || this.layerB?.classList.contains("is-visible"));
    }, RETRY_MS);
  }

  getActiveLayer() {
    return this.activeIsA ? this.layerA : this.layerB;
  }

  getInactiveLayer() {
    return this.activeIsA ? this.layerB : this.layerA;
  }

  async loadNextImage(crossfade) {
    if (!this.running || this.transitioning) return;

    this.transitioning = true;
    try {
      const imageUrl = await fetchRandomImageUrl();
      await preloadImage(imageUrl);

      if (!this.running) return;

      const activeLayer = this.getActiveLayer();
      const inactiveLayer = this.getInactiveLayer();
      const hasVisibleLayer =
        this.layerA.classList.contains("is-visible") || this.layerB.classList.contains("is-visible");

      if (!crossfade || !hasVisibleLayer) {
        activeLayer.src = imageUrl;
        activeLayer.classList.add("is-visible");
        inactiveLayer.classList.remove("is-visible");
        inactiveLayer.removeAttribute("src");
      } else {
        inactiveLayer.src = imageUrl;
        inactiveLayer.classList.add("is-visible");
        activeLayer.classList.remove("is-visible");
        this.activeIsA = !this.activeIsA;
        window.setTimeout(() => {
          if (!this.running) return;
          const hiddenLayer = this.getInactiveLayer();
          hiddenLayer.removeAttribute("src");
        }, FADE_MS + 100);
      }
    } catch {
      this.scheduleRetry();
    } finally {
      this.transitioning = false;
    }
  }
}

const controller = new AnimeBackgroundController();

export function startAnimeTheme() {
  if (window.pywebview?.api) {
    controller.start();
    return;
  }
  window.addEventListener("pywebviewready", () => controller.start(), { once: true });
}

export function stopAnimeTheme() {
  controller.stop();
}
