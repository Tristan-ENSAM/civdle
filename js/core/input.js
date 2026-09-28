/**
 * Guess input with autocomplete, shared by all modes.
 */
import { normalize } from "./data.js";

/**
 * Create the guess input.
 *
 * @param {object}   opts
 * @param {object[]} opts.leaders         All leader records.
 * @param {() => Set<string>} opts.excluded  Ids to hide (already guessed).
 * @param {(leader: object) => void} opts.onSubmit  Called with the chosen leader.
 * @returns {{ el: HTMLElement, disable: () => void, focus: () => void }}
 */
export function createGuessInput({ leaders, excluded, onSubmit }) {
  const wrap = document.createElement("div");
  wrap.className = "guess";
  wrap.innerHTML = `
    <input type="text" autocomplete="off" spellcheck="false"
           placeholder="Tape le nom d'un leader…" aria-label="Nom du leader"
           role="combobox" aria-expanded="false" aria-autocomplete="list">
    <ul class="suggestions" role="listbox" hidden></ul>`;
  const input = wrap.querySelector("input");
  const list = wrap.querySelector("ul");
  let matches = [];
  let active = 0;

  function search(q) {
    const nq = normalize(q);
    if (!nq) return [];
    const ex = excluded();
    const scored = [];
    for (const l of leaders) {
      if (ex.has(l.id)) continue;
      // Rank: prefix match on any name/alias first, then substring match.
      let best = Infinity;
      for (const s of l._search) {
        if (s.startsWith(nq)) best = Math.min(best, 0);
        else if (s.split(" ").some((w) => w.startsWith(nq))) best = Math.min(best, 1);
        else if (s.includes(nq)) best = Math.min(best, 2);
      }
      if (best < Infinity) scored.push([best, l]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name, "fr"));
    return scored.slice(0, 8).map((x) => x[1]);
  }

  function render() {
    list.innerHTML = "";
    matches.forEach((l, i) => {
      const li = document.createElement("li");
      li.role = "option";
      li.className = i === active ? "active" : "";
      li.innerHTML = `${l.portrait ? `<img src="${l.portrait}" alt="">` : ""}<span></span>`;
      li.querySelector("span").textContent = l.name;
      li.addEventListener("mousedown", (e) => { e.preventDefault(); choose(l); });
      list.appendChild(li);
    });
    list.hidden = matches.length === 0;
    input.setAttribute("aria-expanded", String(matches.length > 0));
  }

  function choose(l) {
    input.value = "";
    matches = [];
    render();
    onSubmit(l);
  }

  input.addEventListener("input", () => { matches = search(input.value); active = 0; render(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && matches.length) { active = (active + 1) % matches.length; render(); e.preventDefault(); }
    else if (e.key === "ArrowUp" && matches.length) { active = (active - 1 + matches.length) % matches.length; render(); e.preventDefault(); }
    else if (e.key === "Enter" && matches.length) { choose(matches[active]); e.preventDefault(); }
    else if (e.key === "Escape") { matches = []; render(); }
  });
  input.addEventListener("blur", () => { matches = []; render(); });

  return {
    el: wrap,
    disable() { input.disabled = true; input.placeholder = "Trouvé !"; },
    focus() { input.focus(); },
  };
}
