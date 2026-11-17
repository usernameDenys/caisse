// Store-plan PDF (A3 landscape):
//   page 1 — overview: 3D front + back views, key figures, configurations
//   page 2 — the typical checkout: 3D view, dimensioned top view, specs
//   page 3 — vector plan at a standard architectural scale
import { t } from "../i18n.js";
import { ralForHex } from "../url-config.js";
import { footprint, aisleRect, aisleWidth, toWorld, isCheckout, GUIDE, EAS, HEIGHTS, BELT_LABEL, TRAY_LABEL } from "./footprint.js";
import { summarize, accessoryLines, checkoutCount, itemLabel } from "./summary.js";
import { computeDims } from "./dims.js";

const PAGE = { w: 420, h: 297, margin: 14 };
const SIDEBAR = 110; // title block on the right
const SCALES = [20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000];
const INK = [20, 22, 26];
const MUTED = [95, 102, 112];
const LINE = [227, 230, 234];
const ACCENT = [29, 111, 222];
const DANGER = [180, 35, 24];
const EAS_FILL = [255, 211, 77];

const PMR_BLUE = [29, 95, 191];

/** International symbol of access, `s` mm wide, centred on (cx, cy). */
function drawPmr(doc, cx, cy, s) {
  const k = s / 24;
  const P = (x, y) => [cx + (x - 12) * k, cy + (y - 12) * k];
  doc.setFillColor(...PMR_BLUE).roundedRect(cx - s / 2, cy - s / 2, s, s, 3 * k, 3 * k, "F");
  doc.setDrawColor(255, 255, 255).setFillColor(255, 255, 255).setLineWidth(1.6 * k);
  doc.circle(...P(11.5, 4.6), 1.9 * k, "F");
  const seg = (pts) => pts.slice(1).forEach((p, i) => doc.line(...P(...pts[i]), ...P(...p)));
  seg([[11.5, 7.8], [11.5, 13.4], [16.1, 13.4], [18.7, 18.2]]);
  seg([[11.5, 10.6], [15.5, 10.6]]);
  doc.circle(...P(11.4, 16.6), 5.1 * k, "S");
}

const fmtDate = () =>
  new Date().toLocaleDateString(t.lang === "fr" ? "fr-FR" : "en-GB", { year: "numeric", month: "long", day: "numeric" });
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const SOFT = [246, 247, 249];
// Aspect ratio of the overview renders (must match view3d.captureViews)
const VIEW_RATIO = 1.5;
const ACCENT_SOFT = [232, 240, 253];
const fmtN = (n) => Math.round(n).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ");
const fmtM = (mm) => `${(mm / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ")} m`;

// ── Shared page chrome ───────────────────────────────────────────────────
const CONTENT_TOP = PAGE.margin + 35;
const CONTENT_BOTTOM = PAGE.h - PAGE.margin - 10;

function header(doc, title, subtitle) {
  const { margin: m, w } = PAGE;
  doc.setFillColor(...ACCENT).rect(m, m, 10, 1.2, "F");
  doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...INK);
  doc.text("S O M M E S P R O", m, m + 6.5);
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED);
  doc.text(`${t.planner.pdf.title} · ${fmtDate()}`, w - m, m + 6.5, { align: "right" });
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(...INK);
  doc.text(title, m, m + 19);
  if (subtitle) {
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
    doc.text(subtitle, m, m + 26);
  }
  doc.setDrawColor(...LINE).setLineWidth(0.3).line(m, m + 30, w - m, m + 30);
}

function footers(doc) {
  const { margin: m, w, h } = PAGE;
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE).setLineWidth(0.3).line(m, h - m - 4, w - m, h - m - 4);
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...MUTED);
    doc.text(t.planner.pdf.disclaimer, m, h - m + 1);
    doc.text(`sommespro.fr  ·  ${i} / ${n}`, w - m, h - m + 1, { align: "right" });
  }
}

