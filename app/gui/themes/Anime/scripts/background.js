import { runColorSchemeTransition } from "../../../scripts/color-scheme-transition.js";
import { clearAdaptiveContrast, seedAnimeLightGlass, syncAdaptiveContrast } from "./contrast.js";
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

function waitForLayerImage(layer, url) {
  return new Promise((resolve, reject) => {
    const finish = () => {
      layer.removeEventListener("load", onLoad);
      layer.removeEventListener("error", onError);
      resolve();
    };
    const onLoad = () => finish();
    const onError = () => {
      layer.removeEventListener("load", onLoad);
      reject(new Error("Failed to load background layer"));
    };

    layer.addEventListener("load", onLoad);
    layer.addEventListener("error", onError, { once: true });
    layer.src = url;

    if (layer.complete && layer.naturalWidth) finish();
  });
}

class AnimeBackgroundController {
  constructor() {
    this.root = null;
    this.base = null;
    this.media = null;
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
    seedAnimeLightGlass();
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
    this.root.className = "anime-background anime-background--loading";
    this.root.setAttribute("aria-hidden", "true");

    this.base = document.createElement("div");
    this.base.className = "anime-background__base";

    this.layerA = document.createElement("img");
    this.layerA.className = "anime-background__layer anime-background__layer--a";
    this.layerA.alt = "";
    this.layerA.decoding = "async";

    this.layerB = document.createElement("img");
    this.layerB.className = "anime-background__layer anime-background__layer--b";
    this.layerB.alt = "";
    this.layerB.decoding = "async";

    this.media = document.createElement("div");
    this.media.className = "anime-background__media";

    const dim = document.createElement("div");
    dim.className = "anime-background__dim";

    const scrim = document.createElement("div");
    scrim.className = "anime-background__scrim";

    this.media.append(this.layerA, this.layerB);
    this.root.append(this.base, this.media, dim, scrim);
    document.body.insertBefore(this.root, document.body.firstChild);
  }

  finishBoot() {
    this.root?.classList.remove("anime-background--loading");
  }

  unmount() {
    clearAdaptiveContrast();
    this.root?.remove();
    this.root = null;
    this.base = null;
    this.media = null;
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

  hasVisibleLayer() {
    return (
      this.layerA?.classList.contains("is-visible") || this.layerB?.classList.contains("is-visible")
    );
  }

  async showImage(imageUrl, { crossfade = false, contrastInstant = false } = {}) {
    const activeLayer = this.getActiveLayer();
    const inactiveLayer = this.getInactiveLayer();
    const hasVisible = this.hasVisibleLayer();
    const instantReveal = !crossfade || !hasVisible;

    if (!crossfade || !hasVisible) {
      inactiveLayer.classList.remove("is-visible", "is-instant");
      inactiveLayer.removeAttribute("src");

      activeLayer.classList.remove("is-visible", "is-instant");
      await waitForLayerImage(activeLayer, imageUrl);

      if (!this.running) return;

      activeLayer.classList.add("is-visible");
      if (instantReveal) activeLayer.classList.add("is-instant");
      syncAdaptiveContrast(activeLayer, { instant: contrastInstant });
      this.finishBoot();

      if (instantReveal) {
        requestAnimationFrame(() => activeLayer.classList.remove("is-instant"));
      }
      return;
    }

    inactiveLayer.classList.remove("is-visible", "is-instant");
    await waitForLayerImage(inactiveLayer, imageUrl);

    if (!this.running) return;

    inactiveLayer.classList.add("is-visible");
    activeLayer.classList.remove("is-visible");
    this.activeIsA = !this.activeIsA;
    syncAdaptiveContrast(inactiveLayer, { instant: contrastInstant });
    this.finishBoot();
    window.setTimeout(() => {
      if (!this.running) return;
      this.getInactiveLayer().removeAttribute("src");
    }, FADE_MS + 100);
  }

  async loadNextImage(crossfade) {
    if (!this.running || this.transitioning) return;

    this.transitioning = true;
    try {
      const imageUrl = await fetchRandomImageUrl();
      await preloadImage(imageUrl);

      if (!this.running) return;

      await this.showImage(imageUrl, {
        crossfade: crossfade && this.hasVisibleLayer(),
        contrastInstant: !crossfade || !this.hasVisibleLayer(),
      });
    } catch {
      this.scheduleRetry();
    } finally {
      this.transitioning = false;
    }
  }

  /** Preload a scheme-tagged image, then crossfade UI + wallpaper together. */
  async transitionToColorScheme(colorScheme) {
    if (!this.running || this.transitioning) return;

    this.transitioning = true;
    try {
      const imageUrl = await fetchRandomImageUrl(colorScheme);
      await preloadImage(imageUrl);

      if (!this.running) return;

      const crossfade = this.hasVisibleLayer();
      const apply = async () => {
        document.documentElement.dataset.colorScheme = colorScheme;
        if (colorScheme === "light") seedAnimeLightGlass();
        await this.showImage(imageUrl, { crossfade, contrastInstant: false });
      };

      if (crossfade) {
        await runColorSchemeTransition(apply);
      } else {
        await apply();
      }
    } catch {
      document.documentElement.dataset.colorScheme = colorScheme;
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

export function refreshAnimeBackground() {
  if (!controller.running) return;
  controller.loadNextImage(controller.hasVisibleLayer());
}

export function resyncAnimeContrastFromDom({ instant = false } = {}) {
  const img = document.querySelector(".anime-background__layer.is-visible");
  if (img) syncAdaptiveContrast(img, { instant });
}

export function transitionAnimeColorScheme(colorScheme) {
  return controller.transitionToColorScheme(colorScheme);
}
