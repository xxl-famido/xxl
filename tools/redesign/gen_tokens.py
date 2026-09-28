"""v2 디자인 토큰 생성기 — OKLCH로 색을 만들고 WCAG 대비를 맞춘 뒤 tokens.css와 대비 보고서를 쓴다.

  python tools/redesign/gen_tokens.py

산출:
  dashboard_v2/tokens.css            라이트(:root) + 다크([data-theme=dark], prefers-color-scheme)
  docs/redesign/TOKENS_CONTRAST.md   모든 텍스트·UI 쌍의 대비비 표(기준 미달이면 생성 실패)

원칙(docs/redesign/RESEARCH.md §2): 중립 램프는 OKLCH에서 약간 따뜻한 색조로 생성해 Tailwind zinc와 겹치지 않게 하고,
강조색은 1개(후보 3개는 스와치용으로 함께 출력), 텍스트 4.5:1 · UI 3:1을 라이트/다크 각각 계산한다.
텍스트·보더 토큰의 밝기(L)는 목표 대비를 만족할 때까지 자동으로 조정하므로 hex를 손으로 고치지 않는다.
"""
from __future__ import annotations

import math
import os
import sys
from dataclasses import dataclass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT_CSS = os.path.join(ROOT, "dashboard_v2", "tokens.css")
OUT_MD = os.path.join(ROOT, "docs", "redesign", "TOKENS_CONTRAST.md")

TEXT_AA = 4.5
UI_AA = 3.0

# ── OKLCH → sRGB (Björn Ottosson) ───────────────────────────────────────────

def _oklab_to_linear(L: float, a: float, b: float) -> tuple[float, float, float]:
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    return (
        +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )


def _gamma(c: float) -> float:
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def oklch_to_rgb(L: float, C: float, h: float) -> tuple[int, int, int] | None:
    """색역 밖이면 None."""
    a = C * math.cos(math.radians(h))
    b = C * math.sin(math.radians(h))
    lin = _oklab_to_linear(L, a, b)
    if any(v < -0.0005 or v > 1.0005 for v in lin):
        return None
    return tuple(max(0, min(255, round(_gamma(max(0.0, min(1.0, v))) * 255))) for v in lin)


def oklch_hex(L: float, C: float, h: float) -> str:
    """색역 밖이면 채도를 줄여서 맞춘다(밝기·색상은 유지)."""
    c = C
    while c >= 0:
        rgb = oklch_to_rgb(L, c, h)
        if rgb is not None:
            return "#%02x%02x%02x" % rgb
        c -= 0.002
    raise ValueError(f"gamut: L={L} C={C} h={h}")


# ── WCAG ─────────────────────────────────────────────────────────────────────

def _lum(hexs: str) -> float:
    r, g, b = (int(hexs[i:i + 2], 16) / 255 for i in (1, 3, 5))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contrast(a: str, b: str) -> float:
    la, lb = _lum(a), _lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def fit_L(C: float, h: float, bgs: list[str], target: float, start: float, darker: bool) -> float:
    """start 밝기에서 시작해 모든 배경에 대해 target 대비를 만족할 때까지 L을 0.005씩 옮긴다."""
    L = start
    for _ in range(200):
        hx = oklch_hex(L, C, h)
        if all(contrast(hx, bg) >= target for bg in bgs):
            return L
        L += -0.005 if darker else 0.005
        if not 0 <= L <= 1:
            break
    raise ValueError(f"fit failed C={C} h={h} target={target} bgs={bgs}")


def fit(C: float, h: float, bgs: list[str], target: float, start: float, darker: bool) -> str:
    return oklch_hex(fit_L(C, h, bgs, target, start, darker), C, h)


# ── 팔레트 정의 ────────────────────────────────────────────────────────────────

NEUTRAL_H = 75.0      # 약간 따뜻한 회색(zinc는 h≈286 푸른 계열)
NEUTRAL_C = 0.004     # 라이트
NEUTRAL_C_DARK = 0.002  # 다크는 거의 무채색 — 따뜻하게 두면 구 사이트(#1a1814)와 같아진다

ACCENTS = {            # 스와치 후보 3개. 기본은 첫 번째(2단계 목업에서 확정)
    "cobalt": 255.0,
    "azure": 242.0,
    "indigo-less": 266.0,
}
DEFAULT_ACCENT = "cobalt"

ELEMENTS = {"fire": 32.0, "water": 238.0, "wood": 148.0, "light": 88.0, "dark": 300.0}

