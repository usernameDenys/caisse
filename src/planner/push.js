// "Make room": when new elements are dropped into a row, the neighbours on
// each side slide away just enough so nothing overlaps a body or blocks a
// customer aisle. Everything further along the row moves by the same amount,
// so the spacing between the other checkouts is kept.
import { bounds, aisleWorld } from "./footprint.js";

/** Bounding box of items, including their customer aisles. */
function extentOf(items, aisle) {
  const e = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const it of items) {
    for (const r of [bounds(it), aisleWorld(it, aisle)]) {
      if (!r) continue;
      e.x0 = Math.min(e.x0, r.x0);
      e.y0 = Math.min(e.y0, r.y0);
      e.x1 = Math.max(e.x1, r.x1);
      e.y1 = Math.max(e.y1, r.y1);
    }
  }
  return e;
}

const EPS = 1;

/**
 * @param {object[]} items       all items (placed ones included)
 * @param {Set<string>} placedIds the elements being inserted
 * @param {number} aisle
 * @param {{w: number, h: number}} [room] when given, nothing is pushed through the walls
 * @returns {Map<string, {dx: number, dy: number}>} shifts (may include the placed items)
 */
export function makeRoom(items, placedIds, aisle, room) {
  const placed = items.filter((i) => placedIds.has(i.id));
  const shifts = new Map();
  if (!placed.length) return shifts;

  const ext = extentOf(placed, aisle);
  // Checkouts, rails and antennas all stand lengthwise along their local Y,
  // so a row runs across that: along X when unrotated, along Y at 90°/270°.
  const axis = placed[0].rot % 180 === 0 ? "x" : "y";
  const [lo, hi, plo, phi] = axis === "x" ? ["x0", "x1", "y0", "y1"] : ["y0", "y1", "x0", "x1"];
  const mid = (ext[lo] + ext[hi]) / 2;

  // Other items as units (a pair moves as one)
  const units = new Map();
  for (const it of items) {
    if (placedIds.has(it.id)) continue;
    const key = it.group ?? it.id;
    if (!units.has(key)) units.set(key, []);
    units.get(key).push(it);
  }

  // Units in the same band (overlapping across the row direction)
  const band = [];
  for (const members of units.values()) {
    const e = extentOf(members, aisle);
    if (e[plo] < ext[phi] - EPS && ext[plo] < e[phi] - EPS) {
      band.push({ members, e, center: (e[lo] + e[hi]) / 2 });
    }
  }

  // How far each side has to move to clear the dropped elements
  let forward = 0;
  let backward = 0;
  for (const u of band) {
    if (u.center >= mid) forward = Math.max(forward, ext[hi] - u.e[lo]);
    else backward = Math.max(backward, u.e[hi] - ext[lo]);
  }

  // A wall behind the backward side: push everything forward instead (the
  // dropped elements slide forward too, the backward side stays put).
  let placedShift = 0;
  if (room && backward > EPS) {
    const before = band.filter((u) => u.center < mid);
    const minLo = Math.min(...before.map((u) => u.e[lo]));
    if (minLo - backward < -EPS) {
      placedShift = backward;
      forward += backward;
      backward = 0;
    }
  }

  const vec = (d) => (axis === "x" ? { dx: d, dy: 0 } : { dx: 0, dy: d });
  for (const u of band) {
    const d = u.center >= mid ? (forward > EPS ? forward : 0) : backward > EPS ? -backward : 0;
    if (!d) continue;
    for (const it of u.members) shifts.set(it.id, vec(d));
  }
  if (placedShift) for (const it of placed) shifts.set(it.id, vec(placedShift));
  return shifts;
}
