/**
 * Mode "Portrait": the answer's portrait starts heavily blurred and gets
 * sharper after each wrong guess.
 *
 * `makePortraitMode(options)` builds the mode; two variants are exported:
 *   - default export "portrait": colour, upright;
 *   - `portraitChallenge` ("Flou challenger"): same blur schedule, plus the
 *     image is in shades of grey and rotated by an angle drawn each day
 *     (deterministic from the date, ROTATE_MIN..ROTATE_MAX degrees, either
 *     direction). Grey and rotation stay until the leader is found.
 *
 * Tuning: BLUR_START (px) is the initial blur; the blur reaches 0 after
 * STEPS wrong guesses (linear). Arbitrary defaults, to adjust.
 *
 * Note: the effects are CSS filters/transforms, so a player can remove them
 * with the browser dev tools. A static site cannot prevent this.
 */
import { defaultGuessRow } from "../core/game.js";
import { hashString, mulberry32 } from "../core/daily.js";

const BLUR_START = 24;
const STEPS = 8;
const ROTATE_MIN = 60;
const ROTATE_MAX = 300;

export function blurFor(nGuesses, won) {
  if (won) return 0;
  return Math.max(0, BLUR_START * (1 - nGuesses / STEPS));
}

/** Daily rotation angle in degrees, in [ROTATE_MIN, ROTATE_MAX]. */
export function rotationFor(dateStr, leaderId) {
  const rng = mulberry32(hashString(`${dateStr}::${leaderId}::rotate`));
  return Math.round(ROTATE_MIN + rng() * (ROTATE_MAX - ROTATE_MIN));
}

/**
 * Build a portrait-blur mode.
 * @param {object} o
 * @param {string} o.id
 * @param {string} o.label
 * @param {string} o.hint
 * @param {boolean} [o.grayscale]  Show the portrait in shades of grey until found.
 * @param {boolean} [o.rotate]     Rotate the portrait by a daily angle until found.
 */
export function makePortraitMode({ id, label, hint, grayscale = false, rotate = false }) {
  return {
    id,
    label,
    hint,
    eligible: (l) => !!l.portrait,

    setup(ctx) {
      ctx.els.clue.innerHTML = `<div class="frame portrait-frame"><img alt="Portrait mystère" draggable="false"></div>`;
      ctx.portraitImg = ctx.els.clue.querySelector("img");
      ctx.portraitImg.src = ctx.answer.portrait;
      ctx.portraitImg.addEventListener("contextmenu", (e) => e.preventDefault());
      ctx.portraitAngle = rotate ? rotationFor(ctx.dateStr, ctx.answer.id) : 0;
    },

    update(ctx) {
      const won = ctx.state.won;
      const filters = [`blur(${blurFor(ctx.state.guesses.length, won)}px)`];
      if (grayscale && !won) filters.push("grayscale(1)");
      ctx.portraitImg.style.filter = filters.join(" ");
      const angle = won ? 0 : ctx.portraitAngle;
      ctx.portraitImg.style.transform = `scale(1.08) rotate(${angle}deg)`;
    },

    renderGuess: (ctx, leader) => defaultGuessRow(leader, ctx.answer),
  };
}

export const portraitChallenge = makePortraitMode({
  id: "portrait-challenge",
  label: "Flou challenger",
  hint: "Portrait flouté, en nuances de gris et pivoté : il se précise à chaque essai.",
  grayscale: true,
  rotate: true,
});

export default makePortraitMode({
  id: "portrait",
  label: "Portrait",
  hint: "Retrouve le leader à partir de son portrait flouté : il se précise à chaque essai.",
});
