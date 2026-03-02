import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

const wrap = document.getElementById("canvas-wrap");
const loader_el = document.getElementById("loader");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

const camera = new THREE.PerspectiveCamera(
  45,
  wrap.clientWidth / wrap.clientHeight,
  0.1,
  1000
);
camera.position.set(3, 1, 3.5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(wrap.clientWidth, wrap.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
wrap.appendChild(renderer.domElement);

const ctrls = new OrbitControls(camera, renderer.domElement);
ctrls.enableDamping = true;

const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

new HDRLoader().load(
  "./assets/studio.hdr",
  (hdr) => {
    const envMap = pmrem.fromEquirectangular(hdr).texture;
    scene.environment = envMap;
    hdr.dispose();
    pmrem.dispose();
  },
  undefined,
  () => {
    pmrem.dispose();
  }
);

function fitCameraToModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  const r = sphere.radius;

  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);

  const dist = Math.max(r / Math.tan(vFov / 2), r / Math.tan(hFov / 2)) * 1.15;

  const dir = camera.position.clone().normalize();
  camera.position.copy(dir.multiplyScalar(dist));
  ctrls.update();
}

// ── Hotspots ────────────────────────────────────────────────────────────────
// Shift+click on the model logs coordinates to the console so you can
// copy them here as new hotspot entries.
const HOTSPOTS = [
  {
    id: "conveyor",
    label: "Tapis convoyeur",
    title: "Bande transporteuse",
    content:
      "Bande caoutchouc avec réglage par vis avant. Marche avant ou arrière, possibilité de commande pédale.",
    position: new THREE.Vector3(0.329, -0.129, -1.168),
  },
  {
    id: "motor",
    label: "Motorisation",
    title: "Moteur 220 V EU",
    content:
      "Moteur monophasé 220 V normes EU. Boîtier de commande avec fonction lanterneau 2 couleurs.",
    position: new THREE.Vector3(0.169, -0.35, -0.193),
  },
  {
    id: "bac",
    label: "Bac arrière",
    title: "Bac inox",
    content:
      "Bac arrière en inox pour nettoyage rapide et évacuation rapide des articles.",
    position: new THREE.Vector3(0.066, -0.15, 1.111),
  },
  {
    id: "protection",
    label: "Protection caissier",
    title: "Écran de protection",
    content:
      "Protection du personnel en plexiglas transparent. Fixation rigide sur la base de la caisse pour une stabilité optimale.",
    position: new THREE.Vector3(0.65, 0.726, 0.241),
  },
];

// Popup elements
const popup = document.getElementById("popup");
const popupLabel = document.getElementById("popup-label");
const popupTitle = document.getElementById("popup-title");
const popupContent = document.getElementById("popup-content");
const popupClose = document.getElementById("popup-close");

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

function hidePopup() {
  popup.hidden = true;
  if (activePin) activePin.classList.remove("active");
  activePin = null;
}

popupClose.addEventListener("click", hidePopup);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hidePopup();
});

function createHotspotPins() {
  HOTSPOTS.forEach((hs) => {
    const pin = document.createElement("button");
    pin.className = "hotspot-pin";
    pin.setAttribute("aria-label", hs.label);
    wrap.appendChild(pin);
    hs.el = pin;
    pin.addEventListener("click", (e) => {
      e.stopPropagation();
      if (activePin === pin) {
        hidePopup();
      } else {
        showPopup(hs, pin);
      }
    });
  });
}

function updateHotspotPositions() {
  HOTSPOTS.forEach((hs) => {
    if (!hs.el) return;
    const pos = hs.position.clone().project(camera);
    if (pos.z > 1) {
      hs.el.style.visibility = "hidden";
      return;
    }
    hs.el.style.visibility = "";
    const x = (pos.x * 0.5 + 0.5) * wrap.clientWidth;
    const y = (-pos.y * 0.5 + 0.5) * wrap.clientHeight;
    hs.el.style.left = `${x}px`;
    hs.el.style.top = `${y}px`;
  });
}

