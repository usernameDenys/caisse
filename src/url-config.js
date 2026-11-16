// Serialises the configuration to/from human-readable URL params, e.g.
//   /?side=left&belt=1400&tray=700x600&color=5010&light=FFE4B0
// Only values that differ from the defaults are written.
import { DEFAULT_CONFIG } from "./state.js";

const SIDE = { right: "right", left: "left" };
const BELT = { 1700: "L", 1400: "M", 900: "S" };
const TRAY = { "1200x1100": "1250_L", "700x1100": "700_L", "700x600": "700_M" };
export const RAL = {
  7016: "#5B686D",
  9016: "#F1F0EB",
  5010: "#1C3F6E",
  3020: "#CC0605",
  9005: "#0A0A0A",
};

const invert = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
const HEX = /^[0-9a-f]{6}$/i;

export function ralForHex(hex) {
  return invert(RAL)[hex.toUpperCase()] ?? null;
}

export function readConfigFromUrl(search = location.search) {
  const p = new URLSearchParams(search);
  const config = {};
  const side = SIDE[p.get("side")];
  if (side) config.mirror = side;
  const belt = BELT[p.get("belt")];
  if (belt) config.belt = belt;
  const tray = TRAY[p.get("tray")];
  if (tray) config.tray = tray;

  const color = p.get("color");
  if (RAL[color]) config.color = RAL[color];
  else if (HEX.test(color ?? "")) config.color = `#${color.toUpperCase()}`;

  const light = p.get("light");
  if (HEX.test(light ?? "")) config.light = `#${light.toUpperCase()}`;
  return config;
}

export function configToSearch(config) {
  const p = new URLSearchParams();
  const d = DEFAULT_CONFIG;
  if (config.mirror !== d.mirror) p.set("side", config.mirror);
  if (config.belt !== d.belt) p.set("belt", invert(BELT)[config.belt]);
  if (config.tray !== d.tray) p.set("tray", invert(TRAY)[config.tray]);
  if (config.color.toUpperCase() !== d.color)
    p.set("color", ralForHex(config.color) ?? config.color.slice(1).toUpperCase());
  if (config.light.toUpperCase() !== d.light) p.set("light", config.light.slice(1).toUpperCase());
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function shareUrl(config) {
  return `${location.origin}${location.pathname}${configToSearch(config)}`;
}

export function writeConfigToUrl(config) {
  const search = configToSearch(config);
  if (search !== location.search) {
    history.replaceState(null, "", `${location.pathname}${search}${location.hash}`);
  }
  syncLangLinks(search);
}

// Keep the configuration when switching language
function syncLangLinks(search) {
  document.querySelectorAll(".lang-link").forEach((a) => {
    const url = new URL(a.href, location.href);
    url.search = search;
    a.href = url.pathname + url.search;
  });
}
