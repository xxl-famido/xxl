// 지난 버전 고정본(tier_frozen) 되살리기 — 고정 기능(migration 0011) 전에 수정으로 지난 버전 상태가 사라진 티어표를 백업에서 넣는다.
//   node scripts/freeze_restore.mjs --build 2.0 --from <백업.sql> --ids t…,t… [--from <백업.sql> --ids …] [--remote] [--dry]
// 백업 파일은 scripts/backup.mjs 가 만든 것(비밀 폴더 lounge_backups/). 글 내용이 들어가므로 만든 SQL 도 비밀 폴더에 두고 실행 뒤 지운다.
// 안전장치: 백업 상태에 그 버전 뒤에 들어온 동료가 있으면 거부, 지금 DB 에서 아직 그 버전인 티어표는 거부(같은 티어표를 두 번 세지 않게).
// 같은 (티어표, 버전) 고정본이 이미 있으면 그대로 둔다(INSERT OR IGNORE) — 여러 번 돌려도 안전.
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tierPositions, BUILDS, CHAR_SINCE, buildRank } from '../../dashboard_v2/src/lounge/shared.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SECRETS_DIR = process.env.LOUNGE_SECRETS_DIR || 'C:/Users/ZRUN/Documents/secrets';
const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const RE_TIER = /^t[0-9a-z]{12}$/;
const die = (msg) => { console.error('✗', msg); process.exit(1); };

const args = process.argv.slice(2);
const where = args.includes('--remote') ? '--remote' : '--local';
const DRY = args.includes('--dry');
const build = args[args.indexOf('--build') + 1];
if (!args.includes('--build') || !BUILDS.includes(build) || build === BUILDS[BUILDS.length - 1]) die(`--build 는 지난 라운지 버전(${BUILDS.slice(0, -1).join(', ')}) 중 하나`);
const jobs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--from') continue;
  if (args[i + 2] !== '--ids') die('--from <백업> 다음에는 --ids 가 와야 합니다');
  const ids = (args[i + 3] || '').split(',').filter(Boolean);
  if (!ids.length || !ids.every((id) => RE_TIER.test(id))) die(`티어표 ID 형식이 이상합니다: ${args[i + 3]}`);
  jobs.push({ file: resolve(args[i + 1]), ids });
}
if (!jobs.length) die('--from <백업> --ids <ID,…> 가 필요합니다');

function wr(wrArgs) {
  return execFileSync(process.execPath, [WRANGLER, ...wrArgs], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'inherit'] });
}
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

// 지금 DB 의 버전 — 아직 그 버전인 티어표는 고정본이 필요 없다(있으면 두 번 센다)
const allIds = jobs.flatMap((j) => j.ids);
const nowRows = JSON.parse(wr(['d1', 'execute', 'xxl-lounge', where, '--json', '--command', `SELECT id, build, status FROM tiers WHERE id IN (${allIds.map(q).join(',')})`]))[0].results;
const nowOf = new Map(nowRows.map((r) => [r.id, r]));

const lines = [];
const now = Date.now();
for (const { file, ids } of jobs) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(file, 'utf8'));
  for (const id of ids) {
    const row = db.prepare('SELECT * FROM tiers WHERE id = ?').get(id);
    if (!row) die(`${file} 에 ${id} 가 없습니다`);
    const rows = JSON.parse(row.rows);
    const late = rows.flatMap((r) => r.ids).filter((cid) => CHAR_SINCE[cid] && buildRank(CHAR_SINCE[cid]) > buildRank(build));
    if (late.length) die(`${id}: 백업 상태에 ${build} 뒤에 들어온 동료가 있습니다(${late.join(', ')}) — ${build} 상태가 아닙니다`);
    const cur = nowOf.get(id);
    if (cur && cur.build === build) die(`${id}: 지금도 ${build} 티어표라 고정본이 필요 없습니다`);
    console.log(`• ${id} ← ${file.split(/[\\/]/).pop()} (수정 ${row.edited_at ? new Date(row.edited_at).toISOString() : '-'}, 동료 ${rows.flatMap((r) => r.ids).length}명) · 지금 ${cur ? `${cur.build}/${cur.status}` : '지워짐'}`);
    lines.push(`INSERT OR IGNORE INTO tier_frozen (tier_id, build, title, basis, rows, descr, fun, anon, anon_no, op, created_at, edited_at, frozen_at) VALUES (${[
      id, build, row.title, row.basis, row.rows, row.descr || '', row.fun ? 1 : 0, row.anon, row.anon_no, row.op ? 1 : 0, row.created_at, row.edited_at ?? null, now].map(q).join(', ')});`);
    for (const [cid, pos] of tierPositions(rows)) lines.push(`INSERT OR IGNORE INTO tier_frozen_pos (tier_id, build, char_id, pos) VALUES (${q(id)}, ${q(build)}, ${cid}, ${pos});`);
  }
}
if (DRY) { console.log(`• --dry: 문장 ${lines.length}개, 실행 안 함`); process.exit(0); }
mkdirSync(SECRETS_DIR, { recursive: true });
const sqlFile = join(SECRETS_DIR, `lounge_freeze_restore_${now}.sql`);
writeFileSync(sqlFile, lines.join('\n') + '\n', { encoding: 'utf8', mode: 0o600 });
try {
  wr(['d1', 'execute', 'xxl-lounge', where, '--file', sqlFile]);
} finally {
  unlinkSync(sqlFile);
}
const n = JSON.parse(wr(['d1', 'execute', 'xxl-lounge', where, '--json', '--command', `SELECT COUNT(*) AS n FROM tier_frozen WHERE build = ${q(build)}`]))[0].results[0].n;
console.log(`• 완료(${where.slice(2)}): ${build} 고정본 ${n}개`);
