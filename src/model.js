import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { scene, fitCameraToModel } from "./scene.js";
import { state } from "./state.js";

export const BELT_GROUPS = ["Group_Belt_L", "Group_Belt_M", "Group_Belt_S"];
export const TRAY_GROUPS = ["Group_Tray_700_L", "Group_Tray_700_M", "Group_Tray_1250_L"];

export const sceneGroups = {};

export function setBelt(size) {
  BELT_GROUPS.forEach((name) => {
    if (sceneGroups[name]) sceneGroups[name].visible = name === `Group_Belt_${size}`;
  });
}

export function setTray(name) {
  TRAY_GROUPS.forEach((n) => {
    if (sceneGroups[n]) sceneGroups[n].visible = n === `Group_Tray_${name}`;
  });
}

export function loadModel(loaderEl, onLoaded) {
  new GLTFLoader().load(
    "/assets/Caisse3js.glb",
    (gltf) => {
      state.loadedModel = gltf.scenes[0];

      const box = new THREE.Box3().setFromObject(state.loadedModel);
      state.loadedModel.position.sub(box.getCenter(new THREE.Vector3()));
      scene.add(state.loadedModel);
      fitCameraToModel(state.loadedModel);

      loaderEl.classList.add("hidden");
      setTimeout(() => loaderEl.remove(), 400);

      state.loadedModel.traverse((obj) => {
        if (obj.name && (BELT_GROUPS.includes(obj.name) || TRAY_GROUPS.includes(obj.name))) {
          sceneGroups[obj.name] = obj;
          obj.visible = false;
        }
        if (!obj.isMesh) return;
        if (obj.material?.name === "RAL_7016") state.bodyMaterial = obj.material;
        if (obj.material?.name === "Emissive") state.emissiveMaterial = obj.material;
      });

      setBelt("L");
      setTray("1250_L");
      onLoaded?.();
    },
    undefined,
    (error) => {
      console.error("Failed to load model:", error);
      loaderEl.classList.add("hidden");
    }
  );
}
