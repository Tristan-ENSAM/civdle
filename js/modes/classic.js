/**
 * Mode "Classique": guess the leader; each guess shows, per attribute,
 * whether it matches the answer.
 *
 * Columns come from `config.classicAttributes` (data/config.json), so adding
 * or removing a compared attribute needs no code change. Supported types:
 *   - "exact":   green if equal, red otherwise (null == null counts as equal).
 *   - "set":     value is an array (or a single value); green if same set,
 *                orange if they share at least one element, red otherwise.
 *   - "ordered": value must appear in the list `config[attr.order]`; green if
 *                equal, red with an arrow pointing toward the answer otherwise.
 *
 * Optional `catalog` on an attribute: values are ids compared as such, and
 * displayed as icons from `data/catalogs.json` (see fillValue).
 */

const EMPTY_LABEL = "Aucun";

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Compare one attribute of a guess with the answer.
 * @returns {{status: "ok"|"partial"|"ko", arrow?: "up"|"down"}}
 */
export function compareAttribute(attr, guessVal, answerVal, config) {
  if (attr.type === "set") {
    const g = new Set(asArray(guessVal));
    const a = new Set(asArray(answerVal));
    const same = g.size === a.size && [...g].every((x) => a.has(x));
    if (same) return { status: "ok" };
    return { status: [...g].some((x) => a.has(x)) ? "partial" : "ko" };
  }
  if (attr.type === "ordered") {
    if (guessVal === answerVal) return { status: "ok" };
    const order = config[attr.order] ?? [];
    const gi = order.indexOf(guessVal);
    const ai = order.indexOf(answerVal);
    if (gi < 0 || ai < 0) return { status: "ko" }; // unknown position: no arrow
    return { status: "ko", arrow: gi < ai ? "up" : "down" };
  }
  // "exact" (default)
  return { status: (guessVal ?? null) === (answerVal ?? null) ? "ok" : "ko" };
}

/**
 * Fill a cell with the attribute value(s).
 *
 * If the attribute has a `catalog`, each value is an id looked up in
 * `config.catalogs[attr.catalog]`: its `icon` is shown (with `label` as
 * tooltip/alt text); without icon, or if the image fails to load, the
 * `label` is shown as text; unknown ids are shown as is.
 * Without catalog, values are shown as text.
 */
function fillValue(cell, attr, value, config) {
  const vals = asArray(value);
  if (!vals.length) { cell.append(EMPTY_LABEL); return; }
  const catalog = attr.catalog ? config.catalogs?.[attr.catalog] : null;
  if (!catalog) { cell.append(vals.join(", ")); return; }
  const box = document.createElement("span");
  box.className = "icons";
  for (const v of vals) {
    const entry = catalog[v];
    const label = entry?.label ?? String(v);
    if (entry?.icon) {
      const img = document.createElement("img");
      img.src = entry.icon;
      img.alt = label;
      img.title = label;
      img.onerror = () => img.replaceWith(label);
      box.appendChild(img);
    } else {
      const s = document.createElement("span");
      s.textContent = label;
      box.appendChild(s);
    }
  }
  cell.appendChild(box);
}

export default {
  id: "classic",
  label: "Classique",
  hint: "Devine le leader : chaque essai révèle quelles caractéristiques il partage avec la réponse.",

  setup(ctx) {
    const attrs = ctx.config.classicAttributes ?? [];
    const header = document.createElement("div");
    header.className = "classic-row classic-header";
    header.style.setProperty("--cols", attrs.length);
    header.innerHTML = `<div class="cell">Leader</div>` +
      attrs.map(() => `<div class="cell"></div>`).join("");
    attrs.forEach((a, i) => { header.children[i + 1].textContent = a.label; });
    ctx.els.history.classList.add("classic-table");
    ctx.els.history.before(header);
    ctx.classicHeader = header;
    // Horizontal scroll wrapper keeps header and rows aligned on small screens.
    const scroller = document.createElement("div");
    scroller.className = "classic-scroll";
    header.before(scroller);
    scroller.append(header, ctx.els.history);

    const legend = document.createElement("p");
    legend.className = "legend";
    legend.innerHTML = `<span class="sw ok"></span>identique <span class="sw partial"></span>partiel
      <span class="sw ko"></span>différent &nbsp;↑/↓ : la réponse est plus tardive/plus précoce`;
    ctx.els.clue.appendChild(legend);
  },

  update(ctx) {
    ctx.classicHeader.hidden = ctx.state.guesses.length === 0;
  },

  renderGuess(ctx, leader) {
    const attrs = ctx.config.classicAttributes ?? [];
    const row = document.createElement("div");
    row.className = "classic-row";
    row.style.setProperty("--cols", attrs.length);
    const nameCell = document.createElement("div");
    nameCell.className = `cell name ${leader.id === ctx.answer.id ? "ok" : "ko"}`;
    nameCell.innerHTML = `${leader.portrait ? `<img src="${leader.portrait}" alt="">` : ""}<span></span>`;
    nameCell.querySelector("span").textContent = leader.name;
    row.appendChild(nameCell);
    attrs.forEach((attr, i) => {
      const r = compareAttribute(attr, leader[attr.key], ctx.answer[attr.key], ctx.config);
      const cell = document.createElement("div");
      cell.className = `cell ${r.status}`;
      cell.style.setProperty("--i", i + 1);
      fillValue(cell, attr, leader[attr.key], ctx.config);
      if (r.arrow) {
        const arrow = document.createElement("span");
        arrow.className = "arrow";
        arrow.textContent = r.arrow === "up" ? " ↑" : " ↓";
        cell.appendChild(arrow);
      }
      row.appendChild(cell);
    });
    return row;
  },

  shareGrid(ctx) {
    const attrs = ctx.config.classicAttributes ?? [];
    return ctx.state.guesses.map((id) => {
      const l = ctx.byId.get(id);
      return attrs.map((attr) => {
        const r = compareAttribute(attr, l[attr.key], ctx.answer[attr.key], ctx.config);
        if (r.arrow) return r.arrow === "up" ? "⬆️" : "⬇️";
        return { ok: "🟩", partial: "🟧", ko: "🟥" }[r.status];
      }).join("");
    }).join("\n");
  },
};
