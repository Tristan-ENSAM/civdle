/**
 * Mode "Portrait": the answer's portrait starts heavily blurred and gets
 * sharper after each wrong guess.
 *
 * Tuning: BLUR_START (px) is the initial blur; the blur reaches 0 after
 * STEPS wrong guesses (linear). Both values are arbitrary defaults, to adjust.
 *
 * Note: the blur is a CSS filter, so a player can remove it with the browser
 * dev tools. A static site cannot prevent this (the answer itself is computed
 * in the browser).
 */
import { defaultGuessRow } from "../core/game.js";

const BLUR_START = 24;
const STEPS = 8;

export function blurFor(nGuesses, won) {
  if (won) return 0;
  return Math.max(0, BLUR_START * (1 - nGuesses / STEPS));
}

export default {
  id: "portrait",
  label: "Portrait",
  hint: "Retrouve le leader à partir de son portrait flouté : il se précise à chaque essai.",

  eligible: (l) => !!l.portrait,

  setup(ctx) {
    ctx.els.clue.innerHTML = `<div class="frame portrait-frame"><img alt="Portrait mystère" draggable="false"></div>`;
    ctx.portraitImg = ctx.els.clue.querySelector("img");
    ctx.portraitImg.src = ctx.answer.portrait;
    ctx.portraitImg.addEventListener("contextmenu", (e) => e.preventDefault());
  },

  update(ctx) {
    const b = blurFor(ctx.state.guesses.length, ctx.state.won);
    ctx.portraitImg.style.filter = `blur(${b}px)`;
  },

  renderGuess: (ctx, leader) => defaultGuessRow(leader, ctx.answer),
};
