/**
 * Summary page (#accueil), opened by clicking the site title: one card per
 * game mode, in tab order, with its icon (js/modes/icons.js), its rule
 * (`mode.hint`) and whether today's puzzle of that mode is solved in this
 * browser.
 */
import { iconFor } from "./modes/icons.js";

export const HOME_ID = "accueil";

/**
 * Render the summary into `container`.
 *
 * @param {HTMLElement} container
 * @param {object[]} modes                 Mode objects (js/modes/index.js).
 * @param {(mode: object) => boolean} isSolved  Today's puzzle of the mode is won.
 */
export function renderHome(container, modes, isSolved) {
  container.innerHTML = `
    <section class="home">
      <h2 class="home-title">Modes de jeu</h2>
      <p class="hint">Une énigme par mode et par jour, la même pour tout le monde.</p>
      <ul class="home-list"></ul>
    </section>`;
  const list = container.querySelector(".home-list");
  for (const m of modes) {
    const solved = isSolved(m);
    const li = document.createElement("li");
    li.innerHTML = `
      <a class="home-card${solved ? " solved" : ""}" href="#${m.id}">
        <span class="home-icon">${iconFor(m.id)}</span>
        <span class="home-text">
          <span class="home-label"></span>
          <span class="home-hint"></span>
        </span>
        <span class="home-status"></span>
      </a>`;
    li.querySelector(".home-label").textContent = m.label;
    li.querySelector(".home-hint").textContent = m.hint ?? "";
    li.querySelector(".home-status").textContent = solved ? "Résolu ✓" : "À jouer";
    list.appendChild(li);
  }
}
