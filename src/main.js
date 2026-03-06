import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

const wrap = document.getElementById("canvas-wrap");
const loader_el = document.getElementById("loader");

document.querySelectorAll(".accordion-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const expanded = btn.getAttribute("aria-expanded") === "true";
    const body = document.getElementById(btn.getAttribute("aria-controls"));
    btn.setAttribute("aria-expanded", String(!expanded));
    body.hidden = expanded;
  });
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

const camera = new THREE.PerspectiveCamera(
  45,
  wrap.clientWidth / wrap.clientHeight,
  0.1,
  1000
);
camera.position.set(-3, 1.5, -3);
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
ctrls.maxPolarAngle = Math.PI / 2;

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

//Hotspots
const HOTSPOTS = [
  {
    id: "conveyor",
    label: "Tapis convoyeur",
    title: "Bande transporteuse",
    content:
      "Bande caoutchouc avec réglage par vis avant. Marche avant ou arrière, possibilité de commande pédale.",
    position: new THREE.Vector3(-0.361, -0.129, 0.398),
    positionLeft: new THREE.Vector3(-0.341, -0.129, 0.254),
  },
  {
    id: "motor",
    label: "Motorisation",
    title: "Moteur 220 V EU",
    content:
      "Moteur monophasé 220 V normes EU. Boîtier de commande avec fonction lanterneau 2 couleurs.",
    position: new THREE.Vector3(-0.302, -0.635, 0.189),
    positionLeft: new THREE.Vector3(-0.190, -0.438, 0.269),
  },
  {
    id: "bac",
    label: "Bac arrière",
    title: "Bac inox",
    content:
      "Bac arrière en inox pour nettoyage rapide et évacuation rapide des articles.",
    position: new THREE.Vector3(-0.446, -0.138, -0.975),
    positionLeft: new THREE.Vector3(0.865, -0.129, 0.330),
  },
  {
    id: "protection",
    label: "Protection caissier",
    title: "Écran de protection",
    content:
      "Protection du personnel en plexiglas transparent. Fixation rigide sur la base de la caisse pour une stabilité optimale.",
    position: new THREE.Vector3(-0.648, 0.617, -0.223),
    positionLeft: new THREE.Vector3(0.236, 0.612, 0.648),
  },
];

// Popup elements
const popup = document.getElementById("popup");
const popupLabel = document.getElementById("popup-label");
const popupTitle = document.getElementById("popup-title");
const popupContent = document.getElementById("popup-content");
const popupClose = document.getElementById("popup-close");

let activePin = null;
let isMirroredLeft = false;

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
  if (e.key === "c" || e.key === "C") {
    const p = camera.position;
    console.log(`📷 camera.position.set(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`);
  }
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
    const activePos = (isMirroredLeft && hs.positionLeft) ? hs.positionLeft : hs.position;
    const pos = activePos.clone().project(camera);
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

// Color picker
const RAL_NAMES = {
  7016: "Gris anthracite",
  9016: "Blanc signalisation",
  5010: "Bleu gentiane",
  3020: "Rouge signalisation",
  9005: "Noir foncé",
};

let bodyMaterial = null;

function applyBodyColor(hex) {
  if (!bodyMaterial) return;
  bodyMaterial.color.set(hex);
}

const bodySwatches = document.querySelectorAll(
  ".swatch:not(.swatch-light)[data-color]"
);
const colorRalEl = document.getElementById("color-ral");
const colorNameEl = document.getElementById("color-name");
const colorCustom = document.getElementById("color-custom");

bodySwatches.forEach((btn) => {
  btn.addEventListener("click", () => {
    bodySwatches.forEach((s) => s.classList.remove("active"));
    btn.classList.add("active");
    const hex = btn.dataset.color;
    const ral = btn.dataset.ral;
    colorCustom.value = hex;
    colorRalEl.textContent = ral;
    colorNameEl.textContent = RAL_NAMES[ral] ?? "";
    applyBodyColor(hex);
  });
});

