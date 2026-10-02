/**
 * Mode "Son": a sound of a military unit (selection, movement or attack, as
 * provided) is played; the player types unit names until the right one is
 * found. After ICON_AFTER wrong guesses, the unit icon appears blurred and
 * gets sharper with each further wrong guess.
 *
 * Pool: the military units of the BBG site (data/units.json, written by
 * tools/bbg/build_units.py). Only units with a `sound` can be the answer of
 * the day; the sound files are not on the BBG site and must be added to
 * audio/units/ (see build_units.py). Without any, the mode shows a notice.
 *
 * The sound is fetched and played through the Web Audio API, not an <audio>
 * element: the page holds no element whose `src` names the file. As for the
 * image clues (js/core/clue.js), the file is still downloaded, so the Network
 * panel of the dev tools gives it: a static site cannot prevent this.
 *
 * Suggestions in the input are shown without icons, otherwise the list itself
 * would let the player match the blurred icon.
 *
 * Tuning (arbitrary values, to adjust): ICON_AFTER wrong guesses before the
 * icon appears; it starts at BLUR_START px and is sharp after STEPS more.
 */
import { defaultGuessRow } from "../core/game.js";
import { createClue } from "../core/clue.js";

const ICON_AFTER = 5;
const BLUR_START = 16;
const STEPS = 6;

/** Blur in px of the icon after `nGuesses` wrong guesses, null while hidden. */
export function iconBlurFor(nGuesses, won) {
  if (won) return 0;
  if (nGuesses < ICON_AFTER) return null;
  return Math.max(0, BLUR_START * (1 - (nGuesses - ICON_AFTER) / STEPS));
}

/**
 * Player of one sound file. The AudioContext is created on the first click
 * (browsers refuse to start audio without a user gesture) and the decoded
 * sound is kept for the next plays.
 */
function createPlayer(src) {
  let audioCtx = null;
  let buffer = null;
  let current = null;
  return {
    async play() {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) throw new Error("Web Audio API indisponible");
      audioCtx ??= new AC();
      if (audioCtx.state === "suspended") await audioCtx.resume();
      if (!buffer) {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`${res.status} ${src}`);
        const data = await res.arrayBuffer();
        // Callback form: older Safari has no promise-based decodeAudioData.
        buffer = await new Promise((ok, ko) => audioCtx.decodeAudioData(data, ok, ko));
      }
      current?.stop();
      const node = audioCtx.createBufferSource();
      node.buffer = buffer;
      node.connect(audioCtx.destination);
      node.start();
      current = node;
      return new Promise((done) => { node.onended = () => { if (current === node) current = null; done(); }; });
    },
  };
}

export default {
  id: "son",
  label: "Son",
  hint: "Retrouve l'unité militaire à partir de son bruitage.",
  pool: "units",
  suggestionImages: false,
  texts: {
    none: "Aucune unité avec un son disponible (fichiers audio manquants, voir tools/bbg/build_units.py).",
    placeholder: "Tape le nom d'une unité…",
    label: "Nom de l'unité",
    next: "Prochaine unité dans",
    yesterday: "L'unité d'hier était :",
  },
  eligible: (u) => !!u.sound,

  setup(ctx) {
    ctx.els.clue.innerHTML = `
      <button type="button" class="sound-play" aria-label="Écouter le son">
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>
        <span>Écouter</span>
      </button>
      <p class="sound-note" hidden></p>
      <div class="frame unit-frame" hidden><img alt="Unité mystère" draggable="false"></div>`;
    const btn = ctx.els.clue.querySelector(".sound-play");
    const note = ctx.els.clue.querySelector(".sound-note");
    const player = createPlayer(ctx.answer.sound);
    btn.addEventListener("click", async () => {
      btn.classList.add("playing");
      note.hidden = true;
      try {
        await player.play();
      } catch (err) {
        console.error("Civdle: son non lu", err);
        note.textContent = "Impossible de lire le son sur ce navigateur.";
        note.hidden = false;
      } finally {
        btn.classList.remove("playing");
      }
    });
    ctx.unitFrame = ctx.els.clue.querySelector(".unit-frame");
    // Padding as in css/style.css (keeps the blur inside the frame).
    ctx.unitClue = ctx.answer.icon ? createClue(ctx.unitFrame, ctx.answer.icon, { padding: 0.12 }) : null;
  },

  update(ctx) {
    if (!ctx.unitClue) return;
    const blur = iconBlurFor(ctx.state.guesses.length, ctx.state.won);
    ctx.unitFrame.hidden = blur === null;
    if (ctx.state.won) ctx.unitClue.reveal(ctx.answer.icon);
    else if (blur !== null) ctx.unitClue.set({ blur });
  },

  renderGuess: (ctx, unit) => defaultGuessRow(unit, ctx.answer),
};
