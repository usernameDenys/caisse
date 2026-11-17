import { t } from "../i18n.js";
import { store, newItem, newPair, newGuidage, newEas, placeRow, rotateGroup, duplicateGroup } from "./store.js";
import { createCanvas, SNAP } from "./canvas.js";
import { findConflicts, footprint, isCheckout } from "./footprint.js";
import { summarize, accessoryLines, checkoutCount, itemLabel } from "./summary.js";
import { makeRoom } from "./push.js";
import { readConfigFromUrl, configToSearch } from "../url-config.js";
import { DEFAULT_CONFIG } from "../state.js";
import { bindQuoteForm, bindDialog } from "../quote-form.js";

const P = t.planner;
const $ = (id) => document.getElementById(id);
const fmtMm = (v) => Math.round(v).toLocaleString("fr-FR");

// ── Wizard defaults: the configuration the user came from ────────────────
const fromUrl = { ...DEFAULT_CONFIG, ...readConfigFromUrl() };
let wizardConfig = { mirror: fromUrl.mirror, belt: fromUrl.belt, tray: fromUrl.tray };

// Back links keep the configurator state
const backSearch = location.search;
for (const a of [$("back-link"), $("back-link-crumb")]) a.href = a.getAttribute("href") + backSearch;
document.querySelectorAll(".lang-link").forEach((a) => (a.href = a.getAttribute("href") + backSearch));

// ── Canvas ───────────────────────────────────────────────────────────────
const svg = $("plan");
const canvas = createCanvas(svg, {
  onCursor(x, y) {
    $("status-cursor").textContent = x == null ? "" : `X ${fmtMm(x)} · Y ${fmtMm(y)} mm`;
  },
});

let conflicts = new Map();

// ── Segmented pickers ────────────────────────────────────────────────────
function syncPicker(root, config) {
  root.querySelectorAll(".segmented[data-field]").forEach((group) => {
    group.querySelectorAll("button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.value === config[group.dataset.field]));
    });
  });
}

function bindPicker(root, onPick) {
  root.querySelectorAll(".segmented[data-field]").forEach((group) => {
    group.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-value]");
      if (b) onPick(group.dataset.field, b.dataset.value);
    });
  });
}

const wizardRoot = $("wizard-config");
bindPicker(wizardRoot, (field, value) => {
  wizardConfig = { ...wizardConfig, [field]: value };
  syncPicker(wizardRoot, wizardConfig);
});
syncPicker(wizardRoot, wizardConfig);

const selRoot = $("sel-config");
bindPicker(selRoot, (field, value) => {
  if (!store.selected) return;
  const ids = store.selection;
  store.commit((s) => s.items.forEach((i) => ids.has(i.id) && isCheckout(i) && (i[field] = value)));
});

// ── Room ─────────────────────────────────────────────────────────────────
function bindNumber(input, toState, fromState) {
  input.addEventListener("change", () => {
    const v = parseFloat(input.value.replace(",", "."));
    if (!Number.isFinite(v)) return render();
    store.commit((s) => toState(s, v));
  });
  return () => {
    if (document.activeElement !== input) input.value = fromState(store.state);
  };
}

const roomSyncers = [
  bindNumber($("room-w"), (s, v) => (s.room.w = Math.round(Math.min(Math.max(v, 3), 200) * 1000)), (s) => s.room.w / 1000),
  bindNumber($("room-h"), (s, v) => (s.room.h = Math.round(Math.min(Math.max(v, 3), 200) * 1000)), (s) => s.room.h / 1000),
  bindNumber($("aisle"), (s, v) => (s.aisle = Math.round(Math.min(Math.max(v, 500), 3000))), (s) => s.aisle),
];

// ── Adding / editing ─────────────────────────────────────────────────────
let rowLayout = "pairs"; // double checkouts by default
$("row-layout").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-value]");
  if (!b) return;
  rowLayout = b.dataset.value;
  $("row-layout").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
});

$("place-row").addEventListener("click", () => {
  const count = Math.min(Math.max(parseInt($("row-count").value, 10) || 1, 1), 40);
  const options = { pairs: rowLayout === "pairs", guidage: $("row-guidage").checked, eas: $("row-eas").checked, pmr: $("row-pmr").checked };
  // Select the whole new line (checkouts, guidage, antennas) so it can be moved at once
  const before = new Set(store.state.items.map((i) => i.id));
  store.commit((s) => placeRow(s, wizardConfig, count, s.aisle, options));
  store.select(store.state.items.filter((i) => !before.has(i.id)).map((i) => i.id));
  canvas.fit();
});

