// "Copy link" and "Download PDF" buttons in the panel header.
import { t } from "./i18n.js";
import { state } from "./state.js";
import { shareUrl } from "./url-config.js";
import { downloadPdf } from "./export-pdf.js";

const shareBtn = document.getElementById("share-btn");
const pdfBtn = document.getElementById("pdf-btn");
const status = document.getElementById("share-status");

function flashLabel(btn, text, ms = 1800) {
  const label = btn.querySelector(".btn-label");
  const original = label.dataset.original ?? label.textContent;
  label.dataset.original = original;
  label.textContent = text;
  clearTimeout(btn._flash);
  btn._flash = setTimeout(() => (label.textContent = original), ms);
}

shareBtn.addEventListener("click", async () => {
  const url = shareUrl(state.config);
  // Native share sheet on phones, clipboard elsewhere
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ title: document.title, url });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    window.prompt(t.panel.share, url);
    return;
  }
  flashLabel(shareBtn, t.panel.shareCopied);
  status.textContent = t.panel.shareCopied;
});

pdfBtn.addEventListener("click", async () => {
  if (!state.loadedModel || pdfBtn.disabled) return;
  pdfBtn.disabled = true;
  const label = pdfBtn.querySelector(".btn-label");
  const original = label.textContent;
  label.textContent = t.panel.pdfBusy;
  try {
    await downloadPdf();
  } catch (err) {
    console.error("PDF export failed:", err);
  } finally {
    label.textContent = original;
    pdfBtn.disabled = false;
  }
});
