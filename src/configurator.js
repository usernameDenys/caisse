import * as THREE from "three";
import { camera, ctrls } from "./scene.js";
import { fitCameraToModel } from "./scene.js";
import { state } from "./state.js";
import { setBelt, setTray } from "./model.js";

//Helpers
function setActiveBtn(group, active) {
  group.forEach((b) => {
    b.classList.remove("active");
    b.setAttribute("aria-pressed", "false");
  });
  active.classList.add("active");
  active.setAttribute("aria-pressed", "true");
}

//Body colour
const RAL_NAMES = {
  7016: "Gris anthracite",
  9016: "Blanc signalisation",
  5010: "Bleu gentiane",
  3020: "Rouge signalisation",
  9005: "Noir foncé",
};

const bodySwatches = [
  ...document.querySelectorAll(".swatch:not(.swatch-light)[data-color]"),
];
const colorRalEl = document.getElementById("color-ral");
const colorNameEl = document.getElementById("color-name");
const colorCustom = document.getElementById("color-custom");

bodySwatches.forEach((btn) => {
  btn.addEventListener("click", () => {
    setActiveBtn(bodySwatches, btn);
    const { color: hex, ral } = btn.dataset;
    colorCustom.value = hex;
    colorRalEl.textContent = ral;
    colorNameEl.textContent = RAL_NAMES[ral] ?? "";
    if (state.bodyMaterial) state.bodyMaterial.color.set(hex);
  });
});

colorCustom.addEventListener("input", (e) => {
  bodySwatches.forEach((s) => {
    s.classList.remove("active");
    s.setAttribute("aria-pressed", "false");
  });
  colorRalEl.textContent = "—";
  colorNameEl.textContent = "Personnalisé";
  if (state.bodyMaterial) state.bodyMaterial.color.set(e.target.value);
});

//Emissive light colour
const lightSwatches = [
  ...document.querySelectorAll(".swatch-light[data-color]"),
];
const lightCustom = document.getElementById("light-custom");

function applyLightColor(hex) {
  if (!state.emissiveMaterial) return;
  state.emissiveMaterial.color.set(hex);
  state.emissiveMaterial.emissive.set(hex);
}

lightSwatches.forEach((btn) => {
  btn.addEventListener("click", () => {
    setActiveBtn(lightSwatches, btn);
    lightCustom.value = btn.dataset.color;
    applyLightColor(btn.dataset.color);
  });
});

lightCustom.addEventListener("input", (e) => {
  lightSwatches.forEach((s) => {
    s.classList.remove("active");
    s.setAttribute("aria-pressed", "false");
  });
  applyLightColor(e.target.value);
});

//Mirror
const mirrorBtns = [...document.querySelectorAll(".opt-btn[data-mirror]")];

mirrorBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    setActiveBtn(mirrorBtns, btn);
    const isLeft = btn.dataset.mirror === "left";
    state.isMirroredLeft = isLeft;

    if (state.loadedModel) {
      state.loadedModel.scale.x = isLeft ? -1 : 1;
      state.loadedModel.rotation.y = isLeft ? Math.PI * 1.5 : 0;
      state.loadedModel.position.set(0, 0, 0);
      state.loadedModel.updateMatrixWorld();

      const center = new THREE.Box3()
        .setFromObject(state.loadedModel)
        .getCenter(new THREE.Vector3());
      state.loadedModel.position.sub(center);

      state.loadedModel.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          mats.forEach((m) => (m.side = THREE.DoubleSide));
        }
      });
    }

    camera.position.set(
      isLeft ? 3.844 : -3,
      isLeft ? 1.847 : 1.5,
      isLeft ? 3.667 : -3
    );
    ctrls.target.set(0, 0, 0);
    ctrls.update();
    if (state.loadedModel) fitCameraToModel(state.loadedModel);
  });
});

//Belt
const beltBtns = [...document.querySelectorAll(".opt-btn[data-belt]")];

beltBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    setActiveBtn(beltBtns, btn);
    setBelt(btn.dataset.belt);
  });
});

//Tray
const trayBtns = [...document.querySelectorAll(".opt-btn[data-tray]")];

trayBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    setActiveBtn(trayBtns, btn);
    setTray(btn.dataset.tray);
  });
});
