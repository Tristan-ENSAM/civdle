/**
 * Persistence of each mode's daily progress in localStorage.
 *
 * Key layout: "civdle:<modeId>:<YYYY-MM-DD>" -> { guesses: string[], won: boolean,
 * answerId: string } (answerId lets the game discard a state played against a
 * different answer, e.g. after a salt change).
 * All accesses are wrapped in try/catch: in private browsing or with blocked
 * storage the game still works, it just forgets progress on reload.
 */

const PREFIX = "civdle";

function key(modeId, dateStr) {
  return `${PREFIX}:${modeId}:${dateStr}`;
}

/** Load a mode's state for a date; returns a fresh state if nothing is stored. */
export function loadState(modeId, dateStr) {
  try {
    const raw = localStorage.getItem(key(modeId, dateStr));
    if (raw) {
      const s = JSON.parse(raw);
      if (Array.isArray(s.guesses)) return { guesses: s.guesses, won: !!s.won, answerId: s.answerId ?? null };
    }
  } catch (_) { /* storage unavailable or corrupted: start fresh */ }
  return { guesses: [], won: false, answerId: null };
}

/** Save a mode's state for a date. Silently ignored if storage is unavailable. */
export function saveState(modeId, dateStr, state) {
  try {
    localStorage.setItem(key(modeId, dateStr), JSON.stringify(state));
  } catch (_) { /* ignore */ }
}
