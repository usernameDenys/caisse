import { defineConfig } from "vite";
import { resolve } from "path";
import i18nPages, { GENERATED_PAGES } from "./build/i18n-pages.js";

export default defineConfig({
  base: "/",
  plugins: [i18nPages({ root: __dirname })],
  build: {
    rollupOptions: {
      input: {
        // Generated from src/templates/*.html × src/locales/*.json
        ...Object.fromEntries(GENERATED_PAGES.map((p) => [p.name, resolve(__dirname, p.file)])),
        mentions: resolve(__dirname, "mentions-legales.html"),
        confidentialite: resolve(__dirname, "confidentialite.html"),
        notFound: resolve(__dirname, "404.html"),
        enLegal: resolve(__dirname, "en/legal-notice.html"),
        enPrivacy: resolve(__dirname, "en/privacy-policy.html"),
      },
    },
  },
});
