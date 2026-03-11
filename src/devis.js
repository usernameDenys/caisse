import { t } from "./i18n.js";

const devisModal = document.getElementById("devis-modal");
const devisSpecs = document.getElementById("devis-specs");
const devisBtn = document.getElementById("devis-btn");
const devisClose = document.getElementById("devis-close");
const devisConfirm = document.getElementById("devis-confirm");

function getSelectionSummary() {
  const mirror = document.querySelector(".opt-btn[data-mirror].active");
  const belt = document.querySelector(".opt-btn[data-belt].active");
  const tray = document.querySelector(".opt-btn[data-tray].active");
  const colorSwatch = document.querySelector(".swatch:not(.swatch-light).active");
  const lightSwatch = document.querySelector(".swatch-light.active");

  const l = t.devis.labels;

  const colorLabel = colorSwatch
    ? colorSwatch.getAttribute("aria-label")
    : `${l.custom} — ${document.getElementById("color-custom").value}`;

  const lightLabel = lightSwatch
    ? lightSwatch.getAttribute("aria-label")
    : `${l.custom} — ${document.getElementById("light-custom").value}`;

  return [
    { label: l.product, value: l.productValue },
    { label: l.mirror, value: mirror?.textContent.trim() ?? "—" },
    { label: l.belt, value: belt?.textContent.trim() ?? "—" },
    { label: l.tray, value: tray?.textContent.trim() ?? "—" },
    { label: l.color, value: colorLabel },
    { label: l.light, value: lightLabel },
  ];
}

function openDevisModal() {
  const specs = getSelectionSummary();
  devisSpecs.innerHTML = specs
    .map((s) => `<dt>${s.label}</dt><dd>${s.value}</dd>`)
    .join("");
  devisModal.hidden = false;
  devisClose.focus();
}

function closeDevisModal() {
  devisModal.hidden = true;
  devisBtn.focus();
}

devisBtn.addEventListener("click", openDevisModal);
devisClose.addEventListener("click", closeDevisModal);
devisModal.querySelector(".devis-backdrop").addEventListener("click", closeDevisModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !devisModal.hidden) closeDevisModal();
});

devisConfirm.addEventListener("click", () => {
  const specs = getSelectionSummary();
  const e = t.devis.email;
  const bodyLines = [
    e.greeting,
    "",
    e.intro,
    "",
    ...specs.map((s) => `${s.label} : ${s.value}`),
    "",
    e.closing,
  ];
  const subject = encodeURIComponent(e.subject);
  const body = encodeURIComponent(bodyLines.join("\n"));
  window.location.href = `mailto:denysgolenko@gmail.com?subject=${subject}&body=${body}`;
});
