import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

export const wrap = document.getElementById("canvas-wrap");

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

export const camera = new THREE.PerspectiveCamera(
  45,
  wrap.clientWidth / wrap.clientHeight,
  0.1,
  1000
);
camera.position.set(-3, 1.5, -3);
camera.lookAt(0, 0, 0);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(wrap.clientWidth, wrap.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
wrap.appendChild(renderer.domElement);

export const ctrls = new OrbitControls(camera, renderer.domElement);
ctrls.enableDamping = true;
ctrls.maxPolarAngle = Math.PI / 2;
ctrls.minDistance = 1.5;
ctrls.maxTargetRadius = 1.0;

//Environment HDRI
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

new HDRLoader().load(
  "/assets/studio.hdr",
  (hdr) => {
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pmrem.dispose();
  },
  undefined,
  () => pmrem.dispose()
);

//Lights
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

//Helpers
export function fitCameraToModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  const r = sphere.radius;

  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const dist = Math.max(r / Math.tan(vFov / 2), r / Math.tan(hFov / 2)) * 1.15;

  camera.position.copy(
    camera.position.clone().normalize().multiplyScalar(dist)
  );
  ctrls.update();
}
