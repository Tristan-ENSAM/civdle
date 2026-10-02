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
 * The clue is drawn on a canvas (js/core/clue.js), so the dev tools' inspector
 * shows neither the sharp image nor a CSS filter to remove. The image file is
 * still downloaded, so the Network panel gives it: a static site cannot
 * prevent this.
 */
import { defaultGuessRow } from "../core/game.js";
import { createClue } from "../core/clue.js";

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
    // Padding as in css/style.css (keeps the blur inside the frame).
    ctx.impClue = createClue(ctx.els.clue.querySelector(".frame"), ctx.answer.icon, { padding: 0.12 });
  },

  update(ctx) {
    if (ctx.state.won) ctx.impClue.reveal(ctx.answer.icon);
    else ctx.impClue.set({ blur: blurFor(ctx.state.guesses.length, false) });
  },

  renderGuess: (ctx, item) => defaultGuessRow(item, ctx.answer),
};
