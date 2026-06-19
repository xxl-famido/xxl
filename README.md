# XXL WOOFIA 전투 시뮬레이터

브라우저에서 도는 XXL WOOFIA 턴제 전투 데미지 시뮬레이터.
조합·스펙·스킬레벨·도장강화에 따른 데미지를 N회 평균으로 계산해 랭킹·차트·전투로그로 보여줍니다.

## 온라인 (GitHub Pages)
`main` 브랜치에 push하면 GitHub Actions가 자동으로 GitHub Pages에 배포합니다.
엔진(순수 Python)은 **Pyodide**로 사용자 브라우저 안에서 실행되어 서버가 필요 없습니다.

→ `https://<아이디>.github.io/<저장소이름>/`

## 로컬 실행 (개발용)
```
python server.py      # http://localhost:8777
```
로컬에서는 `server.py`(localhost:8777)가 API를 처리하고, 정적 호스팅(GitHub Pages)에서는
`dashboard/sim-worker.js`가 Pyodide로 같은 로직(`sim_api.py`)을 브라우저에서 실행합니다.

## 구조
- `woofia_sim/` — 시뮬레이션 엔진 (순수 Python 표준 라이브러리)
- `sim_api.py` — 캐릭터 메타 / 스킬 / 시뮬 API (server.py와 Pyodide가 공유)
- `server.py` — 로컬 개발 서버
- `dashboard/` — 프런트엔드 (index.html · app.js · style.css · sim-worker.js · icons)
- `data/` — 게임 데이터 (chars.json · skills.json)
- `.github/workflows/deploy.yml` — GitHub Pages 자동 배포
