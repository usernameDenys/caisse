// 3D view of the whole store layout (read-only), and still renders for the PDF.
// Loaded lazily: three.js + the checkout model are only fetched when needed.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { footprint, aisleRect, aisleWidth as aisleOf, toWorld, isCheckout, GUIDE, EAS } from "./footprint.js";

const MM = 0.001; // plan millimetres → metres
const BELTS = ["L", "M", "S"];
const TRAYS = ["1250_L", "700_L", "700_M"];

// ── Shared renderer / scene (one WebGL context for view + captures) ──────
let ctx = null;

function createContext() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ReinhardToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeceef1);
  [
    { color: 0xffffff, intensity: 2.5, pos: [4, 6, 4] },
    { color: 0xc8d8ff, intensity: 1.0, pos: [-4, 3, 2] },
    { color: 0xffffff, intensity: 1.2, pos: [0, 4, -5] },
  ].forEach(({ color, intensity, pos }) => {
    const l = new THREE.DirectionalLight(color, intensity);
    l.position.set(...pos);
    scene.add(l);
  });
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd0d4d8, 0.6));

  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 500);
  const content = new THREE.Group();
  scene.add(content);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new Promise((resolve) =>
    new HDRLoader().load(
      "/assets/studio.hdr",
      (hdr) => {
        scene.environment = pmrem.fromEquirectangular(hdr).texture;
        hdr.dispose();
        pmrem.dispose();
        resolve();
      },
      undefined,
      () => resolve()
    )
  );

  const model = new Promise((resolve, reject) =>
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
      "/assets/caisse.glb",
      (gltf) => {
        const root = gltf.scenes[0];
        root.traverse((o) => {
          if (!o.isMesh) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => (m.side = THREE.DoubleSide)); // mirrored copies
        });
        resolve(root);
      },
      undefined,
      reject
    )
  );

  return { renderer, scene, camera, content, ready: Promise.all([env, model]).then(([, m]) => m), controls: null };
}

function getContext() {
  ctx ??= createContext();
  return ctx;
}

// ── Materials for accessories ────────────────────────────────────────────
const MAT = {
  // Barely-there floor (80 % transparent): the 1 m grid does the work
  floor: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false }),
  wall: new THREE.MeshBasicMaterial({ color: 0xc9ced4, transparent: true, opacity: 0.5, depthWrite: false }),
  aisle: new THREE.MeshBasicMaterial({ color: 0x1d6fde, transparent: true, opacity: 0.1, depthWrite: false }),
  tube: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.6 }),
  easPanel: new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.15, transparent: true, opacity: 0.55 }),
  easBase: new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.5 }),
  easLight: new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffb300, emissiveIntensity: 0.6 }),
};
const GRID_MAT = new THREE.LineBasicMaterial({ color: 0x9aa1a9, transparent: true, opacity: 0.18, depthWrite: false });

// Geometry created here (not the shared checkout model) is tagged for disposal
const own = (o) => ((o.userData.own = true), o);
const box = (w, h, d, mat) => own(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));

/** Places `obj` (built around its own origin) at a plan item's position. */
function placeAt(obj, it) {
  obj.position.set(it.cx * MM, 0, it.cy * MM);
  obj.rotation.y = -THREE.MathUtils.degToRad(it.rot); // plan Y is world +Z
  return obj;
}

function buildCheckout(source, it) {
  const fp = footprint(it);
  const copy = source.clone(true);
  copy.traverse((o) => {
    const belt = BELTS.find((b) => o.name === `Group_Belt_${b}`);
    if (belt) o.visible = belt === it.belt;
    const tray = TRAYS.find((t) => o.name === `Group_Tray_${t}`);
    if (tray) o.visible = tray === it.tray;
  });
  // Centre the model on its plan footprint, then mirror for Droitier
  copy.position.set(-fp.modelCenter.x * MM, 0, -fp.modelCenter.y * MM);
  const mirror = new THREE.Group();
  mirror.add(copy);
  if (it.mirror === "left") mirror.scale.x = -1;
  const outer = new THREE.Group();
  outer.add(mirror);
  outer.userData.itemId = it.id;
  return placeAt(outer, it);
}

