/**
 * Daily answer selection.
 *
 * Every player gets the same leader for a given (date, mode) pair, because the
 * choice only depends on: the date in the configured timezone, the mode id,
 * the configured salt, and the list of leader ids.
 *
 * Method: the leader ids are sorted, then shuffled with a PRNG seeded by
 * (salt + mode id). Day N (counted from `config.epoch`) picks element
 * N mod len of that permutation. Consequence: no leader repeats within a
 * full cycle of `len` days for a given mode.
 *
 * Caveat: adding or removing a leader changes the permutation, hence the
 * answers of the current and following days.
 */

/** Return today's date as "YYYY-MM-DD" in the given IANA timezone. */
export function dateInTimezone(timezone, now = new Date()) {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/** Number of whole days between two "YYYY-MM-DD" strings (b - a). */
export function daysBetween(a, b) {
  const toUtc = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

/** Shift a "YYYY-MM-DD" string by `delta` days. */
export function shiftDate(dateStr, delta) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return t.toISOString().slice(0, 10);
}

/** 32-bit FNV-1a string hash. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG: returns a function yielding floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle (returns a new array). */
export function seededShuffle(array, rng) {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Pick the leader for a mode on a given date.
 *
 * @param {object[]} leaders  Leader records (must have a unique `id`).
 * @param {string}   modeId   Mode identifier (each mode has its own sequence).
 * @param {string}   dateStr  "YYYY-MM-DD".
 * @param {object}   config   Site config (`epoch`, `salt`).
 * @param {(leader: object) => boolean} [eligible]  Optional filter, e.g. the
 *        portrait mode only keeps leaders that have a portrait.
 * @returns {object|null} The selected leader, or null if none is eligible.
 */
export function pickDaily(leaders, modeId, dateStr, config, eligible = () => true) {
  const pool = leaders.filter(eligible).map((l) => l.id).sort();
  if (pool.length === 0) return null;
  const rng = mulberry32(hashString(`${config.salt}::${modeId}`));
  const order = seededShuffle(pool, rng);
  const n = daysBetween(config.epoch, dateStr);
  const idx = ((n % order.length) + order.length) % order.length;
  return leaders.find((l) => l.id === order[idx]);
}

/** Milliseconds until the next midnight in the given timezone (approximation-free: polls by minutes). */
export function msUntilNextDay(timezone, now = new Date()) {
  const today = dateInTimezone(timezone, now);
  // Step forward minute by minute from a coarse lower bound; bounded loop (max 1440 iterations).
  let t = new Date(now.getTime());
  t.setSeconds(0, 0);
  for (let i = 0; i <= 1440; i++) {
    t = new Date(t.getTime() + 60000);
    if (dateInTimezone(timezone, t) !== today) return t.getTime() - now.getTime();
  }
  return 0;
}
