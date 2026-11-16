// Vite plugin: renders src/templates/index.html once per locale in src/locales/.
//   fr → /index.html     en → /en/index.html
// The generated files are git-ignored; edit the template and locale JSON instead.
import fs from "node:fs";
import path from "node:path";

const LOCALES = [
  { code: "fr", out: "index.html" },
  { code: "en", out: "en/index.html" },
];
const DEFAULT_LOCALE = "fr";

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function lookup(data, key, file) {
  const value = key.split(".").reduce((o, k) => o?.[k], data);
  if (value === undefined) throw new Error(`[i18n-pages] Missing key "${key}" in ${file}`);
  return value;
}

export function render(template, data, file = "") {
  return template
    .replace(/\{\{#each ([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, key, body) =>
      lookup(data, key, file)
        .map((item) => body.replace(/\{\{\.\}\}/g, escapeHtml(item)))
        .join("\n          ")
    )
    .replace(/\{\{\{([\w.]+)\}\}\}/g, (_, key) => String(lookup(data, key, file)))
    .replace(/\{\{([\w.]+)\}\}/g, (_, key) => escapeHtml(lookup(data, key, file)));
}

export default function i18nPages({ root = process.cwd() } = {}) {
  const templatePath = path.join(root, "src/templates/index.html");
  const localeDir = path.join(root, "src/locales");

  function renderAll() {
    // Drop the authoring comment (it contains example {{…}} syntax)
    const template = fs
      .readFileSync(templatePath, "utf8")
      .replace(/<!--\s*Single source template[\s\S]*?-->\n/, "");
    const locales = LOCALES.map((l) => ({
      ...l,
      data: JSON.parse(fs.readFileSync(path.join(localeDir, `${l.code}.json`), "utf8")),
    }));

    for (const { code, out, data } of locales) {
      const defaultUrl = locales.find((l) => l.code === DEFAULT_LOCALE).data.url;
      const alternates = [
        ...locales.map((l) => `    <link rel="alternate" hreflang="${l.code}" href="${l.data.url}" />`),
        `    <link rel="alternate" hreflang="x-default" href="${defaultUrl}" />`,
      ].join("\n");

      const langSwitcher = locales
        .map((l) =>
          l.code === code
            ? `          <span class="lang-current" aria-current="true">${l.data.label}</span>`
            : `          <a class="lang-link" href="${new URL(l.data.url).pathname}" hreflang="${l.code}">${l.data.label}</a>`
        )
        .join('\n          <span class="lang-sep" aria-hidden="true">/</span>\n');

      const jsonLd = JSON.stringify(
        {
          "@context": "https://schema.org",
          "@type": "Service",
          name: data.meta.ldName,
          description: data.meta.ldDescription,
          image: "https://sommespro.fr/og-image.webp",
          brand: { "@type": "Brand", name: "SommesPro" },
          provider: { "@type": "Person", name: "Denys Holenko" },
          url: data.url,
        },
        null,
        2
      ).replace(/</g, "\\u003c");

      const html = render(template, { ...data, alternates, langSwitcher, jsonLd }, `${code}.json`);

      const outPath = path.join(root, out);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      // Only write on change so the dev-server watcher doesn't loop
      if (!fs.existsSync(outPath) || fs.readFileSync(outPath, "utf8") !== html) {
        fs.writeFileSync(outPath, html);
      }
    }
  }

  return {
    name: "i18n-pages",
    // Runs before Rollup resolves the HTML inputs, in both dev and build
    config() {
      renderAll();
    },
    configureServer(server) {
      const watched = [templatePath, localeDir];
      server.watcher.add(watched);
      server.watcher.on("change", (file) => {
        if (file === templatePath || file.startsWith(localeDir)) {
          try {
            renderAll();
            server.ws.send({ type: "full-reload" });
          } catch (err) {
            server.config.logger.error(err.message);
          }
        }
      });
    },
  };
}