# 계산 그래픽 5그룹(전투 로그) — 데이터 시각화 기준 팔레트의 범주 슬롯 2~6(주황·청록·노랑·분홍·초록)을 원래 순서 그대로.
# 슬롯 1(파랑)은 쓰지 않는다: 파랑 = 강조색 = 로그의 '결과 숫자' 전용(ATK 합계와 최종이 같은 색이 되던 문제, 2026-09-28 사용자 지적).
# 검증: dataviz validate_palette.js — 라이트(#ffffff)·다크(#191817) 모두 CVD·일반 시야 통과(다른 순서는 주황↔노랑·분홍↔청록 실패).
# 라이트 3색 3:1 미만 → 막대마다 이름표 직접 표기(완화 규칙).
VIZ_ORDER = ("atk", "skill", "amp", "recv", "elem")
VIZ_LIGHT = ("#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300")
VIZ_DARK = ("#d95926", "#199e70", "#c98500", "#d55181", "#008300")


@dataclass
class Theme:
    name: str
    colors: dict[str, str]
    checks: list[tuple[str, str, str, float]]   # (label, fg, bg, target)


def build_light() -> Theme:
    n = lambda L: oklch_hex(L, NEUTRAL_C, NEUTRAL_H)
    c: dict[str, str] = {}
    c["bg-canvas"] = n(0.975)
    c["bg-surface"] = "#ffffff"
    c["bg-subtle"] = n(0.955)
    c["bg-selected"] = n(0.93)
    c["bg-overlay"] = "#ffffff"
    c["bg-inverse"] = n(0.24)
    c["border-subtle"] = n(0.91)
    c["border-default"] = n(0.86)
    surfaces = [c["bg-surface"], c["bg-canvas"], c["bg-subtle"]]
    c["border-strong"] = fit(NEUTRAL_C, NEUTRAL_H, surfaces, UI_AA, 0.66, darker=True)
    c["text-primary"] = n(0.22)
    c["text-secondary"] = fit(NEUTRAL_C, NEUTRAL_H, surfaces + [c["bg-selected"]], 7.0, 0.46, darker=True)
    c["text-tertiary"] = fit(NEUTRAL_C, NEUTRAL_H, surfaces + [c["bg-selected"]], TEXT_AA, 0.58, darker=True)
    c["text-disabled"] = n(0.72)
    c["text-inverse"] = n(0.985)
    checks = []
    for name, h in ACCENTS.items():
        Ls = fit_L(0.17, h, ["#ffffff"], TEXT_AA, 0.58, darker=True) - 0.01   # 흰 글씨 4.5:1 + 여유
        solid = oklch_hex(Ls, 0.17, h)
        c[f"accent-{name}-solid"] = solid
        c[f"accent-{name}-hover"] = oklch_hex(Ls - 0.05, 0.17, h)
        c[f"accent-{name}-active"] = oklch_hex(Ls - 0.09, 0.17, h)
        c[f"accent-{name}-text"] = fit(0.15, h, surfaces, TEXT_AA, 0.52, darker=True)
        c[f"accent-{name}-subtle"] = oklch_hex(0.965, 0.02, h)
        c[f"accent-{name}-muted"] = oklch_hex(0.92, 0.045, h)
        checks += [(f"accent {name}: 흰 글씨/solid", "#ffffff", solid, TEXT_AA),
                   (f"accent {name}: solid 링/surface", solid, c["bg-surface"], UI_AA),
                   (f"accent {name}: solid 링/subtle", solid, c["bg-subtle"], UI_AA),
                   (f"accent {name}: text/canvas", c[f"accent-{name}-text"], c["bg-canvas"], TEXT_AA)]
    for name, h in (("danger", 27.0), ("success", 152.0), ("warning", 68.0)):
        c[f"status-{name}-solid"] = fit(0.16 if name != "warning" else 0.14, h, ["#ffffff"], TEXT_AA, 0.58, darker=True)
        c[f"status-{name}-text"] = fit(0.14, h, surfaces, TEXT_AA, 0.52, darker=True)
        c[f"status-{name}-subtle"] = oklch_hex(0.965, 0.025, h)
        checks += [(f"status {name}: text/canvas", c[f"status-{name}-text"], c["bg-canvas"], TEXT_AA),
                   (f"status {name}: 흰 글씨/solid", "#ffffff", c[f"status-{name}-solid"], TEXT_AA)]
    for name, h in ELEMENTS.items():
        c[f"element-{name}"] = fit(0.15, h, surfaces + [c["bg-selected"]], UI_AA, 0.62, darker=True)
        c[f"element-{name}-subtle"] = oklch_hex(0.955, 0.03, h)
        c[f"element-{name}-text"] = fit(0.14, h, surfaces + [c[f"element-{name}-subtle"]], TEXT_AA, 0.55, darker=True)
        checks += [(f"element {name} 점/selected", c[f"element-{name}"], c["bg-selected"], UI_AA),
                   (f"element {name} 테두리/surface", c[f"element-{name}"], c["bg-surface"], UI_AA),
                   (f"element {name} text/subtle", c[f"element-{name}-text"], c[f"element-{name}-subtle"], TEXT_AA),
                   (f"element {name} text/canvas", c[f"element-{name}-text"], c["bg-canvas"], TEXT_AA)]
    c["element-none"] = c["text-tertiary"]
    c["element-none-subtle"] = c["bg-selected"]
    c["element-none-text"] = c["text-secondary"]
    for k, v in zip(VIZ_ORDER, VIZ_LIGHT):
        c[f"viz-{k}"] = v
    checks += [("text-primary/surface", c["text-primary"], c["bg-surface"], 7.0),
               ("text-secondary/selected", c["text-secondary"], c["bg-selected"], TEXT_AA),
               ("text-tertiary/selected", c["text-tertiary"], c["bg-selected"], TEXT_AA),
               ("border-strong/surface", c["border-strong"], c["bg-surface"], UI_AA),
               ("border-strong/subtle", c["border-strong"], c["bg-subtle"], UI_AA),
               ("text-inverse/bg-inverse", c["text-inverse"], c["bg-inverse"], TEXT_AA)]
    return Theme("light", c, checks)