const sectionTitle = (doc, text, x, y) => {
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...MUTED).text(text.toUpperCase(), x, y);
};

/** Label / value row with a hairline under it. */
function infoRow(doc, x, y, w, label, value, { color = INK, swatch } = {}) {
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED).text(label, x, y);
  doc.setFont("helvetica", "bold").setTextColor(...color);
  const text = String(value);
  doc.text(text, x + w, y, { align: "right" });
  if (swatch) {
    const tw = doc.getTextWidth(text);
    doc.setFillColor(...hexToRgb(swatch)).setDrawColor(190, 195, 200).setLineWidth(0.2);
    doc.roundedRect(x + w - tw - 6.2, y - 3.2, 4, 4, 0.8, 0.8, "FD");
  }
  doc.setDrawColor(...LINE).setLineWidth(0.2).line(x, y + 2.8, x + w, y + 2.8);
  return y + 8;
}

/** Image in a rounded frame with a caption pill. */
function framedImage(doc, img, x, y, w, h, caption) {
  doc.setFillColor(...SOFT).roundedRect(x, y, w, h, 3, 3, "F");
  if (img) doc.addImage(img, "JPEG", x, y, w, h, undefined, "FAST");
  doc.setDrawColor(...LINE).setLineWidth(0.4).roundedRect(x, y, w, h, 3, 3, "S");
  if (caption) {
    doc.setFont("helvetica", "bold").setFontSize(8);
    const tw = doc.getTextWidth(caption) + 8;
    doc.setFillColor(255, 255, 255).setDrawColor(...LINE).setLineWidth(0.3);
    doc.roundedRect(x + 4, y + 4, tw, 7, 3.5, 3.5, "FD");
    doc.setTextColor(...INK).text(caption, x + 8, y + 8.9);
  }
}

// ── Page 1: overview ─────────────────────────────────────────────────────
function overviewPage(doc, state, conflicts, { views, appearance }) {
  const p = t.planner.pdf;
  const S = t.planner.summary;
  const { margin: m, w } = PAGE;
  const { room, items, aisle } = state;
  const count = checkoutCount(items);
  header(doc, p.overview, `${fmtN(count)} ${p.checkoutsWord} · ${p.room} ${fmtM(room.w)} × ${fmtM(room.h)}`);

  // Two views side by side
  const gap = 8;
  const imgW = (w - m * 2 - gap) / 2;
  const imgH = imgW / VIEW_RATIO;
  let y = CONTENT_TOP;
  framedImage(doc, views?.front, m, y, imgW, imgH, p.viewFront);
  framedImage(doc, views?.back, m + imgW + gap, y, imgW, imgH, p.viewBack);
  y += imgH + 8;

  // Key figures
  const dims = computeDims(items, aisle, 100);
  const longest = dims.totals.length ? Math.max(...dims.totals) : 0;
  const rails = items.filter((i) => i.type === "guidage").reduce((n, i) => n + i.sections, 0);
  const tiles = [
    [fmtN(count), p.count],
    [fmtN(items.filter((i) => isCheckout(i) && i.pmr).length), S.pmr],
    [longest ? fmtM(longest) : "—", dims.totals.length > 1 ? p.longestLine : p.lineLength],
    [rails ? `${rails} m` : "—", S.guidage],
    [fmtN(items.filter((i) => i.type === "eas").length), S.eas],
  ];
  const tileGap = 6;
  const tileW = (w - m * 2 - tileGap * (tiles.length - 1)) / tiles.length;
  tiles.forEach(([value, label], i) => {
    const x = m + i * (tileW + tileGap);
    doc.setFillColor(...SOFT).roundedRect(x, y, tileW, 26, 2.5, 2.5, "F");
    doc.setFont("helvetica", "bold").setFontSize(19).setTextColor(...INK).text(value, x + 6, y + 13);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED).text(label, x + 6, y + 20.5);
  });
  y += 26 + 10;

  // Three columns: configurations · finish · floor
  const colGap = 12;
  const c1 = 170;
  const c2 = 95;
  const c3 = w - m * 2 - c1 - c2 - colGap * 2;
  const x2 = m + c1 + colGap;
  const x3 = x2 + c2 + colGap;

  sectionTitle(doc, p.models, m, y);
  let yy = y + 7;
  for (const g of summarize(items)) {
    const badge = String(g.count);
    doc.setFont("helvetica", "bold").setFontSize(9);
    const bw = Math.max(doc.getTextWidth(badge) + 5, 8);
    doc.setFillColor(...ACCENT_SOFT).roundedRect(m, yy - 4.2, bw, 6, 1.5, 1.5, "F");
    doc.setTextColor(...ACCENT).text(badge, m + bw / 2, yy, { align: "center" });
    doc.setFont("helvetica", "normal").setTextColor(...INK).text(g.label, m + bw + 3, yy);
    yy += 8;
  }

  if (appearance?.color) {
    sectionTitle(doc, p.appearance, x2, y);
    let fy = y + 7;
    const ral = ralForHex(appearance.color);
    fy = infoRow(doc, x2, fy, c2, p.color, ral ? `RAL ${ral}` : appearance.color, { swatch: appearance.color });
    const light = t.lights[appearance.light?.slice(1)] ?? appearance.light;
    if (light) infoRow(doc, x2, fy, c2, p.light, light, { swatch: appearance.light });
  }

  sectionTitle(doc, p.floor, x3, y);
  let ry = y + 7;
  ry = infoRow(doc, x3, ry, c3, p.room, `${fmtM(room.w)} × ${fmtM(room.h)}`);
  ry = infoRow(doc, x3, ry, c3, p.aisle, `${aisle} mm`);
  if (items.some((i) => i.pmr)) ry = infoRow(doc, x3, ry, c3, p.legendPmr, "900 mm");
  if (conflicts.size) infoRow(doc, x3, ry, c3, p.conflicts, conflicts.size, { color: DANGER });
}

