import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

export const wrap = document.getElementById("canvas-wrap");

const BACKGROUND = new THREE.Color(0xf0f0f0);
export const scene = new THREE.Scene();
scene.background = BACKGROUND;

export const camera = new THREE.PerspectiveCamera(
  45,
  wrap.clientWidth / wrap.clientHeight,
  0.1,
  1000
);
camera.position.set(-3, 1.5, -3);
camera.lookAt(0, 0, 0);

// Above 2× the extra pixels are invisible but cost 2–4× the GPU work on phones
const MAX_PIXEL_RATIO = 2;

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.setSize(wrap.clientWidth, wrap.clientHeight);
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
wrap.appendChild(renderer.domElement);

export const ctrls = new OrbitControls(camera, renderer.domElement);
ctrls.enableDamping = true;
ctrls.maxPolarAngle = Math.PI / 2;
ctrls.minDistance = 1.5;
ctrls.maxTargetRadius = 1.0;

// ── Render on demand ──────────────────────────────────────────────────────
// Frames are drawn only when something changes (controls, config, resize,
// camera animation) instead of 60×/s, so an idle page costs ~0 GPU/battery.
const beforeRenderHooks = [];
export const onBeforeRender = (fn) => beforeRenderHooks.push(fn);

let renderRequested = false;
let cameraTween = null;

function render(now) {
  renderRequested = false;
  if (cameraTween) stepCameraTween(now);
  // With damping, update() keeps emitting "change" until the motion settles
  ctrls.update();
  beforeRenderHooks.forEach((fn) => fn());
  renderer.render(scene, camera);
}

export function requestRender() {
  if (renderRequested) return;
  renderRequested = true;
  requestAnimationFrame(render);
}

ctrls.addEventListener("change", requestRender);

// ── Resize (observe the container, not the window) ───────────────────────
let fitModel = null;
new ResizeObserver(() => {
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (fitModel && !cameraTween) fitCameraToModel(fitModel);
  requestRender();
}).observe(wrap);

// ── Environment HDRI ─────────────────────────────────────────────────────
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

new HDRLoader().load(
  "/assets/studio.hdr",
  (hdr) => {
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pmrem.dispose();
    requestRender();
  },
  undefined,
  () => pmrem.dispose()
);

// ── Lights ───────────────────────────────────────────────────────────────
const lights = [
  { color: 0xffffff, intensity: 2.5, pos: [4, 6, 4] },
  { color: 0xc8d8ff, intensity: 1.0, pos: [-4, 3, 2] },
  { color: 0xffffff, intensity: 1.2, pos: [0, 4, -5] },
  { color: 0xffeedd, intensity: 0.5, pos: [0, -4, 0] },
];

lights.forEach(({ color, intensity, pos }) => {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(...pos);
  scene.add(light);
});

// ── Camera framing ───────────────────────────────────────────────────────
function fitDistance(model, cam) {
  const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
  const vFov = THREE.MathUtils.degToRad(cam.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * cam.aspect);
  return Math.max(sphere.radius / Math.tan(vFov / 2), sphere.radius / Math.tan(hFov / 2)) * 1.15;
}

/** Position on the ray through `direction` at which `model` fits the viewport. */
export function fitPosition(model, direction, cam = camera) {
  return direction.clone().normalize().multiplyScalar(fitDistance(model, cam));
}

export function fitCameraToModel(model) {
  fitModel = model;
  camera.position.copy(fitPosition(model, camera.position));
  ctrls.update();
  requestRender();
}

// ── Smooth camera transitions ────────────────────────────────────────────
// Interpolates in spherical coordinates so the camera orbits around the
// model instead of cutting straight through it.
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

export function animateCameraTo(position, target = new THREE.Vector3(), duration = 900) {
  if (prefersReducedMotion.matches) {
    camera.position.copy(position);
    ctrls.target.copy(target);
    cameraTween = null;
    ctrls.update();
    requestRender();
    return;
  }
  const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(ctrls.target));
  const to = new THREE.Spherical().setFromVector3(position.clone().sub(target));
  // Take the short way around
  let dTheta = to.theta - from.theta;
  dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));

  cameraTween = {
    start: performance.now(),
    duration,
    from,
    dTheta,
    to,
    fromTarget: ctrls.target.clone(),
    toTarget: target.clone(),
  };
  ctrls.enabled = false;
  requestRender();
}

function stepCameraTween(now) {
  const tw = cameraTween;
  const t = Math.min(1, (now - tw.start) / tw.duration);
  const k = easeInOutCubic(t);
  const s = new THREE.Spherical(
    THREE.MathUtils.lerp(tw.from.radius, tw.to.radius, k),
    THREE.MathUtils.lerp(tw.from.phi, tw.to.phi, k),
    tw.from.theta + tw.dTheta * k
  );
  ctrls.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
  camera.position.setFromSpherical(s).add(ctrls.target);
  if (t < 1) {
    requestRender();
  } else {
    cameraTween = null;
    ctrls.enabled = true;
  }
}

// ── Still image for the PDF ──────────────────────────────────────────────
/**
 * Renders a product shot from `direction` at a fixed size and returns a JPEG
 * data URL. Independent of the user's current view and canvas size.
 */
export function captureImage(model, direction, width = 1600, height = 1000) {
  const shotCam = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
  shotCam.position.copy(fitPosition(model, direction, shotCam).multiplyScalar(0.92));
  shotCam.lookAt(0, 0, 0);

  const prevSize = renderer.getSize(new THREE.Vector2());
  const prevRatio = renderer.getPixelRatio();
  scene.background = new THREE.Color(0xffffff);
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.render(scene, shotCam);
  // Read pixels in the same task as render(): no preserveDrawingBuffer needed
  const dataUrl = renderer.domElement.toDataURL("image/jpeg", 0.88);

  scene.background = BACKGROUND;
  renderer.setPixelRatio(prevRatio);
  renderer.setSize(prevSize.x, prevSize.y, false);
  requestRender();
  return dataUrl;
}
