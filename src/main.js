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
  renderer.render(scene, camera);
  ctrls.update();
}

animate();

function handleWindowResize() {
  camera.aspect = wrap.clientWidth / wrap.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  if (loadedModel) fitCameraToModel(loadedModel);
}
window.addEventListener("resize", handleWindowResize, false);
