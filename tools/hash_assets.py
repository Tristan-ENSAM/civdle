"""Give the clue images opaque file names, or restore their readable names.

Why: the clue of the image modes (Portrait, Silhouette, Regard, Cités-État,
Aménagement, Technologies & Dogmes) is an <img> whose ``src`` used to be
named after the answer (``img/silhouettes/america-abraham-lincoln.png``), so
a glance at the browser's inspector gave the answer away. This script renames
those images after a hash of their content (``img/silhouettes/3f9c….png``)
and rewrites the paths in ``data/*.json``. The sounds of the Son mode
(``audio/units/``) are renamed the same way.

Limit: this only hides the answer from a glance. The site is static, so the
daily draw (``js/core/daily.js``) and the data are public, and someone who
reads them can still find the answer.

Usage:
    python tools/hash_assets.py            # readable names -> hashed names
    python tools/hash_assets.py --restore  # hashed names -> readable names

The generators in ``tools/`` write and look for readable names
(``img/silhouettes/<id>.png``…). Before regenerating data, run
``--restore``; afterwards, run the script without option again. Both
directions are idempotent: files already in the requested form are left
alone.

Readable names are derived from each record's id and field, so no mapping
file is needed:

    leaders.json       portrait     img/portraits/<id>.<ext>
                       silhouette   img/silhouettes/<id>.<ext>
                       reveal       img/reveal/<id>.<ext>
                       eyeImages    img/eyes/<id>-<side>.<ext>
    city_states.json   icon         img/city-states/<id>.<ext>
                       iconGrey     img/city-states/<id>-grey.<ext>
    improvements.json  icon         img/improvements/<id>.<ext>
    techs_civics.json  icon         img/techs-civics/<id>.<ext>
    units.json         icon         img/units/<id>.<ext>
                       sounds       audio/units/<id>-<kind>.<ext>
"""

import hashlib
import json
import re
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# File -> list of (field, directory, suffix of the readable name).
# ``eyeImages`` and ``sounds`` are dicts {side: path}; their suffix is "-<side>".
TARGETS = {
    "data/leaders.json": [
        ("portrait", "img/portraits", ""),
        ("silhouette", "img/silhouettes", ""),
        ("reveal", "img/reveal", ""),
        ("eyeImages", "img/eyes", None),
    ],
    "data/city_states.json": [
        ("icon", "img/city-states", ""),
        ("iconGrey", "img/city-states", "-grey"),
    ],
    "data/improvements.json": [("icon", "img/improvements", "")],
    "data/techs_civics.json": [("icon", "img/techs-civics", "")],
    "data/units.json": [
        ("icon", "img/units", ""),
        ("sounds", "audio/units", None),
    ],
}

HASH_LEN = 16
HASHED_NAME = re.compile(rf"^[0-9a-f]{{{HASH_LEN}}}$")


def hashed_path(path):
    """``img/x/<anything>.ext`` -> ``img/x/<sha256 of the content>.ext``."""
    p = Path(path)
    digest = hashlib.sha256((ROOT / p).read_bytes()).hexdigest()[:HASH_LEN]
    return (p.parent / f"{digest}{p.suffix}").as_posix()


def readable_path(path, directory, rid, suffix):
    """Readable name of an image, keeping its extension."""
    return f"{directory}/{rid}{suffix}{Path(path).suffix}"


def is_tracked(path):
    return subprocess.run(["git", "ls-files", "--error-unmatch", path], cwd=ROOT,
                          capture_output=True).returncode == 0


def move(src, dst, keep_src=False):
    """Rename a file, through git when it is tracked so history follows it.

    Several records may use files with the same content (sounds shared by
    units of a class): hashing gives them one file, so an existing ``dst``
    with the same bytes is reused and ``src`` dropped. ``keep_src`` copies
    instead of moving (restoring a file that other records still use)."""
    if src == dst:
        return
    if (ROOT / dst).exists():
        if (ROOT / dst).read_bytes() != (ROOT / src).read_bytes():
            raise SystemExit(f"refusing to overwrite {dst} (while renaming {src})")
        if not keep_src:
            if is_tracked(src):
                subprocess.run(["git", "rm", "-q", src], cwd=ROOT, check=True)
            else:
                (ROOT / src).unlink()
        return
    if keep_src:
        shutil.copyfile(ROOT / src, ROOT / dst)
    elif is_tracked(src):
        subprocess.run(["git", "mv", src, dst], cwd=ROOT, check=True)
    else:
        (ROOT / src).rename(ROOT / dst)


def convert(path, directory, rid, suffix, restore, uses):
    """Return the new path of one image and rename the file.

    ``uses`` counts the records not converted yet that point to each path: a
    hashed file shared by several records is copied until its last use."""
    if not path.startswith(directory + "/"):
        raise SystemExit(f"{rid}: {path} is not under {directory}/")
    if restore:
        new = readable_path(path, directory, rid, suffix)
    elif HASHED_NAME.match(Path(path).stem):
        return path
    else:
        expected = readable_path(path, directory, rid, suffix)
        if path != expected:
            # --restore rebuilds the name from the id: refuse a name it could not rebuild.
            raise SystemExit(f"{rid}: {path} does not follow the expected name {expected}")
        new = hashed_path(path)
    uses[path] -= 1
    move(path, new, keep_src=restore and uses[path] > 0)
    return new


def main(argv):
    restore = "--restore" in argv[1:]
    renamed = 0
    for rel, fields in TARGETS.items():
        f = ROOT / rel
        records = json.loads(f.read_text(encoding="utf-8"))
        uses = Counter()
        for rec in records:
            for field, _, _ in fields:
                value = rec.get(field)
                if value:
                    uses.update(value.values() if isinstance(value, dict) else [value])
        for rec in records:
            rid = rec["id"]
            for field, directory, suffix in fields:
                value = rec.get(field)
                if not value:
                    continue
                if isinstance(value, dict):
                    for side, path in value.items():
                        new = convert(path, directory, rid, f"-{side}", restore, uses)
                        renamed += new != path
                        value[side] = new
                else:
                    new = convert(value, directory, rid, suffix, restore, uses)
                    renamed += new != value
                    rec[field] = new
        f.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{renamed} image(s) renamed ({'readable' if restore else 'hashed'} names)")


if __name__ == "__main__":
    main(sys.argv)
