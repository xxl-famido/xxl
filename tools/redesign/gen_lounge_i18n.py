"""라운지 사전 생성 + 검사.  python tools/redesign/gen_lounge_i18n.py

1) tools/redesign/lounge_i18n_src.py 의 S(키 → 한/영/일/중) + 메인 사전의 element.* · role.* → dashboard_v2/i18n/lounge/{kr,en,ja,zh}.json
2) 검사(실패하면 종료 코드 1):
   - 코드(src/lounge/*.js · lounge.html · lounge_api/src/*.js)가 쓰는 키가 사전에 모두 있는지
   - 자리표시자 {x} 가 네 언어에서 같은지
   - 번역이 비었거나 한국어가 그대로 남은 en/ja/zh 항목이 없는지
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DASH = os.path.join(ROOT, "dashboard_v2")
OUT = os.path.join(DASH, "i18n", "lounge")
LANGS = ("kr", "en", "ja", "zh")
SHARED_PREFIXES = ("element.", "role.")          # 메인 사전에서 복사(표기 일치)
DYNAMIC_KEYS = {                                  # 코드가 `…${x}` 로 만드는 키
    "basis.": ("all", "boss", "escape", "free"),
    "tag.": ("growth", "boss", "escape", "comp", "skill"),
    "field.name.": ("body", "title", "descr", "rowLabel", "reason"),
    "element.": ("fire", "water", "wood", "light", "dark", "none"),
    "role.": ("warrior", "guard", "healer", "support", "disrupt"),
    "me.kind.": ("post", "tier", "team"),
}


def load_src() -> dict:
    spec = importlib.util.spec_from_file_location("src", os.path.join(ROOT, "tools", "redesign", "lounge_i18n_src.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.S


def used_keys() -> set[str]:
    keys: set[str] = set()
    lounge = os.path.join(DASH, "src", "lounge")
    for fn in os.listdir(lounge):
        if fn.endswith(".js") and fn not in ("seed.js",):
            src = open(os.path.join(lounge, fn), encoding="utf-8").read()
            src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
            keys |= set(re.findall(r"\bt\('([a-zA-Z0-9_.]+)'", src))
            keys |= set(re.findall(r"'(me\.kind\.[a-z]+)'", src))
            keys |= {f"err.{c}" for c in re.findall(r"\bfail\('([a-zA-Z]+)'", src)}   # api-mock.js 오류 코드
    html = open(os.path.join(DASH, "lounge.html"), encoding="utf-8").read()
    keys |= set(re.findall(r'data-i18n(?:-aria)?="([a-zA-Z0-9_.]+)"', html))
    api = os.path.join(ROOT, "lounge_api", "src")
    for fn in os.listdir(api):
        if fn.endswith(".js"):
            src = open(os.path.join(api, fn), encoding="utf-8").read()
            keys |= {f"err.{c}" for c in re.findall(r"\bE\(\d+, '([a-zA-Z]+)'", src)}
            keys |= {f"err.{c}" for c in re.findall(r"'(rate[A-Z][a-zA-Z]+)'", src)}
            keys |= {f"err.{c}" for c in re.findall(r"KR\['err\.([a-zA-Z]+)'\]", src)}
    shared = open(os.path.join(DASH, "src", "lounge", "shared.js"), encoding="utf-8").read()
    keys |= {f"err.{c}" for c in re.findall(r"return '(spam[A-Za-z]+)'", shared)}
    for pre, names in DYNAMIC_KEYS.items():
        keys |= {pre + n for n in names}
    return keys


def main() -> int:
    src = load_src()
    main_d = {lg: json.load(open(os.path.join(DASH, "i18n", f"{lg}.json"), encoding="utf-8")) for lg in LANGS}
    dicts = {lg: {} for lg in LANGS}
    for k, vals in src.items():
        if len(vals) != 4:
            print(f"✗ {k}: 네 언어가 아님", file=sys.stderr)
            return 1
        for lg, v in zip(LANGS, vals):
            dicts[lg][k] = v
    for lg in LANGS:
        for k, v in main_d[lg].items():
            if k.startswith(SHARED_PREFIXES) and isinstance(v, str):
                dicts[lg][k] = v
    errors = []
    for k in sorted(used_keys()):
        for lg in LANGS:
            if not dicts[lg].get(k):
                errors.append(f"누락 {lg}: {k}")
    ph = re.compile(r"\{(\w+)\}")
    for k in dicts["kr"]:
        base = sorted(set(ph.findall(dicts["kr"][k])))
        for lg in LANGS[1:]:
            if sorted(set(ph.findall(dicts[lg].get(k, "")))) != base:
                errors.append(f"자리표시자 불일치 {lg}: {k}")
        for lg in LANGS[1:]:
            if re.search("[가-힣]", dicts[lg].get(k, "")):
                errors.append(f"{lg}에 한국어 남음: {k}")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    os.makedirs(OUT, exist_ok=True)
    for lg in LANGS:
        with open(os.path.join(OUT, f"{lg}.json"), "w", encoding="utf-8") as f:
            json.dump(dict(sorted(dicts[lg].items())), f, ensure_ascii=False, indent=1)
    print(f"ok {len(dicts['kr'])}키 × {len(LANGS)}언어 → {os.path.relpath(OUT, ROOT)} (코드 사용 키 {len(used_keys())}개 모두 있음)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
