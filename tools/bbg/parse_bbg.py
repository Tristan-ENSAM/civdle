"""Parse the BBG leaders page (civ6bbg.github.io, fr_FR/leaders_7.5.html).

Output: list of dicts, one per leader, with the civ/leader LOC keys, the
French heading, the portrait file name, the civ and leader abilities, and the
unique items (units, districts, buildings, improvements) with their French
name and description text.
"""
import html
import json
import re
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else "fr_FR/leaders_7.5.html"


def clean(fragment):
    """Strip tags from an HTML fragment and normalise whitespace."""
    t = re.sub(r"<br\s*/?>", "\n", fragment)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t).replace("\xad", "")
    return re.sub(r"[ \t]+", " ", t).strip()


def parse(path):
    h = open(path, encoding="utf-8").read()
    starts = [m.start() for m in re.finditer(r'<div class="row" id="', h)]
    out = []
    for i, s in enumerate(starts):
        block = h[s: starts[i + 1] if i + 1 < len(starts) else len(h)]
        m = re.search(r'<!--(LOC_CIVILIZATION_\S+) (LOC_LEADER_\S+)-->\s*<h2 class="civ-name">(.*?)\s*<img[^>]*src="/images/leaders/([^"]+)"', block, re.S)
        if not m:
            continue
        rec = {"civKey": m.group(1), "leaderKey": m.group(2), "heading": clean(m.group(3)),
               "portraitFile": html.unescape(m.group(4)), "abilities": [], "items": []}
        # Sections: <!--KEY--> <h3 ...>Name [img]</h3> ... <!--DESCKEY--> <p class="civ-ability-desc actual-text">desc</p>
        for sm in re.finditer(r'<!--(LOC_\S+)-->\s*<h3 class="civ-ability-name"[^>]*>(.*?)</h3>.*?<p class="civ-ability-desc actual-text"[^>]*>(.*?)</p>', block, re.S):
            key, name, desc = sm.group(1), clean(sm.group(2)), clean(sm.group(3))
            entry = {"key": key, "name": name, "desc": desc}
            if key.startswith(("LOC_UNIT_", "LOC_DISTRICT_", "LOC_BUILDING_", "LOC_IMPROVEMENT_")):
                entry["kind"] = key.split("_")[1].lower()
                rec["items"].append(entry)
            else:
                rec["abilities"].append(entry)
        out.append(rec)
    return out


if __name__ == "__main__":
    json.dump(parse(SRC), sys.stdout, ensure_ascii=False, indent=1)
