#!/usr/bin/env python3
"""v1 다국어 사전 → v2 ID 키 사전 이전 도구.

입력(읽기 전용)
  dashboard_v2/legacy/i18n.v1.js   EXACT · PAT · SUB · REGEX (en / zh / ja; zhs는 v2 범위 밖)
  dashboard_v2/legacy/app.v1.js    ADV_T · TDMG_T · ALTAR_T 모듈 내 5언어 사전 + 문자열 위치(영역 판정)
  dashboard_v2/legacy/feedback.v1.js  피드백 카드 5언어 사전
  dashboard/index.html             정적 문구 + 가이드 본문(L190~398)
  tools/redesign/i18n_mockup_keys.py  목업 확정 문구(키 고정, 사람이 관리)

출력
  dashboard_v2/i18n/{kr,en,ja,zh}.json   ID 키 → 문자열 (kr이 원본)
  dashboard_v2/i18n/engine_src.json      엔진·로그 부분치환용 원문(구 SUB/REGEX) → 키
  docs/redesign/I18N_MAP.md              구 한국어 원문 → 새 ID, 변경 사유, 미번역 수

규칙
  1) 용어집(GLOSSARY.md) 교체 → 2) 번역체·해요체 정리(COPY_AUDIT (B)) → 3) 이모지·장식 제거,
  라벨 괄호 설명 분리(COPY_AUDIT (C)) → 4) ID 키 부여(영역.요소.의미) → 5) 번역 재사용 + 용어 보정,
  번역이 없거나 의미가 바뀐 문구는 '[미번역] ' + kr.

사용: python tools/redesign/i18n_migrate.py [--check]
  --check  파일을 쓰지 않고 통계만 출력
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEGACY = ROOT / "dashboard_v2" / "legacy"
OUT_DIR = ROOT / "dashboard_v2" / "i18n"
MAP_MD = ROOT / "docs" / "redesign" / "I18N_MAP.md"
V1_INDEX = ROOT / "dashboard" / "index.html"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from i18n_mockup_keys import MOCKUP_KEYS  # noqa: E402

LANGS = ("en", "zh", "ja")          # 번역 대상(kr은 원본)
UNTRANSLATED = "[미번역] "
HANGUL_RE = re.compile(r"[가-힣]")


# ════════════════════════════════════════════════════════════════════════════
# 1. JS 파싱 (의존성 없이 필요한 만큼만)
# ════════════════════════════════════════════════════════════════════════════
_ESC = {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f", "v": "\v", "0": "\0"}


def js_unescape(body: str) -> str:
    out, i = [], 0
    while i < len(body):
        c = body[i]
        if c != "\\":
            out.append(c)
            i += 1
            continue
        i += 1
        if i >= len(body):
            break
        e = body[i]
        if e in _ESC:
            out.append(_ESC[e])
            i += 1
        elif e == "u":
            if i + 1 < len(body) and body[i + 1] == "{":
                j = body.index("}", i)
                out.append(chr(int(body[i + 2:j], 16)))
                i = j + 1
            else:
                out.append(chr(int(body[i + 1:i + 5], 16)))
                i += 5
        elif e == "x":
            out.append(chr(int(body[i + 1:i + 3], 16)))
            i += 3
        elif e == "\n":
            i += 1
        else:
            out.append(e)
            i += 1
    return "".join(out)


def tokenize_js(src: str, start: int):
    """src[start]가 '{' 라고 가정하고 짝 '}'까지 토큰화. (tokens, end_index)"""
    toks, depth, i, n = [], 0, start, len(src)
    while i < n:
        c = src[i]
        if c in " \t\r\n":
            i += 1
        elif src.startswith("//", i):
            i = src.find("\n", i)
            i = n if i < 0 else i
        elif src.startswith("/*", i):
            i = src.index("*/", i) + 2
        elif c in "'\"`":
            j = i + 1
            while src[j] != c:
                j += 2 if src[j] == "\\" else 1
            toks.append(("S", js_unescape(src[i + 1:j])))
            i = j + 1
        elif c in "{[(":
            depth += 1
            toks.append(("P", c))
            i += 1
        elif c in "}])":
            depth -= 1
            toks.append(("P", c))
            i += 1
            if depth == 0:
                return toks, i
        elif c in ":,+":
            toks.append(("P", c))
            i += 1
        else:
            m = re.match(r"[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|=>|[^\s]", src[i:])
            toks.append(("I", m.group(0)))
            i += len(m.group(0))
    raise ValueError("unbalanced block")


def pairs_from_tokens(toks):
    """{ 'k': 'v' + 'v2', ... } → [(k, v)]"""
    out, i = [], 1
    while i < len(toks):
        if toks[i][0] == "S" and i + 2 < len(toks) and toks[i + 1] == ("P", ":") and toks[i + 2][0] == "S":
            k, v, j = toks[i][1], toks[i + 2][1], i + 3
            while j + 1 < len(toks) and toks[j] == ("P", "+") and toks[j + 1][0] == "S":
                v += toks[j + 1][1]
                j += 2
            out.append((k, v))
            i = j
        else:
            i += 1
    return out


def parse_v1_i18n(text: str):
    """RES[lang] = {EXACT, SUB, PAT, REGEX}"""
    starts = {}
    for code in ("en", "zh", "zhs", "ja"):
        m = re.search(r"\n    %s: \{" % code, text)
        starts[code] = m.start()
    order = sorted(starts, key=starts.get)
    res = {}
    for idx, code in enumerate(order):
        a = starts[code]
        b = starts[order[idx + 1]] if idx + 1 < len(order) else text.index("/* ── 엔진")
        seg = text[a:b]
        r = {"EXACT": {}, "SUB": {}, "PAT": [], "REGEX": []}
        for name in ("EXACT", "SUB"):
            m = re.search(r"\b%s: \{" % name, seg)
            if m:
                toks, _ = tokenize_js(seg, m.end() - 1)
                r[name] = dict(pairs_from_tokens(toks))
        m = re.search(r"\bPAT: \[", seg)
        if m:
            end = seg.index("\n      ],", m.end())
            for line in seg[m.end():end].splitlines():
                p = parse_pat_line(line)
                if p:
                    r["PAT"].append(p)
        m = re.search(r"\bREGEX: \[", seg)
        if m:
            end = seg.index("\n      ],", m.end())
            for line in seg[m.end():end].splitlines():
                mm = re.match(r"\s*\[/(.+)/g, '(.*)'\],?\s*$", line)
                if mm:
                    r["REGEX"].append((mm.group(1), mm.group(2)))
        res[code] = r
    return res


_GROUP_RE = re.compile(r"\((?!\?)(?:\\.|[^()\\])*\)")


def regex_to_template(rx: str) -> str:
    rx = rx.strip("^$")
    k = [0]

    def rep(_m):
        s = "{%d}" % k[0]
        k[0] += 1
        return s

    t = _GROUP_RE.sub(rep, rx)
    return re.sub(r"\\(.)", r"\1", t)


def parse_pat_line(line: str):
    m = re.match(r"\s*\[/(\^.*?\$)/,\s*(.*)\],?\s*$", line)
    if not m:
        return None
    rx, fn = m.group(1), m.group(2)
    pm = re.match(r"(?:function\s*)?\(([^)]*)\)\s*(?:=>)?\s*(.*)$", fn)
    if not pm:
        return None
    params = [p.strip() for p in pm.group(1).split(",")][1:]
    body = pm.group(2).strip()
    idx = {p: i for i, p in enumerate(params)}

    def ref(expr: str) -> str:
        expr = expr.strip()
        mm = re.match(r"tName\((\w+)\)$", expr)
        name = mm.group(1) if mm else expr
        return "{%d}" % idx[name] if name in idx else expr

    if body.startswith("`"):
        tpl = body[1:body.rindex("`")]
        out = re.sub(r"\$\{([^}]+)\}", lambda mm: ref(mm.group(1)), tpl)
        out = js_unescape(out)
    else:
        rm = re.search(r"return (.*?);\s*\}", body)
        if not rm:
            return None
        parts = []
        for tok in re.finditer(r"'((?:\\.|[^'\\])*)'|\"((?:\\.|[^\"\\])*)\"|([\w.()]+)", rm.group(1)):
            if tok.group(1) is not None:
                parts.append(js_unescape(tok.group(1)))
            elif tok.group(2) is not None:
                parts.append(js_unescape(tok.group(2)))
            else:
                parts.append(ref(tok.group(3)))
        out = "".join(parts)
    return regex_to_template(rx), out


def parse_inline_dicts(text: str):
    """const X_T = { id: { kr, en, zh, zhs, ja }, ... } → {X_T: {id: {lang: str}}}"""
    out = {}
    for name in ("ADV_T", "TDMG_T", "ALTAR_T"):
        m = re.search(r"^const %s = \{" % name, text, re.M)
        toks, _ = tokenize_js(text, m.end() - 1)
        entries, i = {}, 1
        while i < len(toks):
            if toks[i][0] == "I" and i + 2 < len(toks) and toks[i + 1] == ("P", ":") and toks[i + 2] == ("P", "{"):
                key, j, d = toks[i][1], i + 3, {}
                while toks[j] != ("P", "}"):
                    if toks[j][0] == "I" and toks[j + 1] == ("P", ":") and toks[j + 2][0] == "S":
                        d[toks[j][1]] = toks[j + 2][1]
                        j += 3
                    else:
                        j += 1
                entries[key] = d
                i = j + 1
            else:
                i += 1
        out[name] = entries
    return out


def parse_feedback(text: str):
    m = re.search(r"const T = \{", text)
    toks, _ = tokenize_js(text, m.end() - 1)
    out, i = {}, 1
    while i < len(toks):
        if toks[i][0] == "I" and toks[i + 1] == ("P", ":") and toks[i + 2] == ("P", "{"):
            lang, j, d = toks[i][1], i + 3, {}
            while toks[j] != ("P", "}"):
                if toks[j][0] == "I" and toks[j + 1] == ("P", ":") and toks[j + 2][0] == "S":
                    d[toks[j][1]] = toks[j + 2][1]
                    j += 3
                else:
                    j += 1
            out[lang] = d
            i = j + 1
        else:
            i += 1
    return out


# ════════════════════════════════════════════════════════════════════════════
# 2. index.html 파싱 (정적 문구 + 가이드 블록)
# ════════════════════════════════════════════════════════════════════════════
INLINE_TAGS = {"b", "code", "em", "strong", "br", "i", "kbd", "small", "span", "a", "sup"}
BLOCK_TAGS = {"p", "li", "h3", "h4"}


class IndexParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []          # (tag, attrs)
        self.texts = []          # (line, text, ctx)  ctx = 'text' | 'em' | attr-name
        self.guide_blocks = []   # (line, tag, cls, html, [text fragments])
        self.guide_alts = []     # (line, alt, src)
        self.cap = None          # [tag, depth, cls, line, parts, frags]
        self.in_guide = 0
        self.skip = 0

    def _cls(self, attrs):
        return dict(attrs).get("class", "") or ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script", "style"):
            self.skip += 1
        line = self.getpos()[0]
        if "guide-body" in (a.get("class") or ""):
            self.in_guide = len(self.stack) + 1
        if tag not in ("br", "img", "input", "meta", "link"):
            self.stack.append((tag, a))
        in_guide = self.in_guide and len(self.stack) >= self.in_guide
        if in_guide:
            if tag == "img" and HANGUL_RE.search(a.get("alt", "")):
                self.guide_alts.append((line, a["alt"], a.get("src", "")))
            if self.cap is None and tag in BLOCK_TAGS:
                self.cap = [tag, len(self.stack), a.get("class", ""), line, [], []]
                return
            if self.cap is not None:
                if tag in INLINE_TAGS:
                    self.cap[4].append("<%s>" % tag if tag != "br" else "<br>")
                return
        for attr in ("title", "placeholder", "alt", "aria-label"):
            v = a.get(attr)
            if v and HANGUL_RE.search(v):
                self.texts.append((line, v.strip(), attr))

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip -= 1
        if self.cap is not None:
            if tag == self.cap[0] and len(self.stack) == self.cap[1]:
                t, _d, cls, line, parts, frags = self.cap
                self.guide_blocks.append((line, t, cls, "".join(parts).strip(), frags))
                self.cap = None
            elif tag in INLINE_TAGS and tag != "br":
                self.cap[4].append("</%s>" % tag)
        if self.stack and self.stack[-1][0] == tag:
            self.stack.pop()
            if self.in_guide and len(self.stack) < self.in_guide:
                self.in_guide = 0

    def handle_data(self, data):
        if self.skip:
            return
        if self.cap is not None:
            self.cap[4].append(html.escape(data, quote=False))
            if data.strip():
                self.cap[5].append(data.strip())
            return
        t = data.strip()
        if t and HANGUL_RE.search(t):
            ctx = "em" if self.stack and self.stack[-1][0] == "em" else "text"
            self.texts.append((self.getpos()[0], t, ctx))


# ════════════════════════════════════════════════════════════════════════════
# 3. 문구 변환 규칙 (용어집 → 어조 → 장식)
# ════════════════════════════════════════════════════════════════════════════
def _jong(ch: str) -> int:
    o = ord(ch) - 0xAC00
    return o % 28 if 0 <= o < 11172 else -1


def _add_jong(ch: str, idx: int) -> str:
    o = ord(ch) - 0xAC00
    if not (0 <= o < 11172) or o % 28:
        return ch
    return chr(ord(ch) + idx)


_LATIN_FINAL = set("LMNlmn")                 # 엘·엠·엔 → 받침 있음 (ATK·HP·EX 등은 없음)
_DIGIT_FINAL = set("0136780")                # 영·일·삼·육·칠·팔 → 받침 있음


def has_final(word: str) -> bool | None:
    """마지막 글자 발음의 받침 유무. 판정 불가(기호·빈 문자열)면 None."""
    w = word.rstrip()
    if not w:
        return None
    ch = w[-1]
    if HANGUL_RE.match(ch):
        return _jong(ch) > 0
    if ch.isascii() and ch.isalpha():
        return ch in _LATIN_FINAL
    if ch.isdigit():
        return ch in _DIGIT_FINAL
    return None


# 받침 유무가 다른 단어로 바꿀 때 조사 보정 (받침 없음 → 있음 / 있음 → 없음)
_JOSA_V2C = {"를": "을", "가": "이", "는": "은", "와": "과", "로": "으로", "랑": "이랑", "여": "이여",
             "로는": "으로는", "로도": "으로도", "로서": "으로서", "나": "이나", "라": "이라", "라도": "이라도"}
_JOSA_C2V = {v: k for k, v in _JOSA_V2C.items()}


def sub_word(text: str, old: str, new: str, *, left_bound: bool = True, right_bound: bool = True) -> tuple[str, int]:
    """단어 교체 + 조사 보정. 한글 경계(앞뒤가 한글이 아님; 뒤는 조사 허용)를 지킨다.
    닫는 따옴표·괄호 뒤 조사(‘…’를)도 보정한다. '(으)로'는 ㄹ받침을 받침 없음처럼 다룬다."""
    old_c, new_c = has_final(old), has_final(new)
    if old_c is None or new_c is None:
        old_c = new_c = False                        # 판정 불가(기호로 끝남) → 조사 보정 안 함
    new_r = new_c and HANGUL_RE.match(new[-1]) is not None and _jong(new[-1]) == 8
    josa = ("으로는|로는|으로도|로도|으로서|로서|으로|로|이라도|라도|이랑|랑|이나|나|이라|라|"
            "에서|에게|에는|에도|에|을|를|이|가|은|는|과|와|의|도|만|께|부터|까지|처럼|보다")
    lb = r"(?<![가-힣])" if left_bound else ""
    rb = r"(?![가-힣])" if right_bound else ""
    pat = re.compile(lb + re.escape(old) + r"([’”」]?)(%s)?" % josa + rb)
    count = 0

    def rep(m):
        nonlocal count
        count += 1
        q, j = m.group(1) or "", m.group(2) or ""
        if j.lstrip("으").startswith("로"):
            want_eu = new_c and not new_r
            base = j[1:] if j.startswith("으") else j
            j = ("으" + base) if want_eu else base
        elif j and old_c != new_c:
            table = _JOSA_C2V if old_c else _JOSA_V2C
            if j in table:
                j = table[j]
            elif j == "이" and not new_c:
                j = "가"
            elif j == "가" and new_c:
                j = "이"
        return new + q + j

    return pat.sub(rep, text), count


_JOSA_PAIR = {"을": ("을", "를"), "를": ("을", "를"), "이": ("이", "가"), "가": ("이", "가"),
              "은": ("은", "는"), "는": ("은", "는"), "과": ("과", "와"), "와": ("과", "와")}
_QUOTED_JOSA = re.compile(r"([가-힣A-Za-z0-9])(’|”|」|</b>|</em>|</code>)(으로|로|을|를|이|가|은|는|과|와)(?![가-힣])")


def fix_quoted_josa(s: str) -> str:
    """‘…’·<b>…</b> 뒤 조사를 앞 글자 받침에 맞춘다(교체로 받침이 바뀐 경우). 명사 뒤 자리만 본다."""
    def rep(m):
        ch, q, j = m.groups()
        fin = has_final(ch)
        if fin is None:
            return m.group(0)
        if j in ("으로", "로"):
            rieul = HANGUL_RE.match(ch) is not None and _jong(ch) == 8
            return ch + q + ("으로" if fin and not rieul else "로")
        c, v = _JOSA_PAIR[j]
        return ch + q + (c if fin else v)
    return _QUOTED_JOSA.sub(rep, s)


# (구 표현, 새 표현, 사유) — 긴 구문부터. 정규식 가능(re: 접두).
PHRASES: list[tuple[str, str, str]] = [
    # (C) 삭제·재작성
    ("타겟 더미 · 결정론 시뮬", "", "C-5 삭제"),
    ("로그는 평균에 가까운 1회 표본", "로그: 총 데미지가 평균에 가장 가까운 1회", "B-7"),
    ("딸피 구간 데미지 검증용 고정 체력 옵션", "적 HP 10% 고정 — 저HP 조건 효과 확인", "B-24"),
    ("필살 시전 (직접딜 없음 → 버프/발동)", "필살기 사용 (직접 데미지 없음)", "B-28"),
    ("(궁궁 불가, 궁평/평궁만)", "(한 턴에 필살기 1회)", "B-12"),
    ("동반 — 적 HP%가 진행 턴을 4등분해 단계적으로 감소합니다", "적 HP 단계 감소 — 턴을 4구간으로 나눠 75%→50%→25% 이하로 적용합니다", "B-26"),
    ("확률 100% · 결정론", "확률 효과 항상 발동", "B-5"),
    ("모든 확률형 스킬 100% 강제", "확률 효과 항상 발동", "U 확률 모드"),
    ("확률 100% 모드", "확률 효과 항상 발동", "U 확률 모드"),
    ("확률 100%", "확률 효과 항상 발동", "U 확률 모드"),
    ("더미 체력", "적 HP", "A-21"),
    ("체력 10% 모드", "적 HP 10% 고정", "A-21"),
    ("re:^체력 10%$", "적 HP 10% 고정", "A-21"),
    # (B) 번역체·조어
    ("연동 (궁 맞추기)", "필살기 연동", "A-1/B-8"),
    ("궁극기 맞추기", "필살기 연동", "A-1"),
    ("궁극기 사용 방식", "필살기 사용 방식", "A-1"),
    ("확률 쿨 감소 성공 가정", "확률 CD 감소 항상 성공", "B-13"),
    ("확률 쿨 감소 가정", "확률 CD 감소 가정", "B-13"),
    ("확률 쿨 감소", "확률 CD 감소", "B-13"),
    (" (궁궁 불가)", "", "B-12"),
    ("그대로 나올 확률", "이 흐름의 재현 확률", "B-14"),
    ("내 사용 방식대로", "개별 설정 따름", "B-9"),
    ("궁 간격 맞추기", "필살기 턴 재배치", "B-10"),
    ("첫 궁 당기기", "첫 필살기 앞당기기", "B-11"),
    ("궁 아끼기", "필살기 보류", "B-9"),
    ("아군 필살 나중", "인접 동료 필살기를 욱영 뒤로", "B-17"),
    ("패시브 방어", "필살기 전 턴 방어", "B-16"),
    ("호환 턴 전부 체크", "붙여넣을 수 있는 턴 모두 선택", "B-18"),
    ("특정 턴만 다르게", "일부 턴 순서 변경", "B-19"),
    ("고급 · 턴별로 다르게", "턴마다 값 지정", "B-20"),
    ("기본 따름", "기본값", "B-21"),
    ("행동 예산", "남은 행동 횟수", "B-22"),
    ("눌러서 도장·행동·교체", "도장·행동·교체 설정", "B-23"),
    ("저HP 게이트", "저HP 조건 효과", "B-25"),
    ("게이트", "조건", "용어 규칙 4"),
    ("미파싱:", "미지원 효과:", "B-29"),
    ("미모델링", "계산 미반영", "B-29"),
    ("비교군", "비교 팀", "B-30"),
    ("캐릭터 로스터", "동료 목록", "B-31"),
    ("캐릭터 스펙 설정", "육성 설정", "B-32"),
    ("스펙 설정", "육성 설정", "B-32"),
    ("풀육성 대비", "최대 육성 대비", "B-33"),
    ("풀육성", "최대 육성", "A-7"),
    ("만렙", "최대 레벨", "속어"),
    ("캐릭터 칩", "동료 버튼", "B-34"),
    ("아군 피격 횟수", "적 공격 대상 수", "B-1"),
    ("피격 데미지 모드", "적 공격 데미지", "B-2"),
    ("피격 데미지", "적 공격 데미지", "B-2"),
    ("받은 피해", "받은 데미지", "B-4"),
    ("결정론", "확률 효과 항상 발동", "용어 규칙 4"),
    ("표본", "1회", "용어 규칙 4"),
    # (A) 공식 용어
    ("길드전 방탈출", "길드 방탈출", "A-11"),
    ("길드 제단 설정", "방탈출 제단", "A-11/A-12"),
    ("길드 제단", "방탈출 제단", "A-11/A-12"),
    ("길드전", "길드", "A-11"),
    ("별·달 제단", "별의 제단·달의 제단", "A-12"),
    ("별 제단", "별의 제단", "A-12"),
    ("달 제단", "달의 제단", "A-12"),
    ("제단 활성화", "제단 점등", "A-12"),
    ("도장(룬) 해제", "도장 잠금해제", "A-3/A-4"),
    ("도장(룬)", "도장", "A-3"),
    ("룬 필살기", "도장 필살기", "A-3"),
    ("도장 해제", "도장 잠금해제", "A-4"),
    ("도장 강화", "도장 제련", "A-5"),
    ("한계 ", "제련 한도 ", "A-5"),
    ("(공격력+체력)", "(ATK+HP)", "A-21"),
    ("공격력·체력", "ATK·HP", "A-21"),
    ("기본 공격력", "기초 ATK", "A-21"),
    ("최대 체력", "최대 HP", "A-21"),
    ("기초최대HP", "기초 최대 HP", "표기 규칙 1"),
    ("최대HP", "최대 HP", "표기 규칙 1"),
    ("기초ATK", "기초 ATK", "표기 규칙 1"),
    ("고정ATK", "고정 ATK", "표기 규칙 1"),
    ("주는딜", "주는 데미지", "A-16"),
    ("주는뎀", "주는 데미지", "A-16"),
    ("받는 지속딜", "받는 지속형 데미지", "A-16"),
    ("속성 받는딜", "속성 받는 데미지", "A-16"),
    ("필살기 받는딜", "필살기로 받는 데미지", "A-16"),
    ("받는배리어", "받는 배리어", "A-16"),
    ("받는딜", "받는 데미지", "A-16"),
    ("받는뎀", "받는 데미지", "A-16"),
    ("지속딜", "지속형 데미지", "A-16"),
    ("직접딜", "직접 데미지", "A-16"),
    ("누적 딜", "누적 데미지", "A-16"),
    ("총딜순", "총 데미지순", "A-16"),
    ("평타뎀", "보통 공격 데미지", "A-16"),
    ("지속힐", "지속형 치료", "A-17"),
    ("받는회복", "받는 치료", "A-17"),
    ("버프/스택", "버프/중첩", "A-18"),
    ("스택", "중첩", "A-18"),
    ("전투불능·이탈", "사망", "A-19"),
    ("전투불능이 되어 이탈", "사망", "A-19"),
    ("전투불능", "사망", "A-19"),
    ("발동효과", "발동 스킬 효과", "A-20"),
    ("EX효과", "필살기 효과", "A-20"),
    ("필살기효과", "필살기 효과", "A-20"),
    ("상성(×1.5)·역상성(×0.75)", "유리 속성(×1.5)·불리 속성(×0.75)", "A-22"),
    ("상성 ×1.5 / 역상성 ×0.75", "유리 ×1.5 / 불리 ×0.75", "A-22"),
    ("역상성", "불리 속성", "A-22"),
    ("무·불·물·풀·빛·어둠", "없음·불·물·나무·빛·어둠", "A-9/A-24"),
    ("re:(?<![가-힣])무속성", "속성 없음", "A-24"),
    ("총 피해", "총 데미지", "A-25"),
    ("턴별 피해", "턴별 데미지", "A-25"),
    ("턴 피해 설정", "턴마다 받는 데미지", "용어집 §2"),
    ("매 턴 피해", "턴마다 받는 데미지", "용어집 §2"),
    ("턴 피해", "턴 데미지", "용어집 §2"),
    ("피해 대상", "데미지 대상", "U9"),
    ("추가행동", "추가 행동", "A-26"),
    ("회복 행동", "추가 행동", "A-26"),
    ("re:(^|‘)스타 (\\d+|N) 해금($|’)", "\\1\\2스타 도달 시 오픈\\3", "A-27"),
    ("re:(^|‘)스타 (\\d+|N)부터($|’)", "\\1\\2스타부터 레벨업\\3", "A-27"),
    ("re:(\\d+)쿨", "CD \\1턴", "A-15"),
    ("필살 CD", "필살기 CD", "A-15"),
    ("보통공격", "보통 공격", "A-2"),
    ("평 · 궁 · 방", "보통 공격 · 필살기 · 방어", "A-2"),
    ("평타 · 궁 · 방어", "보통 공격 · 필살기 · 방어", "A-2"),
    ("조합 비교하기", "팀 비교", "A-14"),
    ("로스터", "동료 목록", "B-31"),
    ("1회 동시 피격", "1회 동시에 공격받음", "B-3"),
    ("힐러", "치료 포지션", "A-17"),
    ("확률 밴드(바닥~천장)", "확률 범위", "용어집 §2"),
    ("확률 밴드", "확률 범위", "용어집 §2"),
    ("확률 편차 밴드", "확률 범위", "용어집 §2"),
]

# (구, 신, 사유) — 조사 보정이 필요한 단어 단위 교체. 순서 중요.
WORDS: list[tuple[str, str, str, bool]] = [
    # (old, new, reason, left_bound)
    ("궁극기", "필살기", "A-1", True),
    ("궁", "필살기", "A-1", True),
    ("평타", "보통 공격", "A-2", True),
    ("기본 공격", "보통 공격", "A-2", True),
    ("문양", "도장", "A-3", True),
    ("룬", "도장", "A-3", True),
    ("육성도", "적합도", "A-6", True),
    ("치유형", "치료형", "A-8", True),
    ("치유", "치료", "A-8", True),
    ("풀", "나무", "A-9", True),
    ("베리어", "배리어", "A-10", False),
    ("캐릭터", "동료", "A-13", True),
    ("조합", "팀", "A-14", True),
    ("파티", "팀", "A-14", True),
    ("쿨", "쿨타임", "A-15", True),
    ("딜", "데미지", "A-16", True),
    ("뎀", "데미지", "A-16", True),
    ("힐", "치료", "A-17", True),
    ("앵커", "기준 동료", "B-8", True),
    ("멤버", "따라가는 동료", "B-8", True),
    ("직업", "포지션", "A-23", True),
    ("공격력", "ATK", "A-21", True),
    ("체력", "HP", "A-21", True),
    ("스펙", "육성", "B-32", True),
]

# 1~2자 셀 약칭(키에 .abbr. 포함) — 용어 규칙 2: 평타 / 필살 / 방어
ABBR_EXACT = {"평": "평타", "궁": "필살", "방": "방어", "평궁방": "평타·필살·방어"}
ABBR_KEY = {"평": "plan.cell.abbr.atk", "궁": "plan.cell.abbr.ult", "방": "plan.cell.abbr.def",
            "평궁방": "plan.cell.abbr.legend"}

# 이모지·장식 기호 (★는 좁은 칸 ★N 허용, →·← 등 화살표는 유지)
DECOR_RE = re.compile(
    "[\U0001F000-\U0001FAFF\u2600-\u2604\u2606-\u27BF\u2B00-\u2BFF\uFE0F\u200D"
    "\u21C4\u21C5\u25A0-\u25FF\u2300-\u23FF]"
)

_TOKEN_END = r"(?=$|[\s.,!?·)\]’'\"」—…:;])"
_NOT_PRED = {"필요", "중요", "주요", "개요", "불필요", "소요", "요", "강요", "수요"}
_CONTRACT = {
    "해": "하", "돼": "되", "봐": "보", "와": "오", "줘": "주", "춰": "추", "워": "우", "뤄": "루",
    "꿔": "꾸", "둬": "두", "쳐": "치", "켜": "켜", "려": "리", "겨": "기", "셔": "시", "져": "지",
    "혀": "히", "껴": "끼", "써": "쓰", "떠": "뜨", "꺼": "끄", "커": "크", "터": "트", "퍼": "프",
    "내": "내", "개": "개", "대": "대", "새": "새", "매": "매", "태": "태", "깨": "깨", "가": "가",
    "나": "나", "서": "서", "사": "사", "자": "자", "타": "타", "파": "파", "차": "차", "싸": "싸",
    "여": "이", "빼": "빼", "재": "재",
}
JONG_B, JONG_M = 17, 16
DETONE_MISSES: list[str] = []
IMPERATIVES: list[str] = []


def _pred(stem_plus_L: str, formal: bool) -> str | None:
    """'없어'·'돼'·'바뀌어' 처럼 요 앞부분 → 합니다체/명사형. 실패 시 None."""
    s = stem_plus_L
    if not s:
        return None
    L = s[-1]
    if L in ("어", "아") and len(s) >= 2:
        prev, P = s[:-2], s[-2]
        if _jong(P) > 0:
            return prev + P + ("습니다" if formal else "음")
        return prev + _add_jong(P, JONG_B) + "니다" if formal else prev + _add_jong(P, JONG_M)
    if L in _CONTRACT:
        base = _CONTRACT[L]
        return s[:-1] + (_add_jong(base, JONG_B) + "니다" if formal else _add_jong(base, JONG_M))
    return None


def _detone_token(tok: str, formal: bool) -> str:
    if tok in _NOT_PRED or not tok.endswith("요"):
        return tok
    body = tok[:-1]
    if body.endswith("까") or body.endswith("나"):
        return tok                                  # 질문형(확인창)은 허용
    if body.endswith("아니에"):
        return body[:-3] + ("아닙니다" if formal else "아님")
    if body.endswith("이에") or body.endswith("예"):
        noun = body[:-2] if body.endswith("이에") else body[:-1]
        return noun + ("입니다" if formal else "임")
    if body.endswith("세"):
        formal = True                                # 명령형을 명사형으로 바꾸면 뜻이 바뀜 → 평서 안내문
        IMPERATIVES.append(tok)
        base = body[:-1]
        if base.endswith("으"):
            base = base[:-1]
            return base + ("습니다" if formal else "음")
        if base.endswith("주") and len(base) >= 2:
            r = _pred(base[:-1], formal)
            if r:
                return r
        if base and _jong(base[-1]) == 0:
            return base[:-1] + (_add_jong(base[-1], JONG_B) + "니다" if formal else _add_jong(base[-1], JONG_M))
    r = _pred(body, formal)
    if r:
        return r
    DETONE_MISSES.append(tok)
    return tok


def detone(s: str, formal: bool) -> str:
    def _imp(m):                                     # '~해 주세요' 명령형 → 평서 안내문
        IMPERATIVES.append(m.group(0))
        return _pred(m.group(1), True) or m.group(0)
    s = re.sub(r"([가-힣]*[어아해워와줘춰])\s?주세요", _imp, s)
    return re.sub(r"[가-힣]+요" + _TOKEN_END, lambda m: _detone_token(m.group(0), formal), s)


def is_formal(s: str, area: str) -> bool:
    return area == "guide" or "니다" in s or (s.rstrip().endswith(".") and len(s) > 30)


def tidy_spaces(s: str) -> str:
    s = re.sub(r"([‘“(「（]|<b>|<code>|<em>)[ \t]+", r"\1", s)
    s = re.sub(r"[ \t]+([’”)」）]|</b>|</code>|</em>)", r"\1", s)
    s = re.sub(r"[ \t]{2,}", " ", s)
    return s.strip()


def strip_decor(s: str) -> str:
    t = DECOR_RE.sub("", s)
    if t == s:
        return s
    return re.sub(r"^[\s·]+|[\s·]+$", "", tidy_spaces(t))


def transform_kr(src: str, area: str) -> tuple[str, list[str]]:
    """구 한국어 → 새 한국어. (결과, 사유 목록)"""
    reasons: list[str] = []
    s = src
    if s.strip() in ABBR_EXACT:
        return ABBR_EXACT[s.strip()], ["용어 규칙 2 (셀 약칭)"]
    t = strip_decor(s)
    if t != s:
        reasons.append("C-1 이모지·장식 제거")
        s = t
    for old, new, why in PHRASES:
        if old.startswith("re:"):
            ns = re.sub(old[3:], new, s)
        elif new and old in s:
            ns, _ = sub_word(s, old, new, left_bound=False, right_bound=False)   # 조사 보정 포함
        else:
            ns = s.replace(old, new)
        if ns != s:
            reasons.append(f"{why} ({old.removeprefix('re:')}→{new or '삭제'})")
            s = ns
    for old, new, why, lb in WORDS:
        if old == "궁":
            s2, n = sub_word(s, "궁", new)
            # '궁'은 한 글자라 (?<![가-힣])궁(?![가-힣]) 로만 교체된다(궁수·궁전 등 보호).
        elif old in ("풀", "쿨", "딜", "뎀", "힐", "룬", "체력", "공격력"):
            s2, n = sub_word(s, old, new)            # 합성어('체력응축' 등 게임 효과명) 보호
        else:
            # 2음절 이상은 뒤에 '별·마다·입니다' 등이 붙어도 교체(조사만 보정)
            s2, n = sub_word(s, old, new, left_bound=lb, right_bound=False)
        if n:
            reasons.append(f"{why} ({old}→{new})")
            s = s2
    # 상성 단독 → 유리 속성 ('속성 상성'은 공식어라 유지)
    ns = re.sub(r"(?<!속성 )(?<![가-힣])상성(?![가-힣])", "유리 속성", s)
    if ns != s:
        reasons.append("A-22 (상성→유리 속성)")
        s = ns
    if s.strip() == "무":
        s = "없음"
        reasons.append("A-24 (무→없음)")
    if reasons:
        s = fix_quoted_josa(s)
    ns = detone(s, is_formal(s, area))
    if ns != s:
        reasons.append("B 해요체→평서")
        s = ns
    return s, reasons


# 번역문 용어 보정 (언어별). 원문 의미가 같은 범위에서만.
TR_FIX = {
    "en": [
        (r"\bUltimates\b", "EX Skills"), (r"\bultimates\b", "EX Skills"),
        (r"\bUltimate\b", "EX Skill"), (r"\bultimate\b", "EX Skill"),
        (r"\bults\b", "uses its EX Skill"), (r"\bUlt\b", "EX"), (r"\bult\b", "EX Skill"),
        (r"\bRune EX Skill\b", "Sigil EX Skill"),
        (r"\bRunes\b", "Sigils"), (r"\bRune\b", "Sigil"), (r"\brunes\b", "sigils"), (r"\brune\b", "sigil"),
        (r"\bGrowth\b", "Compatibility"),
        (r"\bCharacters\b", "Companions"), (r"\bCharacter\b", "Companion"),
        (r"\bcharacters\b", "companions"), (r"\bcharacter\b", "companion"),
        (r"\bBuddies\b", "Companions"), (r"\bBuddy\b", "Companion"),
        (r"\bGrass\b", "Wood"), (r"\bGuild War\b", "Guild"),
        (r"\bAnchor\b", "Lead"), (r"\banchor\b", "lead"),
        (r"\bDeterministic\b", "Always proc"), (r"\bdeterministic\b", "always proc"),
        (r"\b100% Proc mode\b", "Always proc"),
    ],
    "ja": [
        ("刻印（ルーン）", "刻印"), ("ルーン必殺技", "刻印必殺技"), ("ルーン", "刻印"),
        ("育成度", "適合度"), ("ギルド戦・", "ギルド"), ("ギルド戦", "ギルド"),
        ("アンカー", "基準キャラ"),
    ],
    "zh": [
        ("印章（符文）", "印章"), ("符文", "印章"), ("培養度", "適合度"),
        ("公會戰密室", "公會密室"), ("公會戰", "公會"), ("錨點", "基準角色"),
    ],
}
def fix_tr(lang: str, s: str) -> str:
    t = DECOR_RE.sub("", s)
    for a, b in TR_FIX[lang]:
        t = re.sub(a, b, t) if lang == "en" else t.replace(a, b)
    if t == s:
        return s                      # 바뀐 게 없으면 원문 공백(조각 앞뒤 공백 포함) 유지
    return tidy_spaces(t) if DECOR_RE.search(s) else t


# ════════════════════════════════════════════════════════════════════════════
# 4. 영역 판정 + 키 생성
# ════════════════════════════════════════════════════════════════════════════
APP_AREAS = [  # (시작 줄, 영역) — app.v1.js 함수 경계 기준
    (1, "records"), (109, "app"), (114, "records"), (620, "compare"), (1380, "team"),
    (1528, "plan"), (1553, "adv"), (1658, "manual"), (2263, "plan"), (2452, "adv"),
    (2708, "plan"), (2807, "cond"), (2853, "tdmg"), (3103, "altar"), (3208, "plan"),
    (3327, "altar"), (3410, "plan"), (3458, "altar"), (3700, "grow"), (4164, "planner"),
    (4516, "grow"), (4547, "app"), (4606, "result"), (4708, "log"),
]
INDEX_AREAS = [
    (1, "boot"), (21, "top"), (36, "team"), (47, "cond"), (88, "plan"), (102, "cond"),
    (106, "result"), (134, "grow"), (145, "records"), (175, "top"), (180, "patch"),
    (190, "guide"), (399, "compare"),
]
GUIDE_SECTIONS = {
    "팀 편성": "team", "캐릭터 설정": "char", "캐릭터 스펙 설정": "grow", "턴별 행동 계획": "turnPlan",
    "전투 설정": "cond", "행동 우선순위": "order", "행동 고급 설정": "adv",
    "길드 제단 · 턴 피해": "altarTdmg", "길드 제단 설정": "altar", "궁극기 사용 방식": "ultMode",
    "연동 (궁 맞추기)": "sync", "턴 피해 설정": "tdmg", "시뮬레이션 결과": "result",
    "통계 · 랭킹": "stats", "턴별 데미지 차트": "chart", "데미지 추적": "trace",
    "조합 비교하기": "compare", "기록 시스템": "records",
}
_STOP = {"the", "a", "an", "of", "to", "is", "are", "and", "or", "in", "on", "for", "it", "its", "be",
         "this", "that", "with", "at", "by", "as", "from", "s", "t", "you", "your"}


def area_of(line: int, table) -> str:
    cur = table[0][1]
    for start, a in table:
        if line >= start:
            cur = a
    return cur


KR_SLUG = {"턴": "turn", "/턴": "perTurn", "0개 선택": "zeroSelected", "켬": "on", "끔": "off"}


def slug(en: str | None, kr: str) -> str:
    if kr in KR_SLUG:
        return KR_SLUG[kr]
    words = [w for w in re.findall(r"[A-Za-z0-9]+", en or "") if w.lower() not in _STOP]
    if not words:
        return "x" + hashlib.sha1(kr.encode("utf-8")).hexdigest()[:6]
    words = words[:4]
    out = words[0].lower() + "".join(w[:1].upper() + w[1:].lower() for w in words[1:])
    return out[:32]


def element_of(kr: str, ctx: str = "text") -> str:
    if ctx in ("title",):
        return "tip"
    if ctx == "placeholder":
        return "ph"
    if ctx == "aria-label":
        return "aria"
    if ctx == "alt":
        return "alt"
    if ctx == "help":
        return "help"
    if "{0}" in kr:
        return "fmt"
    if kr.endswith("…"):
        return "status"
    if re.search(r"(됨|함|음|옴|냄|없음|완료|실패)(\s*\(.*\))?$", kr) or " — " in kr and len(kr) < 60:
        return "msg"
    if kr.endswith(".") or kr.endswith("다") or len(kr) > 40:
        return "hint"
    return "label"


def camel_split(ident: str) -> str:
    parts = re.sub(r"([a-z0-9])([A-Z])", r"\1.\2", ident).replace("_", ".").split(".")
    return ".".join(p[:1].lower() + p[1:] for p in parts if p)


# ════════════════════════════════════════════════════════════════════════════
# 5. 조립
# ════════════════════════════════════════════════════════════════════════════
class Pool:
    def __init__(self):
        self.kr: dict[str, str] = {}
        self.tr: dict[str, dict[str, str]] = {l: {} for l in LANGS}
        self.by_kr: dict[str, str] = {}          # 새 kr → 키 (중복 병합)
        self.map_rows: list[tuple[str, str, str, str]] = []  # (출처, 구 kr, 새 키, 사유)
        self.term_changes = 0

    def unique(self, key: str) -> str:
        if key not in self.kr:
            return key
        i = 2
        while f"{key}{i}" in self.kr:
            i += 1
        return f"{key}{i}"

    def add(self, key: str, kr: str, tr: dict[str, str | None], *, origin: str, old: str,
            reasons: list[str], merge: bool = True, fixed_key: bool = False) -> str:
        if merge and kr in self.by_kr and not fixed_key:
            k = self.by_kr[kr]
            for l in LANGS:
                if tr.get(l) and not self.tr[l].get(k):
                    self.tr[l][k] = tr[l]
            self.map_rows.append((origin, old, k, "; ".join(reasons + ["중복 병합"])))
            return k
        key = key if fixed_key else self.unique(key)
        self.kr[key] = kr
        for l in LANGS:
            if tr.get(l):
                self.tr[l][key] = tr[l]
        self.by_kr.setdefault(kr, key)
        if any(not r.startswith(("B 해요체", "C-1")) for r in reasons):
            self.term_changes += 1
        self.map_rows.append((origin, old, key, "; ".join(reasons) or "변경 없음"))
        return key


def load_sources():
    i18n_text = (LEGACY / "i18n.v1.js").read_text(encoding="utf-8")
    app_text = (LEGACY / "app.v1.js").read_text(encoding="utf-8")
    fb_text = (LEGACY / "feedback.v1.js").read_text(encoding="utf-8")
    idx_text = V1_INDEX.read_text(encoding="utf-8")
    return parse_v1_i18n(i18n_text), app_text, parse_inline_dicts(app_text), parse_feedback(fb_text), idx_text


def line_of(text: str, needle: str) -> int | None:
    i = text.find(needle)
    return None if i < 0 else text.count("\n", 0, i) + 1


def build():
    res, app_text, inline, fb, idx_text = load_sources()
    exact = {l: res[l]["EXACT"] for l in LANGS}
    pool = Pool()

    def tr_for(old_kr: str) -> dict[str, str | None]:
        k = old_kr.strip()
        return {l: (fix_tr(l, exact[l][k]) if exact[l].get(k) else None) for l in LANGS}

    # ── 5-1 목업 확정 문구 (키 고정, 최우선) ──────────────────────────────
    for key, spec in MOCKUP_KEYS.items():
        kr = spec["kr"]
        tr: dict[str, str | None] = {l: None for l in LANGS}
        for l in LANGS:
            if spec.get(l):
                tr[l] = spec[l]
        for src in spec.get("src", []):
            t = tr_for(src)
            for l in LANGS:
                if not tr[l] and t[l]:
                    tr[l] = t[l]
        pool.add(key, kr, tr, origin="mockup", old=spec.get("src", [""])[0] if spec.get("src") else "",
                 reasons=[spec.get("why", "목업 확정 문구")], fixed_key=True)
        pool.by_kr.setdefault(kr, key)

    # ── 5-2 모듈 내 사전 (이미 ID 키) ──────────────────────────────────────
    dict_area = {"ADV_T": "adv", "TDMG_T": "tdmg", "ALTAR_T": "altar"}
    for dname, entries in inline.items():
        for ident, d in entries.items():
            if "kr" not in d:
                continue
            base = camel_split(ident)
            area = dict_area[dname]
            if base.startswith("ult"):
                area, base = "plan.ult", base[3:].lstrip(".") or "title"
            elif base.startswith("sync"):
                area, base = "plan.sync", base[4:].lstrip(".") or "title"
            key = f"{area}.{base}"
            ov = OVERRIDES.get((dname, ident))
            tr = {l: fix_tr(l, d[l]) if d.get(l) else None for l in LANGS}
            if ov:
                kr, reasons = ov["kr"], [ov["why"]]
                if ov.get("untr"):
                    tr = {l: None for l in LANGS}
                for l in LANGS:                      # 키가 있으면 그 값(None = 미번역), 없으면 기존 번역 유지
                    if l in ov:
                        tr[l] = ov[l]
            else:
                kr, reasons = transform_kr(d["kr"], area)
            pool.add(key, kr, tr, origin=f"app.v1.js {dname}.{ident}", old=d["kr"], reasons=reasons,
                     merge=False)

    # ── 5-3 피드백 카드 ───────────────────────────────────────────────────
    for ident, krv in fb.get("kr", {}).items():
        ov = OVERRIDES.get(("feedback", ident))
        kr, reasons = (ov["kr"], [ov["why"]]) if ov else transform_kr(krv, "feedback")
        tr = {l: fix_tr(l, fb[l][ident]) if fb.get(l, {}).get(ident) else None for l in LANGS}
        if ov and ov.get("untr"):
            tr = {l: None for l in LANGS}
        pool.add(f"feedback.{camel_split(ident)}", kr, tr, origin=f"feedback.v1.js T.{ident}", old=krv,
                 reasons=reasons, merge=False)

    consumed: set[str] = set()      # 가이드 재구성에 쓰인 EXACT 조각

    # ── 5-4 index.html 정적 문구 + 가이드 ──────────────────────────────────
    p = IndexParser()
    p.feed(idx_text)
    for line, text, ctx in p.texts:
        area = area_of(line, INDEX_AREAS)
        if area == "guide" and ctx == "alt":
            continue                                 # 가이드 그림 alt 는 아래 guide.fig.* 로
        old = text
        help_txt = ctx == "em" and old.startswith("(") and old.endswith(")")
        ov = OVERRIDES.get(("index", old))
        if ov:
            kr, reasons = ov["kr"], [ov["why"]]
        else:
            kr, reasons = transform_kr(old[1:-1] if help_txt else old, area)
            if help_txt:
                reasons.append("C-2 라벨 괄호 설명 분리 → .help")
        if not kr:
            pool.map_rows.append((f"index.html:{line}", old, "(삭제)", "; ".join(reasons)))
            continue
        tr = tr_for(old)
        if help_txt:
            tr = {l: (v[1:-1].strip("（）() ") if v else v) for l, v in tr.items()}
        if ov and ov.get("untr"):
            tr = {l: None for l in LANGS}
        el = "help" if help_txt else element_of(kr, ctx)
        en_hint = tr.get("en")
        pool.add(f"{area}.{el}.{slug(en_hint, kr)}", kr, tr, origin=f"index.html:{line}", old=old, reasons=reasons)
        consumed.add(old)

    # 가이드: 섹션별 블록
    sec, counters = "intro", {}
    for line, tag, cls, inner, frags in p.guide_blocks:
        text_plain = re.sub(r"<[^>]+>", "", html.unescape(inner)).strip()
        if tag == "h3" or tag == "h4":
            name = strip_decor(text_plain)
            s = GUIDE_SECTIONS.get(name, slug(None, name))
            if tag == "h3":
                sec = s                              # h4 없이 h3 바로 아래 오는 본문은 그룹 소속
                key = f"guide.group.{s}.title"
            else:
                sec = s
                key = f"guide.section.{s}.title"
            counters[sec] = {}
            kr, reasons = transform_kr(text_plain, "guide")
            tr = tr_for(text_plain)
            pool.add(key, kr, tr, origin=f"index.html:{line}", old=text_plain, reasons=reasons, merge=False,
                     fixed_key=True)
            consumed.update(frags)
            continue
        kind = "note" if "g-note" in cls else ("item" if tag == "li" else "body")
        if "g-intro" in cls:
            kind = "intro"
        c = counters.setdefault(sec, {})
        c[kind] = c.get(kind, 0) + 1
        n = c[kind]
        key = f"guide.section.{sec}.{kind}" + ("" if n == 1 else str(n))
        ov = OVERRIDES.get(("guide", key))
        if ov:
            kr, reasons = ov["kr"], [ov["why"]]
        else:
            kr, reasons = transform_kr(html.unescape(inner), "guide")
        # 번역: 조각별 EXACT 로 재구성 (하나라도 없으면 미번역)
        tr: dict[str, str | None] = {}
        for l in LANGS:
            out, ok = html.unescape(inner), True
            for f in sorted(set(frags), key=len, reverse=True):
                v = exact[l].get(f)
                if v is None:
                    if HANGUL_RE.search(f):
                        ok = False
                    continue
                out = out.replace(f, fix_tr(l, v))
            tr[l] = out if ok and not (ov and ov.get("untr")) else None
            if ov and ov.get(l):
                tr[l] = ov[l]
        if not kr:
            pool.map_rows.append((f"index.html:{line}", text_plain[:60], "(삭제)", "; ".join(reasons)))
            continue
        pool.add(key, kr, tr, origin=f"index.html:{line}", old=text_plain[:80], reasons=reasons,
                 merge=False, fixed_key=True)
        consumed.update(frags)
    for line, alt, src in p.guide_alts:
        kr, reasons = transform_kr(alt, "guide")
        base = Path(src).stem if src else ""
        name = camel_split(base.replace("-", "_")).replace(".", "_") if base else slug(tr_for(alt).get("en"), kr)
        name = re.sub(r"_(\w)", lambda m: m.group(1).upper(), name)     # cs-head → csHead
        pool.add(f"guide.fig.{name}", kr, tr_for(alt), origin=f"index.html:{line} ({src})",
                 old=alt, reasons=reasons, merge=False)
        consumed.add(alt)

    # ── 5-5 EXACT (구 한국어 원문 키) ──────────────────────────────────────
    all_keys: list[str] = []
    seen = set()
    for l in LANGS:
        for k in exact[l]:
            if k not in seen:
                seen.add(k)
                all_keys.append(k)
    unused = 0
    for old in all_keys:
        if old in consumed:
            continue
        ln = line_of(app_text, old)
        if ln is not None:
            area = area_of(ln, APP_AREAS)
            origin = f"app.v1.js:{ln}"
        else:
            iln = line_of(idx_text, old)
            if iln is not None:
                area, origin = area_of(iln, INDEX_AREAS), f"index.html:{iln}"
                if area == "guide":
                    # 가이드 조각인데 블록 재구성에서 못 쓴 것 = 태그 사이 조각. 가이드 블록이 대체.
                    pool.map_rows.append((origin, old[:80], "(가이드 블록에 흡수)", "가이드 블록 단위 키로 대체"))
                    continue
            else:
                area, origin = "misc", "출처 미확인(v1 동적 생성 또는 사용 안 함)"
                unused += 1
        ov = OVERRIDES.get(("exact", old))
        help_txt = old.startswith("(") and old.endswith(")") and len(old) > 6
        if ov:
            kr, reasons = ov["kr"], [ov["why"]]
        else:
            kr, reasons = transform_kr(old[1:-1] if help_txt else old, area)
            if help_txt:
                reasons.append("C-2 라벨 괄호 설명 분리 → .help")
        if not kr:
            pool.map_rows.append((origin, old, "(삭제)", "; ".join(reasons)))
            continue
        tr = tr_for(old)
        if help_txt:
            tr = {l: (v[1:-1] if v and v[:1] in "(（" and v[-1:] in ")）" else v) for l, v in tr.items()}
        if ov and ov.get("untr"):
            tr = {l: None for l in LANGS}
        if old.strip() in ABBR_EXACT:
            key = ABBR_KEY[old.strip()]
            if key in pool.kr:                       # 목업 키에 흡수(번역만 보충)
                for l in LANGS:
                    if tr.get(l) and not pool.tr[l].get(key):
                        pool.tr[l][key] = tr[l]
                pool.map_rows.append((origin, old, key, "; ".join(reasons + ["목업 키에 병합"])))
            else:
                pool.add(key, kr, tr, origin=origin, old=old, reasons=reasons, fixed_key=True)
            continue
        el = "help" if help_txt else element_of(kr)
        pool.add(f"{area}.{el}.{slug(tr.get('en'), kr)}", kr, tr, origin=origin, old=old, reasons=reasons)

    # ── 5-6 PAT (숫자·이름 끼인 문구 → {0} 템플릿) ─────────────────────────
    pat_tr: dict[str, dict[str, str]] = {}
    for l in LANGS:
        for tpl_kr, tpl_tr in res[l]["PAT"]:
            pat_tr.setdefault(tpl_kr, {})[l] = tpl_tr
    for tpl_kr, trs in pat_tr.items():
        probe = re.sub(r"\{\d+\}", "", tpl_kr)
        probe = max(re.split(r"[\s—()]+", probe), key=len)
        ln = line_of(app_text, probe) if probe else None
        area = area_of(ln, APP_AREAS) if ln else "misc"
        ov = OVERRIDES.get(("pat", tpl_kr))
        kr, reasons = (ov["kr"], [ov["why"]]) if ov else transform_kr(tpl_kr, area)
        tr = {l: fix_tr(l, trs[l]) if trs.get(l) else None for l in LANGS}
        if ov and ov.get("untr"):
            tr = {l: None for l in LANGS}
        pool.add(f"{area}.fmt.{slug(tr.get('en'), kr)}", kr, tr, origin=f"i18n.v1.js PAT ({'app.v1.js:%d' % ln if ln else '위치 미확인'})",
                 old=tpl_kr, reasons=reasons)

    # ── 5-7 SUB / REGEX → 엔진·로그 부분치환 조각 ─────────────────────────
    engine_src = {"fragments": {}, "regex": {}}
    sub_keys: list[str] = []
    seen = set()
    for l in LANGS:
        for k in res[l]["SUB"]:
            if k not in seen:
                seen.add(k)
                sub_keys.append(k)
    for old in sub_keys:
        ov = OVERRIDES.get(("exact", old))
        kr, reasons = (ov["kr"], [ov["why"]]) if ov else transform_kr(old, "frag")
        tr = {l: fix_tr(l, res[l]["SUB"][old]) if res[l]["SUB"].get(old) else None for l in LANGS}
        if ov and ov.get("untr"):
            tr = {l: None for l in LANGS}
        key = pool.unique(f"frag.{slug(tr.get('en'), kr)}")
        pool.kr[key] = kr
        for l in LANGS:
            if tr[l]:
                pool.tr[l][key] = tr[l]
        engine_src["fragments"][key] = old
        if any(not r.startswith(("B 해요체", "C-1")) for r in reasons):
            pool.term_changes += 1
        pool.map_rows.append(("i18n.v1.js SUB", old, key, "; ".join(reasons) or "변경 없음"))
    re_tr: dict[str, dict[str, str]] = {}
    for l in LANGS:
        for rx, rep in res[l]["REGEX"]:
            re_tr.setdefault(rx, {})[l] = rep
    for rx, trs in re_tr.items():
        if rx.startswith("([\\d,]+"):
            continue                                   # 만/억 숫자 단위 = format.js 담당
        tpl = regex_to_template(rx)
        kr, reasons = transform_kr(tpl, "frag")
        tr = {l: re.sub(r"\$(\d)", lambda m: "{%d}" % (int(m.group(1)) - 1), trs[l]) if trs.get(l) else None for l in LANGS}
        key = pool.unique(f"frag.re.{slug(tr.get('en'), kr)}")
        pool.kr[key] = kr
        for l in LANGS:
            if tr[l]:
                pool.tr[l][key] = tr[l]
        engine_src["regex"][key] = rx
        pool.map_rows.append(("i18n.v1.js REGEX", rx, key, "; ".join(reasons) or "변경 없음"))

    # ── 5-8 엔진이 내보내는 포지션·속성 원문 → 키 (백엔드 미변경, §5) ────────
    for src, key in (("치유", "role.healer"), ("전사", "role.warrior"), ("수호", "role.guard"),
                     ("보조", "role.support"), ("방해", "role.disrupt"), ("풀", "element.wood"),
                     ("나무", "element.wood"), ("무", "element.none")):
        engine_src.setdefault("exact", {})[src] = key

    # ── 번역 확정: 없는 것은 [미번역] + kr ─────────────────────────────────
    out = {"kr": dict(sorted(pool.kr.items()))}
    untr = {}
    for l in LANGS:
        d, miss = {}, 0
        for k, v in out["kr"].items():
            t = pool.tr[l].get(k)
            if not t:
                d[k] = UNTRANSLATED + v
                miss += 1
            else:
                d[k] = t
        out[l] = d
        untr[l] = miss
    return pool, out, untr, engine_src, unused


# ════════════════════════════════════════════════════════════════════════════
# 6. 수동 재작성 (자동 규칙으로 부족하거나 의미가 바뀌는 문구 — COPY_AUDIT 인용)
#    untr=True: 의미가 바뀌어 기존 번역을 쓸 수 없음 → [미번역]
# ════════════════════════════════════════════════════════════════════════════
OVERRIDES: dict[tuple[str, str], dict] = {
    ("ALTAR_T", "title"): {"kr": "방탈출 제단", "why": "A-11/A-12", "en": "Escape Room Altars", "zh": "公會密室祭壇", "ja": None},
    ("ALTAR_T", "sub"): {"kr": "길드 방탈출 · 층별 제단 효과", "why": "A-11 (길드전 삭제)",
                         "en": "Guild Escape Room · altar effects by floor", "zh": "公會密室 · 各層祭壇效果", "ja": "ギルド脱出部屋 · 階層別の祭壇効果"},
    ("ALTAR_T", "active"): {"kr": "점등", "why": "A-12 (활성화→점등)", "en": None, "zh": None, "ja": None},
    ("ALTAR_T", "star"): {"kr": "별의 제단", "why": "A-12", "en": "Star Altar", "zh": "星之祭壇", "ja": "星の祭壇"},
    ("ALTAR_T", "moon"): {"kr": "달의 제단", "why": "A-12", "en": "Moon Altar", "zh": "月之祭壇", "ja": "月の祭壇"},
    ("ALTAR_T", "starSub"): {"kr": "점등하지 않은 제단의 페널티가 전투에 적용됩니다", "why": "A-12/F-4 재작성(의미 변경)", "untr": True},
    ("ALTAR_T", "moonSub"): {"kr": "점등한 제단의 버프가 전투에 적용됩니다", "why": "A-12/F-4 재작성(의미 변경)", "untr": True},
    ("ALTAR_T", "hint"): {"kr": "제단을 눌러 점등 여부를 바꿉니다. 별의 제단은 점등하면 페널티가 꺼지고, 달의 제단은 점등하면 버프가 켜집니다.",
                          "why": "A-12/F-4 재작성(의미 변경)", "untr": True},
    ("ALTAR_T", "floorRule"): {"kr": "층은 1층부터 순서대로만 점등할 수 있습니다 — 위층을 점등하면 아래층도 함께 점등됩니다.",
                               "why": "A-12 (켜다→점등)",
                               "en": "Floors light up in order from the first — lighting an upper floor also lights the ones below.",
                               "zh": None, "ja": None},
    ("ALTAR_T", "lock"): {"kr": "방탈출 제단 사용 중 — 확률 효과 항상 발동과 함께 쓸 수 없음", "why": "A-11/B-5/해요체",
                          "en": "Escape Room Altars on — can't be combined with Always proc", "zh": None, "ja": None},
    ("ALTAR_T", "toastOn"): {"kr": "방탈출 제단 켜짐", "why": "A-11/개조식", "en": "Escape Room Altars on", "zh": None, "ja": None},
    ("ALTAR_T", "toastOff"): {"kr": "방탈출 제단 꺼짐", "why": "A-11/개조식", "en": "Escape Room Altars off", "zh": None, "ja": None},
    ("ALTAR_T", "toastOnSub"): {"kr": "· 확률 효과 항상 발동과 함께 쓸 수 없음", "why": "B-5/해요체",
                                "en": "· Always proc is unavailable while on", "zh": None, "ja": None},
    ("ALTAR_T", "loadFail"): {"kr": "제단 데이터 불러오기 실패 (altars.json)", "why": "오류 문형 '무엇이 — 왜'",
                              "en": "Failed to load altar data (altars.json)", "zh": "無法載入祭壇資料 (altars.json)", "ja": None},
    ("ALTAR_T", "syncTitle"): {"kr": "필살기 연동", "why": "A-1/B-8", "en": "EX Skill sync", "zh": "必殺技同步", "ja": "必殺技の同期"},
    ("ALTAR_T", "ultAnchorInfo"): {"kr": "연동 그룹 {0}의 기준 동료 — 따라가는 동료가 이 동료의 필살기 턴에 맞춥니다",
                                   "why": "B-8/해요체",
                                   "en": "Lead of sync group {0} — followers align to this companion’s EX Skill turns",
                                   "zh": None, "ja": None},
    ("TDMG_T", "title"): {"kr": "턴마다 받는 데미지", "why": "용어집 §2", "en": "Turn Damage", "zh": "回合傷害設定", "ja": "ターンダメージ設定"},
    ("TDMG_T", "toastOn"): {"kr": "턴마다 받는 데미지 켜짐", "why": "용어집 §2/개조식", "en": "Turn Damage on", "zh": None, "ja": None},
    ("TDMG_T", "toastOff"): {"kr": "턴마다 받는 데미지 꺼짐", "why": "용어집 §2/개조식", "en": "Turn Damage off", "zh": None, "ja": None},
    ("TDMG_T", "adv"): {"kr": "턴마다 값 지정", "why": "B-20", "en": "Per-turn values", "zh": "各回合分別設定", "ja": "ターンごとに設定"},
    ("ADV_T", "syncCleared"): {"kr": "연동 해제됨", "why": "해요체→개조식(COPY_AUDIT §3 예시)", "en": "Sync group removed",
                               "zh": "已解除連動組", "ja": "連動グループを解除しました"},
    ("ADV_T", "syncPresetDone"): {"kr": "연동 프리셋 적용됨", "why": "해요체→개조식", "en": "Sync preset applied",
                                  "zh": "已套用連動預設", "ja": "連動プリセットを適用しました"},
    ("ADV_T", "presetFull"): {"kr": "빈 그룹 없음 — 그룹 하나를 비운 뒤 다시 시도", "why": "해요체→개조식",
                              "en": "No free group — clear one group and try again", "zh": None, "ja": None},
    ("feedback", "fab"): {"kr": "피드백", "why": "C-1 이모지 제거"},
    ("feedback", "ph"): {"kr": "의견·오류·제안 입력", "why": "B-41"},
    ("feedback", "ok"): {"kr": "전송 완료", "why": "B-41", "untr": False},
    ("feedback", "err"): {"kr": "전송 실패 — 잠시 후 다시 시도", "why": "해요체→개조식"},
    ("feedback", "empty"): {"kr": "내용 입력 필요", "why": "COPY_AUDIT §3 (~주세요→명사형)"},
    ("exact", "코드를 복사했어요 — 상대가 가져오기에 붙여넣으면 돼요"): {"kr": "코드 복사됨 — ‘가져오기’에 붙여넣어 불러오기", "why": "B-38"},
    ("exact", "최초 1회만 (~10초), 이후엔 캐시되어 빨라요"): {"kr": "첫 실행만 약 10초 소요", "why": "B-39"},
    ("index", "최초 1회만 (~10초), 이후엔 캐시되어 빨라요"): {"kr": "첫 실행만 약 10초 소요", "why": "B-39"},
    ("exact", "이 턴엔 더 행동할 수 없어요 — 추가 행동은 임부언·욱영의 필살기가 만들어 줍니다"): {"kr": "남은 행동 없음 — 추가 행동은 임부언·욱영의 필살기로만 발생", "why": "B-36"},
    ("exact", "삭제할 기록이 없어요 (잠긴 기록은 제외돼요)"): {"kr": "삭제할 기록 없음 (잠긴 기록 제외)", "why": "COPY_AUDIT §3 예시"},
    ("exact", "코드를 붙여넣어 주세요"): {"kr": "코드 입력 필요", "why": "COPY_AUDIT §3 예시"},
    ("exact", "비교할 대상을 골라주세요"): {"kr": "비교할 기록 선택", "why": "COPY_AUDIT §3 예시"},
    ("exact", "서로 다른 두 기록을 골라주세요"): {"kr": "서로 다른 기록 2개 선택", "why": "COPY_AUDIT §3 (~주세요→명사형)"},
    ("exact", "내보낼 기록을 먼저 선택하세요"): {"kr": "내보낼 기록 먼저 선택", "why": "COPY_AUDIT §3 (~세요→명사형)"},
    ("exact", "공유받은 코드를 여기에 붙여넣으세요"): {"kr": "공유받은 코드 붙여넣기", "why": "COPY_AUDIT §3 (~세요→명사형)"},
    ("exact", "기록 저장 공간이 가득 찼어요 — 오래된 기록을 정리해 주세요"): {"kr": "기록 저장 공간 부족 — 오래된 기록 정리 필요", "why": "오류 문형 '무엇이 — 왜'"},
    ("exact", "를 눌러 결과를 갱신하세요"): {"kr": "를 눌러 결과 갱신", "why": "COPY_AUDIT §3 (~세요→명사형)"},
    ("exact", "🔄 새 버전이 배포됐어요 —"): {"kr": "새 버전 있음 —", "why": "B-40"},
    ("exact", "스타 3부터 해제할 수 있어요"): {"kr": "3스타부터 도장 잠금해제 가능", "why": "A-4/A-27 (G-UI 14205)"},
    ("exact", "이 시점엔 필살기를 쓸 수 없어요 — 쿨타임"): {"kr": "필살기 사용 불가 — 쿨타임", "why": "B-37"},
    ("ADV_T", "conflict"): {"kr": "타임라인이 켜져 있는 동안 적용되지 않는 설정: {0}. ‘기존 설정 불러오기’로 반영", "why": "B-35"},
    ("exact", "가져오기 실패 — 올바른 기록 파일이 아니에요"): {"kr": "가져오기 실패 — 기록 파일 형식 오류", "why": "오류 문형"},
    ("exact", "가져오기 실패 — 올바른 코드가 아니에요"): {"kr": "가져오기 실패 — 코드 형식 오류", "why": "COPY_AUDIT 톤 기준 예시"},
    ("exact", "가져오기 실패 — 형식이 올바르지 않아요"): {"kr": "가져오기 실패 — 형식 오류", "why": "오류 문형"},
    ("exact", "고급 설정이 켜져 있어요 — 순서는 고급 설정에서 정합니다"): {"kr": "고급 설정 사용 중 — 순서는 고급 설정에서 지정", "why": "해요체→개조식"},
    ("index", "고급 설정이 켜져 있어요 — 순서는 고급 설정에서 정합니다"): {"kr": "고급 설정 사용 중 — 순서는 고급 설정에서 지정", "why": "해요체→개조식"},
    ("pat", "이 시점엔 필살기를 쓸 수 없어요 — 쿨타임 {0}턴"): {"kr": "필살기 CD {0}턴 남음", "why": "B-37 (게임 문구 G-UI 26002 기반)"},
    ("pat", "캐릭터 스펙 설정 사용 중 — 스타 {0} · Lv{1} · 육성도 {2}"): {"kr": "육성 설정 사용 — {0}스타 · Lv.{1} · 적합도 {2}", "why": "COPY_AUDIT §5-2 ⑤"},
    ("pat", "{0}개를 파일로 내보냈어요"): {"kr": "{0}개 내보냄", "why": "COPY_AUDIT §3 예시"},
    ("pat", "{0}개 기록을 가져왔어요 (중복 제외)"): {"kr": "기록 {0}개 가져옴 (중복 제외)", "why": "COPY_AUDIT 톤 기준 예시"},
    ("pat", "{0}개를 삭제할까요?"): {"kr": "{0}개를 삭제합니다. 계속할까요?", "why": "COPY_AUDIT §3 확인창"},
    ("pat", "{0}개를 삭제할까요? (잠긴 기록 제외)"): {"kr": "{0}개를 삭제합니다 (잠긴 기록 제외). 계속할까요?", "why": "COPY_AUDIT §3 확인창"},
    ("pat", "{0}에게 피격"): {"kr": "{0} 공격받음", "why": "B-3"},
    ("guide", "guide.section.intro.intro"): {"kr": "5인 팀의 데미지를 턴 단위로 계산하는 시뮬레이터입니다.", "why": "C-3 (1문장으로)", "untr": True},
    ("guide", "guide.section.stats.body"): {
        "kr": "총 데미지·DPS·턴 수와 함께 동료별 데미지를 막대 랭킹으로 표시합니다. 각 수치는 중앙값과 확률 범위(확률 효과 전부 미발동 ~ 전부 발동)를 함께 제공합니다.",
        "why": "F-2 (최소~최대 → 확률 범위, 사실 정정)", "untr": True},
    ("guide", "guide.section.altar.item"): {
        "kr": "<b>별의 제단</b> — 점등하지 않은 제단의 페널티(받는 치료 감소·필살기 최대 CD 증가 등)가 전투에 적용됩니다. "
              "<b>달의 제단</b> — 점등한 제단의 버프가 전투에 적용됩니다.",
        "why": "A-12/F-4 재작성(가이드·패널 설명 충돌 해소, 의미 변경)", "untr": True},
    ("guide", "guide.section.altar.item2"): {
        "kr": "층은 <b>1층부터 순서대로만</b> 점등할 수 있고, 위층을 점등하면 아래층도 함께 점등됩니다. 각 효과는 개별로 끄고 켤 수 있습니다.",
        "why": "A-12 (켜다→점등)", "untr": True},
    ("guide", "guide.section.cond.item2"): {
        "kr": "<b>적 HP 10% 고정</b> — 저HP 조건 효과 확인용", "why": "B-24 (중복 제거)",
        "en": "<b>Enemy HP fixed at 10%</b> — for checking low-HP conditions"},
    ("guide", "guide.section.cond.item3"): {
        "kr": "<b>반복 횟수</b> — 중앙값 산출. 값이 클수록 정확하지만 느림", "why": "F-1/F-2 (평균·최소·최대 → 중앙값)", "untr": True},
}


# ════════════════════════════════════════════════════════════════════════════
# 7. 출력
# ════════════════════════════════════════════════════════════════════════════
def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, indent=1) + "\n"
    path.write_bytes(text.encode("utf-8"))


def write_map(pool: Pool, out: dict, untr: dict, unused: int) -> None:
    lines = [
        "# i18n 대응표 (v1 한국어 원문 키 → v2 ID 키)",
        "",
        "생성: `python tools/redesign/i18n_migrate.py` — 손으로 고치지 말 것(재생성 시 덮어씀). "
        "문구를 바꾸려면 `tools/redesign/i18n_mockup_keys.py`(목업 확정 문구) 또는 도구 안 `OVERRIDES`/`PHRASES`를 고친다.",
        "",
        "## 요약",
        "",
        "| 항목 | 수 |",
        "|---|---|",
        f"| 키 총수 (kr) | {len(out['kr'])} |",
    ]
    for l in LANGS:
        lines.append(f"| 미번역 ({l}) — 값이 `[미번역] ` + kr | {untr[l]} |")
    lines += [
        f"| 용어·문구 교체가 일어난 키 (해요체·이모지만 바뀐 것 제외) | {pool.term_changes} |",
        f"| 출처 미확인 EXACT(v1 동적 생성 또는 미사용, 영역 `misc`) | {unused} |",
        f"| 해요체 자동 변환 실패 토큰 | {len(set(DETONE_MISSES))} |",
        "",
        "## 키 규칙",
        "",
        "- `영역.요소.의미`. 영역: `top` `jump` `team` `grow` `plan`(행동 계획·필살기 사용 방식 `plan.ult.*`·연동 `plan.sync.*`) "
        "`adv`(v1 행동 고급 설정) `manual`(완전 수동) `planner`(동료 창 턴별 계획) `cond` `tdmg` `altar` `result` `log` `compare` "
        "`records` `guide` `patch` `feedback` `boot` `app`(공통 토스트) `element` `role` `frag`(엔진·로그 부분치환) `misc`.",
        "- 요소: `title` `label` `hint`(설명 문장) `help`(? 도움말, 구 라벨 괄호 설명) `msg`(토스트·상태) `status`(진행 중…) "
        "`fmt`(자리표시자 `{0}`/`{name}`) `tip`(title 속성) `ph`(placeholder) `aria` `alt` `cell.abbr`(1~2자 셀 약칭).",
        "- 의미 부분은 영문 번역에서 자동 생성(불용어 제거 4단어 camelCase). 목업 문구는 사람이 붙인 고정 키.",
        "- `guide.*`와 `*.html` 값에는 `<b> <code> <em> <br>` 인라인 태그가 들어 있다 — `i18n.tHtml(key, vars)`로 넣는다(변수만 이스케이프).",
        "- `frag.*`는 엔진·파이썬이 만드는 한국어 조각의 번역. 원문은 `dashboard_v2/i18n/engine_src.json`(백엔드 미변경).",
        "",
        "## 해요체 변환 실패 토큰(수동 확인 필요)",
        "",
        ", ".join(sorted(set(DETONE_MISSES))) or "없음",
        "",
        "## 명령형(~세요) → 평서 안내문 자동 변환 목록 (문맥 확인 권장)",
        "",
        ", ".join(sorted(set(IMPERATIVES))) or "없음",
        "",
        "## 대응표",
        "",
        "| 출처 | 구 한국어 | 새 키 | 사유 |",
        "|---|---|---|---|",
    ]
    esc = lambda s: s.replace("|", "\\|").replace("\n", " ")
    for origin, old, key, why in pool.map_rows:
        lines.append(f"| {esc(origin)} | {esc(old)} | `{key}` | {esc(why)} |")
    MAP_MD.write_bytes(("\n".join(lines) + "\n").encode("utf-8"))


def merge_parts(out: dict, untr: dict) -> None:
    """UI 모듈이 dashboard_v2/i18n/parts/<module>.kr.json 에 추가한 키를 합친다.
    kr 은 조각 값이 우선. 다른 언어는 기존 번역이 있으면 유지, 없으면 [미번역] + kr.
    조각의 en/ja/zh 는 <module>.<lang>.json 이 있으면 함께 읽는다."""
    parts_dir = OUT_DIR / "parts"
    if not parts_dir.is_dir():
        return
    for f in sorted(parts_dir.glob("*.kr.json")):
        mod = f.name[:-len(".kr.json")]
        kr = json.loads(f.read_text(encoding="utf-8"))
        tr = {}
        for l in LANGS:
            lf = parts_dir / f"{mod}.{l}.json"
            tr[l] = json.loads(lf.read_text(encoding="utf-8")) if lf.is_file() else {}
        for k, v in kr.items():
            out["kr"][k] = v
            for l in LANGS:
                cur = out[l].get(k)
                new = tr[l].get(k)
                if new:
                    out[l][k] = new
                elif cur and not cur.startswith(UNTRANSLATED):
                    pass
                else:
                    if not (cur and cur.startswith(UNTRANSLATED)):
                        untr[l] += 1
                    out[l][k] = UNTRANSLATED + v
    # base.<lang>.json: 조각(parts/*.kr.json)에 없는 키(원본 이전분)의 사람 번역.
    # base.kr.json 은 두지 않는다(kr 원문은 이전 도구가 만든 값 그대로). 아직 [미번역] 인 키만 채운다.
    for l in LANGS:
        bf = parts_dir / f"base.{l}.json"
        if not bf.is_file():
            continue
        for k, v in json.loads(bf.read_text(encoding="utf-8")).items():
            cur = out[l].get(k)
            if v and k in out["kr"] and cur and cur.startswith(UNTRANSLATED):
                out[l][k] = v
    for l in LANGS:   # 최종 값 기준으로 다시 센다(조각 번역이 기존 [미번역]을 덮은 경우 포함)
        untr[l] = sum(1 for v in out[l].values() if v.startswith(UNTRANSLATED))
    for l in ("kr", *LANGS):
        out[l] = dict(sorted(out[l].items()))


def main() -> int:
    check = "--check" in sys.argv
    pool, out, untr, engine_src, unused = build()
    merge_parts(out, untr)
    if not check:
        for lang, d in out.items():
            write_json(OUT_DIR / f"{lang}.json", d)
        write_json(OUT_DIR / "engine_src.json", engine_src)
        write_map(pool, out, untr, unused)
    print(f"keys={len(out['kr'])} untranslated=" + ",".join(f"{l}:{untr[l]}" for l in LANGS)
          + f" term_changes={pool.term_changes} unused_exact={unused} detone_miss={len(set(DETONE_MISSES))}")
    if DETONE_MISSES:
        print("detone misses:", ", ".join(sorted(set(DETONE_MISSES))))
    if IMPERATIVES:
        print("imperatives→평서:", ", ".join(sorted(set(IMPERATIVES))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
