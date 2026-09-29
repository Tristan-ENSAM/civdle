/**
 * Game engine shared by every mode.
 *
 * A mode is a plain object (see js/modes/README.md for the full contract):
 *
 *   {
 *     id: "classic",                 // unique, used in storage keys and daily seed
 *     label: "Classique",            // tab label
 *     hint: "…",                     // one-line rule shown above the input
 *     eligible(leader, config),      // optional: which leaders can be today's answer
 *     setup(ctx),                    // optional: build the clue area once
 *     update(ctx),                   // optional: redraw the clue after each guess
 *     renderGuess(ctx, leader),      // optional: element added to the history
 *     shareGrid(ctx),                // optional: extra lines for the share text
 *     revealMs(ctx),                 // optional: ms to wait before the win panel
 *   }
 *
 * The engine owns: daily answer, input, history list, win detection,
 * persistence, win panel (share, countdown, yesterday's answer).
 */
import { pickDaily, shiftDate, msUntilNextDay } from "./daily.js";
import { loadState, saveState } from "./storage.js";
import { createGuessInput } from "./input.js";

/**
 * Mount a mode into a container.
 *
 * @param {object} mode
 * @param {object} env  { leaders, config, dateStr, container, onSolved }
 */
export function mountMode(mode, env) {
  const { leaders, config, dateStr, container } = env;
  const eligible = (l) => (mode.eligible ? mode.eligible(l, config) : true);
  const answer = pickDaily(leaders, mode.id, dateStr, config, eligible);
  const byId = new Map(leaders.map((l) => [l.id, l]));

  container.innerHTML = "";
  if (!answer) {
    container.innerHTML = `<p class="notice">Aucun leader éligible pour ce mode (données manquantes).</p>`;
    return;
  }

  let state = loadState(mode.id, dateStr);
  // A stored state only applies to the answer it was played against: if the
  // daily answer changed (new salt, data update), start over.
  if (state.answerId !== answer.id) state = { guesses: [], won: false, answerId: answer.id };
  // Drop stored ids that no longer exist in the data.
  state.guesses = state.guesses.filter((id) => byId.has(id));

  container.innerHTML = `
    <p class="hint"></p>
    <div class="clue"></div>
    <div class="input-slot"></div>
    <p class="counter"></p>
    <div class="win" hidden></div>
    <div class="history"></div>
    <p class="yesterday"></p>`;
  container.querySelector(".hint").textContent = mode.hint ?? "";
  const els = {
    clue: container.querySelector(".clue"),
    history: container.querySelector(".history"),
    win: container.querySelector(".win"),
    counter: container.querySelector(".counter"),
  };

  const ctx = { mode, answer, leaders, config, state, els, dateStr, byId };

  const input = createGuessInput({
    leaders,
    excluded: () => new Set(state.guesses),
    onSubmit: (leader) => guess(leader),
  });
  container.querySelector(".input-slot").appendChild(input.el);

  mode.setup?.(ctx);

  function addHistory(leader, animate) {
    const row = mode.renderGuess ? mode.renderGuess(ctx, leader) : defaultGuessRow(leader, answer);
    if (!row) return;
    if (animate) row.classList.add("reveal");
    els.history.prepend(row);
  }

  function refresh() {
    const n = state.guesses.length;
    els.counter.textContent = n ? `${n} essai${n > 1 ? "s" : ""}` : "";
    mode.update?.(ctx);
    if (state.won) {
      input.disable();
      showWin();
    }
  }

  function guess(leader) {
    if (state.won || state.guesses.includes(leader.id)) return;
    state.guesses.push(leader.id);
    if (leader.id === answer.id) state.won = true;
    saveState(mode.id, dateStr, state);
    addHistory(leader, true);
    // Let the reveal animation of the new row finish before showing the win
    // panel (mode.revealMs, optional).
    const delay = state.won ? (mode.revealMs?.(ctx) ?? 0) : 0;
    const finish = () => { refresh(); if (state.won) env.onSolved?.(mode.id); };
    if (delay > 0) { input.disable(); setTimeout(finish, delay); } else finish();
  }

  function showWin() {
    const n = state.guesses.length;
    els.win.hidden = false;
    els.win.innerHTML = `
      ${answer.portrait ? `<img class="win-portrait" src="${answer.portrait}" alt="">` : ""}
      <div>
        <p class="win-title">Bravo ! C'était <strong></strong></p>
        <p>Trouvé en ${n} essai${n > 1 ? "s" : ""}.</p>
        <button type="button" class="share">Copier le résultat</button>
        <p class="next">Prochain leader dans <span class="countdown"></span></p>
      </div>`;
    els.win.querySelector("strong").textContent = answer.name;
    els.win.querySelector(".share").addEventListener("click", (e) => share(e.currentTarget));
    startCountdown(els.win.querySelector(".countdown"));
  }

  async function share(btn) {
    const n = state.guesses.length;
    const extra = mode.shareGrid ? mode.shareGrid(ctx) : "";
    const text = [`${config.siteTitle ?? "Civdle"} — ${mode.label} — ${dateStr}`,
                  `Trouvé en ${n} essai${n > 1 ? "s" : ""}`, extra, location.href.split("#")[0]]
      .filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copié !";
    } catch (_) {
      // Clipboard API unavailable (e.g. non-HTTPS): fall back to a prompt.
      window.prompt("Copie ce texte :", text);
    }
  }

  function startCountdown(el) {
    const target = Date.now() + msUntilNextDay(config.timezone);
    const tick = () => {
      const s = Math.max(0, Math.round((target - Date.now()) / 1000));
      const hh = String(Math.floor(s / 3600)).padStart(2, "0");
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      el.textContent = `${hh}:${mm}:${ss}`;
      if (s === 0) { clearInterval(timer); el.textContent = "maintenant — recharge la page"; }
    };
    const timer = setInterval(tick, 1000);
    tick();
  }

  // Yesterday's answer, like pokedle.
  const y = pickDaily(leaders, mode.id, shiftDate(dateStr, -1), config, eligible);
  if (y) container.querySelector(".yesterday").textContent = `Le leader d'hier était : ${y.name}`;

  // Replay stored guesses without animation (history shows newest first).
  state.guesses.forEach((id) => addHistory(byId.get(id), false));
  refresh();
  if (!state.won) input.focus();
}

/** Default history row: portrait + name, green if correct, red otherwise. */
export function defaultGuessRow(leader, answer) {
  const row = document.createElement("div");
  row.className = `guess-row ${leader.id === answer.id ? "ok" : "ko"}`;
  row.innerHTML = `${leader.portrait ? `<img src="${leader.portrait}" alt="">` : ""}<span></span>`;
  row.querySelector("span").textContent = leader.name;
  return row;
}
