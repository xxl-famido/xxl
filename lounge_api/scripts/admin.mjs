// 관리자 도구(이 PC 전용). 토큰은 비밀 폴더 파일에서 읽고 화면에 출력하지 않는다.
//   node scripts/admin.mjs reports               신고 목록
//   node scripts/admin.mjs hide  post:p…          숨김 (show 로 되돌림)
//   node scripts/admin.mjs delete post:p…         삭제(답글 있으면 자리만 남김, 티어표·팀은 딸린 의견까지)
//   node scripts/admin.mjs pin   post:p…          스레드 맨 위 고정(발광 강조, 운영자만 수정·삭제) — unpin 으로 해제
//   node scripts/admin.mjs lock | unlock          글쓰기 잠시 닫기 / 열기 (스팸 공격 시)
//   node scripts/admin.mjs health
//   --local 을 붙이면 로컬 wrangler dev(127.0.0.1:8787, .dev.vars 토큰)에 대고 실행.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SECRETS_DIR = process.env.LOUNGE_SECRETS_DIR || 'C:/Users/ZRUN/Documents/secrets';
const args = process.argv.slice(2).filter((a) => a !== '--local');
const LOCAL = process.argv.includes('--local');
const [cmd, target] = args;
const die = (m) => { console.error('✗', m); process.exit(1); };

let base, token;
if (LOCAL) {
  base = 'http://127.0.0.1:8787';
  token = (/^ADMIN_TOKEN=(.+)$/m.exec(readFileSync(`${ROOT}/.dev.vars`, 'utf8')) || [])[1]?.trim();
} else {
  const st = `${ROOT}/deploy_state.json`;
  if (!existsSync(st)) die('deploy_state.json 이 없습니다(아직 배포 전). 로컬이면 --local.');
  base = JSON.parse(readFileSync(st, 'utf8')).url;
  const tf = `${SECRETS_DIR}/lounge_admin_token.txt`;
  if (!existsSync(tf)) die(`${tf} 가 없습니다.`);
  token = readFileSync(tf, 'utf8').trim();
}
if (!token) die('관리자 토큰을 읽지 못했습니다.');

async function call(method, path, body) {
  const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'text/plain' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) die(`${r.status} ${data.error || ''}`);
  return data;
}
const needTarget = () => { if (!/^(post|tier|team):[ptm][0-9a-z]{12}$/.test(target || '')) die('대상 형식: post:p… | tier:t… | team:m…'); };

switch (cmd) {
  case 'health': console.log(await (await fetch(base + '/v1/health')).json()); break;
  case 'reports': {
    const list = await call('GET', '/v1/admin/reports');
    if (!list.length) console.log('신고 없음');
    for (const g of list) console.log(`${g.target}  신고 ${g.count}  [${g.status}]  ${new Date(g.last).toLocaleString('ko-KR')}\n    ${g.preview.replace(/\n/g, ' ')}\n    사유: ${g.reasons.join(' / ') || '-'}`);
    break;
  }
  case 'hide': case 'show': case 'delete': case 'pin': case 'unpin': needTarget(); console.log(await call('POST', '/v1/admin/moderate', { target, action: cmd })); break;
  case 'lock': case 'unlock': console.log(await call('POST', '/v1/admin/lock', { on: cmd === 'lock' })); break;
  default: die('명령: reports | hide|show|delete|pin|unpin <대상> | lock | unlock | health  (--local)');
}
