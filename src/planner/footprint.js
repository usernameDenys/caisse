// Top-view footprint of the Caisse Standard, in millimetres.
//
// Measured from the 3D model (assets-src/Caisse3js.glb): plan X = model x,
// plan Y = model z. In the default orientation ("right" = Gaucher) the
// customer walks on the −X side (behind the plexi screen) and the cashier
// sits on the +X side next to the cabinet. Goods flow along Y, from the end
// of the belt (max Y) towards the tray (min Y).
//
// ⚠ Values come from the model, not from a manufacturing drawing — check them
//   against the real product before relying on them for installation.

const BELT_END = { L: 1811, M: 1613, S: 1211 };
const TRAY = {
  "1250_L": { x: 1768, y: -1528 },
  "700_L": { x: 1405, y: -1528 },
  "700_M": { x: 1405, y: -1326 },
};

export const BELT_LABEL = { L: "1 700", M: "1 400", S: "900" };
// Heights measured on the model (mm): top of the conveyor belt, and overall
// (lantern post on the cabinet).
export const HEIGHTS = { belt: 857, overall: 1997 };
export const TRAY_LABEL = { "1250_L": "1200 × 1100", "700_L": "700 × 1100", "700_M": "700 × 600" };

const cache = new Map();

/**
 * Footprint in local coordinates centred on its bounding box.
 * @returns {{ w: number, h: number,
 *   parts: {kind: string, x: number, y: number, w: number, h: number}[],
 *   screen: {x: number, y0: number, y1: number},
 *   flow: {x: number, y0: number, y1: number},
 *   customerSide: -1 | 1 }}
 */
export function footprint({ mirror, belt, tray }) {
  const key = `${mirror}|${belt}|${tray}`;
  if (cache.has(key)) return cache.get(key);

  const raw = [
    { kind: "station", x0: 424, x1: 1096, y0: -802, y1: 757 },
    { kind: "belt", x0: 432, x1: 1044, y0: -362, y1: BELT_END[belt] },
    { kind: "cabinet", x0: 1006, x1: 1310, y0: 326, y1: 786 },
    { kind: "tray", x0: 446, x1: TRAY[tray].x, y0: TRAY[tray].y, y1: -362 },
  ];
  const minX = Math.min(...raw.map((p) => p.x0));
  const maxX = Math.max(...raw.map((p) => p.x1));
  const minY = Math.min(...raw.map((p) => p.y0));
  const maxY = Math.max(...raw.map((p) => p.y1));
  const w = maxX - minX;
  const h = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const flip = mirror === "left" ? -1 : 1;

  const fx = (x) => flip * (x - cx);
  const parts = raw.map((p) => {
    const a = fx(p.x0);
    const b = fx(p.x1);
    return { kind: p.kind, x: Math.min(a, b), y: p.y0 - cy, w: Math.abs(b - a), h: p.y1 - p.y0 };
  });

  const fp = {
    w,
    h,
    parts,
    screen: { x: fx(449), y0: -576 - cy, y1: 435 - cy },
    flow: { x: fx(738), y0: BELT_END[belt] - cy - 250, y1: -362 - cy + 150 },
    customerSide: /** @type {-1|1} */ (-flip),
    // Centre of the footprint in model coordinates (mm), for placing the 3D model
    modelCenter: { x: cx, y: cy },
  };
  cache.set(key, fp);
  return fp;
}

// ── World-space geometry (rotation in 90° steps only) ────────────────────
function rotatePoint(x, y, rot) {
  switch (((rot % 360) + 360) % 360) {
    case 90:
      return [-y, x];
    case 180:
      return [-x, -y];
    case 270:
      return [y, -x];
    default:
      return [x, y];
  }
}

/** Axis-aligned world rect of a local rect for a placed item. */
export function toWorld(item, r) {
  const [ax, ay] = rotatePoint(r.x, r.y, item.rot);
  const [bx, by] = rotatePoint(r.x + r.w, r.y + r.h, item.rot);
  return {
    x0: item.cx + Math.min(ax, bx),
    y0: item.cy + Math.min(ay, by),
    x1: item.cx + Math.max(ax, bx),
    y1: item.cy + Math.max(ay, by),
  };
}

