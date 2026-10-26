/**
 * Visitor feedback form (speech bubble button "Donner un avis" in the top
 * bar, next to the settings gear, index.html).
 *
 * The site has no server, so the form is sent to an external form service
 * whose URL is `config.feedbackEndpoint` (data/config.json). It is written for
 * Formspree (https://formspree.io/f/<id>): the fields are POSTed as form data
 * with "Accept: application/json", and the honeypot field is named `_gotcha`.
 * Any service accepting the same request works. While the endpoint is empty
 * the button stays hidden, so no visitor can type a message that goes nowhere.
 *
 * Sent fields: message, email (optional), mode (URL hash when the form is
 * sent), _gotcha. The service timestamps each submission itself.
 */

/** Wire #feedback-open, #feedback and #feedback-form. */
export function initFeedback(config) {
  const endpoint = (config.feedbackEndpoint ?? "").trim();
  const open = document.getElementById("feedback-open");
  const dialog = document.getElementById("feedback");
  if (!open || !dialog || !endpoint || typeof dialog.showModal !== "function") return;
  const form = dialog.querySelector("#feedback-form");
  const status = form.querySelector(".feedback-status");
  const submit = form.querySelector(".dialog-submit");

  function setStatus(text, kind = "") {
    status.textContent = text;
    status.className = `feedback-status ${kind}`.trim();
  }

  open.hidden = false;
  open.addEventListener("click", () => {
    setStatus("");
    submit.disabled = false;
    dialog.showModal();
  });
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  // A click on the backdrop targets the <dialog> itself, as in settings.js.
  dialog.addEventListener("click", (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) dialog.close();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = new FormData(form);
    body.set("mode", location.hash.slice(1) || "(aucun)");
    submit.disabled = true;
    setStatus("Envoi…");
    try {
      const res = await fetch(endpoint, { method: "POST", body, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      form.reset();
      setStatus("Merci, ton message a bien été envoyé.", "done");
    } catch (_) {
      submit.disabled = false;
      setStatus("L'envoi a échoué. Réessaie plus tard.", "error");
    }
  });
}
