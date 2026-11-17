// SVG plan view: rendering, selection, drag (ortho + magnet + grid), pan and zoom.
// World units are millimetres; the SVG viewBox maps them to screen pixels.
import { footprint, aisleRect, aisleWidth, aisleWorld, bounds, isCheckout, GUIDE, EAS } from "./footprint.js";
import { store } from "./store.js";
import { magnet } from "./snap.js";
import { makeRoom } from "./push.js";
import { computeDims } from "./dims.js";

export const SNAP = 50; // mm grid
const MAGNET_PX = 18; // pull distance on screen
const gridSnap = (v) => Math.round(v / SNAP) * SNAP;
const fmt = (mm) => `${Math.round(mm).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ")} mm`;

export function createCanvas(svg, { onCursor } = {}) {
  const view = { x: 0, y: 0, scale: 0.05 }; // scale = px per mm
  const opts = { ortho: true, magnet: true, dims: true };
  let conflicts = new Map();
  let guides = [];

  // ── View transform ─────────────────────────────────────────────────────
  let lastFs = 0;
  function applyView() {
    const { clientWidth: w, clientHeight: h } = svg;
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${w / view.scale} ${h / view.scale}`);
    // Dimension text is sized for the screen: redraw when the zoom changes enough
    if (opts.dims && Math.abs(dimFs() - lastFs) > lastFs * 0.08) requestAnimationFrame(render);
  }

  /** Dimension text height in plan mm, ~11 px on screen. */
  const dimFs = () => Math.min(Math.max(11 / view.scale, 60), 900);

  function dimsSvg() {
    if (!opts.dims || !store.state.items.length) return "";
    const fs = (lastFs = dimFs());
    const d = computeDims(store.state.items, store.state.aisle, fs);
    const t = fs * 0.3;
    const baseline = { bottom: "text-after-edge", top: "hanging", middle: "central" };
    return `<g class="dims">
      ${d.ext.map(([x1, y1, x2, y2]) => `<line class="dim-ext" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`).join("")}
      ${d.lines.map(([x1, y1, x2, y2]) => `<line class="dim-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`).join("")}
      ${d.ticks.map(([x, y]) => `<line class="dim-tick" x1="${x - t}" y1="${y + t}" x2="${x + t}" y2="${y - t}" />`).join("")}
      ${d.texts
        .map(
          (tx) =>
            `<text class="dim-text${tx.bold ? " is-total" : ""}" x="${tx.x}" y="${tx.y}" font-size="${fs}" dominant-baseline="${baseline[tx.baseline] ?? "central"}"${tx.angle ? ` transform="rotate(${tx.angle} ${tx.x} ${tx.y})"` : ""}>${tx.text}</text>`
        )
        .join("")}
    </g>`;
  }

  function toWorld(e) {
    const rect = svg.getBoundingClientRect();
    return { x: view.x + (e.clientX - rect.left) / view.scale, y: view.y + (e.clientY - rect.top) / view.scale };
  }

  function fit() {
    const { room, items } = store.state;
    let x0 = 0, y0 = 0, x1 = room.w, y1 = room.h;
    for (const it of items) {
      const b = bounds(it);
      x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
      x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    }
    const pad = 1500;
    const w = svg.clientWidth || 800;
    const h = svg.clientHeight || 600;
    view.scale = Math.min(w / (x1 - x0 + pad * 2), h / (y1 - y0 + pad * 2));
    view.x = (x0 + x1) / 2 - w / view.scale / 2;
    view.y = (y0 + y1) / 2 - h / view.scale / 2;
    applyView();
  }

  function zoomAt(factor, cx, cy) {
    const next = Math.min(Math.max(view.scale * factor, 0.005), 1);
    const k = view.scale / next;
    view.x = cx - (cx - view.x) * k;
    view.y = cy - (cy - view.y) * k;
    view.scale = next;
    applyView();
  }

  function zoomBy(factor) {
    zoomAt(factor, view.x + svg.clientWidth / view.scale / 2, view.y + svg.clientHeight / view.scale / 2);
  }

  // ── Rendering ──────────────────────────────────────────────────────────
  const selectedIds = () => store.selection;

  function checkoutSvg(it, number, sel) {
    const fp = footprint(it);
    const a = aisleRect(fp, aisleWidth(it, store.state.aisle));
    const f = fp.flow;
    const arrow = 140;
    return `
        <rect class="aisle${it.pmr ? " is-pmr" : ""}" x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" />
        ${it.pmr ? pmrSymbol(a.x + a.w / 2, a.y + a.h / 2, Math.min(a.w * 0.7, 640), it.rot) : ""}
        ${fp.parts.map((p) => `<rect class="part part-${p.kind}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" />`).join("")}
        <line class="screen" x1="${fp.screen.x}" y1="${fp.screen.y0}" x2="${fp.screen.x}" y2="${fp.screen.y1}" />
        <line class="flow" x1="${f.x}" y1="${f.y0}" x2="${f.x}" y2="${f.y1 + arrow}" />
        <path class="flow-head" d="M${f.x - arrow * 0.7} ${f.y1 + arrow} L${f.x} ${f.y1} L${f.x + arrow * 0.7} ${f.y1 + arrow} Z" />
        ${sel ? `<rect class="sel-outline" x="${-fp.w / 2 - 60}" y="${-fp.h / 2 - 60}" width="${fp.w + 120}" height="${fp.h + 120}" />` : ""}
        <text class="ck-label" transform="rotate(${-it.rot})" x="0" y="0">C${number}</text>`;
  }

  // International symbol of access, painted on the floor of a PMR aisle
  function pmrSymbol(cx, cy, size, rot) {
    const k = size / 24;
    return `
        <g class="pmr" transform="translate(${cx} ${cy}) rotate(${-rot}) scale(${k}) translate(-12 -12)">
          <rect class="pmr-bg" x="0" y="0" width="24" height="24" rx="3" />
          <circle class="pmr-fg-fill" cx="11.5" cy="4.6" r="1.9" />
          <path class="pmr-fg" d="M11.5 7.8v5.6h4.6l2.6 4.8M11.5 10.6h4" />
          <path class="pmr-fg" d="M8.6 11.4a5.4 5.4 0 1 0 7.3 6.2" />
        </g>`;
  }

  function guidageSvg(it, sel) {
    const len = it.sections * GUIDE.section;
    const t = GUIDE.tube;
    const p = GUIDE.post;
    const posts = [];
    for (let i = 0; i <= it.sections; i++) {
      posts.push(`<rect class="guide-post" x="${-p / 2}" y="${-len / 2 + i * GUIDE.section - p / 2}" width="${p}" height="${p}" />`);
    }
    return `
        <rect class="hit" x="${-150}" y="${-len / 2 - 60}" width="300" height="${len + 120}" />
        <rect class="guide-tube" x="${-t / 2}" y="${-len / 2}" width="${t}" height="${len}" />
        ${posts.join("")}
        ${sel ? `<rect class="sel-outline" x="${-120}" y="${-len / 2 - 120}" width="240" height="${len + 240}" />` : ""}`;
  }

  // Anti-theft gate: antenna panel seen from above
  function easSvg(it, sel) {
    const { thick: w, length: h } = EAS;
    return `
        <rect class="hit" x="${-200}" y="${-h / 2 - 100}" width="400" height="${h + 200}" />
        <rect class="eas" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="15" />
        <line class="eas-wave" x1="${w / 2 + 70}" y1="${-h / 3}" x2="${w / 2 + 70}" y2="${h / 3}" />
        <line class="eas-wave" x1="${-w / 2 - 70}" y1="${-h / 3}" x2="${-w / 2 - 70}" y2="${h / 3}" />
        ${sel ? `<rect class="sel-outline" x="${-w / 2 - 100}" y="${-h / 2 - 100}" width="${w + 200}" height="${h + 200}" />` : ""}`;
  }

  function render() {
    const { room, items } = store.state;
    const sel = selectedIds();
    const numbers = new Map();
    items.filter(isCheckout).forEach((it, i) => numbers.set(it.id, i + 1));

    const body = items
      .map((it) => {
        const s = sel.has(it.id);
        const inner =
          it.type === "guidage"
            ? guidageSvg(it, s)
            : it.type === "eas"
              ? easSvg(it, s)
              : checkoutSvg(it, numbers.get(it.id), s);
        return `
      <g class="item item-${it.type ?? "checkout"}${s ? " is-selected" : ""}${conflicts.has(it.id) ? " is-conflict" : ""}"
         data-id="${it.id}" transform="translate(${it.cx} ${it.cy}) rotate(${it.rot})">${inner}
      </g>`;
      })
      .join("");

    svg.innerHTML = `
      <defs>
        <pattern id="grid" width="1000" height="1000" patternUnits="userSpaceOnUse">
          <path d="M1000 0H0V1000" class="grid-line" />
        </pattern>
        <pattern id="hatch" width="160" height="160" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="160" class="hatch-line" />
        </pattern>
      </defs>
      <rect class="room-fill" x="0" y="0" width="${room.w}" height="${room.h}" />
      <rect class="room-grid" x="0" y="0" width="${room.w}" height="${room.h}" fill="url(#grid)" />
      <rect class="room" x="0" y="0" width="${room.w}" height="${room.h}" />
      <text class="dim" x="${room.w / 2}" y="-450">${fmt(room.w)}</text>
      <text class="dim" transform="translate(-450 ${room.h / 2}) rotate(-90)">${fmt(room.h)}</text>
      ${body}
      ${dimsSvg()}
      ${guides.map((g) => `<line class="snap-guide" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" />`).join("")}
      ${marquee ? `<rect class="marquee" x="${Math.min(marquee.x0, marquee.x1)}" y="${Math.min(marquee.y0, marquee.y1)}" width="${Math.abs(marquee.x1 - marquee.x0)}" height="${Math.abs(marquee.y1 - marquee.y0)}" />` : ""}`;
  }

  // ── Pointer interaction ────────────────────────────────────────────────
  //   left on an item        → select it (Shift: add/remove) and drag the selection
  //   left on empty space    → selection box (Shift: add to the selection)
  //   middle/right, Space+drag, or touch → pan
  let drag = null;
  let marquee = null;
  let spaceDown = false;

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !e.target.closest?.("input, textarea, button")) {
      spaceDown = true;
      svg.classList.add("can-pan");
      if (e.target === svg || e.target === document.body) e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code !== "Space") return;
    spaceDown = false;
    svg.classList.remove("can-pan");
  });
  svg.addEventListener("contextmenu", (e) => e.preventDefault());

  svg.addEventListener("pointerdown", (e) => {
    svg.focus({ preventScroll: true });
    const p = toWorld(e);
    const g = e.target.closest?.("[data-id]");
    svg.setPointerCapture(e.pointerId);

    const wantsPan = e.button === 1 || e.button === 2 || spaceDown || (e.pointerType === "touch" && !g);
    if (wantsPan) {
      drag = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
      svg.classList.add("is-panning");
      return;
    }
    if (e.button !== 0) return;

    if (g) {
      const id = g.dataset.id;
      if (e.shiftKey) {
        store.select(id, { toggle: true });
        if (!store.selection.has(id)) return; // just deselected — nothing to drag
      } else if (!store.selection.has(id)) {
        store.select(id);
      } else {
        store.primary = id;
      }
      store.beginPreview();
      const ids = new Set(store.selection);
      const start = new Map(store.state.items.filter((i) => ids.has(i.id)).map((i) => [i.id, { cx: i.cx, cy: i.cy }]));
      drag = { kind: "item", id, ids, start, p0: p, axis: null };
    } else {
      drag = { kind: "box", add: e.shiftKey, moved: false };
      marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    }
  });

  function moveItems(e, p) {
    let dx = p.x - drag.p0.x;
    let dy = p.y - drag.p0.y;
    const free = e.altKey; // Alt: no ortho, no magnet, no grid

    // Ortho: lock to the dominant axis (Shift inverts the toolbar setting).
    // Not while placing a new element from the panel — it follows the pointer.
    if (!free && !drag.placing && opts.ortho !== e.shiftKey) {
      const dist = Math.hypot(dx, dy) * view.scale;
      if (!drag.axis && dist > 8) drag.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      if (dist < 8) drag.axis = null;
      if (drag.axis === "x") dy = 0;
      else if (drag.axis === "y") dx = 0;
      else dx = dy = 0;
    }

    // Grid snap on the dragged item's centre
    const lead = drag.start.get(drag.id);
    if (!free) {
      dx = gridSnap(lead.cx + dx) - lead.cx;
      dy = gridSnap(lead.cy + dy) - lead.cy;
      if (drag.axis === "x") dy = 0;
      if (drag.axis === "y") dx = 0;
    }

    const items = store.state.items;
    const moving = items.filter((i) => drag.ids.has(i.id)).map((i) => ({ ...i, cx: drag.start.get(i.id).cx + dx, cy: drag.start.get(i.id).cy + dy }));

    // Magnet: pull edges onto neighbours (overrides the grid on that axis)
    guides = [];
    if (!free && opts.magnet) {
      const others = items.filter((i) => !drag.ids.has(i.id));
      const threshold = Math.min(Math.max(MAGNET_PX / view.scale, 60), 600);
      const m = magnet(moving, others, store.state.room, store.state.aisle, threshold);
      // In ortho mode the locked axis only moves for an exact alignment
      dx += m.dx;
      dy += m.dy;
      guides = m.guides;
    }

    dx = Math.round(dx);
    dy = Math.round(dy);
    store.preview(() => {
      for (const it of items) {
        const s = drag.start.get(it.id);
        if (!s) continue;
        it.cx = s.cx + dx;
        it.cy = s.cy + dy;
      }
    });
  }

  // ── Placing new elements dragged from the panel ─────────────────────────
  // The pointer is captured by the panel button, so the page feeds us its
  // moves. Neighbours make room live while hovering.
  let placing = null;

  const isOver = (clientX, clientY) => {
    const r = svg.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  };

  function placementMove(e) {
    if (!placing) return;
    const over = isOver(e.clientX, e.clientY);
    if (!over) {
      if (placing.ids) {
        store.cancelPreview();
        placing.ids = null;
        drag = null;
        guides = [];
      }
      return false;
    }
    const p = toWorld(e);
    onCursor?.(p.x, p.y);

    if (!placing.ids) {
      store.beginPreview();
      placing.base = new Map(store.state.items.map((i) => [i.id, { cx: i.cx, cy: i.cy }]));
      const before = new Set(placing.base.keys());
      store.preview((draft) => placing.factory(draft, gridSnap(p.x), gridSnap(p.y)));
      placing.ids = new Set(store.state.items.filter((i) => !before.has(i.id)).map((i) => i.id));
      const start = new Map(store.state.items.filter((i) => placing.ids.has(i.id)).map((i) => [i.id, { cx: i.cx, cy: i.cy }]));
      drag = { kind: "item", placing: true, id: [...placing.ids][0], ids: placing.ids, start, p0: p, axis: null };
    }

    // Others back to where they were, then snap the new element, then push
    for (const it of store.state.items) {
      const b = placing.base.get(it.id);
      if (b) {
        it.cx = b.cx;
        it.cy = b.cy;
      }
    }
    moveItems(e, p);
    const shifts = makeRoom(store.state.items, placing.ids, store.state.aisle, store.state.room);
    if (shifts.size) {
      store.preview(() => {
        for (const it of store.state.items) {
          const d = shifts.get(it.id);
          if (d) {
            it.cx += d.dx;
            it.cy += d.dy;
          }
        }
      });
    }
    return true;
  }

  // ── Applying a property by dropping onto an aisle (PMR passage) ────────
  let applying = null;
  const HIT = 200; // mm of tolerance around an aisle

  function beginApply(apply) {
    applying = { apply, target: null };
  }

  function applyMove(e) {
    if (!applying) return false;
    const over = isOver(e.clientX, e.clientY);
    const p = over ? toWorld(e) : null;
    if (p) onCursor?.(p.x, p.y);
    // Hit-test against the plan as it was before this preview
    const items = applying.target ? JSON.parse(store._snapshot).items : store.state.items;
    const hit = p
      ? items.find((i) => {
          const a = isCheckout(i) && aisleWorld(i, store.state.aisle);
          return a && p.x >= a.x0 - HIT && p.x <= a.x1 + HIT && p.y >= a.y0 - HIT && p.y <= a.y1 + HIT;
        })
      : null;
    if (hit?.id === applying.target) return over;
    if (applying.target) {
      store.cancelPreview();
      applying.target = null;
    }
    if (hit) {
      store.beginPreview();
      applying.target = hit.id;
      store.preview((draft) => applying.apply(draft, hit.id));
    }
    return over;
  }

  /** @returns {string|null} id of the checkout that received the property */
  function endApply(e) {
    if (!applying) return null;
    const target = applying.target;
    const ok = target && isOver(e.clientX, e.clientY);
    if (ok) store.endPreview();
    else if (target) store.cancelPreview();
    applying = null;
    if (ok) store.select(target);
    return ok ? target : null;
  }

  function beginPlacement(factory) {
    placing = { factory, ids: null, base: null };
  }

  /** @returns {Set<string>|null} ids of the placed elements, or null if cancelled */
  function endPlacement(e) {
    if (!placing) return null;
    const ok = placing.ids && isOver(e.clientX, e.clientY);
    const ids = placing.ids;
    if (ok) store.endPreview();
    else if (ids) store.cancelPreview();
    placing = null;
    drag = null;
    guides = [];
    if (ok) store.select([...ids]);
    else render();
    return ok ? ids : null;
  }

  svg.addEventListener("pointermove", (e) => {
    const p = toWorld(e);
    onCursor?.(p.x, p.y);
    if (!drag || placing) return;
    if (drag.kind === "item") {
      moveItems(e, p);
    } else if (drag.kind === "box") {
      marquee.x1 = p.x;
      marquee.y1 = p.y;
      if (Math.abs(marquee.x1 - marquee.x0) * view.scale + Math.abs(marquee.y1 - marquee.y0) * view.scale > 4) drag.moved = true;
      render();
    } else {
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      view.x = drag.vx - dx / view.scale;
      view.y = drag.vy - dy / view.scale;
      applyView();
    }
  });

  function endDrag() {
    if (!drag) return;
    guides = [];
    if (drag.kind === "item") {
      store.endPreview();
    } else if (drag.kind === "box") {
      const box = marquee;
      marquee = null;
      if (drag.moved) {
        // Everything whose centre lies inside the box
        const [x0, x1] = [Math.min(box.x0, box.x1), Math.max(box.x0, box.x1)];
        const [y0, y1] = [Math.min(box.y0, box.y1), Math.max(box.y0, box.y1)];
        const hit = store.state.items.filter((i) => i.cx >= x0 && i.cx <= x1 && i.cy >= y0 && i.cy <= y1).map((i) => i.id);
        store.select(hit, { add: drag.add });
      } else if (!drag.add) {
        store.select(null);
      } else {
        render();
      }
    } else if (!drag.moved) {
      store.select(null);
    }
    svg.classList.remove("is-panning");
    drag = null;
  }
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("pointerleave", () => onCursor?.(null));

  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const p = toWorld(e);
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), p.x, p.y);
    },
    { passive: false }
  );

  new ResizeObserver(() => applyView()).observe(svg);

  return {
    render,
    fit,
    zoomBy,
    opts,
    beginPlacement,
    placementMove,
    endPlacement,
    beginApply,
    applyMove,
    endApply,
    setConflicts(c) {
      conflicts = c;
    },
    /** Centre of the current view, in mm (for placing new items). */
    center() {
      return {
        x: view.x + svg.clientWidth / view.scale / 2,
        y: view.y + svg.clientHeight / view.scale / 2,
      };
    },
  };
}
