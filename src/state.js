export const DEFAULT_CONFIG = Object.freeze({
  mirror: "right", // "right" = Gaucher / Left-handed, "left" = Droitier / Right-handed
  belt: "L", // L | M | S
  tray: "1250_L", // 1250_L | 700_L | 700_M
  color: "#383E42", // body colour, hex (RAL 7016)
  light: "#E7E7E7", // interior light colour, hex
});

export const state = {
  loadedModel: null,
  bodyMaterial: null,
  emissiveMaterial: null,
  config: { ...DEFAULT_CONFIG },
  get isMirroredLeft() {
    return this.config.mirror === "left";
  },
};
