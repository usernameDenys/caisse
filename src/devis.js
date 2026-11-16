import { t } from "./i18n.js";
import { state } from "./state.js";
import { getSelectionSummary } from "./configurator.js";
import { shareUrl } from "./url-config.js";

// Web3Forms (https://web3forms.com) delivers the form to our inbox — no backend.
// The access key is public by design. Empty → fall back to a pre-filled mailto:.
const ENDPOINT = "https://api.web3forms.com/submit";
const ACCESS_KEY = import.meta.env.VITE_WEB3FORMS_KEY || "";
// Assembled at runtime so naive scrapers don't pick it up from the bundle
const CONTACT_EMAIL = ["denysgolenko", "gmail.com"].join("@");

const modal = document.getElementById("devis-modal");
const panel = modal.querySelector(".devis-panel");
const specsEl = document.getElementById("devis-specs");
const openBtn = document.getElementById("devis-btn");
const closeBtn = document.getElementById("devis-close");
const form = document.getElementById("devis-form");
const submitBtn = document.getElementById("devis-confirm");
const statusEl = document.getElementById("devis-status");
const f = t.devis.form;

// ── Modal ────────────────────────────────────────────────────────────────
function open() {
  specsEl.replaceChildren(
    ...getSelectionSummary().flatMap((s) => {
      const dt = document.createElement("dt");
      dt.textContent = s.label;
      const dd = document.createElement("dd");
      dd.textContent = s.value;
      return [dt, dd];
    })
  );
  setStatus("");
  form.hidden = false;
  modal.hidden = false;
  form.elements.name.focus();
}

function close() {
  modal.hidden = true;
  openBtn.focus();
}

openBtn.addEventListener("click", open);
closeBtn.addEventListener("click", close);
modal.querySelector(".devis-backdrop").addEventListener("click", close);

// Escape closes; Tab stays inside the dialog
document.addEventListener("keydown", (e) => {
  if (modal.hidden) return;
  if (e.key === "Escape") close();
  if (e.key !== "Tab") return;
  const focusable = [
    ...panel.querySelectorAll("button, a[href], input:not([tabindex='-1']), textarea"),
  ].filter((el) => !el.disabled && el.offsetParent !== null);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

// ── Submit ───────────────────────────────────────────────────────────────
function setStatus(message, kind = "", html = false) {
  statusEl.className = `devis-status${kind ? ` devis-status--${kind}` : ""}`;
  if (html) statusEl.innerHTML = message;
  else statusEl.textContent = message;
}

function mailtoHref(data) {
  const e = t.devis.email;
  const specs = getSelectionSummary();
  const lines = [
    e.greeting,
    "",
    e.intro,
    "",
    ...specs.map((s) => `${s.label} : ${s.value}`),
    `${t.devis.labels.link} : ${shareUrl(state.config)}`,
    "",
    data.message,
    "",
    e.closing,
    [data.name, data.company, data.phone].filter(Boolean).join("\n"),
  ];
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(e.subject)}&body=${encodeURIComponent(
    lines.join("\n")
  )}`;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(
    [...new FormData(form)].map(([k, v]) => [k, String(v).trim()])
  );

  if (!data.name || !form.elements.email.checkValidity() || !data.email) {
    setStatus(f.invalid, "error");
    (data.name ? form.elements.email : form.elements.name).focus();
    return;
  }

  if (!ACCESS_KEY) {
    window.location.href = mailtoHref(data);
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = f.sending;
  setStatus("");

  try {
    const l = t.devis.labels;
    const fl = t.devis.form;
    // Web3Forms lists every field in the email, in this order
    const payload = {
      access_key: ACCESS_KEY,
      subject: `${t.devis.email.subject} — ${data.name}${data.company ? ` (${data.company})` : ""}`,
      from_name: "SommesPro configurateur",
      botcheck: data.website, // honeypot: non-empty → silently dropped
      [fl.name]: data.name,
      email: data.email, // used as Reply-To
      [fl.company]: data.company,
      [fl.phone]: data.phone,
      ...Object.fromEntries(getSelectionSummary().map((s) => [s.label, s.value])),
      [l.link]: shareUrl(state.config),
      [fl.message]: data.message,
    };

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result.success) throw new Error(result.message || `HTTP ${res.status}`);

    form.reset();
    form.hidden = true;
    setStatus(f.success, "success");
    closeBtn.focus();
  } catch (err) {
    console.error("Quote request failed:", err);
    const href = mailtoHref(data).replace(/"/g, "%22");
    setStatus(`${f.error} <a href="${href}">${CONTACT_EMAIL}</a>`, "error", true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `${f.submit} &rarr;`;
  }
});