/** Accessible (PMR) checkouts always get a 900 mm customer passage. */
export const PMR_AISLE = 900;

/** Customer passage width for a checkout: PMR, or the plan's default. */
export const aisleWidth = (it, aisle) => (it.pmr ? PMR_AISLE : aisle);

/** Local rect of the customer passage alongside the checkout. */
export function aisleRect(fp, aisle) {
  return fp.customerSide < 0
    ? { x: -fp.w / 2 - aisle, y: -fp.h / 2, w: aisle, h: fp.h }
    : { x: fp.w / 2, y: -fp.h / 2, w: aisle, h: fp.h };
}

// ── Accessories ──────────────────────────────────────────────────────────
// Guidage: black square tube 40 × 40 mm, 1 m sections, posts at the joints.
export const GUIDE = { tube: 40, post: 60, section: 1000 };
// Antivol (EAS anti-theft gate): one antenna panel standing in line with the
// guidage, on the tray (exit) side. Plan footprint of its base.
export const EAS = { thick: 80, length: 450, height: 1600, gap: 100 };

export const isCheckout = (it) => (it.type ?? "checkout") === "checkout";

/** Local rects that physically occupy the floor, plus the local bbox. */
export function shapes(it) {
  if (it.type === "guidage") {
    const len = it.sections * GUIDE.section;
    const p = GUIDE.post;
    return { body: [{ x: -p / 2, y: -len / 2, w: p, h: len }], w: p, h: len };
  }
  if (it.type === "eas") {
    const { thick: w, length: h } = EAS;
    return { body: [{ x: -w / 2, y: -h / 2, w, h }], w, h };
  }
  const fp = footprint(it);
  return { body: fp.parts, w: fp.w, h: fp.h };
}

export function bounds(item) {
  const { w, h } = shapes(item);
  return toWorld(item, { x: -w / 2, y: -h / 2, w, h });
}

/** World rect of a checkout's customer aisle (null for accessories). */
export function aisleWorld(item, aisle) {
  return isCheckout(item) ? toWorld(item, aisleRect(footprint(item), aisleWidth(item, aisle))) : null;
}

const EPS = 1; // mm — touching is fine
export const overlaps = (a, b) => a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.y0 < b.y1 - EPS && b.y0 < a.y1 - EPS;
const inside = (a, room) => a.x0 >= -EPS && a.y0 >= -EPS && a.x1 <= room.w + EPS && a.y1 <= room.h + EPS;

/**
 * Finds layout problems.
 * @returns {Map<string, Set<"overlap"|"aisle"|"outside">>} item id → problems
 */
export function findConflicts(items, room, aisle) {
  const geo = items.map((it) => ({
    it,
    checkout: isCheckout(it),
    body: shapes(it).body.map((p) => toWorld(it, p)),
    aisle: aisleWorld(it, aisle),
  }));
  const out = new Map();
  const flag = (id, kind) => {
    if (!out.has(id)) out.set(id, new Set());
    out.get(id).add(kind);
  };

  for (const g of geo) {
    if (![...g.body, ...(g.aisle ? [g.aisle] : [])].every((r) => inside(r, room))) flag(g.it.id, "outside");
  }
  for (let i = 0; i < geo.length; i++) {
    for (let j = 0; j < geo.length; j++) {
      if (i === j) continue;
      const a = geo[i];
      const b = geo[j];
      // Guidage sections may touch or cross each other freely
      const bothAccessories = !a.checkout && !b.checkout;
      if (j > i && !bothAccessories && a.body.some((ra) => b.body.some((rb) => overlaps(ra, rb)))) {
        flag(a.it.id, "overlap");
        flag(b.it.id, "overlap");
      }
      if (a.aisle && b.body.some((rb) => overlaps(a.aisle, rb))) {
        flag(a.it.id, "aisle");
        flag(b.it.id, "aisle");
      }
    }
  }
  return out;
}