def build_dark() -> Theme:
    n = lambda L: oklch_hex(L, NEUTRAL_C_DARK, NEUTRAL_H)
    c: dict[str, str] = {}
    c["bg-canvas"] = n(0.17)
    c["bg-surface"] = n(0.21)
    c["bg-subtle"] = n(0.245)
    c["bg-selected"] = n(0.285)
    c["bg-overlay"] = n(0.26)
    c["bg-inverse"] = n(0.95)
    c["border-subtle"] = n(0.27)
    c["border-default"] = n(0.32)
    surfaces = [c["bg-surface"], c["bg-canvas"], c["bg-subtle"], c["bg-overlay"]]
    c["border-strong"] = fit(NEUTRAL_C_DARK, NEUTRAL_H, surfaces, UI_AA, 0.50, darker=False)
    c["text-primary"] = n(0.94)
    c["text-secondary"] = fit(NEUTRAL_C_DARK, NEUTRAL_H, surfaces + [c["bg-selected"]], 7.0, 0.70, darker=False)
    c["text-tertiary"] = fit(NEUTRAL_C_DARK, NEUTRAL_H, surfaces + [c["bg-selected"]], TEXT_AA, 0.60, darker=False)
    c["text-disabled"] = n(0.48)
    c["text-inverse"] = n(0.17)
    checks = []
    for name, h in ACCENTS.items():
        # 다크에서는 더 밝고 채도 낮게. 주 버튼은 이 배경 + 어두운 글씨.
        Ls = fit_L(0.12, h, [c["bg-surface"], c["bg-canvas"]], TEXT_AA, 0.72, darker=False) + 0.01
        solid = oklch_hex(Ls, 0.12, h)
        c[f"accent-{name}-solid"] = solid
        c[f"accent-{name}-hover"] = oklch_hex(Ls + 0.05, 0.12, h)
        c[f"accent-{name}-active"] = oklch_hex(Ls + 0.09, 0.11, h)
        c[f"accent-{name}-text"] = fit(0.12, h, surfaces + [c["bg-selected"]], TEXT_AA, 0.72, darker=False)
        c[f"accent-{name}-subtle"] = oklch_hex(0.25, 0.035, h)
        c[f"accent-{name}-muted"] = oklch_hex(0.32, 0.06, h)
        checks += [(f"accent {name}: 어두운 글씨/solid", c["text-inverse"], solid, TEXT_AA),
                   (f"accent {name}: solid 링/surface", solid, c["bg-surface"], UI_AA),
                   (f"accent {name}: solid 링/selected", solid, c["bg-selected"], UI_AA),
                   (f"accent {name}: text/canvas", c[f"accent-{name}-text"], c["bg-canvas"], TEXT_AA)]
    for name, h in (("danger", 27.0), ("success", 152.0), ("warning", 68.0)):
        c[f"status-{name}-solid"] = fit(0.13, h, [c["bg-surface"]], TEXT_AA, 0.72, darker=False)
        c[f"status-{name}-text"] = fit(0.12, h, surfaces + [c["bg-selected"]], TEXT_AA, 0.72, darker=False)
        c[f"status-{name}-subtle"] = oklch_hex(0.25, 0.03, h)
        checks += [(f"status {name}: text/canvas", c[f"status-{name}-text"], c["bg-canvas"], TEXT_AA),
                   (f"status {name}: 어두운 글씨/solid", c["text-inverse"], c[f"status-{name}-solid"], TEXT_AA)]
    for name, h in ELEMENTS.items():
        c[f"element-{name}"] = fit(0.12, h, surfaces + [c["bg-selected"]], UI_AA, 0.62, darker=False)
        c[f"element-{name}-subtle"] = oklch_hex(0.28, 0.04, h)
        c[f"element-{name}-text"] = fit(0.11, h, surfaces + [c["bg-selected"], c[f"element-{name}-subtle"]], TEXT_AA, 0.72, darker=False)
        checks += [(f"element {name} 점/selected", c[f"element-{name}"], c["bg-selected"], UI_AA),
                   (f"element {name} 테두리/surface", c[f"element-{name}"], c["bg-surface"], UI_AA),
                   (f"element {name} text/subtle", c[f"element-{name}-text"], c[f"element-{name}-subtle"], TEXT_AA),
                   (f"element {name} text/canvas", c[f"element-{name}-text"], c["bg-canvas"], TEXT_AA)]
    c["element-none"] = c["text-tertiary"]
    c["element-none-subtle"] = c["bg-selected"]
    c["element-none-text"] = c["text-secondary"]
    for k, v in zip(VIZ_ORDER, VIZ_DARK):
        c[f"viz-{k}"] = v
    checks += [("text-primary/surface", c["text-primary"], c["bg-surface"], 7.0),
               ("text-secondary/selected", c["text-secondary"], c["bg-selected"], TEXT_AA),
               ("text-tertiary/selected", c["text-tertiary"], c["bg-selected"], TEXT_AA),
               ("border-strong/surface", c["border-strong"], c["bg-surface"], UI_AA),
               ("border-strong/overlay", c["border-strong"], c["bg-overlay"], UI_AA),
               ("text-inverse/bg-inverse", c["text-inverse"], c["bg-inverse"], TEXT_AA)]
    return Theme("dark", c, checks)


