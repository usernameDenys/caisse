// Page chrome around the 3D view: steps nav, stage tools, summary bar, hint.
import * as THREE from "three";
import { camera, ctrls, animateCameraTo, renderer } from "./scene.js";
import { t } from "./i18n.js";
import { onConfigChange, getSelectionSummary } from "./configurator.js";

const stage = document.getElementById("canvas-wrap");
const panel = document.getElementById("panel");

// ── Accordions ───────────────────────────────────────────────────────────
document.querySelectorAll(".accordion-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const expanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!expanded));
    document.getElementById(btn.getAttribute("aria-controls")).hidden = expanded;
  });
});

// ── Steps: highlight the section in view, smooth-scroll on click ─────────
const stepLinks = [...document.querySelectorAll(".steps a")];
const stepTargets = stepLinks.map((a) => document.querySelector(a.getAttribute("href")));

function updateActiveStep() {
  const top = panel.getBoundingClientRect().top + 80;
  let active = 0;
  stepTargets.forEach((el, i) => {
    if (el.getBoundingClientRect().top <= top) active = i;
  });
  // At the very bottom, the last step is active even if short
  if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 4) active = stepTargets.length - 1;
  stepLinks.forEach((a, i) => {
    if (i === active) a.setAttribute("aria-current", "step");
    else a.removeAttribute("aria-current");
  });
}

panel.addEventListener("scroll", updateActiveStep, { passive: true });
// Scroll only the panel: scrollIntoView() would also scroll the page itself
// and push the header out of view.
const stepsNav = document.querySelector(".steps");
stepLinks.forEach((a, i) =>
  a.addEventListener("click", (e) => {
    e.preventDefault();
    const offset = stepTargets[i].getBoundingClientRect().top - panel.getBoundingClientRect().top;
    panel.scrollTo({
      top: panel.scrollTop + offset - stepsNav.offsetHeight - 16,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  })
);

// ── Stage tools ──────────────────────────────────────────────────────────
function zoom(factor) {
  const offset = camera.position.clone().sub(ctrls.target);
  const dist = THREE.MathUtils.clamp(offset.length() * factor, ctrls.minDistance, ctrls.maxDistance);
  animateCameraTo(ctrls.target.clone().add(offset.setLength(dist)), ctrls.target.clone(), 350);
}
document.getElementById("zoom-in").addEventListener("click", () => zoom(0.8));
document.getElementById("zoom-out").addEventListener("click", () => zoom(1.25));

const fsBtn = document.getElementById("fullscreen-btn");
if (!document.fullscreenEnabled) fsBtn.hidden = true;
fsBtn.addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else stage.requestFullscreen?.();
});

// ── Hint fades after the first interaction with the model ────────────────
const hint = document.getElementById("hint");
renderer.domElement.addEventListener("pointerdown", () => hint.classList.add("faded"), { once: true });

// ── Summary bar ──────────────────────────────────────────────────────────
const chips = document.getElementById("bar-chips");
const count = document.getElementById("bar-count");

onConfigChange(() => {
  const rows = getSelectionSummary().filter((r) => r.key !== "product");
  const b = t.bar;
  const chipText = {
    mirror: (r) => r.value,
    belt: (r) => `${b.belt} ${r.value}`,
    tray: (r) => `${b.tray} ${r.value}`,
    color: (r) => r.value.split(" — ")[0],
    light: (r) => r.value,
  };
  chips.replaceChildren(
    ...rows.map((r) => {
      const li = document.createElement("li");
      if (r.swatch) {
        const dot = document.createElement("span");
        dot.className = "chip-dot";
        dot.setAttribute("aria-hidden", "true");
        dot.style.background = r.display ?? r.swatch;
        li.append(dot);
      }
      li.append(chipText[r.key](r));
      return li;
    })
  );
  count.textContent = b.optionsCount.replace("{n}", rows.length);
});

document.getElementById("summary-mobile").addEventListener("click", () =>
  document.getElementById("devis-btn").click()
);
