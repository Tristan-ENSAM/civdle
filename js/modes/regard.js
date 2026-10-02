/**
 * Mode "Regard": only one eye of the answer's portrait is shown, levelled
 * on the eye line; each wrong guess widens the view around that eye. The
 * whole portrait is shown once the leader is found.
 *
 * Data: `leader.eyes = {right: [cx, cy, w], left: [cx, cy, w], angle}`
 * (centre and corner-to-corner width of each eye in percent of the portrait
 * size, tilt of the eye line in degrees), computed by
 * tools/bbg/detect_eyes.py (MediaPipe Face Mesh on the BBG portrait; manual
 * values in tools/bbg/eyes_overrides.json, exclusions in
 * tools/bbg/eyes_rejected.json). Leaders without `eyes` are not drawn.
 *
 * Which eye: EYE_SIDE = "right" / "left" (the subject's side), or "daily" for
 * a side drawn each day from the date and the leader (deterministic, same
 * for every player).
 *
 * Tuning: the visible width starts at VIEW_START x the eye width and grows
 * linearly to VIEW_END x the eye width after STEPS wrong guesses, capped at
 * the whole portrait. The frame ratio is the `aspect-ratio` of .regard-frame
 * in css/style.css (ASPECT in detect_eyes.py, used for its contact sheet).
 * Arbitrary defaults, to adjust.
 *
 * Note: the crop is a CSS transform of the full portrait, so a player can
 * undo it with the browser dev tools. A static site cannot prevent this.
 * The BBG portraits are 256 px: an eye is ~15-25 px wide in the source, so
 * the first views are enlarged and look soft.
 */
import { defaultGuessRow } from "../core/game.js";
import { hashString, mulberry32 } from "../core/daily.js";

const EYE_SIDE = "daily";
const VIEW_START = 1.8;
const VIEW_END = 5;
const STEPS = 10;

/** Eye shown for this leader on this date: "right" or "left". */
export function sideFor(dateStr, leaderId) {
  if (EYE_SIDE === "right" || EYE_SIDE === "left") return EYE_SIDE;
  const rng = mulberry32(hashString(`${dateStr}::${leaderId}::eye`));
  return rng() < 0.5 ? "right" : "left";
}

/** Visible width, in percent of the portrait width. */
export function viewWidthFor(eyeWidth, nGuesses) {
  const k = VIEW_START + (VIEW_END - VIEW_START) * Math.min(1, nGuesses / STEPS);
  return Math.min(100, eyeWidth * k);
}

function hasEyes(l) {
  const e = l.eyes;
  return !!e && Array.isArray(e.right) && Array.isArray(e.left) && typeof e.angle === "number";
}

export default {
  id: "regard",
  label: "Regard",
  hint: "Reconnais le leader à un seul de ses yeux : la vue s'élargit à chaque essai.",
  eligible: (l) => !!l.portrait && hasEyes(l),

  setup(ctx) {
    ctx.els.clue.innerHTML = `<div class="frame regard-frame"><img alt="Œil mystère" draggable="false"></div>`;
    const img = ctx.els.clue.querySelector("img");
    img.src = ctx.answer.portrait;
    img.addEventListener("contextmenu", (e) => e.preventDefault());
    ctx.regardFrame = ctx.els.clue.querySelector(".regard-frame");
    ctx.regardImg = img;
    ctx.regardEye = ctx.answer.eyes[sideFor(ctx.dateStr, ctx.answer.id)];
  },

  update(ctx) {
    const img = ctx.regardImg;
    if (ctx.state.won) {
      ctx.regardFrame.classList.add("revealed");
      img.style.width = "";
      img.style.transformOrigin = "";
      img.style.transform = "";
      return;
    }
    const [cx, cy, w] = ctx.regardEye;
    const vw = viewWidthFor(w, ctx.state.guesses.length);
    // The portrait is square and is vw % wide in the frame's terms, so its
    // width is 100/vw frame widths. Its top-left corner sits at the frame
    // centre (CSS); it is then shifted by (cx, cy) percent of its own size so
    // the eye sits at the frame centre, and rotated about the eye to level
    // the eye line.
    img.style.width = `${(100 * 100) / vw}%`;
    img.style.transformOrigin = `${cx}% ${cy}%`;
    img.style.transform = `translate(${-cx}%, ${-cy}%) rotate(${-ctx.answer.eyes.angle}deg)`;
  },

  renderGuess: (ctx, leader) => defaultGuessRow(leader, ctx.answer),
};