// ── Page 2: the typical checkout ─────────────────────────────────────────
function typePage(doc, state, { views, typeItem }) {
  const p = t.planner.pdf;
  const { margin: m, w } = PAGE;
  const fp = footprint(typeItem);
  const aisleW = aisleWidth(typeItem, state.aisle);
  header(doc, p.typeTitle, itemLabel(typeItem));

  // Render, 4:3
  const imgW = 220;
  const imgH = imgW * 0.75;
  framedImage(doc, views?.type, m, CONTENT_TOP, imgW, imgH, p.view34);

  // Specs under the render, two columns
  let y = CONTENT_TOP + imgH + 10;
  sectionTitle(doc, t.tech.title, m, y);
  y += 6;
  const colW = (imgW - 10) / 2;
  const specs = [...t.tech.items, ...t.operation.items];
  const half = Math.ceil(specs.length / 2);
  doc.setFont("helvetica", "normal").setFontSize(7.8);
  [specs.slice(0, half), specs.slice(half)].forEach((col, ci) => {
    let cy = y;
    const cx = m + ci * (colW + 10);
    for (const item of col) {
      const lines = doc.splitTextToSize(item, colW - 5);
      if (cy + lines.length * 3.4 > CONTENT_BOTTOM) break;
      doc.setTextColor(...ACCENT).text("•", cx, cy);
      doc.setTextColor(...INK).text(lines, cx + 4, cy);
      cy += lines.length * 3.4 + 1.3;
    }
  });

  // Right column: top view drawing + dimensions table
  const rx = m + imgW + 14;
  const rw = w - m - rx;
  sectionTitle(doc, p.topView, rx, CONTENT_TOP + 3);
  const boxY = CONTENT_TOP + 8;
  const boxH = 92;
  doc.setFillColor(...SOFT).roundedRect(rx, boxY, rw, boxH, 3, 3, "F");

  // Drawn lengthwise (checkout length along the page), aisle included
  const totalW = fp.w + aisleW;
  const k = Math.min((rw - 34) / fp.h, (boxH - 40) / totalW);
  const ox = rx + (rw - fp.h * k) / 2;
  const oy = boxY + 14 + (boxH - 40 - totalW * k) / 2;
  // local (x across, y along) → page: along → X, across → Y
  const aisleLeft = fp.customerSide < 0;
  const bodyX0 = aisleLeft ? aisleW : 0; // across offset of the body
  const PX = (ly) => ox + (ly + fp.h / 2) * k;
  const PY = (lx) => oy + (lx + fp.w / 2 + bodyX0) * k;

  // aisle
  const ay0 = aisleLeft ? oy : oy + fp.w * k;
  doc.setFillColor(...ACCENT_SOFT).setDrawColor(...ACCENT).setLineWidth(0.15).setLineDashPattern([0.8, 0.8], 0);
  doc.rect(ox, ay0, fp.h * k, aisleW * k, "FD");
  doc.setLineDashPattern([], 0);
  for (const part of fp.parts) {
    const fill = part.kind === "belt" ? [90, 96, 104] : part.kind === "tray" ? [196, 201, 207] : [150, 156, 164];
    doc.setFillColor(...fill).setDrawColor(...INK).setLineWidth(0.2);
    doc.rect(PX(part.y), PY(part.x), part.h * k, part.w * k, "FD");
  }

  // Dimension helper (horizontal or vertical) with ticks
  const dim = (x1, y1, x2, y2, label) => {
    doc.setDrawColor(61, 67, 74).setLineWidth(0.2).line(x1, y1, x2, y2);
    for (const [x, yv] of [[x1, y1], [x2, y2]]) doc.setLineWidth(0.35).line(x - 0.8, yv + 0.8, x + 0.8, yv - 0.8);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...INK);
    if (y1 === y2) doc.text(label, (x1 + x2) / 2, y1 - 1.4, { align: "center" });
    else doc.text(label, x1 - 1.6, (y1 + y2) / 2, { align: "center", angle: 90 });
  };
  const top = Math.min(oy, ay0) - 5;
  dim(ox, top, ox + fp.h * k, top, `${fmtN(fp.h)} mm`);
  const bodyTop = PY(-fp.w / 2);
  dim(ox - 5, bodyTop, ox - 5, bodyTop + fp.w * k, `${fmtN(fp.w)}`);
  const aisleBottom = ay0 + aisleW * k;
  dim(ox + fp.h * k + 5, ay0, ox + fp.h * k + 5, aisleBottom, `${fmtN(aisleW)}`);
  // Ends of the checkout, with drawn arrows (no arrow glyphs in standard fonts)
  const ly = boxY + boxH - 5;
  const arrow = (x1, x2) => {
    doc.setDrawColor(...MUTED).setLineWidth(0.3).line(x1, ly - 1, x2, ly - 1);
    const d = Math.sign(x2 - x1) * 1.4;
    doc.line(x2, ly - 1, x2 - d, ly - 2.2).line(x2, ly - 1, x2 - d, ly + 0.2);
  };
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...MUTED);
  arrow(ox + 7, ox);
  doc.text(p.trayEnd, ox + 9, ly);
  arrow(ox + fp.h * k - 7, ox + fp.h * k);
  doc.text(p.entryEnd, ox + fp.h * k - 9, ly, { align: "right" });

  // Dimensions table
  let ty = boxY + boxH + 10;
  sectionTitle(doc, p.dimensions, rx, ty);
  ty += 7;
  ty = infoRow(doc, rx, ty, rw, p.length, `${fmtN(fp.h)} mm`);
  ty = infoRow(doc, rx, ty, rw, p.width, `${fmtN(fp.w)} mm`);
  ty = infoRow(doc, rx, ty, rw, t.options.beltLong, `${BELT_LABEL[typeItem.belt]} mm`);
  ty = infoRow(doc, rx, ty, rw, t.options.trayShort, `${TRAY_LABEL[typeItem.tray]} mm`);
  // (the PDF's standard fonts have no "≈")
  ty = infoRow(doc, rx, ty, rw, p.beltHeight, `~ ${fmtN(HEIGHTS.belt)} mm`);
  ty = infoRow(doc, rx, ty, rw, p.overallHeight, `~ ${fmtN(HEIGHTS.overall)} mm`);
  infoRow(doc, rx, ty, rw, p.aisle, `${fmtN(aisleW)} mm`);
}

