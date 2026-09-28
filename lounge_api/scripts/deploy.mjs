// XXL 라운지 API 배포 — 이 PC 에서만 실행. 같은 명령을 여러 번 돌려도 안전(멱등).
//
//   node scripts/deploy.mjs --check    로그인 없이 점검만: 단위 검사 + 번들 빌드(dry-run) + 설정·비밀값 누출 검사
//   node scripts/deploy.mjs            실제 배포: (로그인 필요) D1 생성/재사용 → 스키마 → 배포+비밀값 → 상태 확인
//
// 비밀값은 저장소 밖 폴더(LOUNGE_SECRETS_DIR, 기본 C:/Users/ZRUN/Documents/secrets)에만 있다.
//  - lounge_pin_pepper.txt  : 비밀번호 해시 키. **한 번 만들면 절대 바꾸지 않는다**(바꾸면 모든 글의 비밀번호가 안 맞는다).
//  - lounge_admin_token.txt : 관리자 API 토큰.
//  - cloudflare_turnstile.txt 의 SECRET_KEY 줄 아래 값 : Turnstile 비밀키.
// 배포 때는 임시 JSON 을 비밀 폴더에 만들어 --secrets-file 로 올린 뒤 바로 지운다. 화면에는 비밀값을 출력하지 않는다.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SECRETS_DIR = process.env.LOUNGE_SECRETS_DIR || 'C:/Users/ZRUN/Documents/secrets';
const TOML = join(ROOT, 'wrangler.toml');
const STATE = join(ROOT, 'deploy_state.json');
const DB_NAME = 'xxl-lounge';
const PLACEHOLDER_DB = '00000000-0000-0000-0000-000000000000';
const CHECK_ONLY = process.argv.includes('--check');
const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const log = (...a) => console.log('•', ...a);
const die = (msg) => { console.error('✗', msg); process.exit(1); };
function wr(args, { input, quiet = false } = {}) {
  // 로컬 설치된 wrangler 를 node 로 직접 실행 — 셸을 거치지 않아 인자가 해석·주입될 여지가 없다.
  const out = execFileSync(process.execPath, [WRANGLER, ...args], { cwd: ROOT, input, encoding: 'utf8', env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' }, stdio: ['pipe', 'pipe', 'pipe'] });
  if (!quiet) process.stdout.write(out.split('\n').filter((l) => l.trim()).map((l) => '    ' + l).join('\n') + '\n');
  return out;
}

// ── 비밀값 ──────────────────────────────────────────────────────────────
function secretFile(name, { create }) {
  const p = join(SECRETS_DIR, name);
  if (existsSync(p)) {
    const v = readFileSync(p, 'utf8').trim();
    if (!/^[0-9a-f]{64}$/.test(v)) die(`${p} 형식이 이상합니다(64자리 hex 여야 함). 손으로 고치지 마세요.`);
    return v;
  }
  if (!create) return null;
  mkdirSync(SECRETS_DIR, { recursive: true });
  const v = randomBytes(32).toString('hex');
  writeFileSync(p, v + '\n', { mode: 0o600, flag: 'wx' });
  log(`새로 만듦: ${p}`);
  return v;
}
function turnstileSecret() {
  const p = join(SECRETS_DIR, 'cloudflare_turnstile.txt');
  if (!existsSync(p)) die(`${p} 가 없습니다.`);
  const lines = readFileSync(p, 'utf8').split(/\r?\n/);
  const i = lines.findIndex((l) => l.startsWith('SECRET_KEY'));
  const v = (lines[i + 1] || '').trim();
  if (!/^0x[0-9A-Za-z_-]{20,}$/.test(v)) die('Turnstile 비밀키를 읽지 못했습니다.');
  return v;
}

// ── 점검(로그인 불필요) ───────────────────────────────────────────────────
function preflight() {
  log('단위 검사');
  execFileSync('node', ['test/unit.mjs'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  const toml = readFileSync(TOML, 'utf8');
  const code = toml.split(/\r?\n/).filter((l) => !l.trim().startsWith('#')).join('\n');   // 주석 제외
  const origins = /^ALLOWED_ORIGINS\s*=\s*"([^"]*)"/m.exec(code)?.[1] ?? '';
  if (origins !== 'https://xxl-famido.github.io') die(`라이브 ALLOWED_ORIGINS 가 GitHub Pages 하나가 아닙니다: ${origins}`);
  if (/^\s*(RATE_SCALE|PIN_PEPPER|ADMIN_TOKEN|TURNSTILE_SECRET)\s*=/m.test(code)) die('wrangler.toml 에 비밀값·검사용 설정이 들어 있습니다.');
  if (!/workers_dev\s*=\s*true/.test(toml)) die('workers_dev = true 가 아닙니다.');
  log('번들 빌드(dry-run)');
  wr(['deploy', '--dry-run', '--outdir', '.wrangler/dryrun'], { quiet: true });
  const bundle = readFileSync(join(ROOT, '.wrangler/dryrun/index.js'), 'utf8');
  const devVars = existsSync(join(ROOT, '.dev.vars')) ? readFileSync(join(ROOT, '.dev.vars'), 'utf8') : '';
  const leaked = [...devVars.matchAll(/^(\w+)=(.{16,})$/gm)].filter(([, , v]) => bundle.includes(v.trim())).map(([, k]) => k);
  const realSecrets = [secretFile('lounge_pin_pepper.txt', { create: false }), secretFile('lounge_admin_token.txt', { create: false })].filter(Boolean);
  if (leaked.length || realSecrets.some((v) => bundle.includes(v))) die(`번들에 비밀값이 들어 있습니다: ${leaked.join(', ')}`);
  log(`번들 ${(bundle.length / 1024).toFixed(0)}KB, 비밀값 누출 없음`);
}

// ── 배포 ────────────────────────────────────────────────────────────────
function ensureDb() {
  let toml = readFileSync(TOML, 'utf8');
  const cur = /database_id\s*=\s*"([^"]+)"/.exec(toml)?.[1];
  if (cur && cur !== PLACEHOLDER_DB) { log(`D1 재사용: ${cur}`); return cur; }
  const list = JSON.parse(wr(['d1', 'list', '--json'], { quiet: true }));
  let id = list.find((d) => d.name === DB_NAME)?.uuid;
  if (id) log(`기존 D1 발견: ${id}`);
  else {
    log(`D1 생성: ${DB_NAME}`);
    const out = wr(['d1', 'create', DB_NAME]);
    id = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.exec(out)?.[0];
    if (!id) die('D1 ID 를 읽지 못했습니다. 위 출력을 확인하세요.');
  }
  toml = toml.replace(/database_id\s*=\s*"[^"]+"/, `database_id = "${id}"`);
  writeFileSync(TOML, toml);
  log('wrangler.toml 에 database_id 기록(비밀값 아님)');
  return id;
}

