/**
 * Mode "Description": guess the leader from excerpts of its description.
 *
 * `leader.descriptions` is an array of excerpts, shown in file order: the
 * first one at start, then one more after each wrong guess (put the hardest
 * excerpt first). Masked in the text until solved (case-insensitive, whole
 * words only): the leader's `name`, its `aliases`, its `civilization`, and
 * any extra strings listed in `maskWords` (e.g. a first name alone, an
 * adjective like "ottoman"). Nothing is masked implicitly beyond these.
 */
import { defaultGuessRow } from "../core/game.js";

const MASK = "▇▇▇";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the list of strings to hide for a leader.
 * @returns {string[]} sorted longest first so that full names are masked
 *          before their individual words.
 */
export function maskTokens(leader) {
  const tokens = new Set();
  const add = (s) => { if (s && String(s).trim().length >= 2) tokens.add(String(s).trim()); };
  add(leader.name);
  (leader.aliases ?? []).forEach(add);
  add(leader.civilization);
  (leader.maskWords ?? []).forEach(add);
  return [...tokens].sort((a, b) => b.length - a.length);
}

/** Replace every token (case-insensitive, whole words) with the mask. */
export function maskText(text, tokens) {
  if (!tokens.length) return text;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${tokens.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`, "giu");
  return text.replace(re, MASK);
}

export default {
  id: "description",
  label: "Description",
  hint: "Devine le leader à partir d'extraits de sa description. Un extrait de plus à chaque essai.",

  eligible: (l) => Array.isArray(l.descriptions) && l.descriptions.length > 0,

  setup(ctx) {
    ctx.els.clue.innerHTML = `<div class="quotes"></div>`;
    ctx.maskTokens = maskTokens(ctx.answer);
  },

  update(ctx) {
    const all = ctx.answer.descriptions;
    const shown = ctx.state.won ? all.length : Math.min(all.length, ctx.state.guesses.length + 1);
    const box = ctx.els.clue.querySelector(".quotes");
    box.innerHTML = "";
    all.slice(0, shown).forEach((t) => {
      const q = document.createElement("blockquote");
      q.textContent = ctx.state.won ? t : maskText(t, ctx.maskTokens);
      box.appendChild(q);
    });
    if (!ctx.state.won && shown < all.length) {
      const p = document.createElement("p");
      p.className = "more";
      p.textContent = `${all.length - shown} extrait${all.length - shown > 1 ? "s" : ""} restant${all.length - shown > 1 ? "s" : ""}`;
      box.appendChild(p);
    }
  },

  renderGuess: (ctx, leader) => defaultGuessRow(leader, ctx.answer),
};
