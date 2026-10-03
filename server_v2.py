"""v2 디자인 개편용 개별 로컬 서버 — 기존 server.py(8777)와 완전히 분리해서 돈다.

  python server_v2.py     # then open http://localhost:8778

정적 파일은 dashboard_v2/ 에서 서빙하고, API(/api/*)와 /data/* 는 server.py 의 Handler 를 그대로 재사용한다
(엔진 sim_api.py 공유 — 로직은 손대지 않는다). dashboard_v2/ 에 아직 없는 공용 자산(icons/, guide/, *.json)은
기존 dashboard/ 로 폴백해서 개편 초기에 파일을 복사해 둘 필요가 없게 한다.
"""
from __future__ import annotations

import os

from server import Handler as V1Handler, DASH as DASH_V1, DevServer, all_meta

HERE = os.path.dirname(os.path.abspath(__file__))
DASH_V2 = os.path.join(HERE, "dashboard_v2")
PORT = 8778

# v2 에 없을 때 dashboard/ 에서 대신 찾는 경로 접두사·확장자 (html/css/js 는 폴백하지 않는다 — 개편본과 섞이면 안 됨)
FALLBACK_PREFIXES = ("icons/", "data/")   # guide/ 는 폴백하지 않는다 — v1 화면 그림이 v2 가이드에 섞이면 안 됨
FALLBACK_EXTS = (".json", ".png", ".svg", ".webp", ".jpg")

CTYPES = {".html": "text/html", ".css": "text/css", ".js": "application/javascript",
          ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
          ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2"}


def _resolve(rel: str) -> str | None:
    """dashboard_v2/ 우선, 허용된 공용 자산만 dashboard/ 폴백. 디렉터리 밖 경로는 거부."""
    v1_ok = (rel.startswith(FALLBACK_PREFIXES) or rel.endswith(FALLBACK_EXTS)) and not rel.startswith("guide/")
    for base, allowed in ((DASH_V2, True), (DASH_V1, v1_ok)):
        if not allowed:
            continue
        fp = os.path.normpath(os.path.join(base, rel))
        if fp.startswith(base + os.sep) and os.path.isfile(fp):
            return fp
    return None


class Handler(V1Handler):
    def do_GET(self):
        path = self.path.split("?")[0]
        if path.startswith("/api/") or path.startswith("/data/"):
            return super().do_GET()
        if path == "/i18n/parts/":            # 개발용: 모듈별 문구 조각 목록(병합 전 로컬 확인)
            parts = sorted(f for f in os.listdir(os.path.join(DASH_V2, "i18n", "parts")) if f.endswith(".kr.json")) if os.path.isdir(os.path.join(DASH_V2, "i18n", "parts")) else []
            return self._send(200, parts)
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        fp = _resolve(rel)
        if fp is None:
            return self._send(404, {"error": "not found"})
        ext = os.path.splitext(fp)[1]
        ctype = CTYPES.get(ext, "text/plain")
        if ext in (".html", ".css", ".js", ".json"):
            ctype += "; charset=utf-8"
        with open(fp, "rb") as f:
            return self._send(200, f.read(), ctype)


if __name__ == "__main__":
    os.makedirs(DASH_V2, exist_ok=True)
    all_meta()  # warm the cache
    print(f"WOOFIA 시뮬레이터 v2 (디자인 개편)  ->  http://localhost:{PORT}")
    DevServer(("127.0.0.1", PORT), Handler).serve_forever()