# ── 비색상 토큰 ────────────────────────────────────────────────────────────────

STATIC = """
  /* 타이포 — 크기 6단계, 굵기 400/500/600만 */
  --font-sans: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, "JetBrains Mono", Consolas, "Cascadia Mono", monospace;
  --text-caption: 500 12px/16px var(--font-sans);
  --text-body-sm: 400 13px/18px var(--font-sans);
  --text-body: 400 14px/20px var(--font-sans);
  --text-body-strong: 600 14px/20px var(--font-sans);
  --text-title-sm: 600 16px/24px var(--font-sans);
  --text-title: 600 20px/28px var(--font-sans);
  --text-display: 600 28px/36px var(--font-sans);
  --tracking-title: -0.01em;
  --tracking-display: -0.02em;

  /* 간격 — 4px 기반 */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 20px;
  --space-6: 24px; --space-8: 32px; --space-10: 40px; --space-12: 48px;

  /* 컨트롤 높이·터치 타깃 */
  --control-sm: 28px; --control-md: 32px; --control-lg: 40px;
  --touch-min: 44px;

  /* 라운드 — 4값. 중첩 시 안쪽 = 바깥 − 패딩 */
  --radius-sm: 4px; --radius-md: 6px; --radius-lg: 10px; --radius-full: 999px;

  /* 보더 */
  --border-w: 1px;
  --focus-ring: 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--accent-solid);

  /* 모션 — 4단계, 등장 decelerate / 퇴장 accelerate */
  --dur-instant: 100ms; --dur-fast: 150ms; --dur-base: 200ms; --dur-slow: 300ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-enter: cubic-bezier(0, 0, 0, 1);
  --ease-exit: cubic-bezier(0.3, 0, 1, 1);

  /* z-index — 5단계 */
  --z-sticky: 10; --z-dropdown: 20; --z-overlay: 30; --z-modal: 40; --z-toast: 50;
"""

SHADOW_LIGHT = """
  /* 그림자 — 떠 있는 요소에만, 중립색 */
  --shadow-sm: 0 1px 2px rgba(20, 18, 14, 0.06);
  --shadow-md: 0 4px 12px rgba(20, 18, 14, 0.08), 0 1px 3px rgba(20, 18, 14, 0.06);
  --shadow-lg: 0 12px 32px rgba(20, 18, 14, 0.12), 0 2px 6px rgba(20, 18, 14, 0.06);
"""
SHADOW_DARK = """
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.45), 0 0 0 1px var(--border-default);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px var(--border-default);
"""


