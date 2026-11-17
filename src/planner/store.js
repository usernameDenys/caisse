// Plan state with undo/redo and autosave to this browser.
import { footprint, bounds, aisleWorld, isCheckout, GUIDE, EAS, PMR_AISLE } from "./footprint.js";

const STORAGE_KEY = "sommespro-planner-v1";
const HISTORY_LIMIT = 100;

export const DEFAULT_ITEM = { mirror: "right", belt: "L", tray: "1250_L" };

function initialState() {
  return {
    room: { w: 20000, h: 12000 },
    aisle: 650,
    items: [],
    nextId: 1,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.room || !Array.isArray(s.items)) return null;
    // Lane-number posts were removed (2026-11) — drop them from saved plans
    s.items = s.items.filter((i) => i.type !== "sign");
    return { ...initialState(), ...s };
  } catch {
    return null;
  }
}

export const store = {
  state: load() ?? initialState(),
  // Selection: every selected id (groups are always selected whole) and the
  // "primary" item the user clicked last, shown in the properties panel.
  selection: new Set(),
  primary: null,
  past: [],
  future: [],
  listeners: [],

  subscribe(fn) {
    this.listeners.push(fn);
  },

  emit() {
    this.listeners.forEach((fn) => fn(this.state));
  },

  /** Apply a mutation as one undoable step. */
  commit(mutator, { save = true } = {}) {
    this.past.push(JSON.stringify(this.state));
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    const draft = structuredClone(this.state);
    mutator(draft);
    this.state = draft;
    this.pruneSelection();
    if (save) this.persist();
    this.emit();
  },

  /** Live change without a history entry (e.g. while dragging). */
  preview(mutator) {
    mutator(this.state);
    this.emit();
  },

  /** Start a drag: snapshot now, commit later with endPreview(). */
  beginPreview() {
    this._snapshot = JSON.stringify(this.state);
  },

  endPreview() {
    if (this._snapshot && this._snapshot !== JSON.stringify(this.state)) {
      this.past.push(this._snapshot);
      this.future = [];
      this.persist();
    }
    this._snapshot = null;
    this.emit();
  },

  /** Abandon a preview started with beginPreview(). */
  cancelPreview() {
    if (this._snapshot) this.state = JSON.parse(this._snapshot);
    this._snapshot = null;
    this.pruneSelection();
    this.emit();
  },

  undo() {
    if (!this.past.length) return;
    this.future.push(JSON.stringify(this.state));
    this.state = JSON.parse(this.past.pop());
    this.pruneSelection();
    this.persist();
    this.emit();
  },

  redo() {
    if (!this.future.length) return;
    this.past.push(JSON.stringify(this.state));
    this.state = JSON.parse(this.future.pop());
    this.pruneSelection();
    this.persist();
    this.emit();
  },

  /**
   * @param {string|string[]|null} ids
   * @param {{add?: boolean, toggle?: boolean}} [mode] add to / toggle in the current selection
   */
  select(ids, { add = false, toggle = false } = {}) {
    const list = ids == null ? [] : Array.isArray(ids) ? ids : [ids];
    const next = add || toggle ? new Set(this.selection) : new Set();
    for (const id of list) {
      const group = this.groupIds(id);
      const remove = toggle && this.selection.has(id);
      group.forEach((g) => (remove ? next.delete(g) : next.add(g)));
    }
    this.selection = next;
    const last = list.at(-1);
    this.primary = last && next.has(last) ? last : [...next][0] ?? null;
    this.emit();
  },

  pruneSelection() {
    const ids = new Set(this.state.items.map((i) => i.id));
    this.selection = new Set([...this.selection].filter((id) => ids.has(id)));
    if (!this.selection.has(this.primary)) this.primary = [...this.selection][0] ?? null;
  },

  /** True when something is selected. */
  get selected() {
    return this.selection.size > 0;
  },

  get selectedItems() {
    return this.state.items.filter((i) => this.selection.has(i.id));
  },

  /** The single item (or single group) being edited, else null. */
  get selectedItem() {
    if (!this.primary) return null;
    const group = this.groupIds(this.primary);
    if (group.size !== this.selection.size || ![...group].every((id) => this.selection.has(id))) return null;
    return this.state.items.find((i) => i.id === this.primary) ?? null;
  },

  /** Ids moved/rotated together with `id` (its group, or just itself). */
  groupIds(id, items = this.state.items) {
    const it = items.find((i) => i.id === id);
    if (!it?.group) return new Set(it ? [id] : []);
    return new Set(items.filter((i) => i.group === it.group).map((i) => i.id));
  },

  persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* private mode / quota — the plan just isn't remembered */
    }
  },

  reset() {
    this.commit((s) => Object.assign(s, initialState()));
  },
};