export async function downloadPlanPdf(state, conflicts, extra = {}) {
  const { jsPDF } = await import("jspdf");
  const p = t.planner.pdf;
  const doc = new jsPDF({ unit: "mm", format: "a3", orientation: "landscape", compress: true });
  const { margin } = PAGE;

  if (checkoutCount(state.items)) {
    overviewPage(doc, state, conflicts, extra);
    doc.addPage("a3", "landscape");
    if (extra.typeItem) {
      typePage(doc, state, extra);
      doc.addPage("a3", "landscape");
    }
  }

  // Drawing area
  // 12 mm on the left/top for the dimension labels, 12 mm gap before the sidebar
  const areaW = PAGE.w - margin * 2 - SIDEBAR - 12 - 12;
  const areaH = PAGE.h - margin * 2 - 12 - 8;
  const { room, items, aisle } = state;
  const scale = SCALES.find((s) => room.w / s <= areaW && room.h / s <= areaH) ?? SCALES.at(-1);
  const k = 1 / scale; // paper mm per real mm
  const ox = margin + 12 + (areaW - room.w * k) / 2;
  const oy = margin + 12 + (areaH - room.h * k) / 2;
  const X = (x) => ox + x * k;
  const Y = (y) => oy + y * k;

  // Grid (1 m)
  doc.setDrawColor(...LINE).setLineWidth(0.1);
  for (let x = 1000; x < room.w; x += 1000) doc.line(X(x), Y(0), X(x), Y(room.h));
  for (let y = 1000; y < room.h; y += 1000) doc.line(X(0), Y(y), X(room.w), Y(y));

  // Room
  doc.setDrawColor(...INK).setLineWidth(0.6).rect(X(0), Y(0), room.w * k, room.h * k);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
  doc.text(`${(room.w / 1000).toLocaleString("fr-FR")} m`, X(room.w / 2), Y(0) - 3, { align: "center" });
  doc.text(`${(room.h / 1000).toLocaleString("fr-FR")} m`, X(0) - 3, Y(room.h / 2), { align: "center", angle: 90 });

  // Guidage & anti-theft gates (drawn under the checkout labels)
  const checkouts = items.filter(isCheckout);
  for (const it of items) {
    const bad = conflicts.has(it.id);
    if (it.type === "guidage") {
      const len = it.sections * GUIDE.section;
      const tube = toWorld(it, { x: -GUIDE.tube / 2, y: -len / 2, w: GUIDE.tube, h: len });
      doc.setFillColor(...(bad ? DANGER : INK));
      // Real tube is 40 mm; drawn at least 0.8 mm wide so it stays legible at small scales
      const cxp = X((tube.x0 + tube.x1) / 2);
      const cyp = Y((tube.y0 + tube.y1) / 2);
      const tw = Math.max((tube.x1 - tube.x0) * k, 0.8);
      const th = Math.max((tube.y1 - tube.y0) * k, 0.8);
      doc.rect(cxp - tw / 2, cyp - th / 2, tw, th, "F");
      for (let s = 0; s <= it.sections; s++) {
        const post = toWorld(it, { x: -GUIDE.post / 2, y: -len / 2 + s * GUIDE.section - GUIDE.post / 2, w: GUIDE.post, h: GUIDE.post });
        const pw = Math.max((post.x1 - post.x0) * k, 1.2);
        const ph = Math.max((post.y1 - post.y0) * k, 1.2);
        doc.rect(X((post.x0 + post.x1) / 2) - pw / 2, Y((post.y0 + post.y1) / 2) - ph / 2, pw, ph, "F");
      }
    } else if (it.type === "eas") {
      const r = toWorld(it, { x: -EAS.thick / 2, y: -EAS.length / 2, w: EAS.thick, h: EAS.length });
      const w = Math.max((r.x1 - r.x0) * k, 1);
      const h = Math.max((r.y1 - r.y0) * k, 1);
      doc.setFillColor(...EAS_FILL).setDrawColor(...(bad ? DANGER : INK)).setLineWidth(0.25);
      doc.rect(X((r.x0 + r.x1) / 2) - w / 2, Y((r.y0 + r.y1) / 2) - h / 2, w, h, "FD");
    }
  }

  // Checkouts
  checkouts.forEach((it, i) => {
    const fp = footprint(it);
    const bad = conflicts.has(it.id);
    const a = toWorld(it, aisleRect(fp, aisleWidth(it, aisle)));
    doc.setFillColor(232, 240, 253).setDrawColor(...ACCENT).setLineWidth(0.1);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.rect(X(a.x0), Y(a.y0), (a.x1 - a.x0) * k, (a.y1 - a.y0) * k, "FD");
    doc.setLineDashPattern([], 0);
    if (it.pmr) {
      const s = Math.min(a.x1 - a.x0, a.y1 - a.y0) * 0.7 * k;
      drawPmr(doc, X((a.x0 + a.x1) / 2), Y((a.y0 + a.y1) / 2), s);
    }

    for (const part of fp.parts) {
      const r = toWorld(it, part);
      const fill = part.kind === "belt" ? [90, 96, 104] : part.kind === "tray" ? [196, 201, 207] : [150, 156, 164];
      doc.setFillColor(...fill).setDrawColor(...(bad ? DANGER : INK)).setLineWidth(bad ? 0.35 : 0.15);
      doc.rect(X(r.x0), Y(r.y0), (r.x1 - r.x0) * k, (r.y1 - r.y0) * k, "FD");
    }
    // Label on a white tag so it reads over any part
    const label = `C${i + 1}`;
    doc.setFont("helvetica", "bold").setFontSize(7);
    const tw = doc.getTextWidth(label) + 2.4;
    doc.setFillColor(255, 255, 255).setDrawColor(...(bad ? DANGER : INK)).setLineWidth(0.15);
    doc.roundedRect(X(it.cx) - tw / 2, Y(it.cy) - 2, tw, 4, 0.8, 0.8, "FD");
    doc.setTextColor(...(bad ? DANGER : INK));
    doc.text(label, X(it.cx), Y(it.cy) + 0.9, { align: "center" });
  });

  // Dimensions: text 2 mm high on paper
  const fs = 2 * scale;
  const dims = computeDims(items, aisle, fs);
  doc.setLineWidth(0.12).setDrawColor(154, 161, 169);
  for (const [x1, y1, x2, y2] of dims.ext) doc.line(X(x1), Y(y1), X(x2), Y(y2));
  doc.setLineWidth(0.18).setDrawColor(61, 67, 74);
  for (const [x1, y1, x2, y2] of dims.lines) doc.line(X(x1), Y(y1), X(x2), Y(y2));
  doc.setLineWidth(0.3);
  for (const [x, y] of dims.ticks) doc.line(X(x) - 0.6, Y(y) + 0.6, X(x) + 0.6, Y(y) - 0.6);
  for (const tx of dims.texts) {
    doc.setFont("helvetica", tx.bold ? "bold" : "normal").setFontSize(tx.bold ? 6.5 : 5.8).setTextColor(...(tx.bold ? INK : [61, 67, 74]));
    doc.text(tx.text, X(tx.x), Y(tx.y), { align: "center", baseline: tx.baseline ?? "middle", angle: -(tx.angle ?? 0) });
  }

  // ── Title block ──
  const sx = PAGE.w - margin - SIDEBAR;
  let y = margin;
  doc.setDrawColor(...LINE).setLineWidth(0.3).line(sx - 6, margin, sx - 6, PAGE.h - margin - 8);
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...INK);
  doc.text("S O M M E S P R O", sx, y + 4);
  y += 14;
  doc.setFont("helvetica", "normal").setFontSize(18);
  doc.text(p.title, sx, y);
  y += 7;
  doc.setFontSize(9).setTextColor(...MUTED);
  const date = new Date().toLocaleDateString(t.lang === "fr" ? "fr-FR" : "en-GB", { year: "numeric", month: "long", day: "numeric" });
  doc.text(`${t.pdf.date} : ${date}`, sx, y);
  y += 10;

  const row = (label, value, color = INK) => {
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED).text(label, sx, y);
    doc.setFont("helvetica", "bold").setTextColor(...color).text(String(value), sx + SIDEBAR, y, { align: "right" });
    y += 3;
    doc.setDrawColor(...LINE).setLineWidth(0.2).line(sx, y, sx + SIDEBAR, y);
    y += 5;
  };
  row(p.scale, `1:${scale}`);
  row(p.room, `${(room.w / 1000).toLocaleString("fr-FR")} × ${(room.h / 1000).toLocaleString("fr-FR")} m`);
  row(p.aisle, `${aisle} mm`);
  row(p.count, checkoutCount(items));
  for (const l of accessoryLines(items)) row(l.label, l.value);
  if (conflicts.size) row(p.conflicts, conflicts.size, DANGER);
  y += 4;

  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED).text(p.models.toUpperCase(), sx, y);
  y += 6;
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...INK);
  for (const g of summarize(items)) {
    const lines = doc.splitTextToSize(`${g.count} × ${g.label}`, SIDEBAR);
    doc.text(lines, sx, y);
    y += lines.length * 4.2 + 1.5;
  }

  // Legend
  y = PAGE.h - margin - 58;
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED).text(p.legend.toUpperCase(), sx, y);
  y += 5;
  const legend = (fill, label, dashed) => {
    doc.setFillColor(...fill).setDrawColor(...(dashed ? ACCENT : INK)).setLineWidth(0.15);
    if (dashed) doc.setLineDashPattern([0.8, 0.8], 0);
    doc.rect(sx, y - 3, 6, 4, "FD");
    doc.setLineDashPattern([], 0);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...INK).text(label, sx + 9, y);
    y += 6;
  };
  legend([90, 96, 104], p.legendBelt);
  legend([196, 201, 207], p.legendTray);
  legend([232, 240, 253], p.legendAisle, true);
  drawPmr(doc, sx + 3, y - 1, 4.2);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...INK).text(p.legendPmr, sx + 9, y);
  y += 6;
  doc.setFillColor(...INK).rect(sx, y - 1.6, 6, 1.2, "F");
  doc.rect(sx - 0.4, y - 2, 1.2, 2, "F").rect(sx + 5.2, y - 2, 1.2, 2, "F");
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...INK).text(p.legendGuidage, sx + 9, y);
  y += 6;
  doc.setFillColor(...EAS_FILL).setDrawColor(...INK).setLineWidth(0.25).rect(sx + 2.2, y - 3.5, 1.6, 4, "FD");
  doc.text(p.legendEas, sx + 9, y);
  y += 6;
  doc.setDrawColor(61, 67, 74).setLineWidth(0.2).line(sx, y - 1.5, sx + 6, y - 1.5);
  doc.setLineWidth(0.3).line(sx - 0.5, y - 1, sx + 0.5, y - 2).line(sx + 5.5, y - 1, sx + 6.5, y - 2);
  doc.text(p.legendDims, sx + 9, y);


  footers(doc);
  doc.save(p.filename);
}