// Single elements appear in the middle of the view, snapped to the grid
const atCenter = () => {
  const c = canvas.center();
  return [Math.round(c.x / SNAP) * SNAP, Math.round(c.y / SNAP) * SNAP];
};
function addAndSelect(make) {
  let id;
  store.commit((s) => (id = make(s).id));
  store.select(id);
}
// Element factories: (draft, x, y) → creates the element(s) centred at x, y
const FACTORIES = {
  "add-one": (s, x, y) => newItem(s, wizardConfig, x, y),
  "add-pair": (s, x, y) => {
    const fp = footprint({ ...wizardConfig, mirror: "right" });
    return newPair(s, wizardConfig, x - fp.w, y - fp.h / 2)[0];
  },
  "add-guidage": (s, x, y) => newGuidage(s, x, y, 3),
  "add-eas": (s, x, y) => newEas(s, x, y),
};

/**
 * Turns the customer passage of checkouts `ids` into a 900 mm PMR passage
 * (or back), sliding the neighbours so the wider aisle fits.
 */
function setPmr(draft, ids, on) {
  const changed = new Set();
  for (const it of draft.items) {
    if (!ids.has(it.id) || !isCheckout(it) || !!it.pmr === on) continue;
    if (on) it.pmr = true;
    else delete it.pmr;
    store.groupIds(it.id, draft.items).forEach((g) => changed.add(g));
  }
  if (!on || !changed.size) return;
  const shifts = makeRoom(draft.items, changed, draft.aisle, draft.room);
  for (const it of draft.items) {
    const d = shifts.get(it.id);
    if (d) {
      it.cx += d.dx;
      it.cy += d.dy;
    }
  }
}

// Panel tools. Click: add in the middle of the view (PMR: apply to the
// selection). Drag: drop where you want — neighbours make room while hovering.
const TOOLS = {
  ...Object.fromEntries(
    Object.entries(FACTORIES).map(([id, factory]) => [
      id,
      {
        begin: () => canvas.beginPlacement(factory),
        move: (e) => canvas.placementMove(e),
        end: (e) => canvas.endPlacement(e),
        ghostOverCanvas: false,
        click: () => addAndSelect((s) => factory(s, ...atCenter())),
      },
    ])
  ),
  "add-pmr": {
    begin: () => canvas.beginApply((draft, id) => setPmr(draft, new Set([id]), true)),
    move: (e) => canvas.applyMove(e),
    end: (e) => canvas.endApply(e),
    ghostOverCanvas: true, // keep the label: you aim at an aisle
    click: () => {
      if (!store.selection.size) return flashHint();
      const ids = new Set(store.selection);
      store.commit((s) => setPmr(s, ids, true));
    },
  },
};

const ghost = document.createElement("div");
ghost.className = "drag-ghost";
ghost.hidden = true;
document.body.append(ghost);

function flashHint() {
  const hint = document.querySelector("#add-title + .side-hint");
  hint.classList.remove("flash");
  void hint.offsetWidth;
  hint.classList.add("flash");
}