// ── Helpers that build items ─────────────────────────────────────────────
export function newItem(draft, config, cx, cy, rot = 0) {
  const item = { id: `c${draft.nextId++}`, type: "checkout", ...DEFAULT_ITEM, ...config, cx, cy, rot };
  draft.items.push(item);
  return item;
}

export function newGuidage(draft, cx, cy, sections = 3, rot = 0) {
  const item = { id: `g${draft.nextId++}`, type: "guidage", sections, cx, cy, rot };
  draft.items.push(item);
  return item;
}

export function newEas(draft, cx, cy, rot = 0) {
  const item = { id: `e${draft.nextId++}`, type: "eas", cx, cy, rot };
  draft.items.push(item);
  return item;
}

/**
 * Two checkouts tray to tray: Gaucher on the left, Droitier on the right,
 * customer aisles on the outer sides. Moves and rotates as one group.
 */
export function newPair(draft, config, x0, top) {
  const fp = footprint({ ...DEFAULT_ITEM, ...config, mirror: "right" });
  const group = `p${draft.nextId++}`;
  const cy = top + fp.h / 2;
  const a = newItem(draft, { ...config, mirror: "right" }, x0 + fp.w / 2, cy);
  const b = newItem(draft, { ...config, mirror: "left" }, x0 + fp.w * 1.5, cy);
  a.group = b.group = group;
  return [a, b];
}

/** Bottom edge (mm) of everything already placed, for stacking new rows. */
export function contentBottom(items) {
  return items.reduce((bottom, it) => Math.max(bottom, bounds(it).y1), 0);
}

/**
 * Places a row of checkouts with a customer aisle on the customer side of
 * each one. Options:
 *   pairs   — two checkouts tray to tray
 *   guidage — rail line on the outer edge of each aisle
 *   eas     — anti-theft antenna in that line, level with the tray
 *   pmr     — the first checkout gets an accessible 900 mm passage
 * A line between two neighbouring aisles is shared (one rail, one antenna).
 * @returns {string[]} ids of the placed checkouts
 */
