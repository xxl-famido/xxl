# -*- coding: utf-8 -*-
"""Generate the RES.zhs (Simplified Chinese) block for dashboard/i18n.js.

Reuses RES.en keys + the Traditional CN map from gen_zh, OpenCC-converts the
Traditional values to Simplified (t2s), then applies a few SC-specific fixes
where OpenCC differs from the official cn data. Skill descriptions / names come
from the official 'cn' fields (desc_sc / name_sc) at runtime via loadNames.

Run:  python tools/gen_zhs.py   -> writes tools/zhsblock.txt
"""
import json
import re
from pathlib import Path

from opencc import OpenCC
import gen_zh  # CN, SUBO, PAT_JS, REGEX_JS, _block, _keys

CC = OpenCC("t2s")
SRC = Path(__file__).resolve().parents[1] / "dashboard" / "i18n.js"


def s2(text: str) -> str:
    """Traditional -> Simplified, plus fixes OpenCC t2s misses for this game."""
    out = CC.convert(text)
    out = out.replace("痺", "痹")   # 麻痺 -> 麻痹 (OpenCC t2s 누락)
    return out


def emit(keys, override):
    lines = []
    for k in keys:
        v = override.get(k, gen_zh.CN.get(k))
        if v is None:
            v = k
        lines.append(f"        {json.dumps(k, ensure_ascii=False)}: {json.dumps(s2(v), ensure_ascii=False)},")
    return "\n".join(lines)


def main() -> None:
    src = SRC.read_text(encoding="utf-8")
    ex_keys = gen_zh._keys(gen_zh._block(src, "EXACT"))
    sub_keys = gen_zh._keys(gen_zh._block(src, "SUB"))
    subo = {k: s2(v) for k, v in gen_zh.SUBO.items()}  # 고정 -> 固定
    zhs = (
        "    zhs: {\n"
        "      nameField: 'name_sc',\n"
        "      num: false,\n"
        "      names: [],\n"
        "      _sub: null,\n"
        f"      REGEX: {s2(gen_zh.REGEX_JS)},\n"
        f"      PAT: {s2(gen_zh.PAT_JS)},\n"
        "      EXACT: {\n" + emit(ex_keys, {}) + "\n      },\n"
        "      SUB: {\n" + emit(sub_keys, subo) + "\n      },\n"
        "    },\n"
    )
    out = Path(__file__).resolve().parent / "zhsblock.txt"
    out.write_text(zhs, encoding="utf-8")
    print(f"wrote {out}  (EXACT {len(ex_keys)}, SUB {len(sub_keys)})")


if __name__ == "__main__":
    main()
