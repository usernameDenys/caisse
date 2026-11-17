// Quote dialog of the configurator page.
import { t } from "./i18n.js";
import { state } from "./state.js";
import { getSelectionSummary, CAMERA_DIRECTIONS } from "./configurator.js";
import { shareUrl } from "./url-config.js";
import { captureImage } from "./scene.js";
import { bindQuoteForm, bindDialog } from "./quote-form.js";

const modal = document.getElementById("devis-modal");
const specsEl = document.getElementById("devis-specs");
const form = document.getElementById("devis-form");
const closeBtn = document.getElementById("devis-close");
const previewImg = document.getElementById("devis-preview");

const quote = bindQuoteForm({
  form,
  submitBtn: document.getElementById("devis-confirm"),
  statusEl: document.getElementById("devis-status"),
  afterSuccessFocus: closeBtn,
  subject: t.devis.email.subject,
  getLines: () => [
    ...getSelectionSummary().map(({ label, value }) => ({ label, value })),
    { label: t.devis.labels.link, value: shareUrl(state.config) },
  ],
});

function fillSummary() {
  specsEl.replaceChildren(
    ...getSelectionSummary()
      .filter((s) => s.key !== "product") // shown as the heading above
      .flatMap((s) => {
        const dt = document.createElement("dt");
        dt.textContent = s.label;
        const dd = document.createElement("dd");
        if (s.swatch) {
          const dot = document.createElement("span");
          dot.className = "chip-dot";
          dot.setAttribute("aria-hidden", "true");
          dot.style.background = s.display ?? s.swatch;
          dd.append(dot);
        }
        dd.append(s.value);
        return [dt, dd];
      })
  );
  if (state.loadedModel) {
    previewImg.src = captureImage(state.loadedModel, CAMERA_DIRECTIONS[state.config.mirror], 760, 360);
    previewImg.hidden = false;
  }
  quote.reset();
}

bindDialog({
  modal,
  openBtns: [document.getElementById("devis-btn")],
  closeBtns: [closeBtn, document.getElementById("devis-edit")],
  onOpen: fillSummary,
  initialFocus: () => form.elements.name,
});