function buildGuidage(it) {
  const g = new THREE.Group();
  const len = it.sections * GUIDE.section * MM;
  const t = GUIDE.tube * MM;
  const H = 1.0; // rail height (m)
  for (const y of [H, 0.35]) {
    const rail = box(t, t, len, MAT.tube);
    rail.position.y = y;
    g.add(rail);
  }
  for (let i = 0; i <= it.sections; i++) {
    const post = box(t, H + t / 2, t, MAT.tube);
    post.position.set(0, (H + t / 2) / 2, -len / 2 + i * GUIDE.section * MM);
    g.add(post);
  }
  return placeAt(g, it);
}

function buildEas(it) {
  const g = new THREE.Group();
  const L = EAS.length * MM;
  const H = EAS.height * MM;
  const base = box(EAS.thick * MM, 0.08, L, MAT.easBase);
  base.position.y = 0.04;
  const panel = box(0.03, H - 0.08, L * 0.9, MAT.easPanel);
  panel.position.y = 0.08 + (H - 0.08) / 2;
  const light = box(0.035, 0.04, L * 0.9, MAT.easLight);
  light.position.y = H - 0.02;
  g.add(base, panel, light);
  return placeAt(g, it);
}

// International symbol of access, painted on the floor of PMR aisles
let pmrMat = null;
function pmrMaterial() {
  if (pmrMat) return pmrMat;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const k = 256 / 24;
  g.scale(k, k);
  g.fillStyle = "#1d5fbf";
  g.beginPath();
  g.roundRect(0, 0, 24, 24, 3);
  g.fill();
  g.fillStyle = g.strokeStyle = "#fff";
  g.lineWidth = 1.7;
  g.lineCap = g.lineJoin = "round";
  g.beginPath();
  g.arc(11.5, 4.6, 1.9, 0, Math.PI * 2);
  g.fill();
  g.stroke(new Path2D("M11.5 7.8v5.6h4.6l2.6 4.8M11.5 10.6h4"));
  g.stroke(new Path2D("M8.6 11.4a5.4 5.4 0 1 0 7.3 6.2"));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  pmrMat = new THREE.MeshBasicMaterial({ map: tex });
  return pmrMat;
}

function buildFloor(room, aisleWidth, items) {
  const g = new THREE.Group();
  g.userData.floor = true;
  const w = room.w * MM;
  const d = room.h * MM;
  const floor = own(new THREE.Mesh(new THREE.PlaneGeometry(w, d), MAT.floor));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(w / 2, 0, d / 2);
  g.add(floor);

  // 1 m grid
  const pts = [];
  for (let x = 1; x < w; x++) pts.push(x, 0.001, 0, x, 0.001, d);
  for (let z = 1; z < d; z++) pts.push(0, 0.001, z, w, 0.001, z);
  const grid = own(new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)),
    GRID_MAT
  ));
  g.add(grid);

  // Low border marking the floor area
  const t = 0.03;
  const hgt = 0.03;
  [
    [w / 2, d + t / 2, w + 2 * t, t],
    [w / 2, -t / 2, w + 2 * t, t],
    [-t / 2, d / 2, t, d],
    [w + t / 2, d / 2, t, d],
  ].forEach(([x, z, sx, sz]) => {
    const m = box(sx, hgt, sz, MAT.wall);
    m.position.set(x, hgt / 2, z);
    g.add(m);
  });

  // Customer aisles, tinted on the floor
  for (const it of items.filter(isCheckout)) {
    const r = toWorld(it, aisleRect(footprint(it), aisleOf(it, aisleWidth)));
    const a = own(new THREE.Mesh(new THREE.PlaneGeometry((r.x1 - r.x0) * MM, (r.y1 - r.y0) * MM), MAT.aisle));
    a.rotation.x = -Math.PI / 2;
    a.position.set(((r.x0 + r.x1) / 2) * MM, 0.002, ((r.y0 + r.y1) / 2) * MM);
    g.add(a);
    if (it.pmr) {
      const size = Math.min(r.x1 - r.x0, r.y1 - r.y0) * 0.7 * MM;
      const sign = own(new THREE.Mesh(new THREE.PlaneGeometry(size, size), pmrMaterial()));
      sign.rotation.set(-Math.PI / 2, 0, -THREE.MathUtils.degToRad(it.rot));
      sign.position.set(((r.x0 + r.x1) / 2) * MM, 0.004, ((r.y0 + r.y1) / 2) * MM);
      g.add(sign);
    }
  }
  return g;
}

