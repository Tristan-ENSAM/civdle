"""Convert a leaders CSV file into data/leaders.json.

Usage:
    python tools/csv2json.py leaders.csv data/leaders.json

CSV format (UTF-8, comma-separated, first line = header). Recognised columns:

    id, name, aliases, civilization, era, continent, uniqueDistrict,
    uniqueUnitClass, gender, extension, portrait, silhouette, silhouetteFocus,
    descriptions, maskWords

Conventions:
    - Multi-valued columns (``aliases``, ``continent``, ``uniqueDistrict``,
      ``uniqueUnitClass``, ``descriptions``, ``maskWords``)
      separate values with ``|``.
    - ``silhouetteFocus`` is ``x;y`` in percent of the image (e.g. ``48;30``).
    - An empty cell becomes ``null`` (single value) or ``[]`` (list).
    - Any other column is copied as a plain string, so new attributes can be
      added to the CSV and referenced in ``config.json`` without editing this
      script.
"""

import csv
import json
import sys

LIST_FIELDS = {"aliases", "continent", "uniqueDistrict", "uniqueUnitClass", "descriptions", "maskWords"}


def parse_row(row):
    """Convert one CSV row (dict of strings) into a leader record.

    Parameters
    ----------
    row : dict[str, str]
        Row as returned by ``csv.DictReader``.

    Returns
    -------
    dict
        Leader record ready to be serialised to JSON.
    """
    out = {}
    for key, raw in row.items():
        if key is None:
            continue  # extra cells beyond the header
        value = (raw or "").strip()
        if key in LIST_FIELDS:
            out[key] = [v.strip() for v in value.split("|") if v.strip()]
        elif key == "silhouetteFocus":
            out[key] = [float(v) for v in value.split(";")] if value else None
        else:
            out[key] = value or None
    return out


def main(src, dst):
    """Read ``src`` (CSV) and write ``dst`` (JSON)."""
    with open(src, newline="", encoding="utf-8-sig") as f:
        leaders = [parse_row(r) for r in csv.DictReader(f)]
    missing = [i + 2 for i, l in enumerate(leaders) if not l.get("id") or not l.get("name")]
    if missing:
        sys.exit(f"Lignes sans id ou name : {missing}")
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(leaders, f, ensure_ascii=False, indent=2)
    print(f"{len(leaders)} leaders écrits dans {dst}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
