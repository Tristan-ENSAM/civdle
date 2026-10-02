/**
 * Mode "Aménagement": the icon of a tile improvement starts lightly blurred
 * and gets sharper after each wrong guess.
 *
 * Pool: the improvements of the BBG site (data/improvements.json, written by
 * tools/bbg/build_improvements.py). The daily draw uses the same engine (own
 * sequence, seeded by salt + "improvements").
 *
 * Suggestions in the input are shown without icons, otherwise the list itself
 * would let the player match the picture. Wrong guesses in the history keep
 * their icon (they say nothing about the answer).
 *
 * Tuning: BLUR_START (px) is the initial blur; the blur reaches 0 after STEPS
 * wrong guesses (linear). Lighter than the Portrait and Technologies modes
 * (24 px over 8 guesses), as asked ("pas trop"); arbitrary values, to adjust.
 *
 * Note: the blur is a CSS filter, so a player can remove it with the browser
 * dev tools. A static site cannot prevent this.
 */
import { defaultGuessRow } from "../core/game.js";

const BLUR_START = 10;
const STEPS = 6;

/** Blur in px after `nGuesses` wrong guesses (0 once found). */
export function blurFor(nGuesses, won) {
  if (won) return 0;
  return Math.max(0, BLUR_START * (1 - nGuesses / STEPS));
}

export default {
  id: "improvements",
  label: "Aménagement",
  hint: "Retrouve l'aménagement à partir de son icône floutée : elle se précise à chaque essai.",
  pool: "improvements",
  suggestionImages: false,
  texts: {
    none: "Aucun aménagement disponible (data/improvements.json manquant ou vide).",
    placeholder: "Tape le nom d'un aménagement…",
    label: "Nom de l'aménagement",
    next: "Prochain aménagement dans",
    yesterday: "L'aménagement d'hier était :",
  },
  eligible: (r) => !!r.icon,

  setup(ctx) {
    ctx.els.clue.innerHTML = `<div class="frame improvement-frame"><img alt="Aménagement mystère" draggable="false"></div>`;
    ctx.impImg = ctx.els.clue.querySelector("img");
    ctx.impImg.src = ctx.answer.icon;
    ctx.impImg.addEventListener("contextmenu", (e) => e.preventDefault());
  },

  update(ctx) {
    ctx.impImg.style.filter = `blur(${blurFor(ctx.state.guesses.length, ctx.state.won)}px)`;
  },

  renderGuess: (ctx, item) => defaultGuessRow(item, ctx.answer),
};
