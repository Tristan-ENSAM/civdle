/**
 * Mode "Son": three sounds of a military unit, taken from the game, are the
 * clues; the player types unit names until the right one is found. Nothing
 * else appears after a wrong guess. The unit icon is shown once the unit is
 * found (win panel).
 *
 * The sounds go from the most general to the most telling (SOUNDS): the
 * movement sound is available from the start, the attack sound after
 * UNLOCK.attack wrong guesses, the selection sound after UNLOCK.select. In the
 * game, movement and attack sounds are often shared by a whole class of units
 * (foot soldiers, horsemen, ships...); the selection sound is specific to the
 * unit. Every sound is available once the unit is found. Thresholds are
 * arbitrary defaults, to adjust.
 *
 * Pool: the military units of the BBG site (data/units.json, written by
 * tools/bbg/build_units.py). Only units with all three `sounds` can be the
 * answer of the day: the files of audio/units/ cover the non-unique units only
 * (see build_units.py). Without any, the mode shows a notice. Unique units stay
 * in the guess list.
 *
 * The sounds are fetched and played through the Web Audio API, not an <audio>
 * element: the page holds no element whose `src` names a file. As for the
 * image clues (js/core/clue.js), the files are still downloaded, so the
 * Network panel of the dev tools gives them: a static site cannot prevent this.
 *
 * Suggestions in the input are shown with their icons (they say nothing
 * about a sound).
 */
import { defaultGuessRow } from "../core/game.js";

/** Clue order: key in `sounds`, button label. */
const SOUNDS = [
  ["move", "Déplacement"],
  ["attack", "Attaque"],
  ["select", "Sélection"],
];

/** Wrong guesses needed before a sound can be played. */
const UNLOCK = { move: 0, attack: 2, select: 4 };

/** Number of wrong guesses before `kind` unlocks (0 once unlocked). */
export function guessesBeforeUnlock(kind, nGuesses, won) {
  return won ? 0 : Math.max(0, UNLOCK[kind] - nGuesses);
}

/**
 * Player of the sound files. The AudioContext is created on the first click
 * (browsers refuse to start audio without a user gesture), shared by every
 * sound, and the decoded sounds are kept for the next plays. Starting a sound
 * stops the one being played.
 */
function createPlayer() {
  let audioCtx = null;
  let current = null;
  const buffers = new Map();
  return {
    async play(src) {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) throw new Error("Web Audio API indisponible");
      audioCtx ??= new AC();
      if (audioCtx.state === "suspended") await audioCtx.resume();
      if (!buffers.has(src)) {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`${res.status} ${src}`);
        const data = await res.arrayBuffer();
        // Callback form: older Safari has no promise-based decodeAudioData.
        buffers.set(src, await new Promise((ok, ko) => audioCtx.decodeAudioData(data, ok, ko)));
      }
      current?.stop();
      const node = audioCtx.createBufferSource();
      node.buffer = buffers.get(src);
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
  hint: "Retrouve l'unité militaire à partir de ses bruitages : un nouveau son se débloque au fil des essais.",
  pool: "units",
  texts: {
    none: "Aucune unité avec ses sons disponible (fichiers audio manquants, voir tools/bbg/build_units.py).",
    placeholder: "Tape le nom d'une unité…",
    label: "Nom de l'unité",
    next: "Prochaine unité dans",
    yesterday: "L'unité d'hier était :",
  },
  eligible: (u) => SOUNDS.every(([kind]) => !!u.sounds?.[kind]),

  setup(ctx) {
    ctx.els.clue.innerHTML = `
      <div class="sound-list"></div>
      <p class="sound-note" hidden></p>`;
    const list = ctx.els.clue.querySelector(".sound-list");
    const note = ctx.els.clue.querySelector(".sound-note");
    const player = createPlayer();
    ctx.soundButtons = SOUNDS.map(([kind, label]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sound-play";
      btn.dataset.kind = kind;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>
        <span class="sound-label"></span>
        <small class="sound-lock"></small>`;
      btn.querySelector(".sound-label").textContent = label;
      btn.addEventListener("click", async () => {
        btn.classList.add("playing");
        note.hidden = true;
        try {
          await player.play(ctx.answer.sounds[kind]);
        } catch (err) {
          console.error("Civdle: son non lu", err);
          note.textContent = "Impossible de lire le son sur ce navigateur.";
          note.hidden = false;
        } finally {
          btn.classList.remove("playing");
        }
      });
      list.appendChild(btn);
      return btn;
    });
  },

  update(ctx) {
    for (const btn of ctx.soundButtons) {
      const left = guessesBeforeUnlock(btn.dataset.kind, ctx.state.guesses.length, ctx.state.won);
      btn.disabled = left > 0;
      btn.querySelector(".sound-lock").textContent =
        left > 0 ? `dans ${left} essai${left > 1 ? "s" : ""}` : "";
    }
  },

  renderGuess: (ctx, unit) => defaultGuessRow(unit, ctx.answer),
};
