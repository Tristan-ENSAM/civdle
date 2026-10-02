/**
 * Mode "Portrait": the answer's portrait starts heavily blurred and gets
 * sharper after each wrong guess.
 *
 * "Mode challenger" checkbox: the portrait is also shown in shades of grey
 * and rotated by an angle drawn each day (deterministic from the date and the
 * leader, ROTATE_MIN..ROTATE_MAX degrees). It only changes the display: the
 * daily leader and the progress are the same with or without it. Grey and
 * rotation are removed once the leader is found. Ticked by default; the
 * checkbox state is kept in localStorage (per browser; without storage the
 * box starts ticked on every load).
 *
 * Tuning: BLUR_START (px) is the initial blur; the blur reaches 0 after
 * STEPS wrong guesses (linear). Arbitrary defaults, to adjust.
 *
 * The clue is drawn on a canvas (js/core/clue.js), so the dev tools' inspector
 * shows neither the sharp image nor a CSS filter to remove. The image file is
 * still downloaded, so the Network panel gives it: a static site cannot
 * prevent this.
 */
import { defaultGuessRow } from "../core/game.js";
import { hashString, mulberry32 } from "../core/daily.js";
import { createClue } from "../core/clue.js";

const BLUR_START = 24;
const STEPS = 8;
const ROTATE_MIN = 60;
const ROTATE_MAX = 300;
const CHALLENGE_KEY = "civdle:portrait:challenge";

export function blurFor(nGuesses, won) {
  if (won) return 0;
  return Math.max(0, BLUR_START * (1 - nGuesses / STEPS));
}

/** Daily rotation angle in degrees, in [ROTATE_MIN, ROTATE_MAX]. */
export function rotationFor(dateStr, leaderId) {
  const rng = mulberry32(hashString(`${dateStr}::${leaderId}::rotate`));
  return Math.round(ROTATE_MIN + rng() * (ROTATE_MAX - ROTATE_MIN));
}

// On by default: only an explicit "0" (the player unticked the box) turns it off.
function loadChallenge() {
  try { return localStorage.getItem(CHALLENGE_KEY) !== "0"; } catch (_) { return true; }
}

function saveChallenge(on) {
  try { localStorage.setItem(CHALLENGE_KEY, on ? "1" : "0"); } catch (_) { /* ignore */ }
}

export default {
  id: "portrait",
  label: "Portrait",
  hint: "Retrouve le leader à partir de son portrait flouté : il se précise à chaque essai.",
  eligible: (l) => !!l.portrait,

  setup(ctx) {
    ctx.els.clue.innerHTML = `
      <label class="toggle"><input type="checkbox"> Mode challenger <span class="toggle-hint">(nuances de gris + rotation)</span></label>
      <div class="frame portrait-frame"><img alt="Portrait mystère" draggable="false"></div>`;
    ctx.portraitClue = createClue(ctx.els.clue.querySelector(".frame"), ctx.answer.portrait, { round: true });
    ctx.portraitAngle = rotationFor(ctx.dateStr, ctx.answer.id);
    const box = ctx.els.clue.querySelector(".toggle input");
    box.checked = loadChallenge();
    ctx.challenge = box.checked;
    box.addEventListener("change", () => {
      ctx.challenge = box.checked;
      saveChallenge(box.checked);
      this.update(ctx);
    });
  },

  update(ctx) {
    if (ctx.state.won) {
      ctx.portraitClue.reveal(ctx.answer.portrait);
      return;
    }
    const hard = ctx.challenge;
    ctx.portraitClue.set({
      blur: blurFor(ctx.state.guesses.length, false),
      grey: hard,
      scale: 1.08,
      rotate: hard ? ctx.portraitAngle : 0,
    });
  },

  renderGuess: (ctx, leader) => defaultGuessRow(leader, ctx.answer),

  shareGrid: (ctx) => (ctx.challenge ? "Mode challenger" : ""),
};
