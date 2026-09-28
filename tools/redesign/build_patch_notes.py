"""패치 노트 빌드 — tools/redesign/patch_notes_src/{kr,en,ja,zh}.json(정리본) → dashboard_v2/patch-notes.json.

릴리스 메타(version·date·highlight·char·charName·charImg·skill)와 항목의 cat·chars 는
v1 원본 dashboard/patch-notes.json 에서 그대로 가져오고, 문구(title·text·details)만 정리본으로 바꾼다.
v1 에 없는 새 릴리스(v2.0~)는 patch_notes_src/meta.json 에 메타·항목 cat·chars 를 두고 맨 위(최신)에 붙인다.
zhs(간체)는 zh(번체)를 OpenCC t2s 로 변환한다. 없는 언어는 빠지며 화면에서 kr 로 폴백한다.

    python tools/redesign/build_patch_notes.py          # 빌드
    python tools/redesign/build_patch_notes.py --check  # 쓰지 않고 검사만
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
V1_NOTES = ROOT / "dashboard" / "patch-notes.json"
OUT = ROOT / "dashboard_v2" / "patch-notes.json"
SRC = Path(__file__).resolve().parent / "patch_notes_src"
LANGS = ("kr", "en", "ja", "zh")          # zhs 는 zh 에서 파생
META_KEYS = ("version", "date", "highlight", "char", "charName", "charImg", "skill")

COMMENT = (
    "패치 히스토리. 최신이 위. 원문은 tools/redesign/patch_notes_src/*.json, "
    "build_patch_notes.py 로 생성 — 이 파일을 직접 고치지 말 것. "
    "버전 규칙: 동료 추가 = 메이저 x.y(펼침·히어로), 그 사이 = 패치 x.y.z(접힘, 최신이면 펼침). "
    "cat: new|balance|fix|qol. text/details[] 는 {kr,en,ja,zh,zhs}. items[].chars = 인라인 얼굴."
)


def load(path: Path) -> dict:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def make_t2s():
    try:
        import opencc
    except ImportError:
        print("경고: opencc 가 없어 zhs 를 만들지 않습니다(pip install opencc-python-reimplemented)", file=sys.stderr)
        return None
    return opencc.OpenCC("t2s").convert


def check_source(lang: str, src: dict, v1: dict) -> list[str]:
    """정리본이 원본과 릴리스·항목 개수가 맞는지 검사. 오류 메시지 목록을 돌려준다."""
    errs = []
    for rel in v1["releases"]:
        ver = rel["version"]
        s = src.get(ver)
        if s is None:
            errs.append(f"[{lang}] {ver}: 릴리스 없음")
            continue
        if not str(s.get("title", "")).strip():
            errs.append(f"[{lang}] {ver}: title 비어 있음")
        items = s.get("items", [])
        if len(items) != len(rel["items"]):
            errs.append(f"[{lang}] {ver}: 항목 {len(items)}개 ≠ 원본 {len(rel['items'])}개")
            continue
        for i, it in enumerate(items):
            if not str(it.get("text", "")).strip():
                errs.append(f"[{lang}] {ver} #{i}: text 비어 있음")
            if not isinstance(it.get("details", []), list):
                errs.append(f"[{lang}] {ver} #{i}: details 는 배열이어야 함")
    extra = set(k for k in src if not k.startswith("_")) - {r["version"] for r in v1["releases"]}
    errs += [f"[{lang}] 원본에 없는 버전 {v}" for v in sorted(extra)]
    return errs


def check_parallel(lang: str, src: dict, kr: dict) -> list[str]:
    """번역본의 details 개수가 한국어 정리본과 같은지 검사(한 줄씩 대응해야 언어 전환 시 목록이 맞는다)."""
    errs = []
    for ver, rel in kr.items():
        if ver.startswith("_") or ver not in src:
            continue
        for i, (a, b) in enumerate(zip(rel["items"], src[ver].get("items", []))):
            if len(a.get("details", [])) != len(b.get("details", [])):
                errs.append(f"[{lang}] {ver} #{i}: details {len(b.get('details', []))}줄 ≠ kr {len(a.get('details', []))}줄")
    return errs


def merged_releases() -> list[dict]:
    """v1 원본 릴리스 앞에 meta.json 의 새 릴리스(최신순)를 붙인 목록. 형식은 v1 릴리스와 같다."""
    v1 = load(V1_NOTES)
    meta_path = SRC / "meta.json"
    extra = []
    if meta_path.exists():
        for ver, m in load(meta_path).items():
            if ver.startswith("_"):
                continue
            extra.append({"version": ver, **{k: v for k, v in m.items() if k != "items"}, "items": m["items"]})
    known = {r["version"] for r in v1["releases"]}
    dup = [r["version"] for r in extra if r["version"] in known]
    if dup:
        raise SystemExit(f"meta.json 버전이 v1 원본과 겹침: {dup}")
    return extra + v1["releases"]


def build(check_only: bool) -> int:
    v1 = {"releases": merged_releases()}
    sources = {lang: load(SRC / f"{lang}.json") for lang in LANGS if (SRC / f"{lang}.json").exists()}
    if "kr" not in sources:
        print("kr.json 이 없습니다", file=sys.stderr)
        return 1
    errs = []
    for lang, src in sources.items():
        errs += check_source(lang, src, v1)
        if lang != "kr":
            errs += check_parallel(lang, src, sources["kr"])
    if errs:
        print("\n".join(errs), file=sys.stderr)
        return 1

    t2s = make_t2s() if "zh" in sources else None

    def ml(get) -> dict:
        """언어별 문자열 dict. get(src) 가 None 이면 그 언어는 뺀다."""
        out = {}
        for lang, src in sources.items():
            val = get(src)
            if val:
                out[lang] = val
        if t2s and "zh" in out:
            out["zhs"] = t2s(out["zh"])
        return out

    releases = []
    for rel in v1["releases"]:
        ver = rel["version"]
        new = {k: rel[k] for k in META_KEYS if k in rel}
        new["title"] = ml(lambda s: s[ver]["title"])
        items = []
        for i, it in enumerate(rel["items"]):
            n_details = len(sources["kr"][ver]["items"][i].get("details", []))
            item = {"cat": it["cat"]}
            if it.get("chars"):
                item["chars"] = it["chars"]
            item["text"] = ml(lambda s: s[ver]["items"][i]["text"])
            if n_details:
                item["details"] = [ml(lambda s, j=j: s[ver]["items"][i]["details"][j]) for j in range(n_details)]
            items.append(item)
        new["items"] = items
        releases.append(new)

    doc = {"_comment": COMMENT, "releases": releases}
    n_items = sum(len(r["items"]) for r in releases)
    langs = sorted(set(sources) | ({"zhs"} if t2s else set()))
    if check_only:
        print(f"ok (검사만) — 릴리스 {len(releases)} · 항목 {n_items} · 언어 {langs}")
        return 0
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"ok — {OUT.relative_to(ROOT)} · 릴리스 {len(releases)} · 항목 {n_items} · 언어 {langs}")
    return 0


if __name__ == "__main__":
    sys.exit(build("--check" in sys.argv))
