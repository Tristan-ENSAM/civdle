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
 * Load config, catalogs and leaders from the data folder.
 *
 * `catalogs.json` maps catalog name -> { id: { label, icon } } and is exposed
 * as `config.catalogs`. It is optional: if the file is missing, attributes
 * are displayed as plain text.
 *
 * @returns {Promise<{config: object, leaders: object[]}>}
 */
export async function loadData(base = "data") {
  const [config, leaders, catalogs] = await Promise.all([
    fetchJson(`${base}/config.json`),
    fetchJson(`${base}/leaders.json`),
    fetchJson(`${base}/catalogs.json`).catch((e) => { console.warn("[données]", e.message); return {}; }),
  ]);
  config.catalogs = catalogs;
  for (const l of leaders) {
    l._search = [l.name, ...(l.aliases ?? [])].map(normalize);
  }
  const warnings = validateLeaders(leaders, config);
  warnings.forEach((w) => console.warn("[données]", w));
  return { config, leaders };
}
