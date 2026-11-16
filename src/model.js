import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { scene, requestRender } from "./scene.js";
import { state } from "./state.js";

// Compressed with `npm run optimize-assets` (source: assets-src/Caisse3js.glb)
const MODEL_URL = "/assets/caisse.glb";

export const BELT_GROUPS = ["Group_Belt_L", "Group_Belt_M", "Group_Belt_S"];
export const TRAY_GROUPS = ["Group_Tray_700_L", "Group_Tray_700_M", "Group_Tray_1250_L"];

export const sceneGroups = {};

export function setBelt(size) {
  BELT_GROUPS.forEach((name) => {
    if (sceneGroups[name]) sceneGroups[name].visible = name === `Group_Belt_${size}`;
  });
  requestRender();
}

export function setTray(name) {
  TRAY_GROUPS.forEach((n) => {
    if (sceneGroups[n]) sceneGroups[n].visible = n === `Group_Tray_${name}`;
  });
  requestRender();
}

/**
 * @param {{ onProgress?: (ratio: number | null) => void, onLoad?: () => void, onError?: (e) => void }} cb
 *   onProgress receives 0…1, or null when the total size is unknown.
 */
export function loadModel({ onProgress, onLoad, onError } = {}) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    MODEL_URL,
    (gltf) => {
      state.loadedModel = gltf.scenes[0];

      const box = new THREE.Box3().setFromObject(state.loadedModel);
      state.loadedModel.position.sub(box.getCenter(new THREE.Vector3()));
      scene.add(state.loadedModel);

      state.loadedModel.traverse((obj) => {
        if (obj.name && (BELT_GROUPS.includes(obj.name) || TRAY_GROUPS.includes(obj.name))) {
          sceneGroups[obj.name] = obj;
          obj.visible = false;
        }
        if (!obj.isMesh) return;
        // Mirroring uses a negative scale, which flips face winding
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m && (m.side = THREE.DoubleSide));
        if (obj.material?.name === "RAL_7016") state.bodyMaterial = obj.material;
        if (obj.material?.name === "Emissive") state.emissiveMaterial = obj.material;
      });

      onLoad?.();
      requestRender();
    },
    (e) => onProgress?.(e.lengthComputable && e.total ? e.loaded / e.total : null),
    (error) => {
      console.error("Failed to load model:", error);
      onError?.(error);
    }
  );
}
