/**
 * Mode "Regard": only one eye of the answer is shown, centred in a round
 * frame; each wrong guess widens the view around that eye. The whole
 * portrait is shown once the leader is found.
 *
 * Images: `leader.eyeImages = {right, left}` (img/eyes/<id>-<side>.webp,
 * the subject's eyes), written by tools/bbg/make_eye_images.py: a square
 * centred on the eye, levelled on the eye line, of side VIEW_END x the eye
 * width, upscaled x4 with Real-ESRGAN from the 256 px BBG portrait (the
 * upscaling invents plausible detail). Eye positions come from
 * tools/bbg/detect_eyes.py (`leader.eyes`). Leaders without both images are
 * not drawn. Only the eye crop is loaded before the win, not the portrait.
 *
 * Which eye: EYE_SIDE = "right" / "left", or "daily" for a side drawn each
 * day from the date and the leader (deterministic, same for every player).
 *
 * Tuning: the visible diameter starts at VIEW_START x the eye width and grows
 * linearly to VIEW_END x the eye width after STEPS wrong guesses. VIEW_END
 * must match make_eye_images.py (the image holds exactly that view). With
 * VIEW_END = 3 the circle stays within ~1.5 eye widths of the eye centre, so
 * the other eye stays out of view on the detected faces (checked on the
 * contact sheet). Arbitrary defaults, to adjust.
 */
import { defaultGuessRow } from "../core/game.js";
import { hashString, mulberry32 } from "../core/daily.js";

const EYE_SIDE = "daily";
const VIEW_START = 1.6;
const VIEW_END = 3;
const STEPS = 10;

/** Eye shown for this leader on this date: "right" or "left". */
export function sideFor(dateStr, leaderId) {
  if (EYE_SIDE === "right" || EYE_SIDE === "left") return EYE_SIDE;
  const rng = mulberry32(hashString(`${dateStr}::${leaderId}::eye`));
  return rng() < 0.5 ? "right" : "left";
}

/** Visible diameter, in eye widths. */
export function viewFor(nGuesses) {
  return VIEW_START + (VIEW_END - VIEW_START) * Math.min(1, nGuesses / STEPS);
}

export default {
  id: "regard",
  label: "Regard",
  hint: "Reconnais le leader à un seul de ses yeux : la vue s'élargit à chaque essai.",
  eligible: (l) => !!l.portrait && !!l.eyeImages && !!l.eyeImages.right && !!l.eyeImages.left,

  setup(ctx) {
    ctx.els.clue.innerHTML = `<div class="frame regard-frame"><img alt="Œil mystère" draggable="false"></div>`;
    const img = ctx.els.clue.querySelector("img");
    img.src = ctx.answer.eyeImages[sideFor(ctx.dateStr, ctx.answer.id)];
    img.addEventListener("contextmenu", (e) => e.preventDefault());
    ctx.regardFrame = ctx.els.clue.querySelector(".regard-frame");
    ctx.regardImg = img;
  },

  update(ctx) {
    const img = ctx.regardImg;
    if (ctx.state.won) {
      ctx.regardFrame.classList.add("revealed");
      img.src = ctx.answer.portrait;
      img.style.width = "";
      return;
    }
    // The image spans VIEW_END eye widths and is centred on the eye (CSS);
    // showing `v` eye widths means the image is VIEW_END / v frames wide.
    img.style.width = `${(100 * VIEW_END) / viewFor(ctx.state.guesses.length)}%`;
  },

  renderGuess: (ctx, leader) => defaultGuessRow(leader, ctx.answer),
};
