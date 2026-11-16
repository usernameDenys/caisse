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
const lightCustom = document.getElementById("light-custom");
const colorRalEl = document.getElementById("color-ral");
const colorNameEl = document.getElementById("color-name");

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

/** Merge `patch` into the configuration and update UI, 3D model and URL. */
export function setConfig(patch) {
  const prev = state.config;
  const next = { ...prev, ...patch };
  next.color = next.color.toUpperCase();
  next.light = next.light.toUpperCase();
  state.config = next;

  syncUI();
  applyToModel({ mirrorChanged: prev.mirror !== next.mirror, animate: true });

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
  const text = (buttons, attr) =>
    buttons.find((b) => b.dataset[attr] === c[attr])?.textContent.trim() ?? "—";

  const ral = ralForHex(c.color);
  const colorLabel = ral ? `RAL ${ral} — ${t.ral[ral]}` : `${l.custom} — ${c.color}`;
  const lightName = t.lights[c.light.slice(1)];
  const lightLabel = lightName ?? `${l.custom} — ${c.light}`;

  return [
    { key: "product", label: l.product, value: l.productValue },
    { key: "mirror", label: l.mirror, value: text(mirrorBtns, "mirror") },
    { key: "belt", label: l.belt, value: text(beltBtns, "belt") },
    { key: "tray", label: l.tray, value: text(trayBtns, "tray") },
    { key: "color", label: l.color, value: colorLabel, swatch: c.color },
    { key: "light", label: l.light, value: lightLabel, swatch: c.light },
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
  lightCustom.value = c.light.toLowerCase();

  const ral = ralForHex(c.color);
  colorRalEl.textContent = ral ?? "—";
  colorNameEl.textContent = ral ? t.ral[ral] : t.devis.labels.custom;
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
lightCustom.addEventListener("input", (e) => setConfig({ light: e.target.value }));

// ── Init from URL ────────────────────────────────────────────────────────
state.config = { ...DEFAULT_CONFIG, ...readConfigFromUrl() };
syncUI();
writeConfigToUrl(state.config);