export function placeRow(draft, config, count, aisle, { pairs = false, guidage = false, eas = false, pmr = false } = {}, margin = 1000) {
  const base = { ...DEFAULT_ITEM, ...config };
  const fp = footprint(base);
  const isFirstLine = !draft.items.length;
  const existing = new Set(draft.items.map((i) => i.id));
  // Lines are 2.5 m apart (room for the dimensions on the tray side); a new
  // line goes below the existing ones.
  const top = isFirstLine ? margin + 1000 : contentBottom(draft.items) + 2500;
  const cy = top + fp.h / 2;
  const line = guidage || eas ? Math.max(guidage ? GUIDE.post : 0, eas ? EAS.thick : 0) : 0;
  const ids = [];
  const lines = []; // x of each rail line, created once

  // Walk left to right; `x` is the next free position
  let x = margin;
  const addLine = () => {
    if (!line) return;
    lines.push(x + line / 2);
    x += line;
  };

  if (pairs) {
    for (let placed = 0; placed < count; placed += 2) {
      // Shared line between the previous pair's aisle and this one's
      addLine();
      const firstPmr = pmr && placed === 0;
      x += firstPmr ? PMR_AISLE : aisle;
      const [g, d] = newPair(draft, base, x, top);
      if (firstPmr) g.pmr = true;
      ids.push(g.id);
      if (placed + 1 < count) {
        ids.push(d.id);
        x += fp.w * 2 + aisle;
      } else {
        // Odd count: drop the right-hand checkout of the last pair
        draft.items = draft.items.filter((i) => i !== d);
        delete g.group;
        x += fp.w;
      }
    }
    // Closing line after the last aisle (an odd last checkout has none on the right)
    if (count % 2 === 0) addLine();
  } else {
    const customerLeft = fp.customerSide < 0;
    for (let i = 0; i < count; i++) {
      const isPmr = pmr && i === 0;
      const lane = isPmr ? PMR_AISLE : aisle;
      if (customerLeft) {
        addLine();
        x += lane;
      }
      const c = newItem(draft, base, x + fp.w / 2, cy);
      if (isPmr) c.pmr = true;
      ids.push(c.id);
      x += fp.w;
      if (!customerLeft) {
        x += lane;
        addLine();
      }
    }
  }

  // Antenna level with the trays (top of the row), guidage from there to the
  // belt-entry end — both stay within the length of the checkouts.
  const rowTop = cy - fp.h / 2;
  const rowBottom = cy + fp.h / 2;
  const railStart = eas ? rowTop + EAS.length + EAS.gap : rowTop;
  const sections = Math.floor((rowBottom - railStart) / GUIDE.section);
  for (const lx of lines) {
    if (eas) newEas(draft, lx, rowTop + EAS.length / 2);
    if (guidage && sections > 0) newGuidage(draft, lx, rowBottom - (sections * GUIDE.section) / 2, sections);
  }

  // Centre the new line in the room: always across, and also vertically when
  // it is the first line (later lines stack below the previous ones).
  const added = draft.items.filter((i) => !existing.has(i.id));
  const ext = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const it of added) {
    for (const r of [bounds(it), aisleWorld(it, aisle)]) {
      if (!r) continue;
      ext.x0 = Math.min(ext.x0, r.x0);
      ext.y0 = Math.min(ext.y0, r.y0);
      ext.x1 = Math.max(ext.x1, r.x1);
      ext.y1 = Math.max(ext.y1, r.y1);
    }
  }
  const snap = (v) => Math.round(v / 50) * 50;
  const dx = snap(draft.room.w / 2 - (ext.x0 + ext.x1) / 2);
  const dy = isFirstLine ? snap(draft.room.h / 2 - (ext.y0 + ext.y1) / 2) : 0;
  for (const it of added) {
    it.cx += dx;
    it.cy += dy;
  }

  // If the stack of lines now runs past a wall, move the whole layout
  // (relative positions kept) so it is centred vertically in the room.
  const all = { y0: Infinity, y1: -Infinity };
  for (const it of draft.items) {
    for (const r of [bounds(it), aisleWorld(it, aisle)]) {
      if (!r) continue;
      all.y0 = Math.min(all.y0, r.y0);
      all.y1 = Math.max(all.y1, r.y1);
    }
  }
  // 1.4 m kept free above the top line for its dimensions
  const dimSpace = 1400;
  if (all.y0 - dimSpace < 0 || all.y1 > draft.room.h) {
    const shift = snap((draft.room.h + dimSpace) / 2 - (all.y0 + all.y1) / 2);
    for (const it of draft.items) it.cy += shift;
  }
  return ids;
}

/** Rotates the items in `ids` by `delta` degrees around their common centre. */
export function rotateGroup(draft, ids, delta) {
  const items = draft.items.filter((i) => ids.has(i.id));
  const bx = items.map(bounds);
  const gx = (Math.min(...bx.map((b) => b.x0)) + Math.max(...bx.map((b) => b.x1))) / 2;
  const gy = (Math.min(...bx.map((b) => b.y0)) + Math.max(...bx.map((b) => b.y1))) / 2;
  const turns = (((delta / 90) % 4) + 4) % 4;
  for (const it of items) {
    let dx = it.cx - gx;
    let dy = it.cy - gy;
    for (let k = 0; k < turns; k++) [dx, dy] = [-dy, dx];
    it.cx = Math.round(gx + dx);
    it.cy = Math.round(gy + dy);
    it.rot = (it.rot + delta + 360) % 360;
  }
}

/** Copies the items in `ids` next to the originals; returns the new lead id. */
export function duplicateGroup(draft, ids, leadId, aisle) {
  const items = draft.items.filter((i) => ids.has(i.id));
  const bx = items.map(bounds);
  const width = Math.max(...bx.map((b) => b.x1)) - Math.min(...bx.map((b) => b.x0));
  const offset = width + (items.some(isCheckout) ? aisle : 200);
  const group = items.length > 1 ? `p${draft.nextId++}` : undefined;
  let lead = null;
  for (const it of items) {
    const copy = { ...structuredClone(it), id: `${it.id[0]}${draft.nextId++}`, cx: it.cx + offset };
    if (group) copy.group = group;
    draft.items.push(copy);
    if (it.id === leadId) lead = copy.id;
  }
  return lead;
}
