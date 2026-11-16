// One-page PDF specification of the current configuration.
// jsPDF (~350 KB) is loaded lazily, only when a PDF is actually requested.
import { captureImage } from "./scene.js";
import { state } from "./state.js";
import { t } from "./i18n.js";
import { getSelectionSummary, CAMERA_DIRECTIONS } from "./configurator.js";
import { shareUrl } from "./url-config.js";

const PAGE = { w: 210, h: 297, margin: 16 };
const INK = [26, 26, 26];
const MUTED = [136, 136, 136];
const RULE = [225, 225, 225];
const ACCENT = [29, 111, 222];

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

async function buildPdf() {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const { margin } = PAGE;
  const contentW = PAGE.w - margin * 2;
  let y = margin;

  const ensureSpace = (h) => {
    if (y + h > PAGE.h - margin - 12) {
      doc.addPage();
      y = margin;
    }
  };

  // Header
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...INK);
  doc.text("S O M M E S P R O", margin, y + 3);
  const date = new Date().toLocaleDateString(t.lang === "fr" ? "fr-FR" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.setFont("helvetica", "normal").setTextColor(...MUTED);
  doc.text(`${t.pdf.date} : ${date}`, PAGE.w - margin, y + 3, { align: "right" });
  y += 12;

  doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(...MUTED);
  doc.text(t.panel.subtitle.toUpperCase(), margin, y);
  y += 8;
  doc.setFont("helvetica", "normal").setFontSize(22).setTextColor(...INK);
  doc.text(t.panel.title, margin, y);
  y += 7;
  doc.setFontSize(11).setTextColor(...MUTED);
  doc.text(t.pdf.title, margin, y);
  y += 6;

  // Product shot
  if (state.loadedModel) {
    const img = captureImage(state.loadedModel, CAMERA_DIRECTIONS[state.config.mirror]);
    const imgH = contentW * (1000 / 1600);
    doc.addImage(img, "JPEG", margin, y, contentW, imgH);
    y += imgH + 6;
  }

  // Configuration table
  const section = (title) => {
    ensureSpace(14);
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
    doc.text(title.toUpperCase(), margin, y);
    y += 2;
    doc.setDrawColor(...RULE).setLineWidth(0.3).line(margin, y, PAGE.w - margin, y);
    y += 5;
  };

  section(t.pdf.configuration);
  const valueX = margin + contentW * 0.42;
  for (const row of getSelectionSummary()) {
    ensureSpace(8);
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
    doc.text(row.label, margin, y);
    let x = valueX;
    if (row.swatch) {
      doc.setFillColor(...hexToRgb(row.display ?? row.swatch)).setDrawColor(200, 200, 200);
      doc.roundedRect(x, y - 3.4, 4.2, 4.2, 0.8, 0.8, "FD");
      x += 6.5;
    }
    doc.setFont("helvetica", "bold").setTextColor(...INK);
    doc.text(row.value, x, y);
    y += 3;
    doc.setDrawColor(...RULE).line(margin, y, PAGE.w - margin, y);
    y += 5;
  }
  y += 3;

  // Spec lists
  const list = (title, items) => {
    section(title);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...INK);
    for (const item of items) {
      const lines = doc.splitTextToSize(item, contentW - 5);
      ensureSpace(lines.length * 4 + 1.5);
      doc.setTextColor(...MUTED).text("—", margin, y);
      doc.setTextColor(...INK).text(lines, margin + 5, y);
      y += lines.length * 4 + 1.5;
    }
    y += 4;
  };
  list(t.tech.title, t.tech.items);
  list(t.operation.title, t.operation.items);

  // Footer on every page: link back to this exact configuration
  const link = shareUrl(state.config);
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const fy = PAGE.h - margin + 2;
    doc.setDrawColor(...RULE).line(margin, fy - 6, PAGE.w - margin, fy - 6);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED);
    doc.text(t.pdf.footer, margin, fy - 1.5);
    doc.setTextColor(...ACCENT);
    doc.textWithLink(t.devis.labels.link, margin, fy + 2.5, { url: link });
    if (pages > 1) {
      doc.setTextColor(...MUTED).text(`${i} / ${pages}`, PAGE.w - margin, fy + 2.5, { align: "right" });
    }
  }
  return doc;
}

export async function downloadPdf() {
  const doc = await buildPdf();
  doc.save(t.pdf.filename);
}
