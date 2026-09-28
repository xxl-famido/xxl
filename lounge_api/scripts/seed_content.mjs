// 운영자가 고른 초기 글(의견·답글·티어표·팀)을 DB 에 넣는다.
//   node scripts/seed_content.mjs --local     로컬 DB 에 넣어 화면으로 미리보기 (lounge.html?api=http://127.0.0.1:8787)
//   node scripts/seed_content.mjs --remote    라이브 DB 에 넣기 (사용자 확인 후)
//   node scripts/seed_content.mjs --check     내용 검사만(넣지 않음)
//
// 내용 파일: C:/Users/ZRUN/Documents/secrets/lounge_initial_content.json (비밀번호가 들어 있어 저장소 밖)
// 형식은 lounge_api/content/initial_content.example.json 참고.
// 여기서 넣는 글은 전부 운영자 글('파미도', op=1) — 화면 운영자 모드로 쓴 글과 같다.
// 서버 API 와 같은 규칙으로 검사하고(글자 수·태그·동료·코드), 비밀번호는 서버와 같은 방식(HMAC+pepper)으로 해시해 넣는다
// → 나중에 화면에서 그 비밀번호로 수정·삭제·이어 쓰기가 된다.
// 같은 파일을 두 번 넣지 않도록, 넣은 글에는 content 파일의 key 가 기록되고 이미 있는 key 는 건너뛴다.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomBytes, randomInt } from 'node:crypto';
import charsJson from '../../data/chars.json' with { type: 'json' };
import { LIMITS, POST_TAGS, TIER_BASIS, TEAM_BASIS, CURRENT_BUILD, OPERATOR, isPin, tierPositions } from '../../dashboard_v2/src/lounge/shared.js';
import { readTeamCode } from '../src/teamcode.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SECRETS_DIR = process.env.LOUNGE_SECRETS_DIR || 'C:/Users/ZRUN/Documents/secrets';
const CONTENT = process.env.LOUNGE_CONTENT || join(SECRETS_DIR, 'lounge_initial_content.json');
const MODE = process.argv.includes('--remote') ? 'remote' : process.argv.includes('--local') ? 'local' : 'check';
const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const CHAR_IDS = Object.keys(charsJson).map(Number);
const CHAR_SET = new Set(CHAR_IDS);
const die = (m) => { console.error('✗', m); process.exit(1); };

