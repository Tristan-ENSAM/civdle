/**
 * Site-wide display settings (gear button in the top bar, index.html).
 *
 * Stored in localStorage under "civdle:settings" as { colorblind: boolean }.
 * `colorblind` adds the class "colorblind" on <html>, which swaps the result
 * colours in css/style.css (green / red -> blue / grey) and the share grid
 * squares (js/modes/classic.js). Storage errors are ignored, as in storage.js:
 * the setting then only lasts until the page is reloaded.
 */

const KEY = "civdle:settings";
const DEFAULTS = { colorblind: false };

let current = { ...DEFAULTS };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { colorblind: !!s.colorblind };
    }
  } catch (_) { /* storage unavailable or corrupted: defaults */ }
  return { ...DEFAULTS };
}

function apply() {
  document.documentElement.classList.toggle("colorblind", current.colorblind);
}

/** Current settings (read-only copy). */
export function getSettings() {
  return { ...current };
}

/** Change one or more settings, apply them and save them. */
export function setSettings(patch) {
  current = { ...current, ...patch };
  apply();
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch (_) { /* ignore */ }
}

/**
 * Load the stored settings, apply them, and wire the settings dialog:
 * #settings-open opens #settings, whose checkbox #opt-colorblind toggles the
 * colour-blind mode. The dialog closes with its button, Escape, or a click on
 * the backdrop.
 */
export function initSettings() {
  current = load();
  apply();
  const dialog = document.getElementById("settings");
  const open = document.getElementById("settings-open");
  if (!dialog || !open || typeof dialog.showModal !== "function") {
    if (open) open.hidden = true; // <dialog> unsupported: no way to show the panel
    return;
  }
  const box = dialog.querySelector("#opt-colorblind");
  open.addEventListener("click", () => {
    box.checked = current.colorblind;
    dialog.showModal();
  });
  box.addEventListener("change", () => setSettings({ colorblind: box.checked }));
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  // A click on the backdrop targets the <dialog> itself, outside its content box.
  dialog.addEventListener("click", (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) dialog.close();
  });
}
