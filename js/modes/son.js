/**
 * Mode "Son": a sound of a military unit (selection, movement or attack, as
 * provided) is played; the player types unit names until the right one is
 * found. The sound is the only clue: nothing else appears after a wrong
 * guess. The unit icon is shown once the unit is found (win panel).
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
 * Suggestions in the input are shown with their icons (they say nothing
 * about a sound).
 */
import { defaultGuessRow } from "../core/game.js";

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
      <p class="sound-note" hidden></p>`;
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
  },

  renderGuess: (ctx, unit) => defaultGuessRow(unit, ctx.answer),
};
