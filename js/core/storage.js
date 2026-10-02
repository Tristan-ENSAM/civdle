/**
 * Persistence of each mode's daily progress in localStorage.
 *
 * Key layout: "civdle:<modeId>:<YYYY-MM-DD>" -> { guesses: string[], won: boolean,
 * answerKey: string } (answerKey lets the game discard a state played against a
 * different answer, e.g. after a salt change). answerKey is a hash of the
 * answer id (see `answerKeyOf`), so the storage panel of the browser's
 * developer tools does not show the answer in clear. States saved before
 * that change carry `answerId` (the id in clear) instead; they are still
 * recognised, and rewritten with answerKey on the next save.
 * All accesses are wrapped in try/catch: in private browsing or with blocked
 * storage the game still works, it just forgets progress on reload.
 */

import { hashString } from "./daily.js";

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
      if (Array.isArray(s.guesses)) {
        return { guesses: s.guesses, won: !!s.won, answerKey: s.answerKey ?? null, answerId: s.answerId ?? null };
      }
    }
  } catch (_) { /* storage unavailable or corrupted: start fresh */ }
  return { guesses: [], won: false, answerKey: null };
}

/**
 * Stored form of an answer id. Only hides the id from a glance at the
 * storage panel: the answer can still be recomputed from the public code
 * and data.
 */
export function answerKeyOf(modeId, dateStr, answerId, salt) {
  return hashString(`${salt}::${modeId}::${dateStr}::${answerId}`).toString(36);
}

/** True if `state` was played against `answerId` (answerKey, or the legacy clear answerId). */
export function stateMatches(state, modeId, dateStr, answerId, salt) {
  return state.answerKey === answerKeyOf(modeId, dateStr, answerId, salt) || state.answerId === answerId;
}

/** Save a mode's state for a date. Silently ignored if storage is unavailable. */
export function saveState(modeId, dateStr, state) {
  try {
    const { guesses, won, answerKey } = state;
    localStorage.setItem(key(modeId, dateStr), JSON.stringify({ guesses, won, answerKey }));
  } catch (_) { /* ignore */ }
}