// Shift+click on canvas → logs 3D hit position for easy hotspot placement
const _raycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();
renderer.domElement.addEventListener("click", (e) => {
  if (!e.shiftKey || !loadedModel) return;
  const rect = renderer.domElement.getBoundingClientRect();
  _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_mouse, camera);
  const hits = _raycaster.intersectObject(loadedModel, true);
  if (hits.length > 0) {
    const p = hits[0].point;
    console.log(
      `📍 Hotspot position: new THREE.Vector3(${p.x.toFixed(3)}, ${p.y.toFixed(
        3
      )}, ${p.z.toFixed(3)})`
    );
  }
});
// ── End hotspots ─────────────────────────────────────────────────────────────

// ── Color picker ─────────────────────────────────────────────────────────────
const RAL_NAMES = {
  "7016": "Gris anthracite",
  "9016": "Blanc signalisation",
  "5010": "Bleu gentiane",
  "3020": "Rouge signalisation",
  "9005": "Noir foncé",
};

let bodyMaterial = null;

function applyColor(hex) {
  if (!bodyMaterial) return;
  bodyMaterial.color.set(hex);
}

const swatches = document.querySelectorAll(".swatch[data-color]");
const colorRalEl = document.getElementById("color-ral");
const colorNameEl = document.getElementById("color-name");
const colorCustom = document.getElementById("color-custom");

swatches.forEach((btn) => {
  btn.addEventListener("click", () => {
    swatches.forEach((s) => s.classList.remove("active"));
    btn.classList.add("active");
    const hex = btn.dataset.color;
    const ral = btn.dataset.ral;
    colorCustom.value = hex;
    colorRalEl.textContent = ral;
    colorNameEl.textContent = RAL_NAMES[ral] ?? "";
    applyColor(hex);
  });
});

colorCustom.addEventListener("input", (e) => {
  swatches.forEach((s) => s.classList.remove("active"));
  colorRalEl.textContent = "—";
  colorNameEl.textContent = "Personnalisé";
  applyColor(e.target.value);
});
// ── End color picker ──────────────────────────────────────────────────────────

let loadedModel = null;

const loader = new GLTFLoader();
loader.load(
  "./assets/Caisse-glb.glb",
  (gltf) => {
    loadedModel = gltf.scenes[0];
    const box = new THREE.Box3().setFromObject(loadedModel);
    const center = box.getCenter(new THREE.Vector3());
    loadedModel.position.sub(center);
    scene.add(loadedModel);
    fitCameraToModel(loadedModel);
    loader_el.classList.add("hidden");
    setTimeout(() => loader_el.remove(), 400);
    createHotspotPins();
    loadedModel.traverse((obj) => {
      if (obj.isMesh && obj.material?.name === "RAL_7016") {
        bodyMaterial = obj.material;
      }
    });
  },
  undefined,
  (error) => {
    console.error("Failed to load model:", error);
    loader_el.classList.add("hidden");
  }
);

// Key light
const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(4, 6, 4);
scene.add(keyLight);

// Fill light
const fillLight = new THREE.DirectionalLight(0xc8d8ff, 1.0);
fillLight.position.set(-4, 3, 2);
scene.add(fillLight);

// Back light
const backLight = new THREE.DirectionalLight(0xffffff, 1.2);
backLight.position.set(0, 4, -5);
scene.add(backLight);

// Bottom light
const bottomLight = new THREE.DirectionalLight(0xffeedd, 0.5);
bottomLight.position.set(0, -4, 0);
scene.add(bottomLight);

function animate() {
  requestAnimationFrame(animate);
  ctrls.update();
  updateHotspotPositions();
  renderer.render(scene, camera);
}

animate();

function handleWindowResize() {
  camera.aspect = wrap.clientWidth / wrap.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  if (loadedModel) fitCameraToModel(loadedModel);
}
window.addEventListener("resize", handleWindowResize, false);
