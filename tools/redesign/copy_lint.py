#!/usr/bin/env python3
"""v2 문구 검사 — 용어집(GLOSSARY.md)·문구 감사(COPY_AUDIT.md) 금지어 탐지.

대상(기본)
  dashboard_v2/i18n/kr.json        값 전부 (키 이름으로 줄 번호 보고)
  dashboard_v2/index.html          텍스트 노드 + 속성 값 (script/style/주석 제외)
  dashboard_v2/src/**/*.js         한국어가 든 문자열 리터럴만 (주석 제외)

금지어: 궁극기 · 궁(단독) · 평타 · 문양 · 룬 · 캐릭터 · 조합 · 파티 · 치유 · 길드전 · 육성도 · 베리어 ·
        풀(속성) · 해요체 어미 · 이모지·장식 기호 · em dash 연속 (+ 용어집 §3 속어·개발 용어)
예외:   kr.json 키에 '.abbr.'가 있으면 '평타' 허용(용어 규칙 2: 1~2자 셀 약칭).
        JS/HTML 줄에 'copy-lint-allow' 주석이 있으면 그 줄은 건너뜀.

사용: python tools/redesign/copy_lint.py [파일 ...]
종료 코드: 0 = 위반 없음, 1 = 위반 있음, 2 = 입력 오류
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
V2 = ROOT / "dashboard_v2"
HANGUL = re.compile(r"[가-힣]")
NB = r"(?<![가-힣])"            # 앞이 한글이 아님
JOSA = r"(?:을|를|이|가|은|는|의|도|과|와|로|으로|만|에)?"
NA = r"(?![가-힣])"             # 뒤가 한글이 아님

DECOR = (
    "[\U0001F000-\U0001FAFF\u2600-\u2604\u2606-\u27BF\u2B00-\u2BFF\uFE0F\u200D"
    "\u21C4\u21C5\u25A0-\u25FF\u2300-\u23FF]"
)

# (규칙 이름, 정규식, 설명)
RULES: list[tuple[str, re.Pattern, str]] = [
    ("궁극기", re.compile(r"궁극기"), "필살기"),
    ("궁", re.compile(NB + "궁" + JOSA + NA), "필살기 (칸 약칭은 필살)"),
    ("평타", re.compile(r"평타"), "보통 공격"),
    ("문양", re.compile(r"문양"), "도장"),
    ("룬", re.compile(NB + "룬" + JOSA + NA), "도장"),
    ("캐릭터", re.compile(r"캐릭터"), "동료"),
    ("조합", re.compile(r"조합"), "팀"),
    ("파티", re.compile(r"파티"), "팀"),
    ("치유", re.compile(r"치유"), "치료"),
    ("길드전", re.compile(r"길드전"), "방탈출 / 길드 방탈출"),
    ("육성도", re.compile(r"육성도"), "적합도"),
    ("베리어", re.compile(r"베리어"), "배리어"),
    ("풀", re.compile(NB + r"풀(?:\s?속성)?" + JOSA + NA + r"|풀속성|풀육성"), "나무 / 최대 육성"),
    ("해요체", re.compile(r"[가-힣](?:어|아|해|돼|세|예|에|워|와|줘|봐|춰|네|래|게|죠|대|데)요" + NA), "평서·명사형"),
    ("이모지", re.compile(DECOR), "SVG 아이콘으로"),
    ("em dash 연속", re.compile(r"—\s*—|——"), "한 번만"),
    # 용어집 §3 속어·개발 용어
    ("쿨", re.compile(NB + "쿨" + JOSA + NA + r"|\d쿨"), "쿨타임 / CD N턴"),
    ("딜", re.compile(r"(?:주는|받는|지속|총|직접|누적 ?)딜|" + NB + "딜" + JOSA + NA), "데미지"),
    ("뎀", re.compile(r"뎀"), "데미지"),
    ("힐", re.compile(NB + "힐" + JOSA + NA + r"|지속힐"), "치료"),
    ("스택", re.compile(r"스택"), "중첩"),
    ("딸피", re.compile(r"딸피"), "저HP"),
    ("앵커", re.compile(r"앵커"), "기준 동료"),
    ("결정론", re.compile(r"결정론"), "확률 효과 항상 발동"),
    ("전투불능", re.compile(r"전투불능"), "사망"),
]
ALLOW_KEY = {"평타": re.compile(r"\.abbr\.")}
ALLOW_LINE = "copy-lint-allow"
# JS 문자열 리터럴이 이 값과 '정확히' 같으면 화면 문구가 아니라 엔진·저장 프로토콜 토큰이다
# (sim_api.py _ACTION_TOKEN 평/궁/방, ROLE 치유, ELEMENT 무/풀, v1 기록 호환). v2 화면 문구는 t(키)로만 나온다.
ENGINE_TOKENS = {"평", "궁", "방", "치유", "무", "풀", "평궁방"}


def check_text(text: str, key: str | None = None):
    for name, rx, fix in RULES:
        if key and name in ALLOW_KEY and ALLOW_KEY[name].search(key):
            continue
        m = rx.search(text)
        if m:
            yield name, m.group(0), fix


def lint_json(path: Path):
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    lines = raw.splitlines()
    line_of = {}
    for i, ln in enumerate(lines, 1):
        m = re.match(r'\s*"((?:\\.|[^"\\])*)"\s*:', ln)
        if m:
            line_of.setdefault(json.loads('"%s"' % m.group(1)), i)
    for key, val in data.items():
        if not isinstance(val, str):
            continue
        for name, hit, fix in check_text(val, key):
            yield line_of.get(key, 0), f"[{name}] '{hit}' → {fix} · {key}: {val[:80]}"


def _blank_keep_lines(m: re.Match) -> str:
    return re.sub(r"[^\n]", " ", m.group(0))


def lint_html(path: Path):
    raw = path.read_text(encoding="utf-8")
    src = re.sub(r"<!--.*?-->|<script\b.*?</script>|<style\b.*?</style>", _blank_keep_lines, raw, flags=re.S | re.I)
    raw_lines = raw.splitlines()
    for i, ln in enumerate(src.splitlines(), 1):
        if ALLOW_LINE in raw_lines[i - 1]:
            continue
        parts = re.findall(r'=\s*"([^"]*)"|=\s*\'([^\']*)\'', ln)
        segs = [a or b for a, b in parts]
        segs.append(re.sub(r"<[^>]*>", " ", ln))
        for seg in segs:
            for name, hit, fix in check_text(seg):
                yield i, f"[{name}] '{hit}' → {fix} · {seg.strip()[:80]}"


def js_strings(src: str):
    """(줄 번호, 문자열 리터럴 내용) — 주석·정규식 리터럴은 건너뜀."""
    i, n, line = 0, len(src), 1
    prev = ""
    while i < n:
        c = src[i]
        if c == "\n":
            line += 1
            i += 1
            continue
        if src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j < 0 else j
            continue
        if src.startswith("/*", i):
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            line += src.count("\n", i, j)
            i = j
            continue
        if c in "'\"`":
            start_line, j, buf = line, i + 1, []
            while j < n and src[j] != c:
                if src[j] == "\\" and j + 1 < n:
                    buf.append(src[j:j + 2])
                    j += 2
                    continue
                if src[j] == "\n":
                    line += 1
                buf.append(src[j])
                j += 1
            yield start_line, "".join(buf)
            i = j + 1
            prev = c
            continue
        if c == "/" and (prev == "" or prev in "(,=:[!&|?{};+-*%<>~^"):
            j = i + 1
            in_cls = False
            while j < n and src[j] != "\n":
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] == "[":
                    in_cls = True
                elif src[j] == "]":
                    in_cls = False
                elif src[j] == "/" and not in_cls:
                    break
                j += 1
            i = j + 1
            prev = "/"
            continue
        if not c.isspace():
            prev = c
        i += 1


def lint_js(path: Path):
    raw = path.read_text(encoding="utf-8")
    raw_lines = raw.splitlines()
    for ln, s in js_strings(raw):
        if not HANGUL.search(s) and not re.search(DECOR, s):
            continue
        if s in ENGINE_TOKENS:
            continue
        if 0 < ln <= len(raw_lines) and ALLOW_LINE in raw_lines[ln - 1]:
            continue
        for name, hit, fix in check_text(s):
            yield ln, f"[{name}] '{hit}' → {fix} · {s.strip()[:80]}"


def default_targets() -> list[Path]:
    out = [V2 / "i18n" / "kr.json", V2 / "index.html"]
    src = V2 / "src"
    if src.is_dir():
        out += sorted(src.rglob("*.js"))
    return [p for p in out if p.exists()]


def lint_file(path: Path):
    suf = path.suffix.lower()
    if suf == ".json":
        return lint_json(path)
    if suf in (".html", ".htm"):
        return lint_html(path)
    if suf in (".js", ".mjs"):
        return lint_js(path)
    raise ValueError(f"지원하지 않는 파일 형식: {path}")


def main(argv: list[str]) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    targets = [Path(a).resolve() for a in argv] if argv else default_targets()
    if not targets:
        print("검사할 파일 없음", file=sys.stderr)
        return 2
    total = 0
    for p in targets:
        if not p.exists():
            print(f"{p}: 파일 없음", file=sys.stderr)
            return 2
        try:
            rel = p.relative_to(ROOT)
        except ValueError:
            rel = p
        try:
            hits = list(lint_file(p))
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as e:
            print(f"{rel}: 읽기 실패 — {e}", file=sys.stderr)
            return 2
        for ln, msg in hits:
            print(f"{rel}:{ln}: {msg}")
        total += len(hits)
    print(f"copy_lint: {total}건 ({len(targets)}개 파일)")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
