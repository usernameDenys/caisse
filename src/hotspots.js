import * as THREE from "three";
import { camera, renderer, wrap } from "./scene.js";
import { state } from "./state.js";
import { t } from "./i18n.js";

const HOTSPOT_POSITIONS = [
  {
    id: "conveyor",
    position: new THREE.Vector3(-0.361, -0.129, 0.398),
    positionLeft: new THREE.Vector3(-0.341, -0.129, 0.254),
  },
  {
    id: "motor",
    position: new THREE.Vector3(-0.302, -0.635, 0.189),
    positionLeft: new THREE.Vector3(-0.19, -0.438, 0.269),
  },
  {
    id: "bac",
    position: new THREE.Vector3(-0.446, -0.138, -0.975),
    positionLeft: new THREE.Vector3(0.865, -0.129, 0.33),
  },
  {
    id: "protection",
    position: new THREE.Vector3(-0.648, 0.617, -0.223),
    positionLeft: new THREE.Vector3(0.236, 0.612, 0.648),
  },
];

const HOTSPOTS = t.hotspots.map((hs, i) => ({
  ...hs,
  ...HOTSPOT_POSITIONS[i],
}));

const popup = document.getElementById("popup");
const popupLabel = document.getElementById("popup-label");
const popupTitle = document.getElementById("popup-title");
const popupContent = document.getElementById("popup-content");
document.getElementById("popup-close").addEventListener("click", hidePopup);

let activePin = null;

function showPopup(hs, pinEl) {
  if (activePin) activePin.classList.remove("active");
  activePin = pinEl;
  pinEl.classList.add("active");
  popupLabel.textContent = hs.label;
  popupTitle.textContent = hs.title;
  popupContent.textContent = hs.content;
  popup.hidden = false;
}

export function hidePopup() {
  popup.hidden = true;
  if (activePin) activePin.classList.remove("active");
  activePin = null;
}

export function initHotspots() {
  HOTSPOTS.forEach((hs) => {
    const pin = document.createElement("button");
    pin.className = "hotspot-pin";
    pin.setAttribute("aria-label", hs.label);
    wrap.appendChild(pin);
    hs.el = pin;
    pin.addEventListener("click", (e) => {
      e.stopPropagation();
      if (activePin === pin) hidePopup();
      else showPopup(hs, pin);
    });
  });

  // test Vector3 position
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  renderer.domElement.addEventListener("click", (e) => {
    if (!e.shiftKey || !state.loadedModel) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(state.loadedModel, true);
    if (hits.length > 0) {
      const p = hits[0].point;
      console.log(
        `📍 new THREE.Vector3(${p.x.toFixed(3)}, ${p.y.toFixed(
          3
        )}, ${p.z.toFixed(3)})`
      );
    }
  });
}

export function updateHotspotPositions() {
  HOTSPOTS.forEach((hs) => {
    if (!hs.el) return;
    const pos3d =
      state.isMirroredLeft && hs.positionLeft ? hs.positionLeft : hs.position;
    const pos = pos3d.clone().project(camera);
    if (pos.z > 1) {
      hs.el.style.visibility = "hidden";
      return;
    }
    hs.el.style.visibility = "";
    hs.el.style.left = `${(pos.x * 0.5 + 0.5) * wrap.clientWidth}px`;
    hs.el.style.top = `${(-pos.y * 0.5 + 0.5) * wrap.clientHeight}px`;
  });
}
