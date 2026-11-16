import { onBeforeRender, requestRender } from "./scene.js";
import { loadModel } from "./model.js";
import { initHotspots, updateHotspotPositions, hidePopup } from "./hotspots.js";
import { onModelLoaded } from "./configurator.js";
import "./devis.js";
import "./actions.js";
import "./ui.js";

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hidePopup();
});

// ── Load model with progress ──────────────────────────────────────────────
const loaderEl = document.getElementById("loader");
const loaderBar = document.getElementById("loader-bar");
const loaderPct = document.getElementById("loader-pct");
const progressEl = loaderEl.querySelector("[role=progressbar]");

loadModel({
  onProgress(ratio) {
    if (ratio === null) {
      loaderEl.classList.add("indeterminate");
      return;
    }
    const pct = Math.round(ratio * 100);
    loaderBar.style.transform = `scaleX(${ratio})`;
    loaderPct.textContent = `${pct}%`;
    progressEl.setAttribute("aria-valuenow", String(pct));
  },
  onLoad() {
    onModelLoaded();
    initHotspots();
    loaderEl.classList.add("hidden");
    setTimeout(() => loaderEl.remove(), 400);
  },
  onError() {
    loaderEl.classList.add("hidden");
  },
});

onBeforeRender(updateHotspotPositions);
requestRender();

// ── Cookie banner ──────────────────────────────────────────────────────────
const cookieBanner = document.getElementById("cookie-banner");
if (!localStorage.getItem("cookie-notice-accepted")) {
  cookieBanner.hidden = false;
}
document.getElementById("cookie-accept").addEventListener("click", () => {
  localStorage.setItem("cookie-notice-accepted", "1");
  cookieBanner.hidden = true;
});
