/**
 * Loading and validation of site data (config.json + leaders.json).
 */

/** Lowercase, strip accents and punctuation, for tolerant name matching. */
export function normalize(str) {
  return String(str ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Fetch a JSON file, throwing a readable error on failure. */
async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Impossible de charger ${url} (HTTP ${res.status})`);
  return res.json();
}

/**
 * Check leader records against the config and return a list of warnings.
 * Warnings are printed to the console and do not block the game.
 *
 * @param {object[]} leaders
 * @param {object}   config
 * @returns {string[]}
 */
export function validateLeaders(leaders, config) {
  const warnings = [];
  for (const attr of config.classicAttributes ?? []) {
    if (attr.catalog && !config.catalogs?.[attr.catalog]) {
      warnings.push(`config : catalogue "${attr.catalog}" (colonne "${attr.key}") introuvable dans catalogs.json`);
    }
  }
  const ids = new Set();
  for (const l of leaders) {
    const who = l.id ?? "(sans id)";
    if (!l.id) warnings.push(`Leader sans "id" : ${JSON.stringify(l).slice(0, 60)}`);
    else if (ids.has(l.id)) warnings.push(`id en double : ${l.id}`);
    ids.add(l.id);
    if (!l.name) warnings.push(`${who} : "name" manquant`);
    for (const attr of config.classicAttributes ?? []) {
      if (!(attr.key in l)) warnings.push(`${who} : attribut "${attr.key}" absent (mettre null si non applicable)`);
      if (attr.catalog) {
        const cat = config.catalogs?.[attr.catalog];
        if (!cat) continue;
        const vals = l[attr.key] == null ? [] : [].concat(l[attr.key]);
        for (const v of vals) {
          if (!(v in cat)) warnings.push(`${who} : "${v}" absent du catalogue "${attr.catalog}" (catalogs.json)`);
        }
      }
      if (attr.type === "ordered" && l[attr.key] != null) {
        const order = config[attr.order] ?? [];
        if (!order.includes(l[attr.key])) warnings.push(`${who} : valeur "${l[attr.key]}" absente de config.${attr.order}`);
      }
    }
  }
  return warnings;
}

/**
 * Answer pools other than the leaders: pool name (value of `mode.pool`) ->
 * file in the data folder and label used in console warnings. Each file is a
 * list of records with at least `id` and `name` (`aliases` optional). These
 * files are optional: if one is missing, its pool is empty and the mode
 * shows a notice.
 */
const EXTRA_POOLS = {
  cityStates: { file: "city_states.json", label: "Cité-État" },     // tools/bbg/build_city_states.py
  techsCivics: { file: "techs_civics.json", label: "Tech/dogme" },  // tools/bbg/build_techs_civics.py
  improvements: { file: "improvements.json", label: "Aménagement" }, // tools/bbg/build_improvements.py
  units: { file: "units.json", label: "Unité" },                     // tools/bbg/build_units.py
};

/**
 * Load config, catalogs, leaders and the other answer pools (EXTRA_POOLS)
 * from the data folder.
 *
 * `catalogs.json` maps catalog name -> { id: { label, icon } } and is exposed
 * as `config.catalogs`. It is optional: if the file is missing, attributes
 * are displayed as plain text.
 *
 * @returns {Promise<object>} `{ config, leaders, <pool name>: object[], ... }`
 */
export async function loadData(base = "data") {
  const optional = (url, fallback) =>
    fetchJson(url).catch((e) => { console.warn("[données]", e.message); return fallback; });
  const poolNames = Object.keys(EXTRA_POOLS);
  const [config, leaders, catalogs, ...pools] = await Promise.all([
    fetchJson(`${base}/config.json`),
    fetchJson(`${base}/leaders.json`),
    optional(`${base}/catalogs.json`, {}),
    ...poolNames.map((n) => optional(`${base}/${EXTRA_POOLS[n].file}`, [])),
  ]);
  config.catalogs = catalogs;
  const warnings = validateLeaders(leaders, config);
  const out = { config, leaders };
  poolNames.forEach((n, i) => {
    out[n] = pools[i];
    const ids = new Set();
    for (const r of pools[i]) {
      const what = EXTRA_POOLS[n].label;
      if (!r.id || !r.name) warnings.push(`${what} sans "id" ou "name" : ${JSON.stringify(r).slice(0, 60)}`);
      else if (ids.has(r.id)) warnings.push(`${what} : id en double : ${r.id}`);
      ids.add(r.id);
    }
  });
  for (const item of [...leaders, ...pools.flat()]) {
    item._search = [item.name, ...(item.aliases ?? [])].map(normalize);
  }
  warnings.forEach((w) => console.warn("[données]", w));
  return out;
}
