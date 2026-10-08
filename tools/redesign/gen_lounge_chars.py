"""라운지 동료 목록(dashboard_v2/lounge_chars.json) 생성 — 신캐 추가 때 한 번 돌린다.

    python tools/redesign/gen_lounge_chars.py --new 10444 --version 2.1   # 신규 표시(NEW!!)할 동료 ID(여러 개면 쉼표) + 그 동료를 넣는 시뮬레이터 버전(패치노트 버전)

- 이름·속성·포지션은 엔진(sim_api.char_meta)과 같은 값을 쓴다(라운지와 시뮬 표기가 어긋나지 않게).
- 라운지 서버(lounge_api)는 data/chars.json 의 ID 를 유효 동료로 쓰므로, 여기서도 같은 ID 집합인지 검사한다.
- --new 에는 --version 이 꼭 있어야 한다. 라운지 버전 = 시뮬레이터 버전의 앞 두 자리(X.N):
  신캐가 들어와 N 이 바뀐 버전(예: 2.1)이면 dashboard_v2/src/lounge/builds.js 맨 뒤(= 현재 라운지 버전)에 새로 넣고,
  패치 버전(예: 2.0.3 의 XL 동료)이면 지금 라운지 버전 그대로 둔다 — 티어표 '이번 버전'은 N 이 바뀔 때만 갱신된다(2026-10-08 사용자 결정).
  신규 동료가 처음 들어온 라운지 버전도 적는다. 라운지 글 도장(CURRENT_BUILD)·평균 티어 '이번 버전'·티어표 끌올이 이 기록을 쓴다(shared.js).
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
RE_VERSION = re.compile(r"^v?(\d+)\.(\d+)(?:\.\d+)?$")
RE_LOUNGE_VERSION = re.compile(r"^\d+\.\d+$")


def lounge_version(sim_version: str) -> str | None:
    """시뮬레이터 버전('2.1' · '2.0.3' · 'v2.1.1') → 라운지 버전(앞 두 자리 '2.1'). 모양이 틀리면 None."""
    m = RE_VERSION.match(sim_version.strip())
    return f"{int(m.group(1))}.{int(m.group(2))}" if m else None


def version_key(version: str) -> tuple[int, int]:
    major, minor = version.split(".")
    return int(major), int(minor)


def update_builds(new_ids: set[int], version: str) -> tuple[list[str], bool]:
    """builds.js 의 BUILD_DATA 한 줄을 고쳐 쓴다. 새 라운지 버전은 맨 뒤(= 현재 라운지 버전). → (버전 목록, 새 버전을 넣었는지)."""
    with open(BUILDS_JS, encoding="utf-8") as f:
        src = f.read()
    m = RE_BUILD_DATA.search(src)
    if not m:
        raise ValueError(f"{os.path.relpath(BUILDS_JS, ROOT)} 에서 BUILD_DATA 한 줄을 찾지 못했습니다")
    data = json.loads(m.group(1))
    builds, since = data.get("builds"), data.get("since")
    if not isinstance(builds, list) or not builds or not isinstance(since, dict):
        raise ValueError("BUILD_DATA 형식이 이상합니다(builds 목록·since 객체 필요)")
    if not all(isinstance(b, str) and RE_LOUNGE_VERSION.match(b) for b in builds):
        raise ValueError(f"builds 는 라운지 버전(X.N) 목록이어야 합니다: {builds}")
    added = version not in builds
    if added:
        if version_key(version) < version_key(builds[-1]):
            raise ValueError(f"라운지 버전 {version} 이 현재 라운지 버전 {builds[-1]} 보다 오래됐습니다")
        builds.append(version)
    elif version != builds[-1]:
        raise ValueError(f"지난 라운지 버전 {version} 에는 동료를 넣을 수 없습니다(현재 {builds[-1]})")
    for cid in sorted(new_ids):
        if version == builds[0]:
            since.pop(str(cid), None)       # 라운지 첫 버전부터 있던 동료와 같다
        else:
            since[str(cid)] = version
    line = "export const BUILD_DATA = " + json.dumps({"builds": builds, "since": since}, ensure_ascii=False, separators=(",", ":")) + ";"
    with open(BUILDS_JS, "w", encoding="utf-8", newline="\n") as f:
        f.write(src[:m.start()] + line + src[m.end():])
    return builds, added


def main() -> int:
    new_ids: set[int] = set()
    if "--new" in sys.argv:
        new_ids = {int(x) for x in sys.argv[sys.argv.index("--new") + 1].split(",") if x.strip()}
    if "--build" in sys.argv:
        print("✗ --build(게임 빌드 MMDD)는 더 이상 쓰지 않습니다 → --version <시뮬레이터 버전>(예: 2.1 · 2.0.3)", file=sys.stderr)
        return 1
    raw_version = sys.argv[sys.argv.index("--version") + 1] if "--version" in sys.argv and sys.argv.index("--version") + 1 < len(sys.argv) else None
    if new_ids and not raw_version:
        print("✗ --new 에는 --version <시뮬레이터 버전>(그 동료를 넣는 패치노트 버전, 예: 2.1)이 필요합니다", file=sys.stderr)
        return 1
    version = lounge_version(raw_version) if raw_version is not None else None
    if raw_version is not None and not version:
        print(f"✗ --version 은 시뮬레이터 버전(X.N 또는 X.N.Z)이어야 합니다: {raw_version!r}", file=sys.stderr)
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
    # 버전 기록을 먼저 고친다 — 실패하면 동료 목록도 쓰지 않는다(둘 다 같은 명령으로 다시 돌리면 같은 결과).
    if new_ids:
        try:
            builds, added = update_builds(new_ids, version)
        except (OSError, ValueError) as e:
            print(f"✗ 라운지 버전 기록 갱신 실패: {e}", file=sys.stderr)
            return 1
        what = "새 라운지 버전" if added else "라운지 버전 그대로"
        print(f"ok v{raw_version.lstrip('v')} → {what} v{builds[-1]} ← {sorted(new_ids)} -> {os.path.relpath(BUILDS_JS, ROOT)}")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"ok {len(out)}명 (신규 {sorted(new_ids) or '없음'}) -> {os.path.relpath(OUT, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
