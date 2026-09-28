"""라운지 동료 목록(dashboard_v2/lounge_chars.json) 생성 — 신캐 추가 때 한 번 돌린다.

    python tools/redesign/gen_lounge_chars.py --new 10443      # 신규 표시(NEW!!)할 동료 ID(여러 개면 쉼표)

- 이름·속성·포지션은 엔진(sim_api.char_meta)과 같은 값을 쓴다(라운지와 시뮬 표기가 어긋나지 않게).
- 라운지 서버(lounge_api)는 data/chars.json 의 ID 를 유효 동료로 쓰므로, 여기서도 같은 ID 집합인지 검사한다.
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, ROOT)
import sim_api  # noqa: E402

OUT = os.path.join(ROOT, "dashboard_v2", "lounge_chars.json")
ICONS = os.path.join(ROOT, "dashboard", "icons")


def main() -> int:
    new_ids: set[int] = set()
    if "--new" in sys.argv:
        new_ids = {int(x) for x in sys.argv[sys.argv.index("--new") + 1].split(",") if x.strip()}
    ids = sorted(int(k) for k in sim_api._chars)
    unknown = new_ids - set(ids)
    if unknown:
        print(f"✗ --new 에 없는 동료: {sorted(unknown)}", file=sys.stderr)
        return 1
    out = []
    for cid in ids:
        meta = sim_api.char_meta(cid)
        raw = sim_api._chars[str(cid)]
        if not os.path.isfile(os.path.join(ICONS, f"{cid}.png")):
            print(f"✗ 아이콘 없음: dashboard/icons/{cid}.png", file=sys.stderr)
            return 1
        row = {"id": cid, "name": meta["name"], "el": meta["elementKey"], "role": meta["role"], "rarity": raw["rarity"]}
        # 언어별 이름(라운지 i18n.nameOf 가 name_<kr|en|ja|cn> 을 씀 — 메인 core/i18n.js 와 같은 필드명)
        for k in ("name_kr", "name_en", "name_ja", "name_cn"):
            if raw.get(k):
                row[k] = raw[k].strip()
        if cid in new_ids:
            row["new"] = True
        out.append(row)
    with open(os.path.join(ROOT, "data", "chars.json"), encoding="utf-8") as f:
        server_ids = sorted(int(k) for k in json.load(f))
    if server_ids != ids:
        print("✗ data/chars.json 과 동료 ID 가 다릅니다", file=sys.stderr)
        return 1
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"ok {len(out)}명 (신규 {sorted(new_ids) or '없음'}) -> {os.path.relpath(OUT, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
