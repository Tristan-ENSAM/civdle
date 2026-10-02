/**
 * Entry point: load data, build the mode tabs, mount the selected mode.
 * The selected mode is kept in the URL hash (#classic, #portrait, …) so a
 * link can point directly to a mode. The site title links to #accueil, the
 * summary of the modes (js/home.js); an empty or unknown hash still opens the
 * first mode.
 */
import { loadData } from "./core/data.js";
import { dateInTimezone, pickDaily } from "./core/daily.js";
import { loadState } from "./core/storage.js";
import { mountMode } from "./core/game.js";
import modes from "./modes/index.js";
import { renderHome, HOME_ID } from "./home.js";

async function main() {
  const tabs = document.getElementById("tabs");
  const container = document.getElementById("game");
  let data;
  try {
    data = await loadData();
  } catch (err) {
    container.innerHTML = `<p class="notice"></p>`;
    container.querySelector(".notice").textContent =
      `${err.message}. Si tu as ouvert index.html directement (file://), lance un serveur local : voir README.`;
    return;
  }
  const { config } = data;
  // Answer pool of a mode: the leaders, unless the mode names another pool.
  const poolOf = (m) => (m.pool ? data[m.pool] ?? [] : data.leaders);
  document.title = config.siteTitle ?? "Civdle";
  document.getElementById("site-title").textContent = config.siteTitle ?? "Civdle";
  const dateStr = dateInTimezone(config.timezone);

  /** Today's puzzle of mode `m` is won in this browser. */
  function isSolved(m) {
    const st = loadState(m.id, dateStr);
    const ans = pickDaily(poolOf(m), m.id, dateStr, config, (l) => (m.eligible ? m.eligible(l, config) : true));
    return !!(st.won && ans && st.answerId === ans.id);
  }

  function renderTabs(currentId) {
    tabs.innerHTML = "";
    for (const m of modes) {
      const a = document.createElement("a");
      a.href = `#${m.id}`;
      a.className = m.id === currentId ? "active" : "";
      if (isSolved(m)) a.classList.add("solved");
      a.textContent = m.label;
      tabs.appendChild(a);
    }
  }

  function route() {
    const id = location.hash.slice(1);
    if (id === HOME_ID) {
      renderTabs(null);
      renderHome(container, modes, isSolved);
      return;
    }
    const mode = modes.find((m) => m.id === id) ?? modes[0];
    renderTabs(mode.id);
    mountMode(mode, { leaders: poolOf(mode), config, dateStr, container, onSolved: () => renderTabs(mode.id) });
  }

  window.addEventListener("hashchange", route);
  route();
}

main();