function disposeTree(obj) {
  // Checkout clones share the source model's geometry — only dispose our own
  obj.traverse((o) => o.userData.own && o.geometry?.dispose());
}

/** Rebuilds the scene contents from the plan state. */
async function build(state, appearance) {
  const c = getContext();
  const source = await c.ready;

  // Configurator colours (shared materials of the source model)
  source.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material?.name === "RAL_7016" && appearance?.color) o.material.color.set(appearance.color);
    if (o.material?.name === "Emissive" && appearance?.light) {
      o.material.color.set(appearance.light);
      o.material.emissive.set(appearance.light);
    }
  });

  disposeTree(c.content);
  c.content.clear();
  c.content.add(buildFloor(state.room, state.aisle, state.items));
  for (const it of state.items) {
    if (isCheckout(it)) c.content.add(buildCheckout(source, it));
    else if (it.type === "guidage") c.content.add(buildGuidage(it));
    else if (it.type === "eas") c.content.add(buildEas(it));
  }
  return c;
}

/** Camera looking at the layout from the customer (belt-entry) side. */
function frame(camera, state, target) {
  const box3 = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(state.room.w * MM, 2, state.room.h * MM));
  // Tighter framing around the placed items when there are some
  if (state.items.length) {
    box3.makeEmpty();
    for (const it of state.items) box3.expandByPoint(new THREE.Vector3(it.cx * MM, 0, it.cy * MM));
    box3.expandByScalar(2.5);
    box3.max.y = Math.max(box3.max.y, 2);
  }
  const center = box3.getCenter(new THREE.Vector3());
  center.y = 0.6;
  const size = box3.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.z) * 0.62 + 2;
  const dist = radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.max(Math.min(camera.aspect, 1.6), 0.8);
  camera.position.set(center.x - dist * 0.35, dist * 0.55, center.z + dist * 0.75);
  camera.lookAt(center);
  target?.copy(center);
}

// ── Interactive view ─────────────────────────────────────────────────────
let mounted = null;

export async function show(container, state, appearance) {
  const c = getContext();
  if (!mounted) {
    container.appendChild(c.renderer.domElement);
    c.controls ??= new OrbitControls(c.camera, c.renderer.domElement);
    c.controls.enableDamping = true;
    c.controls.maxPolarAngle = Math.PI / 2.05;
    c.controls.minDistance = 2;
    c.controls.maxDistance = 120;

    let raf = 0;
    const loop = () => {
      raf = 0;
      if (c.controls.update()) request();
      c.renderer.render(c.scene, c.camera);
    };
    const request = () => (raf ||= requestAnimationFrame(loop));
    c.controls.addEventListener("change", request);
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      c.renderer.setSize(w, h);
      c.camera.aspect = w / h;
      c.camera.updateProjectionMatrix();
      request();
    });
    ro.observe(container);
    mounted = { container, request, ro, framed: false, raf: () => raf };
  }
  await build(state, appearance);
  if (!mounted.framed) {
    frame(c.camera, state, c.controls.target);
    mounted.framed = true;
  }
  c.controls.update();
  mounted.request();
}

/** Re-centre the 3D camera on the layout. */
export function refit(state) {
  if (!mounted) return;
  frame(ctx.camera, state, ctx.controls.target);
  ctx.controls.update();
  mounted.request();
}

// ── Still images for the PDF ─────────────────────────────────────────────
/** World direction of a checkout's customer entry side (plan local +Y). */
function entryDir(rot) {
  const [x, z] = { 0: [0, 1], 90: [-1, 0], 180: [0, -1], 270: [1, 0] }[((rot % 360) + 360) % 360];
  return new THREE.Vector3(x, 0, z);
}

function renderStill(c, cam, width, height) {
  c.renderer.setPixelRatio(1);
  c.renderer.setSize(width, height, false);
  c.renderer.render(c.scene, cam);
  // Read back in the same task as render(): no preserveDrawingBuffer needed
  return c.renderer.domElement.toDataURL("image/jpeg", 0.9);
}

/** Corners of the bounding box of every mesh under `root` (tight fit). */
function meshCorners(root) {
  root.updateWorldMatrix(true, true);
  const pts = [];
  const box = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    box.setFromObject(o);
    if (box.isEmpty()) return;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z));
  });
  return pts;
}

