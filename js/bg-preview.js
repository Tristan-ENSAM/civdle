/**
 * TEMPORAIRE (PR d'aperçu) : sélecteur des fonds proposés dans
 * css/bg-preview.css. Le choix vient de ?bg=a|b|c, sinon du dernier choix
 * (localStorage "civdle:bg-preview"), sinon "a". "0" = fond uni actuel.
 */
const KEY = "civdle:bg-preview";
const OPTIONS = [["0", "Actuel"], ["a", "A"], ["b", "B"], ["c", "C"]];

let choice = new URLSearchParams(location.search).get("bg");
if (!OPTIONS.some(([v]) => v === choice)) {
  try { choice = localStorage.getItem(KEY); } catch (_) { choice = null; }
  if (!OPTIONS.some(([v]) => v === choice)) choice = "a";
}

const box = document.createElement("div");
box.id = "bg-preview";
box.innerHTML = "<span>Fond :</span>";
for (const [value, label] of OPTIONS) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.dataset.bg = value;
  b.addEventListener("click", () => select(value));
  box.append(b);
}
document.body.append(box);

function select(value) {
  choice = value;
  document.documentElement.dataset.bg = value;
  for (const b of box.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.bg === value));
  try { localStorage.setItem(KEY, value); } catch (_) { /* ignore */ }
}
select(choice);
