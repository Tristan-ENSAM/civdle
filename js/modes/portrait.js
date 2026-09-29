/**
 * Mode "Portrait": the answer's portrait starts heavily blurred and gets
 * sharper after each wrong guess.
 *
 * "Mode challenger" checkbox: the portrait is also shown in shades of grey
 * and rotated by an angle drawn each day (deterministic from the date and the
 * leader, ROTATE_MIN..ROTATE_MAX degrees). It only changes the display: the
 * daily leader and the progress are the same with or without it. Grey and
 * rotation are removed once the leader is found. The checkbox state is kept
 * in localStorage (per browser; the game works without it).
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

function loadChallenge() {
  try { return localStorage.getItem(CHALLENGE_KEY) === "1"; } catch (_) { return false; }
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
    ctx.portraitImg = ctx.els.clue.querySelector("img");
    ctx.portraitImg.src = ctx.answer.portrait;
    ctx.portraitImg.addEventListener("contextmenu", (e) => e.preventDefault());
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
    const won = ctx.state.won;
    const hard = ctx.challenge && !won;
    const filters = [`blur(${blurFor(ctx.state.guesses.length, won)}px)`];
    if (hard) filters.push("grayscale(1)");
    ctx.portraitImg.style.filter = filters.join(" ");
    ctx.portraitImg.style.transform = `scale(1.08) rotate(${hard ? ctx.portraitAngle : 0}deg)`;
  },

  renderGuess: (ctx, leader) => defaultGuessRow(leader, ctx.answer),

  shareGrid: (ctx) => (ctx.challenge ? "Mode challenger" : ""),
};
