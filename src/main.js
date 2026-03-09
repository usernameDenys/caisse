import {
  wrap,
  scene,
  camera,
  renderer,
  ctrls,
  fitCameraToModel,
} from "./scene.js";
import { loadModel } from "./model.js";
import { initHotspots, updateHotspotPositions, hidePopup } from "./hotspots.js";
import { state } from "./state.js";
import "./configurator.js";
import "./devis.js";

//Accordion
document.querySelectorAll(".accordion-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const expanded = btn.getAttribute("aria-expanded") === "true";
    const body = document.getElementById(btn.getAttribute("aria-controls"));
    btn.setAttribute("aria-expanded", String(!expanded));
    body.hidden = expanded;
  });
});

//Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hidePopup();
  if (e.key === "c" || e.key === "C") {
    const { x, y, z } = camera.position;
    console.log(
      `📷 camera.position.set(${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(
        3
      )})`
    );
  }
});

//Load model
const loaderEl = document.getElementById("loader");
loadModel(loaderEl, () => initHotspots());

//Render loop
function animate() {
  requestAnimationFrame(animate);
  ctrls.update();
  updateHotspotPositions();
  renderer.render(scene, camera);
}
animate();

//Resize
window.addEventListener("resize", () => {
  camera.aspect = wrap.clientWidth / wrap.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  if (state.loadedModel) fitCameraToModel(state.loadedModel);
});

// ── Cookie banner ──────────────────────────────────────────────────────────
const cookieBanner = document.getElementById("cookie-banner");
if (!localStorage.getItem("cookie-notice-accepted")) {
  cookieBanner.hidden = false;
}
document.getElementById("cookie-accept").addEventListener("click", () => {
  localStorage.setItem("cookie-notice-accepted", "1");
  cookieBanner.hidden = true;
});
