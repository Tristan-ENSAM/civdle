"""Minimal reader for the 2D leader images in Civ VI ``LeaderFallbackImages.blp``.

Each DLC folder of the game ships ``Platforms/Windows/BLPs/LeaderFallbackImages.blp``,
a Firaxis package ("CIVBLP") holding the "fallback" 2D image of each of its
leaders (``FALLBACK_NEUTRAL_<NAME>``): the figure alone, with transparency,
used when 3D leaders are disabled. For the leaders also present in the SDK
Assets depot, this image has the same outline as ``LEADER_<NAME>_NEUTRAL``.

The format is not documented. This reader relies only on what was observed in
the files (reverse-engineered on DLC/GreatNegotiators, then checked on every
DLC by comparing the stored size with the size computed from the dimensions):

- header: magic ``CIVBLP``, then at offset 0x08 three uint32:
  header size, package-data size, start of the big-data area (``DATA_BASE``);
  at 0x14, the total file size;
- in the package data, for each texture, a record where:
  ``+0x00`` uint64 offset of the pixels in the big-data area,
  ``+0x08`` uint64 size in bytes (all mip levels),
  ``+0x38`` uint8 DXGI format (28 = R8G8B8A8_UNORM, the only one handled),
  ``+0x3a`` uint16 width, ``+0x3c`` uint16 height,
  ``+0x3e`` uint16 depth (1), ``+0x40`` uint16 array size (1),
  ``+0x42`` uint8 mip count.
  Records are found by scanning for this pattern and are kept only when the
  stored size equals the size computed from width/height/mips.
- names: the ``FALLBACK_NEUTRAL_*`` strings of the package. They are NOT tied
  to records by this reader (the link was not decoded): callers must check the
  image <-> name association visually. See ``list_names``.

Only mip level 0 is decoded.
"""
import re
import struct

from PIL import Image

DXGI_R8G8B8A8_UNORM = 28


def _mip_chain_size(w, h, mips, bpp=4):
    return sum(max(1, w >> i) * max(1, h >> i) * bpp for i in range(mips))


def read_header(data):
    if data[:6] != b"CIVBLP":
        raise ValueError("not a CIVBLP file")
    header_size, pkg_size, data_base = struct.unpack_from("<3I", data, 8)
    total = struct.unpack_from("<I", data, 0x18)[0]
    return {"header_size": header_size, "pkg_size": pkg_size, "data_base": data_base, "total": total}


def find_textures(data):
    """Return the texture records found in the package data, in file order."""
    hdr = read_header(data)
    start, end = hdr["header_size"], hdr["data_base"]
    out = []
    for q in range(start + 0x38, end - 0x10):
        if data[q] != DXGI_R8G8B8A8_UNORM or data[q + 1] != 0:
            continue
        w, h, depth, arr = struct.unpack_from("<4H", data, q + 2)
        mips = data[q + 10]
        if depth != 1 or arr != 1 or not (16 <= w <= 8192 and 16 <= h <= 8192) or not 1 <= mips <= 14:
            continue
        off, size = struct.unpack_from("<2Q", data, q - 0x38)
        if size != _mip_chain_size(w, h, mips):
            continue
        out.append({"offset": hdr["data_base"] + off, "size": size, "width": w, "height": h, "mips": mips})
    return out


def list_names(data):
    """FALLBACK_NEUTRAL_* names in the package (order of appearance, unique)."""
    names = []
    for m in re.finditer(rb"FALLBACK_NEUTRAL_[A-Z0-9_]+", data):
        n = m.group().decode()
        if n not in names:
            names.append(n)
    return names


def decode(data, rec):
    """Mip 0 of an R8G8B8A8 record as a PIL RGBA image."""
    n = rec["width"] * rec["height"] * 4
    raw = data[rec["offset"]:rec["offset"] + n]
    return Image.frombytes("RGBA", (rec["width"], rec["height"]), raw)
