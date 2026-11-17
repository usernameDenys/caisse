// Shared quote-request form logic (configurator + store planner).
// Web3Forms (https://web3forms.com) delivers the form to our inbox — no backend.
// The access key is public by design. Empty → fall back to a pre-filled mailto:.
import { t } from "./i18n.js";

const ENDPOINT = "https://api.web3forms.com/submit";
const ACCESS_KEY = import.meta.env.VITE_WEB3FORMS_KEY || "";
// Assembled at runtime so naive scrapers don't pick it up from the bundle
export const CONTACT_EMAIL = ["denysgolenko", "gmail.com"].join("@");

/**
 * @param {object} o
 * @param {HTMLFormElement} o.form           fields: name, email, company, phone, message, website (honeypot)
 * @param {HTMLButtonElement} o.submitBtn    contains a .btn-label span
 * @param {HTMLElement} o.statusEl
 * @param {HTMLElement} [o.afterSuccessFocus]
 * @param {() => {label: string, value: string}[]} o.getLines  request details listed in the email
 * @param {string} o.subject
 * @param {string} [o.fromName]
 */
export function bindQuoteForm({ form, submitBtn, statusEl, afterSuccessFocus, getLines, subject, fromName }) {
  const f = t.devis.form;
  const submitLabel = submitBtn.querySelector(".btn-label");

  function setStatus(message, kind = "", html = false) {
    statusEl.className = `devis-status${kind ? ` devis-status--${kind}` : ""}`;
    if (html) statusEl.innerHTML = message;
    else statusEl.textContent = message;
  }

  function mailtoHref(data) {
    const e = t.devis.email;
    const lines = [
      e.greeting,
      "",
      e.intro,
      "",
      ...getLines().map((s) => `${s.label} : ${s.value}`),
      "",
      data.message,
      "",
      e.closing,
      [data.name, data.company, data.phone].filter(Boolean).join("\n"),
    ];
    return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]));

    if (!data.name || !data.email || !form.elements.email.checkValidity()) {
      setStatus(f.invalid, "error");
      (data.name ? form.elements.email : form.elements.name).focus();
      return;
    }

    if (!ACCESS_KEY) {
      window.location.href = mailtoHref(data);
      return;
    }

    submitBtn.disabled = true;
    submitLabel.textContent = f.sending;
    setStatus("");

    try {
      // Web3Forms lists every field in the email, in this order
      const payload = {
        access_key: ACCESS_KEY,
        subject: `${subject} — ${data.name}${data.company ? ` (${data.company})` : ""}`,
        from_name: fromName ?? "SommesPro configurateur",
        botcheck: data.website, // honeypot: non-empty → silently dropped
        [f.name]: data.name,
        email: data.email, // used as Reply-To
        [f.company]: data.company,
        [f.phone]: data.phone,
        ...Object.fromEntries(getLines().map((s) => [s.label, s.value])),
        [f.message]: data.message,
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
      afterSuccessFocus?.focus();
    } catch (err) {
      console.error("Quote request failed:", err);
      const href = mailtoHref(data).replace(/"/g, "%22");
      setStatus(`${f.error} <a href="${href}">${CONTACT_EMAIL}</a>`, "error", true);
    } finally {
      submitBtn.disabled = false;
      submitLabel.textContent = f.submit;
    }
  });

  return {
    reset() {
      setStatus("");
      form.hidden = false;
    },
  };
}

/** Modal open/close with Escape and a Tab focus trap. */
export function bindDialog({ modal, openBtns = [], closeBtns = [], onOpen, initialFocus }) {
  const panel = modal.querySelector(".devis-panel");
  let opener = null;

  function open(e) {
    opener = e?.currentTarget ?? document.activeElement;
    onOpen?.();
    modal.hidden = false;
    initialFocus?.()?.focus();
  }
  function close() {
    modal.hidden = true;
    opener?.focus?.();
  }

  openBtns.forEach((b) => b.addEventListener("click", open));
  closeBtns.forEach((b) => b.addEventListener("click", close));
  modal.querySelector(".devis-backdrop")?.addEventListener("click", close);

  document.addEventListener("keydown", (e) => {
    if (modal.hidden) return;
    if (e.key === "Escape") close();
    if (e.key !== "Tab") return;
    const focusable = [...panel.querySelectorAll("button, a[href], input:not([tabindex='-1']), textarea, select")].filter(
      (el) => !el.disabled && el.offsetParent !== null
    );
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

  return { open, close };
}
