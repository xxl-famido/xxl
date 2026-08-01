"""dashboard/spec.js 가 woofia_sim/stats.py 와 같은 값을 내는지 확인.

스펙 패널은 슬라이더를 끌 때마다 서버를 왕복하지 않으려고 공식을 JS에도 두고
있다. 둘이 갈라지면 **화면 숫자와 시뮬 결과가 조용히 달라진다** — 이 검사가
그걸 막는 유일한 장치다. node 가 없는 환경에서는 건너뛴다.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tools" / "statcheck.js"


@pytest.mark.skipif(shutil.which("node") is None, reason="node 없음")
def test_js_stat_formula_matches_python(tmp_path: Path) -> None:
    import sys

    sys.path.insert(0, str(ROOT / "tools"))
    from statgolden import build_golden

    golden = build_golden()
    assert golden["stats"], "골든이 비어 있음"

    dest = tmp_path / "statgolden.json"
    dest.write_text(json.dumps(golden, separators=(",", ":")), encoding="utf-8")

    proc = subprocess.run(
        ["node", str(CHECK), str(dest)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        cwd=str(ROOT), timeout=120,
    )
    assert proc.returncode == 0, f"spec.js 불일치\n{proc.stdout}\n{proc.stderr}"
