"""Local dev web server for the WOOFIA simulator dashboard.

  python server.py        # then open http://localhost:8777

Serves the static dashboard/ and exposes the API. The actual simulation logic
lives in sim_api.py (shared with the static Pyodide/GitHub Pages build).
No third-party deps (stdlib http.server only).
"""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from sim_api import all_meta, char_skills, run_sim
from boss_api import list_bosses, run_boss, boss_chars   # 길드 보스전 — 별도 엔진(boss_sim)

HERE = os.path.dirname(os.path.abspath(__file__))
DASH = os.path.join(HERE, "dashboard")
PORT = 8777


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")  # 항상 최신 파일
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/chars":
            return self._send(200, all_meta())
        if path.startswith("/api/char/"):
            return self._send(200, char_skills(int(path.rsplit("/", 1)[1])))
        if path == "/api/bosses":
            return self._send(200, list_bosses())
        if path == "/api/boss/chars":
            return self._send(200, boss_chars())
        if path.startswith("/data/"):   # i18n.js 이름맵(chars/skills.json) — 배포 시엔 Actions가 _site/data로 복사
            dp = os.path.normpath(os.path.join(HERE, path.lstrip("/")))
            if dp.startswith(os.path.join(HERE, "data")) and os.path.isfile(dp):
                with open(dp, "rb") as f:
                    return self._send(200, f.read(), "application/json; charset=utf-8")
            return self._send(404, {"error": "not found"})
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        fp = os.path.normpath(os.path.join(DASH, rel))
        if fp.startswith(DASH) and os.path.isfile(fp):
            ext = os.path.splitext(fp)[1]
            ctype = {".html": "text/html", ".css": "text/css", ".js": "application/javascript",
                     ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml"}.get(ext, "text/plain")
            with open(fp, "rb") as f:
                return self._send(200, f.read(), ctype + ("; charset=utf-8" if ext in (".html", ".css", ".js", ".json") else ""))
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path in ("/api/simulate", "/api/boss"):
            n = int(self.headers.get("Content-Length", 0))
            cfg = json.loads(self.rfile.read(n) or b"{}")
            try:
                fn = run_boss if self.path == "/api/boss" else run_sim
                return self._send(200, fn(cfg))
            except Exception as e:
                import traceback
                traceback.print_exc()
                return self._send(500, {"error": str(e)})
        return self._send(404, {"error": "not found"})


if __name__ == "__main__":
    all_meta()  # warm the cache
    print(f"WOOFIA 시뮬레이터  ->  http://localhost:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
