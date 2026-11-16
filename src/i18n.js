// Same JSON files the HTML pages are generated from (build/i18n-pages.js)
import fr from "./locales/fr.json";
import en from "./locales/en.json";

const translations = { fr, en };
const lang = document.documentElement.lang || "fr";

export const t = translations[lang] || translations.fr;
