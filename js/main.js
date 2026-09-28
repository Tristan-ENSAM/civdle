/**
 * Entry point: load data, build the mode tabs, mount the selected mode.
 * The selected mode is kept in the URL hash (#classic, #portrait, …) so a
 * link can point directly to a mode.
 */
import { loadData } from "./core/data.js";
import { dateInTimezone } from "./core/daily.js";
import { loadState } from "./core/storage.js";
import { mountMode } from "./core/game.js";
import modes from "./modes/index.js";

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
  const { config, leaders } = data;
  document.title = config.siteTitle ?? "Civdle";
  document.getElementById("site-title").textContent = config.siteTitle ?? "Civdle";
  const dateStr = dateInTimezone(config.timezone);

  function renderTabs(currentId) {
    tabs.innerHTML = "";
    for (const m of modes) {
      const a = document.createElement("a");
      a.href = `#${m.id}`;
      a.className = m.id === currentId ? "active" : "";
      if (loadState(m.id, dateStr).won) a.classList.add("solved");
      a.textContent = m.label;
      tabs.appendChild(a);
    }
  }

  function route() {
    const id = location.hash.slice(1);
    const mode = modes.find((m) => m.id === id) ?? modes[0];
    renderTabs(mode.id);
    mountMode(mode, { leaders, config, dateStr, container, onSolved: () => renderTabs(mode.id) });
  }

  window.addEventListener("hashchange", route);
  route();
}

main();