// Farthest camera distance tried when fitting (m). Cameras' far plane must
// lie beyond it, or "doesn't fit" stops being monotonic and the search
// runs away to the far end.
const FIT_MAX = 400;

/**
 * Moves `cam` along `dir` as close as possible while every point stays in
 * the frame (with `margin` of the half-frame), then re-centres the subject
 * in a few passes so the margins are even.
 */
function fitPoints(cam, points, dir, margin = 0.03) {
  const d = dir.clone().normalize();
  const target = points.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(points.length);
  const q = new THREE.Vector3();
  const place = (dist) => {
    cam.position.copy(target).addScaledVector(d, dist);
    cam.lookAt(target);
    cam.updateMatrixWorld();
  };
  const fits = (dist) => {
    place(dist);
    return points.every((p) => {
      q.copy(p).project(cam);
      return q.z < 1 && Math.abs(q.x) <= 1 - margin && Math.abs(q.y) <= 1 - margin;
    });
  };
  const search = () => {
    let lo = 0.2;
    let hi = FIT_MAX;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    place(hi);
    return hi;
  };

  const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  for (let pass = 0; pass < 4; pass++) {
    const dist = search();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of points) {
      q.copy(p).project(cam);
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x);
      y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
    }
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    target.addScaledVector(right, ((x0 + x1) / 2) * dist * tanV * cam.aspect);
    target.addScaledVector(up, ((y0 + y1) / 2) * dist * tanV);
  }
  search();
}

export async function captureViews(state, appearance, typeItem) {
  const c = await build(state, appearance);
  const prevSize = c.renderer.getSize(new THREE.Vector2());
  const prevRatio = c.renderer.getPixelRatio();
  const prevBg = c.scene.background;
  c.scene.background = new THREE.Color(0xffffff);
  c.scene.updateMatrixWorld(true);

  const W = 2400;
  const H = 1600; // 3:2, matches the PDF frames
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, FIT_MAX * 2);
  const first = state.items.find(isCheckout);
  const entry = entryDir(first?.rot ?? 0);
  const side = new THREE.Vector3(-entry.z, 0, entry.x);
  const up = new THREE.Vector3(0, 1, 0);
  const subjects = c.content.children.filter((o) => !o.userData.floor);
  const points = subjects.flatMap(meshCorners);

  fitPoints(cam, points, entry.clone().addScaledVector(side, -0.35).addScaledVector(up, 0.6));
  const front = renderStill(c, cam, W, H);
  fitPoints(cam, points, entry.clone().negate().addScaledVector(side, -0.35).addScaledVector(up, 0.65));
  const back = renderStill(c, cam, W, H);

  // Typical checkout: the same scene, everything else hidden
  let type = null;
  const solo = typeItem && subjects.find((o) => o.userData.itemId === typeItem.id);
  if (solo) {
    const hidden = c.content.children.filter((o) => o !== solo && o.visible);
    hidden.forEach((o) => (o.visible = false));
    const centre = new THREE.Box3().setFromObject(solo).getCenter(new THREE.Vector3());
    const grid = new THREE.GridHelper(6, 12, 0x9aa1a9, 0x9aa1a9);
    grid.material.transparent = true;
    grid.material.opacity = 0.18;
    grid.material.depthWrite = false;
    grid.position.set(centre.x, 0.001, centre.z);
    c.scene.add(grid);

    const e = entryDir(typeItem.rot);
    const s = new THREE.Vector3(-e.z, 0, e.x);
    const camT = new THREE.PerspectiveCamera(28, 4 / 3, 0.05, FIT_MAX * 2);
    fitPoints(camT, meshCorners(solo), e.clone().addScaledVector(s, -0.9).addScaledVector(up, 0.75), 0.06);
    type = renderStill(c, camT, 1600, 1200);

    c.scene.remove(grid);
    grid.geometry.dispose();
    grid.material.dispose();
    hidden.forEach((o) => (o.visible = true));
  }

  // Restore the interactive view
  c.scene.background = prevBg;
  c.renderer.setPixelRatio(prevRatio);
  if (prevSize.x && prevSize.y) c.renderer.setSize(prevSize.x, prevSize.y, false);
  mounted?.request();
  return { front, back, type };
}

// Exported for tests
export { fitPoints, meshCorners };
