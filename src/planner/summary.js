// Groups placed items for the side panel, summary bar, PDF and quote.
import { t } from "../i18n.js";
import { BELT_LABEL, TRAY_LABEL, isCheckout } from "./footprint.js";

export function itemLabel(it) {
  const side = it.mirror === "left" ? t.options.mirrorLeft : t.options.mirrorRight;
  return `${side} · ${t.bar.belt} ${BELT_LABEL[it.belt]} mm · ${t.bar.tray} ${TRAY_LABEL[it.tray]} mm`;
}

/** Checkouts grouped by configuration. */
export function summarize(items) {
  const groups = new Map();
  for (const it of items.filter(isCheckout)) {
    const label = itemLabel(it);
    groups.set(label, (groups.get(label) ?? 0) + 1);
  }
  return [...groups].map(([label, count]) => ({ label, count }));
}

/** Guidage and anti-theft gate totals, as {label, value} lines (empty when none). */
export function accessoryLines(items) {
  const S = t.planner.summary;
  const sections = items.filter((i) => i.type === "guidage").reduce((n, i) => n + i.sections, 0);
  const gates = items.filter((i) => i.type === "eas").length;
  const lines = [];
  const pmr = items.filter((i) => isCheckout(i) && i.pmr).length;
  if (pmr) lines.push({ label: S.pmr, value: S.pmrValue.replace("{n}", pmr) });
  if (sections) lines.push({ label: S.guidage, value: S.guidageValue.replace("{m}", sections).replace("{n}", sections) });
  if (gates) lines.push({ label: S.eas, value: S.easValue.replace("{n}", gates) });
  return lines;
}

export const checkoutCount = (items) => items.filter(isCheckout).length;
