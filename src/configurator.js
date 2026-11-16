import * as THREE from "three";
import { camera, ctrls, fitPosition, fitCameraToModel, animateCameraTo, requestRender } from "./scene.js";
import { state, DEFAULT_CONFIG } from "./state.js";
import { setBelt, setTray } from "./model.js";
import { t } from "./i18n.js";
import { readConfigFromUrl, writeConfigToUrl, ralForHex } from "./url-config.js";

/** Default camera direction for each checkout orientation. */
export const CAMERA_DIRECTIONS = {
  right: new THREE.Vector3(-3, 1.5, -3),
  left: new THREE.Vector3(3.844, 1.847, 3.667),
};

// ── DOM ──────────────────────────────────────────────────────────────────
const mirrorBtns = [...document.querySelectorAll(".opt-btn[data-mirror]")];
const beltBtns = [...document.querySelectorAll(".opt-btn[data-belt]")];
const trayBtns = [...document.querySelectorAll(".opt-btn[data-tray]")];
const bodySwatches = [...document.querySelectorAll(".swatch:not(.swatch-light)[data-color]")];
const lightSwatches = [...document.querySelectorAll(".swatch-light[data-color]")];
const colorCustom = document.getElementById("color-custom");
const lightCustom = document.getElementById("light-custom"); // optional
const otherRalBtn = colorCustom.closest(".swatch-other");
const colorRalEl = document.getElementById("color-ral");
const colorNameEl = document.getElementById("color-name");
const lightNameEl = document.getElementById("light-name");
const viewBtns = [...document.querySelectorAll(".view-btns [data-view]")];