def color_block(t: Theme, indent: str = "  ") -> str:
    lines = []
    groups = [("배경", "bg-"), ("보더", "border-"), ("텍스트", "text-"),
              ("강조색 후보(스와치)", "accent-"), ("상태", "status-"), ("속성 — 기본=점·카드 테두리, -text=글자, -subtle=선택 배경", "element-"),
              ("계산 그래픽 그룹(데이터 시각화 범주 슬롯 1~5, 표식 전용 — 글자에 쓰지 않음)", "viz-")]
    for title, prefix in groups:
        lines.append(f"{indent}/* {title} */")
        for k, v in t.colors.items():
            if k.startswith(prefix):
                lines.append(f"{indent}--{k}: {v};")
    lines.append(f"{indent}/* 기본 강조색 = {DEFAULT_ACCENT} (2단계 목업에서 확정) */")
    for suf in ("solid", "hover", "active", "text", "subtle", "muted"):
        lines.append(f"{indent}--accent-{suf}: var(--accent-{DEFAULT_ACCENT}-{suf});")
    lines.append(f"{indent}--on-accent: {'#ffffff' if t.name == 'light' else 'var(--text-inverse)'};")
    return "\n".join(lines)


def write_css(light: Theme, dark: Theme) -> None:
    dark_block = color_block(dark) + "\n" + SHADOW_DARK + "  color-scheme: dark;\n"
    css = f"""/* woofia_sim v2 디자인 토큰 — 생성 파일. 손으로 고치지 말고 tools/redesign/gen_tokens.py 를 실행할 것.
   계층: 여기 있는 것은 전부 시맨틱 토큰. 컴포넌트 CSS는 이 변수만 참조한다(hex 직접 사용 금지).
   대비 근거: docs/redesign/TOKENS_CONTRAST.md */

:root {{
{color_block(light)}
{SHADOW_LIGHT}{STATIC}  color-scheme: light;
}}

/* 다크 — 명시적 선택 */
:root[data-theme="dark"] {{
{dark_block}}}

/* 다크 — 시스템 설정 추종(테마를 고르지 않았을 때) */
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
{dark_block}  }}
}}

/* 움직임 줄이기 — 이동은 없애고 페이드만 남긴다. 전역 0.01ms 리셋은 쓰지 않는다(요소가 영구히 안 보일 수 있음). */
@media (prefers-reduced-motion: reduce) {{
  :root {{
    --dur-instant: 0ms; --dur-fast: 150ms; --dur-base: 150ms; --dur-slow: 150ms;
  }}
}}
"""
    os.makedirs(os.path.dirname(OUT_CSS), exist_ok=True)
    with open(OUT_CSS, "w", encoding="utf-8") as f:
        f.write(css)


def write_report(themes: list[Theme]) -> bool:
    ok_all = True
    out = ["# 토큰 대비 보고서 (자동 생성 — gen_tokens.py)", "",
           f"기준: 텍스트 {TEXT_AA}:1 · UI 컴포넌트(보더·링·아이콘·표식) {UI_AA}:1 · 본문 주요 텍스트 7:1 목표.",
           f"중립 램프: OKLCH h={NEUTRAL_H} C={NEUTRAL_C}(라이트)/{NEUTRAL_C_DARK}(다크) — 약간 따뜻한 회색, zinc h≈286과 구분. 강조색 후보: "
           + ", ".join(f"{k} h={v}" for k, v in ACCENTS.items()) + ".", ""]
    for t in themes:
        out += [f"## {t.name}", "", "| 쌍 | 전경 | 배경 | 대비 | 기준 | 판정 |", "|---|---|---|---|---|---|"]
        for label, fg, bg, target in t.checks:
            r = contrast(fg, bg)
            ok = r >= target
            ok_all &= ok
            out.append(f"| {label} | `{fg}` | `{bg}` | {r:.2f} | {target} | {'✓' if ok else '✗ 미달'} |")
        out += ["", "### 전체 값", "", "| 토큰 | hex |", "|---|---|"]
        out += [f"| `--{k}` | `{v}` |" for k, v in t.colors.items()]
        out.append("")
    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    return ok_all


if __name__ == "__main__":
    light, dark = build_light(), build_dark()
    ok = write_report([light, dark])
    if not ok:
        print("대비 미달 항목이 있습니다. TOKENS_CONTRAST.md 확인.", file=sys.stderr)
        sys.exit(1)
    write_css(light, dark)
    print(f"ok: {OUT_CSS}\n    {OUT_MD}")
