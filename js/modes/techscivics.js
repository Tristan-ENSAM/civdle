/**
 * Mode "Technologies & Dogmes": the icon of a technology or a civic starts
 * heavily blurred and gets sharper after each wrong guess (same principle as
 * the Portrait mode).
 *
 * Pool: the technologies and civics of the BBG site, in a single list
 * (data/techs_civics.json, written by tools/bbg/build_techs_civics.py); the
 * answer of the day can be either. The daily draw uses the same engine (own
 * sequence, seeded by salt + "techscivics").
 *
 * Suggestions in the input are shown without icons, otherwise the list itself
 * would let the player match the picture. Wrong guesses in the history keep
 * their icon (they say nothing about the answer).
 *
 * Tuning: BLUR_START (px) is the initial blur; the blur reaches 0 after STEPS
 * wrong guesses (linear). Same defaults as the Portrait mode, arbitrary, to
 * adjust (the icons are 160 px, shown larger in the frame).
 *
 * The clue is drawn on a canvas (js/core/clue.js), so the dev tools' inspector
 * shows neither the sharp image nor a CSS filter to remove. The image file is
 * still downloaded, so the Network panel gives it: a static site cannot
 * prevent this.
 */
import { defaultGuessRow } from "../core/game.js";
import { createClue } from "../core/clue.js";

const BLUR_START = 24;
const STEPS = 8;

/** Blur in px after `nGuesses` wrong guesses (0 once found). */
export function blurFor(nGuesses, won) {
  if (won) return 0;
  return Math.max(0, BLUR_START * (1 - nGuesses / STEPS));
}

export default {
  id: "techscivics",
  label: "Technologies & Dogmes",
  hint: "Retrouve la technologie ou le dogme à partir de son icône floutée : elle se précise à chaque essai.",
  pool: "techsCivics",
  suggestionImages: false,
  texts: {
    none: "Aucune technologie ni aucun dogme disponible (data/techs_civics.json manquant ou vide).",
    placeholder: "Tape le nom d'une technologie ou d'un dogme…",
    label: "Nom de la technologie ou du dogme",
    next: "Prochaine énigme dans",
    yesterday: "Hier, c'était :",
  },
  eligible: (r) => !!r.icon,

  setup(ctx) {
    ctx.els.clue.innerHTML = `<div class="frame techcivic-frame"><img alt="Icône mystère" draggable="false"></div>`;
    // Padding as in css/style.css (keeps the blur inside the frame).
    ctx.tcClue = createClue(ctx.els.clue.querySelector(".frame"), ctx.answer.icon, { padding: 0.14 });
  },

  update(ctx) {
    if (ctx.state.won) ctx.tcClue.reveal(ctx.answer.icon);
    else ctx.tcClue.set({ blur: blurFor(ctx.state.guesses.length, false) });
  },

  renderGuess: (ctx, item) => defaultGuessRow(item, ctx.answer),
};