let suppressUntil = 0;
for (const [id, tool] of Object.entries(TOOLS)) {
  const btn = $(id);
  let press = null;

  btn.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    press = { x: e.clientX, y: e.clientY, dragging: false };
    btn.setPointerCapture(e.pointerId);
  });

  btn.addEventListener("pointermove", (e) => {
    if (!press) return;
    if (!press.dragging) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6) return;
      press.dragging = true;
      tool.begin();
      ghost.textContent = btn.textContent.trim();
      document.body.classList.add("is-placing");
    }
    const over = tool.move(e);
    ghost.hidden = over && !tool.ghostOverCanvas;
    ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`;
  });

  const stop = () => {
    ghost.hidden = true;
    document.body.classList.remove("is-placing");
    press = null;
  };
  btn.addEventListener("pointerup", (e) => {
    if (press?.dragging) {
      tool.end(e);
      // The click that follows a drag must not act a second time
      suppressUntil = performance.now() + 400;
    }
    stop();
  });
  btn.addEventListener("pointercancel", () => {
    if (press?.dragging) tool.end({ clientX: -1, clientY: -1 });
    stop();
  });

  btn.addEventListener("click", () => {
    if (performance.now() < suppressUntil) return;
    tool.click();
  });
}

$("clear-all").addEventListener("click", () => {
  if (!store.state.items.length) return;
  store.commit((s) => {
    s.items = [];
  });
});

/** Edits the primary selected item (position fields, rail sections). */
function updateSelected(fn) {
  const id = store.primary;
  if (!id) return;
  store.commit((s) => fn(s.items.find((i) => i.id === id), s));
}

// Rotate, duplicate, move and delete act on the whole selection
const rotate = (delta) => {
  if (!store.selected) return;
  const ids = new Set(store.selection);
  store.commit((s) => rotateGroup(s, ids, delta));
};
const duplicate = () => {
  if (!store.selected) return;
  const ids = new Set(store.selection);
  const before = new Set(store.state.items.map((i) => i.id));
  store.commit((s) => duplicateGroup(s, ids, store.primary, s.aisle));
  store.select(store.state.items.filter((i) => !before.has(i.id)).map((i) => i.id));
};
const remove = () => {
  if (!store.selected) return;
  const ids = new Set(store.selection);
  store.commit((s) => {
    s.items = s.items.filter((i) => !ids.has(i.id));
  });
};
const moveBy = (dx, dy) => {
  if (!store.selected) return;
  const ids = new Set(store.selection);
  store.commit((s) =>
    s.items.forEach((i) => {
      if (!ids.has(i.id)) return;
      i.cx += dx;
      i.cy += dy;
    })
  );
};

$("ungroup").addEventListener("click", () => {
  const ids = new Set(store.selection);
  const primary = store.primary;
  store.commit((s) => s.items.forEach((i) => ids.has(i.id) && delete i.group));
  store.select(primary);
});
$("sel-pmr").addEventListener("change", (e) => {
  const on = e.target.checked;
  const ids = new Set(store.selection);
  store.commit((s) => setPmr(s, ids, on));
});
$("sel-sections").addEventListener("change", (e) => {
  const v = Math.min(Math.max(parseInt(e.target.value, 10) || 1, 1), 20);
  updateSelected((it) => (it.sections = v));
});

$("rot-left").addEventListener("click", () => rotate(-90));
$("rot-right").addEventListener("click", () => rotate(90));
$("duplicate").addEventListener("click", duplicate);
$("delete").addEventListener("click", remove);
$("sel-x").addEventListener("change", (e) => {
  const v = parseFloat(e.target.value);
  if (Number.isFinite(v) && store.selectedItem) moveBy(Math.round(v) - store.selectedItem.cx, 0);
});
$("sel-y").addEventListener("change", (e) => {
  const v = parseFloat(e.target.value);
  if (Number.isFinite(v) && store.selectedItem) moveBy(0, Math.round(v) - store.selectedItem.cy);
});

// ── Toolbar ──────────────────────────────────────────────────────────────
$("undo").addEventListener("click", () => store.undo());
$("redo").addEventListener("click", () => store.redo());
$("zoom-in").addEventListener("click", () => canvas.zoomBy(1.25));
$("zoom-out").addEventListener("click", () => canvas.zoomBy(0.8));
$("fit").addEventListener("click", () => canvas.fit());
for (const name of ["ortho", "magnet", "dims"]) {
  $(name).addEventListener("click", (e) => {
    const on = !canvas.opts[name];
    canvas.opts[name] = on;
    e.currentTarget.setAttribute("aria-pressed", String(on));
    canvas.render();
  });
}

// ── Keyboard ─────────────────────────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (!$("devis-modal").hidden) return;
  if (e.target.closest("input, textarea, select")) return;
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();

  if (mod && key === "z") {
    e.preventDefault();
    e.shiftKey ? store.redo() : store.undo();
  } else if (mod && key === "y") {
    e.preventDefault();
    store.redo();
  } else if (mod && key === "a") {
    e.preventDefault();
    store.select(store.state.items.map((i) => i.id));
  } else if (mod && key === "d") {
    e.preventDefault();
    duplicate();
  } else if (!mod && key === "r") {
    rotate(e.shiftKey ? -90 : 90);
  } else if (key === "delete" || key === "backspace") {
    if (store.selected) {
      e.preventDefault();
      remove();
    }
  } else if (key === "escape") {
    store.select(null);
  } else if (key.startsWith("arrow") && store.selected) {
    e.preventDefault();
    const step = e.shiftKey ? 500 : SNAP;
    const [dx, dy] = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[key];
    moveBy(dx, dy);
  }
});

// ── Render ───────────────────────────────────────────────────────────────
function renderSelection() {
  const items = store.selectedItems;
  $("sel-empty").hidden = items.length > 0;
  $("sel-panel").hidden = !items.length;
  if (!items.length) return;

  // One item (or one pair) → full details; several → bulk actions
  const it = store.selectedItem ?? items.find((i) => i.id === store.primary) ?? items[0];
  const single = !!store.selectedItem;
  const checkouts = items.filter(isCheckout);
  const checkout = isCheckout(it);
  const number = store.state.items.filter(isCheckout).indexOf(it) + 1;
  $("sel-name").textContent = !single
    ? P.selection.multi.replace("{n}", items.length)
    : checkout
      ? `C${number}`
      : it.type === "guidage"
        ? P.selection.guidageTitle
        : P.selection.easTitle;

  // Config pickers edit every selected checkout; show the primary's values
  const configItem = checkout ? it : checkouts[0];
  $("sel-config-wrap").hidden = !configItem;
  $("sel-pmr-wrap").hidden = !checkouts.length;
  $("sel-pmr").checked = checkouts.length > 0 && checkouts.every((c) => c.pmr);
  $("sel-pmr").indeterminate = checkouts.some((c) => c.pmr) && !checkouts.every((c) => c.pmr);
  selRoot.hidden = !configItem;
  if (configItem) syncPicker(selRoot, configItem);
  $("sel-pos-label").hidden = $("sel-pos").hidden = !single;
  $("view-3d").hidden = !(single && checkout);
  $("sel-group").hidden = !(single && it.group);
  $("sel-guidage").hidden = !(single && it.type === "guidage");
  if (single && it.type === "guidage" && document.activeElement !== $("sel-sections")) $("sel-sections").value = it.sections;
  if (document.activeElement !== $("sel-x")) $("sel-x").value = Math.round(it.cx);
  if (document.activeElement !== $("sel-y")) $("sel-y").value = Math.round(it.cy);

  const problems = [...new Set(items.flatMap((i) => [...(conflicts.get(i.id) ?? [])]))];
  $("sel-conflicts").replaceChildren(
    ...problems.map((p) => {
      const li = document.createElement("li");
      li.textContent = P.conflict[p];
      return li;
    })
  );
  if (checkout) $("view-3d").href = $("back-link").getAttribute("href").split("?")[0] + configToSearch({ ...DEFAULT_CONFIG, ...it, color: fromUrl.color, light: fromUrl.light });
}

function renderSummary() {
  const { items } = store.state;
  const groups = summarize(items);
  const extras = accessoryLines(items);
  const total = P.status.count.replace("{n}", checkoutCount(items));

  $("bar-total").textContent = total;
  $("bar-chips").replaceChildren(
    ...[...groups.map((g) => `${g.count} × ${g.label}`), ...extras.map((l) => `${l.label} · ${l.value}`)].map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    })
  );
  $("group-list").replaceChildren(...groupItems(groups, extras));

  $("status-count").textContent = total;
  const c = $("status-conflicts");
  c.textContent = conflicts.size ? P.status.conflicts.replace("{n}", conflicts.size) : items.length ? P.status.ok : "";
  c.className = conflicts.size ? "is-bad" : "is-ok";
}

function groupItems(groups, extras) {
  return [
    ...groups.map((g) => {
      const li = document.createElement("li");
      const n = document.createElement("strong");
      n.textContent = `${g.count} ×`;
      li.append(n, g.label);
      return li;
    }),
    ...extras.map((l) => {
      const li = document.createElement("li");
      const n = document.createElement("strong");
      n.textContent = "+";
      li.append(n, `${l.label} : ${l.value}`);
      return li;
    }),
  ];
}

function render() {
  const { state } = store;
  conflicts = findConflicts(state.items, state.room, state.aisle);
  canvas.setConflicts(conflicts);
  canvas.render();
  roomSyncers.forEach((sync) => sync());
  renderSelection();
  renderSummary();
  $("undo").disabled = !store.past.length;
  $("redo").disabled = !store.future.length;
}

store.subscribe(render);
render();
requestAnimationFrame(() => canvas.fit());

// ── 2D / 3D view ─────────────────────────────────────────────────────────
// Finish chosen in the configurator (passed in the URL) is used in 3D and the PDF
const appearance = { color: fromUrl.color, light: fromUrl.light };
const stage = document.querySelector(".plan-stage");
const view3dEl = $("view3d");
let mode = "2d";
let view3d = null; // lazily imported module
const load3d = () => (view3d ??= import("./view3d.js"));

async function refresh3d() {
  const v = await load3d();
  await v.show(view3dEl, store.state, appearance);
  $("view3d-loading").hidden = true;
}

let pending3d = 0;
store.subscribe(() => {
  if (mode !== "3d") return;
  clearTimeout(pending3d);
  pending3d = setTimeout(refresh3d, 150);
});

document.querySelector(".view-switch").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-view]");
  if (!b || b.dataset.view === mode) return;
  mode = b.dataset.view;
  document.querySelectorAll(".view-switch button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  stage.classList.toggle("is-3d", mode === "3d");
  view3dEl.hidden = mode !== "3d";
  if (mode === "3d") {
    try {
      await refresh3d();
    } catch (err) {
      console.error("3D view failed:", err);
    }
  }
});
$("refit3d").addEventListener("click", async () => (await load3d()).refit(store.state));

// ── PDF: 3D overview + scaled plan + information ─────────────────────────
$("plan-pdf").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const label = btn.querySelector(".btn-label");
  const original = label.textContent;
  btn.disabled = true;
  label.textContent = P.pdf.generating;
  try {
    const items = store.state.items;
    // Typical checkout = the most common configuration in the plan
    const top = summarize(items).sort((a, b) => b.count - a.count)[0];
    const typeItem = top ? items.find((i) => isCheckout(i) && itemLabel(i) === top.label) : null;
    let views = null;
    if (typeItem) {
      try {
        views = await (await load3d()).captureViews(store.state, appearance, typeItem);
      } catch (err) {
        console.warn("3D renders for the PDF failed, exporting without images", err);
      }
    }
    const { downloadPlanPdf } = await import("./export-pdf.js");
    await downloadPlanPdf(store.state, conflicts, { views, appearance, typeItem });
  } catch (err) {
    console.error("PDF export failed:", err);
  } finally {
    btn.disabled = false;
    label.textContent = original;
  }
});

// ── Quote ────────────────────────────────────────────────────────────────
function quoteLines() {
  const { room, items, aisle } = store.state;
  const S = P.summary;
  return [
    { label: S.room, value: `${room.w / 1000} × ${room.h / 1000} m` },
    { label: S.count, value: String(checkoutCount(items)) },
    { label: S.aisle, value: `${aisle} mm` },
    { label: S.models, value: summarize(items).map((g) => `${g.count} × ${g.label}`).join(" ; ") },
    ...accessoryLines(items),
  ];
}

const form = $("devis-form");
const quote = bindQuoteForm({
  form,
  submitBtn: $("devis-confirm"),
  statusEl: $("devis-status"),
  afterSuccessFocus: $("devis-close"),
  subject: P.quote.subject,
  fromName: "SommesPro planificateur",
  getLines: quoteLines,
});

bindDialog({
  modal: $("devis-modal"),
  openBtns: [$("devis-btn")],
  closeBtns: [$("devis-close"), $("devis-edit")],
  initialFocus: () => form.elements.name,
  onOpen() {
    const { items } = store.state;
    $("quote-total").textContent = P.status.count.replace("{n}", checkoutCount(items));
    const lines = quoteLines().slice(0, 3);
    $("devis-specs").replaceChildren(
      ...lines.flatMap((l) => {
        const dt = document.createElement("dt");
        dt.textContent = l.label;
        const dd = document.createElement("dd");
        dd.textContent = l.value;
        return [dt, dd];
      })
    );
    $("quote-groups").replaceChildren(...groupItems(summarize(items), accessoryLines(items)));
    quote.reset();
    if (!checkoutCount(items)) {
      form.hidden = true;
      $("devis-status").className = "devis-status devis-status--error";
      $("devis-status").textContent = P.quote.empty;
    }
  },
});

