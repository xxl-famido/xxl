#!/usr/bin/env bash
# v2 정적 사이트 조립(배포 워크플로 .github/workflows-staged/deploy_v2.yml 과 같은 절차, 로컬 Pyodide 경로 검증용).
#   bash tools/redesign/build_site_v2.sh           → _site_v2/
#   bash tools/redesign/build_site_v2.sh _site     → _site/ (배포 워크플로가 쓰는 경로)
set -e
cd "$(dirname "$0")/../.."
OUT="${1:-_site_v2}"
case "$OUT" in _site|_site_v2) ;; *) echo "출력 폴더는 _site 또는 _site_v2 만" >&2; exit 1 ;; esac
rm -rf "$OUT" && mkdir -p "$OUT/woofia_sim" "$OUT/data"
cp -r dashboard_v2/* "$OUT/"
rm -rf "$OUT/legacy" "$OUT/tests" "$OUT/mockup.html" "$OUT/mockup_adv.html" "$OUT/mockup.css" "$OUT/logs" "$OUT/tokens-preview.html" "$OUT/package.json" "$OUT/i18n/parts"
cp -r dashboard/icons "$OUT/icons"
cp woofia_sim/*.py "$OUT/woofia_sim/"
cp sim_api.py "$OUT/sim_api.py"
cp data/chars.json data/skills.json "$OUT/data/"
VER="$(git log -1 --format=%cI)"
printf '{"updated":"%s"}' "$VER" > "$OUT/version.json"
sed -i "s|__BUILD_VERSION__|$VER|" "$OUT/src/ui/update.js"   # 새 배포 알림: 실행 중인 코드가 자기 버전을 알게

# 구버전(v1): 현재 deploy.yml 의 조립 절차 그대로 v1/ 하위에 둔다(≡ 메뉴 「구버전」 → v1/).
# v1 은 Pyodide 모드에서 전부 상대 경로(sim-worker.js·version.json·data/·woofia_sim/)라 하위 경로에서 그대로 동작한다.
# 같은 origin 이라 기록·초안 localStorage(woofia_history·woofia_draft 등)를 v2 와 공유한다.
V1="$OUT/v1"
mkdir -p "$V1/woofia_sim" "$V1/data"
cp -r dashboard/* "$V1/"
cp woofia_sim/*.py "$V1/woofia_sim/"
cp sim_api.py "$V1/sim_api.py"
cp data/chars.json data/skills.json "$V1/data/"
rm -f "$V1/result.json"
printf '{"updated":"%s"}' "$VER" > "$V1/version.json"
sed -i "s|__BUILD_VERSION__|$VER|" "$V1/app.js"
# v1 「새 버전」 링크(dashboard/index.html 한 줄) 번역은 빌드 단계에서만 사전에 주입한다(v1 소스 무변경).
sed -i -e "s|'기록 관리': 'Manage History',|& '새 버전': 'New version',|"        -e 's|"기록 관리": "紀錄管理",|& "새 버전": "新版",|'        -e 's|"기록 관리": "纪录管理",|& "새 버전": "新版",|'        -e 's|"기록 관리": "記録管理",|& "새 버전": "新バージョン",|' "$V1/i18n.js"
[ "$(grep -cE "['\"]새 버전['\"]:" "$V1/i18n.js")" = 4 ] || { echo "v1 i18n 주입 실패" >&2; exit 1; }
grep -q 'href="../"' "$V1/index.html" || { echo "v1 「새 버전」 링크 없음" >&2; exit 1; }
# ≡ 메뉴 「구버전」 항목 켜기(개발 서버에서는 v1/ 이 없어 꺼 둔 값).
sed -i "s|^const V1_BUILT = false;|const V1_BUILT = true;|" "$OUT/src/ui/menu.js"
grep -q "^const V1_BUILT = true;" "$OUT/src/ui/menu.js" || { echo "메뉴 「구버전」 켜기 실패" >&2; exit 1; }
echo "v1: 구버전 조립 ($V1)"

# 라운지 안전장치: 서버 주소가 없으면(= 목업 모드) 라운지를 공개하지 않는다.
# 목업 모드로 공개되면 글이 각자 브라우저에만 저장돼 "서로 안 보이는 게시판"이 되기 때문.
LOUNGE_API="$(sed -n 's/.*<meta name="lounge-api" content="\([^"]*\)".*/\1/p' dashboard_v2/lounge.html)"
if [[ "$LOUNGE_API" =~ ^https://[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$ ]]; then
  echo "lounge: 공개 (서버 $LOUNGE_API)"
else
  rm -f "$OUT/lounge.html" "$OUT/lounge.css"
  rm -rf "$OUT/src/lounge"
  echo "lounge: 서버 주소 없음 → 라운지 제외(목업을 공개하지 않음)"
fi
echo "ok $OUT ($(du -sh "$OUT" | cut -f1))"
