/**
 * Mode "Cités-État": the icon of a city-state is shown; the player types
 * city-state names until the right one is found. No clue changes after a
 * wrong guess (same principle as "Regard" without the widening view: the
 * player just tries again).
 *
 * Pool: the city-states of the BBG site (data/city_states.json, written by
 * tools/bbg/build_city_states.py), not the leaders. The daily draw uses the
 * same engine (own sequence, seeded by salt + "citystates").
 *
 * "Mode challenger" checkbox (ticked by default): the icon is shown in a single
 * grey (`iconGrey`) instead of its colours. On the BBG icons the colour gives
 * the city-state type, and the grey image is built so that every glyph has
 * the same grey whatever its type (see build_city_states.py). It only changes
 * the display: the daily answer and the progress are the same with or
 * without it. The colour icon is shown once the city-state is found. The
 * checkbox state is kept in localStorage (per browser; without storage the
 * box starts ticked on every load).
 *
 * Suggestions in the input are shown without icons, otherwise the list itself
 * would let the player match the shape. Wrong guesses in the history keep
 * their colour icon (they say nothing about the answer).
 *
 * Note: the colour icon path is in the data, so a player can find it with the
 * browser dev tools. A static site cannot prevent this.
 */
import { defaultGuessRow } from "../core/game.js";

const CHALLENGE_KEY = "civdle:citystates:challenge";

// On by default: only an explicit "0" (the player unticked the box) turns it off.
function loadChallenge() {
  try { return localStorage.getItem(CHALLENGE_KEY) !== "0"; } catch (_) { return true; }
}

function saveChallenge(on) {
  try { localStorage.setItem(CHALLENGE_KEY, on ? "1" : "0"); } catch (_) { /* ignore */ }
}

export default {
  id: "citystates",
  label: "Cités-État",
  hint: "Retrouve la cité-État à partir de son emblème.",
  pool: "cityStates",
  suggestionImages: false,
  texts: {
    none: "Aucune cité-État disponible (data/city_states.json manquant ou vide).",
    placeholder: "Tape le nom d'une cité-État…",
    label: "Nom de la cité-État",
    next: "Prochaine cité-État dans",
    yesterday: "La cité-État d'hier était :",
  },
  eligible: (c) => !!c.icon && !!c.iconGrey,

  setup(ctx) {
    ctx.els.clue.innerHTML = `
      <label class="toggle"><input type="checkbox"> Mode challenger <span class="toggle-hint">(emblème en gris, sans la couleur du type)</span></label>
      <div class="frame citystate-frame"><img alt="Emblème mystère" draggable="false"></div>`;
    ctx.csImg = ctx.els.clue.querySelector("img");
    ctx.csImg.addEventListener("contextmenu", (e) => e.preventDefault());
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
    const grey = ctx.challenge && !ctx.state.won;
    const src = grey ? ctx.answer.iconGrey : ctx.answer.icon;
    // Only touch src when it changes, to avoid reloading the image.
    if (ctx.csImg.getAttribute("src") !== src) ctx.csImg.setAttribute("src", src);
  },

  renderGuess: (ctx, cityState) => defaultGuessRow(cityState, ctx.answer),

  shareGrid: (ctx) => (ctx.challenge ? "Mode challenger" : ""),
};
