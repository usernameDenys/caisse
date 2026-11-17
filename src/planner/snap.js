// Magnetic snapping while dragging.
//
// The moving group's edges (bodies and checkout aisles) are pulled onto the
// edges of nearby items and the room walls, so checkouts click into place:
//   • body against body          → touching (e.g. tray to tray)
//   • aisle edge against a body  → exactly one customer aisle apart
//   • same-side edges            → aligned rows
import { bounds, aisleWorld } from "./footprint.js";

const shift = (r, dx, dy) => ({ x0: r.x0 + dx, x1: r.x1 + dx, y0: r.y0 + dy, y1: r.y1 + dy });

// Only items that are roughly beside each other on the other axis attract
const NEAR = 1500; // mm
const nearOn = (a, b, axis) =>
  axis === "x" ? a.y0 < b.y1 + NEAR && b.y0 < a.y1 + NEAR : a.x0 < b.x1 + NEAR && b.x0 < a.x1 + NEAR;

function boxesOf(items, aisle) {
  const out = [];
  for (const it of items) {
    out.push({ r: bounds(it), aisle: false });
    const a = aisleWorld(it, aisle);
    if (a) out.push({ r: a, aisle: true });
  }
  return out;
}

/**
 * @param {object[]} moving   items of the dragged group, at their proposed position
 * @param {object[]} others   every other item
 * @param {{w:number,h:number}} room
 * @param {number} aisle      mm
 * @param {number} threshold  max pull distance, mm
 * @returns {{dx: number, dy: number, snappedX: boolean, snappedY: boolean, guides: object[]}}
 */
export function magnet(moving, others, room, aisle, threshold) {
  const mine = boxesOf(moving, aisle);
  const theirs = boxesOf(others, aisle);
  const result = { dx: 0, dy: 0, snappedX: false, snappedY: false, guides: [] };

  for (const axis of ["x", "y"]) {
    const [lo, hi] = axis === "x" ? ["x0", "x1"] : ["y0", "y1"];
    let best = null;
    const consider = (from, to, m, t) => {
      const d = to - from;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: to, m, t };
    };

    for (const m of mine) {
      for (const t of theirs) {
        if (m.aisle && t.aisle) continue; // aisles never attract aisles
        if (!nearOn(m.r, t.r, axis)) continue;
        consider(m.r[lo], t.r[hi], m.r, t.r); // my left edge to its right edge
        consider(m.r[hi], t.r[lo], m.r, t.r);
        if (!m.aisle && !t.aisle) {
          consider(m.r[lo], t.r[lo], m.r, t.r); // alignment
          consider(m.r[hi], t.r[hi], m.r, t.r);
        }
      }
      // Room walls
      const wall = { x0: 0, y0: 0, x1: room.w, y1: room.h };
      consider(m.r[lo], 0, m.r, wall);
      consider(m.r[hi], axis === "x" ? room.w : room.h, m.r, wall);
    }

    if (best) {
      result[axis === "x" ? "dx" : "dy"] = best.d;
      result[axis === "x" ? "snappedX" : "snappedY"] = true;
      // Guide line along the matched edge, spanning both boxes
      const m = shift(best.m, axis === "x" ? best.d : 0, axis === "y" ? best.d : 0);
      result.guides.push(
        axis === "x"
          ? { x1: best.at, x2: best.at, y1: Math.min(m.y0, best.t.y0), y2: Math.max(m.y1, best.t.y1) }
          : { y1: best.at, y2: best.at, x1: Math.min(m.x0, best.t.x0), x2: Math.max(m.x1, best.t.x1) }
      );
    }
  }
  return result;
}