colorCustom.addEventListener("input", (e) => {
  bodySwatches.forEach((s) => s.classList.remove("active"));
  colorRalEl.textContent = "—";
  colorNameEl.textContent = "Personnalisé";
  applyBodyColor(e.target.value);
});

// Color picker — emissive light
let emissiveMaterial = null;

function applyLightColor(hex) {
  if (!emissiveMaterial) return;
  emissiveMaterial.color.set(hex);
  emissiveMaterial.emissive.set(hex);
}

const lightSwatches = document.querySelectorAll(".swatch-light[data-color]");
const lightCustom = document.getElementById("light-custom");

lightSwatches.forEach((btn) => {
  btn.addEventListener("click", () => {
    lightSwatches.forEach((s) => s.classList.remove("active"));
    btn.classList.add("active");
    lightCustom.value = btn.dataset.color;
    applyLightColor(btn.dataset.color);
  });
});

lightCustom.addEventListener("input", (e) => {
  lightSwatches.forEach((s) => s.classList.remove("active"));
  applyLightColor(e.target.value);
});

// Mirror
document.querySelectorAll(".opt-btn[data-mirror]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".opt-btn[data-mirror]")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const isLeft = btn.dataset.mirror === "left";
    isMirroredLeft = isLeft;
    if (loadedModel) {
      loadedModel.scale.x = isLeft ? -1 : 1;
      loadedModel.rotation.y = isLeft ? Math.PI * 1.5 : 0;
      loadedModel.position.set(0, 0, 0);
      loadedModel.updateMatrixWorld();
      const mirrorBox = new THREE.Box3().setFromObject(loadedModel);
      const mirrorCenter = mirrorBox.getCenter(new THREE.Vector3());
      loadedModel.position.sub(mirrorCenter);
      loadedModel.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          mats.forEach((m) => {
            m.side = THREE.DoubleSide;
          });
        }
      });
    }
    if (isLeft) {
      camera.position.set(3.844, 1.847, 3.667);
    } else {
      camera.position.set(-3, 1.5, -3);
    }
    ctrls.target.set(0, 0, 0);
    ctrls.update();
    if (loadedModel) fitCameraToModel(loadedModel);
  });
});

// Group switching
const BELT_GROUPS = ["Group_Belt_L", "Group_Belt_M", "Group_Belt_S"];
const TRAY_GROUPS = [
  "Group_Tray_700_L",
  "Group_Tray_700_M",
  "Group_Tray_1250_L",
];
const sceneGroups = {};

function setBelt(size) {
  BELT_GROUPS.forEach((name) => {
    if (sceneGroups[name])
      sceneGroups[name].visible = name === `Group_Belt_${size}`;
  });
}

function setTray(name) {
  TRAY_GROUPS.forEach((n) => {
    if (sceneGroups[n]) sceneGroups[n].visible = n === `Group_Tray_${name}`;
  });
}

document.querySelectorAll(".opt-btn[data-belt]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".opt-btn[data-belt]")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    setBelt(btn.dataset.belt);
  });
});

document.querySelectorAll(".opt-btn[data-tray]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".opt-btn[data-tray]")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    setTray(btn.dataset.tray);
  });
});

let loadedModel = null;

const loader = new GLTFLoader();
loader.load(
  "./assets/Caisse3js.glb",
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
      if (
        obj.name &&
        (BELT_GROUPS.includes(obj.name) || TRAY_GROUPS.includes(obj.name))
      ) {
        sceneGroups[obj.name] = obj;
        obj.visible = false;
      }
      if (!obj.isMesh) return;
      if (obj.material?.name === "RAL_7016") bodyMaterial = obj.material;
      if (obj.material?.name === "Emissive") emissiveMaterial = obj.material;
    });
    setBelt("L");
    setTray("1250_L");
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
