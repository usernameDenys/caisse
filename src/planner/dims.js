// Automatic dimensions (cotes) for each line of checkouts:
//   • chain across the line: checkout (tray to tray for a double), aisle,
//     antenna/guidage line, aisle, …
//   • overall length of the line
//   • length of the first checkout only
// drawn on the tray side of the line.
// Returned as drawing primitives in plan millimetres, shared by the SVG view
// and the PDF.
import { bounds, aisleWorld, isCheckout } from "./footprint.js";

const EPS = 1;

/** Groups items into lines: same orientation and overlapping across the line. */
function findLines(items) {
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const bx = items.map(bounds);
  const across = (i) => (items[i].rot % 180 === 0 ? [bx[i].y0, bx[i].y1] : [bx[i].x0, bx[i].x1]);
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].rot % 180 !== items[j].rot % 180) continue;
      const [a0, a1] = across(i);
      const [b0, b1] = across(j);
      if (a0 < b1 - EPS && b0 < a1 - EPS) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  items.forEach((it, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(it);
  });
  return [...groups.values()].filter((g) => g.some(isCheckout));
}

/** Merge overlapping [a, b] intervals of the same kind. */
function merge(intervals) {
  const sorted = [...intervals].sort((p, q) => p.a - q.a);
  const out = [];
  for (const iv of sorted) {
    const last = out.at(-1);
    if (last && iv.a <= last.b + EPS) last.b = Math.max(last.b, iv.b);
    else out.push({ ...iv });
  }
  return out;
}

// Thousands with a plain space: the PDF's standard fonts have no narrow no-break space
const fmt = (mm) => Math.round(mm).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ");

/**
 * @param {object[]} items
 * @param {number} aisle
 * @param {number} fs  text size in plan mm (depends on zoom / paper scale)
 * @returns {{lines: number[][], ticks: number[][], texts: {x:number,y:number,text:string,angle:number,bold?:boolean}[]}}
 */
export function computeDims(items, aisle, fs) {
  const out = { lines: [], ticks: [], texts: [], ext: [], totals: [] };

  for (const line of findLines(items)) {
    const first = line.find(isCheckout);
    const alongX = first.rot % 180 === 0;
    // Map (u along the line, v across it) ↔ plan (x, y)
    const P = (u, v) => (alongX ? [u, v] : [v, u]);
    const span = (r) => (alongX ? [r.x0, r.x1] : [r.y0, r.y1]);
    const cross = (r) => (alongX ? [r.y0, r.y1] : [r.x0, r.x1]);

    // Tray side of the checkouts (local −Y), where the dimensions go
    const tray = { 0: [0, -1], 90: [1, 0], 180: [0, 1], 270: [-1, 0] }[((first.rot % 360) + 360) % 360];
    const side = alongX ? tray[1] : tray[0]; // +1 / −1 across the line

    // Intervals along the line
    const units = new Map();
    for (const it of line.filter(isCheckout)) {
      const key = it.group ?? it.id;
      const [a, b] = span(bounds(it));
      const u = units.get(key);
      units.set(key, u ? { a: Math.min(u.a, a), b: Math.max(u.b, b), it } : { a, b, it });
    }
    const bodies = [...units.values()];
    const aisles = merge(line.filter(isCheckout).map((it) => {
      const [a, b] = span(aisleWorld(it, aisle));
      return { a, b };
    }));
    const rails = merge(line.filter((i) => !isCheckout(i)).map((it) => {
      const [a, b] = span(bounds(it));
      return { a, b };
    }));

    // Chain: every boundary of bodies / aisles / rails, in order
    const edges = [...bodies, ...aisles, ...rails].flatMap((iv) => [iv.a, iv.b]).sort((p, q) => p - q);
    const stops = edges.filter((e, i) => i === 0 || e - edges[i - 1] > EPS);
    if (stops.length < 2) continue;
    const u0 = stops[0];
    const u1 = stops.at(-1);

    // Across: the edge of the line on the entry side
    const crossAll = line.map((it) => cross(bounds(it)));
    const edge = side > 0 ? Math.max(...crossAll.map((c) => c[1])) : Math.min(...crossAll.map((c) => c[0]));
    const vChain = edge + side * (400 + fs);
    const vTotal = vChain + side * 3.4 * fs;
    const textGap = 0.45 * fs;
    const angle = alongX ? 0 : -90;

    const dimLine = (ua, ub, v) => out.lines.push([...P(ua, v), ...P(ub, v)]);
    const tick = (u, v) => out.ticks.push(P(u, v));

    // Extension lines from the line edge to past the total dimension
    for (const u of stops) out.ext.push([...P(u, edge + side * 150), ...P(u, vChain + side * 0.4 * fs)]);
    out.ext.push([...P(u0, vChain), ...P(u0, vTotal + side * 0.4 * fs)]);
    out.ext.push([...P(u1, vChain), ...P(u1, vTotal + side * 0.4 * fs)]);

    // Chain dimension; labels that don't fit go one level further out
    dimLine(u0, u1, vChain);
    stops.forEach((u) => tick(u, vChain));
    let stagger = false;
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1];
      const b = stops[i];
      const text = fmt(b - a);
      const fits = b - a > text.length * fs * 0.62 + fs * 0.4;
      stagger = fits ? false : !stagger;
      const v = fits ? vChain - side * textGap : vChain + side * (stagger ? 1.25 : 2.25) * fs;
      out.texts.push({ ...xy(P((a + b) / 2, v)), text, angle, baseline: fits ? (side > 0 ? "bottom" : "top") : "middle" });
    }

    // Overall length of the line
    out.totals.push(u1 - u0);
    dimLine(u0, u1, vTotal);
    tick(u0, vTotal);
    tick(u1, vTotal);
    out.texts.push({ ...xy(P((u0 + u1) / 2, vTotal - side * textGap)), text: fmt(u1 - u0), angle, bold: true, baseline: side > 0 ? "bottom" : "top" });

    // Length of the first checkout (leftmost / topmost unit)
    const firstUnit = bodies.sort((p, q) => p.a - q.a)[0];
    const [c0, c1] = cross(bounds(firstUnit.it));
    const uLen = u0 - (400 + fs);
    out.ext.push([...P(firstUnit.a - 150, c0), ...P(uLen - 0.4 * fs, c0)]);
    out.ext.push([...P(firstUnit.a - 150, c1), ...P(uLen - 0.4 * fs, c1)]);
    out.lines.push([...P(uLen, c0), ...P(uLen, c1)]);
    tick(uLen, c0);
    tick(uLen, c1);
    // Text on the inner side (towards the checkout), clear of walls
    out.texts.push({ ...xy(P(uLen + textGap, (c0 + c1) / 2)), text: fmt(c1 - c0), angle: alongX ? -90 : 0, baseline: alongX ? "top" : "bottom" });
  }
  return out;
}

const xy = ([x, y]) => ({ x, y });
