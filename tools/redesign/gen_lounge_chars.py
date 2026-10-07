"""라운지 동료 목록(dashboard_v2/lounge_chars.json) 생성 — 신캐 추가 때 한 번 돌린다.

    python tools/redesign/gen_lounge_chars.py --new 10443 --build 0922   # 신규 표시(NEW!!)할 동료 ID(여러 개면 쉼표) + 그 동료가 들어온 게임 빌드(MMDD)

- 이름·속성·포지션은 엔진(sim_api.char_meta)과 같은 값을 쓴다(라운지와 시뮬 표기가 어긋나지 않게).
- 라운지 서버(lounge_api)는 data/chars.json 의 ID 를 유효 동료로 쓰므로, 여기서도 같은 ID 집합인지 검사한다.
- --new 에는 --build 가 꼭 있어야 한다: dashboard_v2/src/lounge/builds.js 에 빌드를 (처음이면 맨 뒤 = 현재 라이브 빌드로) 넣고
  신규 동료의 빌드를 적는다. 라운지 글 도장(CURRENT_BUILD)·평균 티어 '이번 버전'·티어표 끌올이 이 기록을 쓴다(shared.js).
"""
from __future__ import annotations

import json
import os
import re
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, ROOT)
import sim_api  # noqa: E402

OUT = os.path.join(ROOT, "dashboard_v2", "lounge_chars.json")
ICONS = os.path.join(ROOT, "dashboard", "icons")
BUILDS_JS = os.path.join(ROOT, "dashboard_v2", "src", "lounge", "builds.js")
RE_BUILD_DATA = re.compile(r"^export const BUILD_DATA = (\{.*\});[ \t]*$", re.M)
RE_MMDD = re.compile(r"^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$")


def update_builds(new_ids: set[int], build: str) -> list[str]:
    """builds.js 의 BUILD_DATA 한 줄을 고쳐 쓴다. 새 빌드는 맨 뒤(= 현재 라이브 빌드). → 갱신된 빌드 목록."""
    with open(BUILDS_JS, encoding="utf-8") as f:
        src = f.read()
    m = RE_BUILD_DATA.search(src)
    if not m:
        raise ValueError(f"{os.path.relpath(BUILDS_JS, ROOT)} 에서 BUILD_DATA 한 줄을 찾지 못했습니다")
    data = json.loads(m.group(1))
    builds, since = data.get("builds"), data.get("since")
    if not isinstance(builds, list) or not builds or not isinstance(since, dict):
        raise ValueError("BUILD_DATA 형식이 이상합니다(builds 목록·since 객체 필요)")
    if build not in builds:
        builds.append(build)
    for cid in sorted(new_ids):
        since[str(cid)] = build
    line = "export const BUILD_DATA = " + json.dumps({"builds": builds, "since": since}, ensure_ascii=False, separators=(",", ":")) + ";"
    with open(BUILDS_JS, "w", encoding="utf-8", newline="\n") as f:
        f.write(src[:m.start()] + line + src[m.end():])
    return builds


def main() -> int:
    new_ids: set[int] = set()
    if "--new" in sys.argv:
        new_ids = {int(x) for x in sys.argv[sys.argv.index("--new") + 1].split(",") if x.strip()}
    build = sys.argv[sys.argv.index("--build") + 1] if "--build" in sys.argv and sys.argv.index("--build") + 1 < len(sys.argv) else None
    if new_ids and not build:
        print("✗ --new 에는 --build MMDD(그 동료가 들어온 게임 빌드, 예: 1006)가 필요합니다", file=sys.stderr)
        return 1
    if build is not None and not RE_MMDD.match(build):
        print(f"✗ --build 는 MMDD 네 자리여야 합니다: {build!r}", file=sys.stderr)
        return 1
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
    # 빌드 기록을 먼저 고친다 — 실패하면 동료 목록도 쓰지 않는다(둘 다 같은 명령으로 다시 돌리면 같은 결과).
    if new_ids:
        try:
            builds = update_builds(new_ids, build)
        except (OSError, ValueError) as e:
            print(f"✗ 빌드 기록 갱신 실패: {e}", file=sys.stderr)
            return 1
        print(f"ok 빌드 {build} ← {sorted(new_ids)} (라이브 빌드 {builds[-1]}) -> {os.path.relpath(BUILDS_JS, ROOT)}")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"ok {len(out)}명 (신규 {sorted(new_ids) or '없음'}) -> {os.path.relpath(OUT, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
