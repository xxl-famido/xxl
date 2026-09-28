"""dashboard_v2/ui-icons/*.svg (Lucide 원본) → sprite.svg 로 합친다.  python tools/redesign/build_sprite.py

- 각 파일의 <svg …> 루트를 벗기고 안쪽 도형만 <symbol id="i-이름" viewBox="0 0 24 24"> 에 넣는다.
- 루트 <svg>에 display:none 을 주면 Chrome 이 외부 <use> 참조를 그리지 않으므로 width/height=0 으로 숨긴다.
- 스트로크·색은 사용처 CSS(.ic { stroke: currentColor … }) 가 정한다.
"""
from __future__ import annotations

import glob
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ICON_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "dashboard_v2", "ui-icons"))
OUT = os.path.join(ICON_DIR, "sprite.svg")

symbols: list[str] = []
for path in sorted(glob.glob(os.path.join(ICON_DIR, "*.svg"))):
    name = os.path.basename(path)[:-4]
    if name == "sprite":
        continue
    src = open(path, encoding="utf-8").read()
    src = re.sub(r"<!--.*?-->", "", src, flags=re.S)                  # 라이선스 주석 제거(정규식 오매칭 방지)
    m = re.search(r"<svg\b[^>]*>(.*?)</svg>", src, flags=re.S)
    if not m:
        raise SystemExit(f"svg 루트를 찾지 못함: {path}")
    inner = re.sub(r"\s+", " ", m.group(1)).strip()
    if "<svg" in inner:
        raise SystemExit(f"중첩 svg: {path}")
    symbols.append(f'<symbol id="i-{name}" viewBox="0 0 24 24">{inner}</symbol>')

with open(OUT, "w", encoding="utf-8") as f:
    f.write('<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true">\n'
            "<!-- Lucide Icons (ISC) — LICENSE 동봉. 생성 파일: tools/redesign/build_sprite.py -->\n"
            + "\n".join(symbols) + "\n</svg>\n")
print(f"ok: {len(symbols)} symbols -> {OUT}")
