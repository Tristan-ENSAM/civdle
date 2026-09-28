/**
 * Mode "Silhouette": a black silhouette of the answer, zoomed on one spot;
 * each wrong guess zooms out.
 *
 * Image source, in order of preference:
 *   1. `leader.silhouette` — a dedicated image (used as is, turned black by CSS);
 *   2. `leader.portrait`   — turned black with `filter: brightness(0)`.
 * In both cases the image MUST have a transparent background, otherwise the
 * whole frame turns black.
 *
 * Zoom point: `leader.silhouetteFocus = [x, y]` in percent of the image
 * (recommended: pick a point that is inside the figure). Without it, a point
 * is drawn pseudo-randomly each day in [FOCUS_MIN, FOCUS_MAX] %, which may
 * land on transparent background and show an empty frame at the first steps.
 *
 * Tuning: ZOOM_START is the initial magnification; the zoom reaches 1 after
 * STEPS wrong guesses (linear). Arbitrary defaults, to adjust.
 */
import { defaultGuessRow } from "../core/game.js";
import { hashString, mulberry32 } from "../core/daily.js";

const ZOOM_START = 6;
const STEPS = 8;
const FOCUS_MIN = 30;
const FOCUS_MAX = 70;

export function zoomFor(nGuesses, won) {
  if (won) return 1;
  return Math.max(1, ZOOM_START - (ZOOM_START - 1) * (nGuesses / STEPS));
}

function focusFor(leader, dateStr) {
  if (Array.isArray(leader.silhouetteFocus) && leader.silhouetteFocus.length === 2) {
    return leader.silhouetteFocus;
  }
  const rng = mulberry32(hashString(`${dateStr}::${leader.id}::focus`));
  const span = FOCUS_MAX - FOCUS_MIN;
  return [FOCUS_MIN + rng() * span, FOCUS_MIN + rng() * span];
}

export default {
  id: "silhouette",
  label: "Silhouette",
  hint: "Reconnais la silhouette : la vue se dézoome à chaque essai.",

  eligible: (l) => !!(l.silhouette || l.portrait),

  setup(ctx) {
    ctx.els.clue.innerHTML = `<div class="frame silhouette-frame"><img alt="Silhouette mystère" draggable="false"></div>`;
    const img = ctx.els.clue.querySelector("img");
    img.src = ctx.answer.silhouette || ctx.answer.portrait;
    img.addEventListener("contextmenu", (e) => e.preventDefault());
    const [fx, fy] = focusFor(ctx.answer, ctx.dateStr);
    img.style.transformOrigin = `${fx}% ${fy}%`;
    ctx.silhouetteImg = img;
  },

  update(ctx) {
    const img = ctx.silhouetteImg;
    img.style.transform = `scale(${zoomFor(ctx.state.guesses.length, ctx.state.won)})`;
    // Once solved, show the portrait in colour (if there is one).
    if (ctx.state.won && ctx.answer.portrait) {
      img.src = ctx.answer.portrait;
      img.classList.add("revealed");
    }
  },

  renderGuess: (ctx, leader) => defaultGuessRow(leader, ctx.answer),
};