function setPressed(buttons, isActive) {
  buttons.forEach((b) => {
    const on = isActive(b);
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
}

const sameHex = (a, b) => a.toUpperCase() === b.toUpperCase();

// ── Public API ───────────────────────────────────────────────────────────
let urlTimer;
const listeners = [];
/** Subscribe to configuration changes (also called once on init). */
export function onConfigChange(fn) {
  listeners.push(fn);
  fn(state.config);
}

/** Merge `patch` into the configuration and update UI, 3D model and URL. */
export function setConfig(patch) {
  const prev = state.config;
  const next = { ...prev, ...patch };
  next.color = next.color.toUpperCase();
  next.light = next.light.toUpperCase();
  state.config = next;

  syncUI();
  applyToModel({ mirrorChanged: prev.mirror !== next.mirror, animate: true });
  if (prev.mirror !== next.mirror) setPressed(viewBtns, (b) => b.dataset.view === "34");
  listeners.forEach((fn) => fn(state.config));

  // Debounced: colour pickers fire many events, and Safari throttles replaceState
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => writeConfigToUrl(state.config), 250);
}

/** Called once the GLB is in the scene. */
export function onModelLoaded() {
  applyToModel({ mirrorChanged: true, animate: false });
}

/** Human-readable summary of the current configuration (for quote + PDF). */
export function getSelectionSummary() {
  const c = state.config;
  const l = t.devis.labels;
  const text = (buttons, attr) => {
    const btn = buttons.find((b) => b.dataset[attr] === c[attr]);
    if (!btn) return "—";
    const label = btn.querySelector(".card-label");
    if (label) return label.textContent.trim();
    const value = btn.querySelector(".card-value")?.textContent.trim();
    const unit = btn.querySelector(".card-unit")?.textContent.trim();
    return value ? `${value} ${unit ?? ""}`.trim() : btn.textContent.trim();
  };
  // Swatch colour as shown in the UI (may differ from the 3D material tint)
  const display = (swatches, hex) =>
    swatches.find((b) => sameHex(b.dataset.color, hex))?.style.getPropertyValue("--c").trim() || hex;

  const ral = ralForHex(c.color);
  const colorLabel = ral ? `RAL ${ral} — ${t.ral[ral]}` : `${l.custom} — ${c.color}`;
  const lightName = t.lights[c.light.slice(1)];
  const lightLabel = lightName ?? `${l.custom} — ${c.light}`;

  return [
    { key: "product", label: l.product, value: l.productValue },
    { key: "mirror", label: l.mirror, value: text(mirrorBtns, "mirror") },
    { key: "belt", label: l.belt, value: text(beltBtns, "belt") },
    { key: "tray", label: l.tray, value: text(trayBtns, "tray") },
    { key: "color", label: l.color, value: colorLabel, swatch: c.color, display: display(bodySwatches, c.color) },
    { key: "light", label: l.light, value: lightLabel, swatch: c.light, display: display(lightSwatches, c.light) },
  ];
}

// ── UI ───────────────────────────────────────────────────────────────────
function syncUI() {
  const c = state.config;
  setPressed(mirrorBtns, (b) => b.dataset.mirror === c.mirror);
  setPressed(beltBtns, (b) => b.dataset.belt === c.belt);
  setPressed(trayBtns, (b) => b.dataset.tray === c.tray);
  setPressed(bodySwatches, (b) => sameHex(b.dataset.color, c.color));
  setPressed(lightSwatches, (b) => sameHex(b.dataset.color, c.light));

  colorCustom.value = c.color.toLowerCase();
  if (lightCustom) lightCustom.value = c.light.toLowerCase();

  const ral = ralForHex(c.color);
  colorRalEl.textContent = ral ?? "—";
  colorNameEl.textContent = ral ? t.ral[ral] : t.devis.labels.custom;
  otherRalBtn?.classList.toggle("active", !ral);
  if (lightNameEl) lightNameEl.textContent = t.lights[c.light.slice(1)] ?? `${t.devis.labels.custom} — ${c.light}`;
}

// ── Camera views ─────────────────────────────────────────────────────────
/**
 * Directions for the view buttons, derived from the model's footprint:
 * "front"/"back" look along the checkout's long axis, "side" across it,
 * each on the same side as the default 3/4 view.
 */
function viewDirection(view) {
  const model = state.loadedModel;
  const base = CAMERA_DIRECTIONS[state.config.mirror];
  if (view === "34" || !model) return base.clone();
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const longX = size.x >= size.z;
  const along = longX ? new THREE.Vector3(Math.sign(base.x) || 1, 0, 0) : new THREE.Vector3(0, 0, Math.sign(base.z) || 1);
  const across = longX ? new THREE.Vector3(0, 0, Math.sign(base.z) || 1) : new THREE.Vector3(Math.sign(base.x) || 1, 0, 0);
  const lift = new THREE.Vector3(0, 0.35, 0);
  if (view === "front") return along.add(lift);
  if (view === "back") return along.negate().add(lift);
  return across.add(lift); // side
}

export function setView(view) {
  if (!state.loadedModel) return;
  setPressed(viewBtns, (b) => b.dataset.view === view);
  animateCameraTo(fitPosition(state.loadedModel, viewDirection(view)));
}

// ── 3D ───────────────────────────────────────────────────────────────────
function applyToModel({ mirrorChanged, animate }) {
  const model = state.loadedModel;
  if (!model) return;
  const c = state.config;

  setBelt(c.belt);
  setTray(c.tray);
  state.bodyMaterial?.color.set(c.color);
  if (state.emissiveMaterial) {
    state.emissiveMaterial.color.set(c.light);
    state.emissiveMaterial.emissive.set(c.light);
  }

  if (mirrorChanged) {
    const isLeft = c.mirror === "left";
    model.scale.x = isLeft ? -1 : 1;
    model.rotation.y = isLeft ? Math.PI * 1.5 : 0;
    model.position.set(0, 0, 0);
    model.updateMatrixWorld();
    const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
    model.position.sub(center);

    const dir = CAMERA_DIRECTIONS[c.mirror];
    if (animate) {
      animateCameraTo(fitPosition(model, dir));
    } else {
      camera.position.copy(dir);
      ctrls.target.set(0, 0, 0);
      fitCameraToModel(model);
    }
  }
  requestRender();
}

// ── Events ───────────────────────────────────────────────────────────────
mirrorBtns.forEach((b) => b.addEventListener("click", () => setConfig({ mirror: b.dataset.mirror })));
beltBtns.forEach((b) => b.addEventListener("click", () => setConfig({ belt: b.dataset.belt })));
trayBtns.forEach((b) => b.addEventListener("click", () => setConfig({ tray: b.dataset.tray })));
bodySwatches.forEach((b) => b.addEventListener("click", () => setConfig({ color: b.dataset.color })));
lightSwatches.forEach((b) => b.addEventListener("click", () => setConfig({ light: b.dataset.color })));
colorCustom.addEventListener("input", (e) => setConfig({ color: e.target.value }));
lightCustom?.addEventListener("input", (e) => setConfig({ light: e.target.value }));
viewBtns.forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

// ── Init from URL ────────────────────────────────────────────────────────
state.config = { ...DEFAULT_CONFIG, ...readConfigFromUrl() };
syncUI();
writeConfigToUrl(state.config);
