"""pytest가 저장소 루트와 tools/ 를 import 할 수 있게 경로를 잡아준다.

`tests/` 에 `__init__.py` 가 없으므로 pytest는 이 디렉터리만 sys.path 에 넣는다.
루트(`woofia_sim` 패키지)와 `tools`(snapshot 모듈)를 직접 추가해야 한다.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for path in (ROOT, ROOT / "tools"):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))
