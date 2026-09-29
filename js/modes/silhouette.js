/**
 * Mode "Silhouette": a black silhouette of the answer, zoomed on one spot;
 * each wrong guess zooms out.
 *
 * Image source: `leader.silhouette`, filtered by `leader.silhouetteSource`
 * (see SOURCES), a cut-out figure on a transparent
 * background (turned black by CSS). Leaders without one are not drawn in this
 * mode: the raw portraits are round medallions and would all look like discs.
 *
 * Zoom point: `leader.silhouetteFocus = [x, y]` in percent of the image,
 * shown at the centre of the frame (recommended: a point on the outline of
 * the figure; tools/bbg/build.py computes one from the image transparency). Without it, a point
 * is drawn pseudo-randomly each day in [FOCUS_MIN, FOCUS_MAX] %, which may
 * land on transparent background and show an empty frame at the first steps.
 *
 * Tuning: ZOOM_START is the initial magnification; the zoom reaches 1 after
 * STEPS wrong guesses (linear). Arbitrary defaults, to adjust.
 */
import { defaultGuessRow } from "../core/game.js";
import { hashString, mulberry32 } from "../core/daily.js";

const ZOOM_START = 5;
const STEPS = 8;
const FOCUS_MIN = 30;
const FOCUS_MAX = 70;
// Accepted values of `leader.silhouetteSource`: "game" = exact outline from
// the official textures (tools/game/import_textures.py); "mod" = exact outline
// from the BBG Expanded mod's own leader images (same script); "cutout" = estimated
// by background removal from the BBG medallion (tools/bbg/make_silhouettes.py),
// which has visible errors on some leaders. Add "cutout" to re-enable them.
const SOURCES = ["game", "mod"];

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

  // Only leaders whose silhouette source is in SOURCES (see the header).
  eligible: (l) => !!l.silhouette && SOURCES.includes(l.silhouetteSource),

  setup(ctx) {
    ctx.els.clue.innerHTML = `<div class="frame silhouette-frame"><img alt="Silhouette mystère" draggable="false"></div>`;
    const img = ctx.els.clue.querySelector("img");
    img.src = ctx.answer.silhouette;
    img.addEventListener("contextmenu", (e) => e.preventDefault());
    ctx.silhouetteFocus = focusFor(ctx.answer, ctx.dateStr);
    ctx.silhouetteImg = img;
  },

  update(ctx) {
    const img = ctx.silhouetteImg;
    const z = zoomFor(ctx.state.guesses.length, ctx.state.won);
    // View centred on the focus point, clamped so the view never leaves the
    // image: the visible window is 100/z % wide, so its centre must stay in
    // [50/z, 100 - 50/z]. The focus point therefore always stays in view, and
    // at z = 1 the whole image is shown.
    const [fx, fy] = ctx.silhouetteFocus;
    const clamp = (v) => Math.min(100 - 50 / z, Math.max(50 / z, v));
    img.style.transform = `scale(${z}) translate(${50 - clamp(fx)}%, ${50 - clamp(fy)}%)`;
    // Once solved, show the portrait in colour (if there is one).
    if (ctx.state.won && ctx.answer.portrait) {
      img.src = ctx.answer.portrait;
      img.classList.add("revealed");
    }
  },

  renderGuess: (ctx, leader) => defaultGuessRow(leader, ctx.answer),
};