function pepper() {
  if (MODE === 'local') return (/^PIN_PEPPER=(.+)$/m.exec(readFileSync(join(ROOT, '.dev.vars'), 'utf8')) || [])[1]?.trim();
  const p = join(SECRETS_DIR, 'lounge_pin_pepper.txt');
  if (!existsSync(p)) die('lounge_pin_pepper.txt 가 없습니다(라이브 배포 전).');
  return readFileSync(p, 'utf8').trim();
}
const hmac = (key, msg) => createHmac('sha256', key).update(msg).digest('hex');
const rid = (prefix) => prefix + [...randomBytes(12)].map((b) => (b % 36).toString(36)).join('');
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
function clean(v, max, name, required = true) {
  const s = (typeof v === 'string' ? v : '').replace(/\r\n?/g, '\n').trim();
  if (required && !s) die(`${name}: 비어 있습니다.`);
  if (s.length > max) die(`${name}: ${max}자를 넘습니다(${s.length}자).`);
  return s;
}
function wr(args) {
  return execFileSync(process.execPath, [WRANGLER, ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
}
function query(sql) {
  const out = wr(['d1', 'execute', 'xxl-lounge', `--${MODE}`, '--json', '--command', sql]);
  return JSON.parse(out)[0].results;
}

if (!existsSync(CONTENT)) die(`내용 파일이 없습니다: ${CONTENT}\n  예시: lounge_api/content/initial_content.example.json 을 복사해 채우세요.`);
const c = JSON.parse(readFileSync(CONTENT, 'utf8'));
if (!isPin(c.pin)) die('pin: 숫자 4자리여야 합니다(모든 글 공통 — 나중에 화면에서 수정·삭제할 때 씀).');
const now = Date.now();
const H = 3.6e6;
const atOf = (x, i) => Math.round(now - (Number.isFinite(+x.hoursAgo) ? +x.hoursAgo : (1 + i * 0.3)) * H);

// ── 검사 + 행 만들기 ─────────────────────────────────────────────────────
const plan = { posts: [], tiers: [], teams: [] };
const keys = new Set();
const needKey = (x, where) => {
  if (typeof x.key !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(x.key)) die(`${where}: key 는 영소문자·숫자·_- 1~40자(중복 방지용 이름)`);
  if (keys.has(x.key)) die(`${where}: key "${x.key}" 가 중복됩니다.`);
  keys.add(x.key);
};
const threadOfRef = (ref) => {
  if (/^char:\d{5}$/.test(ref)) { if (!CHAR_SET.has(+ref.slice(5))) die(`없는 동료: ${ref}`); return ref; }
  const m = /^(tier|team):([a-z0-9_-]+)$/.exec(ref || '');
  if (!m) die(`thread 형식: char:10441 | tier:<티어표 key> | team:<팀 key> (${ref})`);
  return ref;   // key 참조 — 아래에서 실제 id 로 바꾼다
};

(c.tiers || []).forEach((t, i) => {
  const w = `tiers[${i}]`; needKey(t, w);
  const title = clean(t.title, LIMITS.title, `${w}.title`);
  if (!TIER_BASIS.some((b) => b.key === t.basis)) die(`${w}.basis: ${TIER_BASIS.map((b) => b.key).join('|')}`);
  if (!Array.isArray(t.rows) || t.rows.length < 2 || t.rows.length > LIMITS.tierRows) die(`${w}.rows: 2~8행`);
  const seen = new Set();
  const rows = t.rows.map((r, k) => {
    const label = clean(r.label, LIMITS.tierLabel, `${w}.rows[${k}].label`, false) || '-';
    const ids = (r.ids || []).map(Number);
    ids.forEach((id) => { if (!CHAR_SET.has(id) || seen.has(id)) die(`${w}.rows[${k}]: 잘못되거나 중복된 동료 ${id}`); seen.add(id); });
    return { label, ids };
  });
  if (!seen.size) die(`${w}: 동료가 한 명도 없습니다.`);
  plan.tiers.push({ key: t.key, id: rid('t'), title, basis: t.basis, rows, descr: clean(t.descr, LIMITS.tierDesc, `${w}.descr`, false), at: atOf(t, i) });
});
for (const [i, t] of (c.teams || []).entries()) {
  const w = `teams[${i}]`; needKey(t, w);
  let r;
  try { r = await readTeamCode(t.code, CHAR_SET); } catch (e) { die(`${w}.code: ${e.message}`); }
  if (!TEAM_BASIS.some((b) => b.key === t.basis)) die(`${w}.basis: ${TEAM_BASIS.map((b) => b.key).join('|')}`);
  plan.teams.push({ key: t.key, id: rid('m'), code: r.code, ids: r.ids, summary: r.summary, title: clean(t.title, LIMITS.title, `${w}.title`), basis: t.basis, descr: clean(t.descr, LIMITS.teamDesc, `${w}.descr`, false), at: atOf(t, i) });
}
const refId = (ref) => {
  const [k, v] = ref.split(':');
  if (k === 'char') return ref;
  const hit = (k === 'tier' ? plan.tiers : plan.teams).find((x) => x.key === v);
  if (!hit) die(`${ref}: 같은 파일에 그 key 의 ${k === 'tier' ? '티어표' : '팀'}이 없습니다.`);
  return `${k}:${hit.id}`;
};
(c.posts || []).forEach((p, i) => {
  const w = `posts[${i}]`; needKey(p, w);
  const thread = refId(threadOfRef(p.thread));
  const body = clean(p.body, LIMITS.post, `${w}.body`);
  const isChar = thread.startsWith('char:');
  const tags = (p.tags || []).filter((x) => POST_TAGS.includes(x)).slice(0, LIMITS.tags);
  if ((p.tags || []).length !== tags.length) die(`${w}.tags: ${POST_TAGS.join(', ')} 중 최대 ${LIMITS.tags}개`);
  const replies = (p.replies || []).map((r, k) => ({ body: clean(r.body, LIMITS.post, `${w}.replies[${k}].body`), at: atOf(r, i) + (k + 1) * 60000 }));
  plan.posts.push({ key: p.key, thread, kind: thread.split(':')[0], body, tags: isChar ? tags : [], at: atOf(p, i), replies });
});
console.log(`• 검사 통과: 의견 ${plan.posts.length} (답글 ${plan.posts.reduce((s, p) => s + p.replies.length, 0)}), 티어표 ${plan.tiers.length}, 팀 ${plan.teams.length}`);
if (MODE === 'check') process.exit(0);

// ── 이미 넣은 key 건너뛰기 (key 는 ip_hash 자리에 'seed:<key>' 로 기록 — 응답에는 나가지 않는 칸) ──
const existing = new Set(query("SELECT ip_hash FROM posts WHERE ip_hash LIKE 'seed:%' UNION SELECT ip_hash FROM tiers WHERE ip_hash LIKE 'seed:%' UNION SELECT ip_hash FROM teams WHERE ip_hash LIKE 'seed:%'").map((r) => r.ip_hash.slice(5)));
const codeTaken = new Set(query('SELECT code FROM teams').map((r) => r.code));
const PEP = pepper();
if (!PEP || PEP.length < 16) die('pepper 를 읽지 못했습니다.');
const pinCols = () => { const salt = [...randomBytes(16)].map((b) => (b % 36).toString(36)).join(''); return { salt, hash: hmac(PEP, `pin:${salt}:${c.pin}`) }; };

// 운영자 이름(파미도) 고정. idents 에는 기록하지 않는다(익명 뽑기 후보에서 이미 빠져 있음).
const pick = () => ({ anon: OPERATOR.anon, no: 1, sql: '' });

const sql = [];
const stats = new Map();
const bump = (th, at) => { const s = stats.get(th) || { n: 0, last: 0 }; s.n++; s.last = Math.max(s.last, at); stats.set(th, s); };
let skipped = 0;
for (const t of plan.tiers) {
  if (existing.has(t.key)) { skipped++; const row = query(`SELECT id FROM tiers WHERE ip_hash = ${q('seed:' + t.key)}`)[0]; t.id = row.id; continue; }
  const who = pick('tier:' + t.id); const pin = pinCols();
  sql.push(`INSERT INTO tiers (id, title, basis, rows, descr, anon, anon_no, build, pin_salt, pin_hash, ip_hash, created_at, op) VALUES (${[t.id, t.title, t.basis, JSON.stringify(t.rows), t.descr, who.anon, who.no, CURRENT_BUILD, pin.salt, pin.hash, 'seed:' + t.key].map(q).join(', ')}, ${t.at}, 1);`);
  for (const [cid, pos] of tierPositions(t.rows)) sql.push(`INSERT INTO tier_pos (tier_id, char_id, pos) VALUES (${q(t.id)}, ${cid}, ${pos});`);
}
for (const m of plan.teams) {
  if (existing.has(m.key)) { skipped++; const row = query(`SELECT id FROM teams WHERE ip_hash = ${q('seed:' + m.key)}`)[0]; m.id = row.id; continue; }
  if (codeTaken.has(m.code)) die(`teams "${m.key}": 이 공유 코드는 이미 올라가 있습니다.`);
  const who = pick('team:' + m.id); const pin = pinCols();
  sql.push(`INSERT INTO teams (id, code, ids, summary, title, basis, descr, anon, anon_no, build, pin_salt, pin_hash, ip_hash, created_at, op) VALUES (${[m.id, m.code, m.ids.join(','), JSON.stringify(m.summary), m.title, m.basis, m.descr, who.anon, who.no, CURRENT_BUILD, pin.salt, pin.hash, 'seed:' + m.key].map(q).join(', ')}, ${m.at}, 1);`);
  for (const cid of m.ids) sql.push(`INSERT OR IGNORE INTO team_char (team_id, char_id) VALUES (${q(m.id)}, ${cid});`);
}
for (const p of plan.posts) {
  if (existing.has(p.key)) { skipped++; continue; }
  const thread = p.thread.replace(/^(tier|team):([a-z0-9_-]+)$/, (all, k, v) => { const hit = (k === 'tier' ? plan.tiers : plan.teams).find((x) => x.key === v || x.id === v); return hit ? `${k}:${hit.id}` : all; });
  const who = pick(thread); const pin = pinCols();
  const id = rid('p');
  sql.push(`INSERT INTO posts (id, thread, kind, parent, reply_to, anon, anon_no, body, tags, build, pin_salt, pin_hash, ip_hash, created_at, op) VALUES (${[id, thread, p.kind, null, null, who.anon, who.no, p.body, JSON.stringify(p.tags), CURRENT_BUILD, pin.salt, pin.hash, 'seed:' + p.key].map(q).join(', ')}, ${p.at}, 1);`);
  bump(thread, p.at);
  for (const r of p.replies) {   // 답글은 같은 사람이 이어 쓴 것처럼 같은 이름
    const rp = pinCols();
    sql.push(`INSERT INTO posts (id, thread, kind, parent, reply_to, anon, anon_no, body, tags, build, pin_salt, pin_hash, ip_hash, created_at, op) VALUES (${[rid('p'), thread, p.kind, id, null, who.anon, who.no, r.body, '[]', CURRENT_BUILD, rp.salt, rp.hash, 'seed-reply:' + p.key].map(q).join(', ')}, ${r.at}, 1);`);
    bump(thread, r.at);
  }
}
for (const [th, s] of stats) sql.push(`INSERT INTO thread_stats (thread, count, last) VALUES (${q(th)}, ${s.n}, ${s.last}) ON CONFLICT(thread) DO UPDATE SET count = count + ${s.n}, last = MAX(last, ${s.last});`);

if (!sql.length) { console.log(`• 넣을 것이 없습니다(이미 들어간 key ${skipped}개).`); process.exit(0); }
const tmp = join(SECRETS_DIR, `.seed_${process.pid}.sql`);
try {
  writeFileSync(tmp, sql.join('\n'), { mode: 0o600 });
  wr(['d1', 'execute', 'xxl-lounge', `--${MODE}`, '--file', tmp]);
} finally { if (existsSync(tmp)) unlinkSync(tmp); }
console.log(`• ${MODE === 'remote' ? '라이브' : '로컬'} DB 에 넣음 (건너뜀 ${skipped}). 비밀번호 ${'*'.repeat(4)} 로 화면에서 수정·삭제·이어 쓰기 가능.`);