async function deploy() {
  try { JSON.parse(wr(['whoami', '--json'], { quiet: true })); } catch { die('로그인이 필요합니다: 대화창에 `! npx wrangler login` (PC 앞에서) 후 다시 실행.'); }
  preflight();
  const dbId = ensureDb();
  log('스키마 적용(원격)');
  wr(['d1', 'migrations', 'apply', DB_NAME, '--remote']);

  const secrets = {
    PIN_PEPPER: secretFile('lounge_pin_pepper.txt', { create: true }),
    ADMIN_TOKEN: secretFile('lounge_admin_token.txt', { create: true }),
    TURNSTILE_SECRET: turnstileSecret(),
  };
  const tmp = join(SECRETS_DIR, `.deploy_secrets_${process.pid}.json`);
  let out;
  try {
    writeFileSync(tmp, JSON.stringify(secrets), { mode: 0o600 });
    log('배포 + 비밀값 3개 업로드');
    out = wr(['deploy', '--secrets-file', tmp]);
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
  const url = /https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/.exec(out)?.[0];
  if (!url) die('배포 주소를 찾지 못했습니다. 위 출력을 확인하세요.');
  log(`주소: ${url}`);

  let health = null;
  for (let i = 0; i < 10 && !health; i++) {
    try { const r = await fetch(url + '/v1/health'); if (r.ok) health = await r.json(); } catch { /* 전파 대기 */ }
    if (!health) await new Promise((r) => setTimeout(r, 3000));
  }
  if (!health || !health.ok) die('상태 확인 실패. 잠시 후 브라우저로 /v1/health 를 열어 보세요.');
  log(`상태 확인 OK (빌드 ${health.build})`);

  writeFileSync(STATE, JSON.stringify({ url, database: DB_NAME, databaseId: dbId, deployedAt: new Date().toISOString(), build: health.build }, null, 2) + '\n');
  log(`기록: deploy_state.json`);
  console.log(`
완료. 다음 할 일
  1) Cloudflare 대시보드 → Manage Account → Billing → Payment Methods 가 여전히 비어 있는지 확인
  2) 라운지를 라이브에 열 때: node scripts/golive.mjs   (lounge.html 에 서버 주소 기입)
`);
}

if (CHECK_ONLY) { preflight(); log('점검 통과 — 로그인 후 `node scripts/deploy.mjs` 로 배포할 수 있습니다.'); }
else await deploy();
