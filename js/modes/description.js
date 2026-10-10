/**
 * Mode "Description": guess the leader from excerpts of its description.
 *
 * `leader.descriptions` is an array of excerpts, cut into sentences (see
 * `splitSentences`) and revealed in file order: the first sentence at start,
 * then one more sentence after each wrong guess (put the hardest excerpt
 * first). Each excerpt keeps its own box, which fills up sentence by
 * sentence. Masked in the text until solved (case-insensitive, whole
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

/**
 * Cut an excerpt into sentences: one per line, and inside a line after
 * ". ", "! ", "? " or "… " followed by a capital letter. A line starting with
 * a bullet ("•", "-", "–") stays with the sentence before it (a list belongs
 * to the sentence that introduces it). Heuristic: an abbreviation followed by
 * a capital ("J.-C. Le…") would be cut; none was found in data/leaders.json.
 */
export function splitSentences(text) {
  const out = [];
  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[•\-–]/.test(line) && out.length) { out[out.length - 1] += ` ${line}`; continue; }
    out.push(...line.split(/(?<=[.!?…])\s+(?=[\p{Lu}«])/u));
  }
  return out;
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
  hint: "Devine le leader à partir de sa description. Une phrase de plus à chaque essai.",

  eligible: (l) => Array.isArray(l.descriptions) && l.descriptions.length > 0,

  setup(ctx) {
    ctx.els.clue.innerHTML = `<div class="quotes"></div>`;
    ctx.maskTokens = maskTokens(ctx.answer);
    ctx.sentences = ctx.answer.descriptions.map(splitSentences);
  },

  update(ctx) {
    const total = ctx.sentences.reduce((n, s) => n + s.length, 0);
    const shown = ctx.state.won ? total : Math.min(total, ctx.state.guesses.length + 1);
    const box = ctx.els.clue.querySelector(".quotes");
    box.innerHTML = "";
    let left = shown;
    for (const sentences of ctx.sentences) {
      if (left <= 0) break;
      const text = sentences.slice(0, left).join(" ");
      left -= sentences.length;
      const q = document.createElement("blockquote");
      q.textContent = ctx.state.won ? text : maskText(text, ctx.maskTokens);
      box.appendChild(q);
    }
    if (!ctx.state.won && shown < total) {
      const n = total - shown;
      const p = document.createElement("p");
      p.className = "more";
      p.textContent = `${n} phrase${n > 1 ? "s" : ""} restante${n > 1 ? "s" : ""}`;
      box.appendChild(p);
    }
  },

  renderGuess: (ctx, leader) => defaultGuessRow(leader, ctx.answer),
};
