// Vite plugin: renders each page template in src/templates/ once per locale.
//   index.html   → /index.html,         /en/index.html
//   planner.html → /planner/index.html, /en/planner/index.html
// The generated files are git-ignored; edit the templates and locale JSON instead.
import fs from "node:fs";
import path from "node:path";

const LOCALES = [
  { code: "fr", prefix: "" },
  { code: "en", prefix: "en/" },
];
const DEFAULT_LOCALE = "fr";

const PAGES = [
  { template: "index.html", path: "", meta: "meta" },
  { template: "planner.html", path: "planner/", meta: "planner.meta" },
];

/** Output files, relative to the project root (for Vite's rollup inputs). */
export const GENERATED_PAGES = PAGES.flatMap((p) =>
  LOCALES.map((l) => ({ name: `${l.code}-${p.path.replace(/\/$/, "") || "main"}`, file: `${l.prefix}${p.path}index.html` }))
);

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
  const templateDir = path.join(root, "src/templates");
  const localeDir = path.join(root, "src/locales");

  function renderAll() {
    const locales = LOCALES.map((l) => ({
      ...l,
      data: JSON.parse(fs.readFileSync(path.join(localeDir, `${l.code}.json`), "utf8")),
    }));
    const defaultLocale = locales.find((l) => l.code === DEFAULT_LOCALE);

    for (const page of PAGES) {
      // Drop the authoring comment (it contains example {{…}} syntax)
      const template = fs
        .readFileSync(path.join(templateDir, page.template), "utf8")
        .replace(/<!--\s*Single source template[\s\S]*?-->\n/, "");

      for (const { code, prefix, data } of locales) {
        const pageUrl = (l) => l.data.url + page.path;
        const meta = lookup(data, page.meta, `${code}.json`);

        const alternates = [
          ...locales.map((l) => `    <link rel="alternate" hreflang="${l.code}" href="${pageUrl(l)}" />`),
          `    <link rel="alternate" hreflang="x-default" href="${pageUrl(defaultLocale)}" />`,
        ].join("\n");

        const langSwitcher = locales
          .map((l) =>
            l.code === code
              ? `          <span class="lang-current" aria-current="true">${l.data.label}</span>`
              : `          <a class="lang-link" href="${new URL(pageUrl(l)).pathname}" hreflang="${l.code}">${l.data.label}</a>`
          )
          .join('\n          <span class="lang-sep" aria-hidden="true">/</span>\n');

        const jsonLd = JSON.stringify(
          {
            "@context": "https://schema.org",
            "@type": page.path ? "WebApplication" : "Service",
            name: meta.ldName ?? meta.ogTitle,
            description: meta.ldDescription ?? meta.description,
            image: "https://sommespro.fr/og-image.webp",
            ...(page.path
              ? { applicationCategory: "DesignApplication", operatingSystem: "Web" }
              : { brand: { "@type": "Brand", name: "SommesPro" }, provider: { "@type": "Person", name: "Denys Holenko" } }),
            url: pageUrl({ data }),
          },
          null,
          2
        ).replace(/</g, "\\u003c");

        const html = render(
          template,
          { ...data, url: pageUrl({ data }), pageMeta: meta, alternates, langSwitcher, jsonLd },
          `${code}.json`
        );

        const outPath = path.join(root, prefix, page.path, "index.html");
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        // Only write on change so the dev-server watcher doesn't loop
        if (!fs.existsSync(outPath) || fs.readFileSync(outPath, "utf8") !== html) {
          fs.writeFileSync(outPath, html);
        }
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
      server.watcher.add([templateDir, localeDir]);
      server.watcher.on("change", (file) => {
        if (file.startsWith(templateDir) || file.startsWith(localeDir)) {
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
