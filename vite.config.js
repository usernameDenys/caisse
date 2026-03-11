import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  base: "/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        mentions: resolve(__dirname, "mentions-legales.html"),
        confidentialite: resolve(__dirname, "confidentialite.html"),
        enMain: resolve(__dirname, "en/index.html"),
        enLegal: resolve(__dirname, "en/legal-notice.html"),
        enPrivacy: resolve(__dirname, "en/privacy-policy.html"),
      },
    },
  },
});
