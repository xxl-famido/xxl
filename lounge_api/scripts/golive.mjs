// 라운지 화면을 라이브 서버에 연결(또는 해제). lounge.html 의 <meta name="lounge-api"> 한 줄만 바꾼다.
//   node scripts/golive.mjs          deploy_state.json 의 주소를 넣는다(라이브 서버 health 확인 후)
//   node scripts/golive.mjs --off    비운다(목업으로 되돌림)
// 이 스크립트는 파일만 바꾼다. GitHub 에 올리는 것(= 실제 공개)은 사람이 확인하고 따로 한다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HTML = fileURLToPath(new URL('../../dashboard_v2/lounge.html', import.meta.url));
const OFF = process.argv.includes('--off');
const die = (m) => { console.error('✗', m); process.exit(1); };

let url = '';
if (!OFF) {
  const st = `${ROOT}/deploy_state.json`;
  if (!existsSync(st)) die('deploy_state.json 이 없습니다. 먼저 node scripts/deploy.mjs 로 배포하세요.');
  url = JSON.parse(readFileSync(st, 'utf8')).url;
  if (!/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(url || '')) die(`주소 형식이 이상합니다: ${url}`);
  const r = await fetch(url + '/v1/health').catch(() => null);
  if (!r || !r.ok) die(`라이브 서버 상태 확인 실패: ${url}/v1/health`);
}
const html = readFileSync(HTML, 'utf8');
const re = /<meta name="lounge-api" content="[^"]*">/;
if (!re.test(html)) die('lounge.html 에 lounge-api meta 가 없습니다.');
writeFileSync(HTML, html.replace(re, `<meta name="lounge-api" content="${url}">`));
console.log(OFF ? '• lounge.html → 목업 모드(서버 주소 비움)' : `• lounge.html → ${url}`);
console.log('  공개하려면: 로컬 확인 → 커밋 → main push (GitHub Pages 배포). 사람이 직접 확인 후 진행.');
