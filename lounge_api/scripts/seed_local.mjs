// 로컬 D1 에 목업과 같은 예시 데이터를 넣는다. **--local 고정** — 라이브 DB 에는 절대 쓰지 않는다.
// 실행: node scripts/seed_local.mjs   (wrangler dev 가 떠 있어도 됨)
import { SEED } from '../../dashboard_v2/src/lounge/seed.js';
import { tierPositions } from '../../dashboard_v2/src/lounge/shared.js';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const d = SEED(Date.now());
const pad = (s) => s.replace(/[^0-9a-z]/g, '').padStart(12, '0').slice(-12);
const idOf = { post: (s) => 'p' + pad('seed' + s), tier: (s) => 't' + pad('seedtier' + s), team: (s) => 'm' + pad('seedteam' + s) };
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const threadOf = (t) => {
  const [k, ref] = t.split(':');
  return k === 'char' ? t : k === 'tier' ? 'tier:' + idOf.tier(ref) : 'team:' + idOf.team(ref);
};
const lines = ['DELETE FROM posts; DELETE FROM tiers; DELETE FROM tier_pos; DELETE FROM teams; DELETE FROM team_char; DELETE FROM idents; DELETE FROM thread_stats; DELETE FROM votes; DELETE FROM reports; DELETE FROM rate; DELETE FROM settings;'];
const SEAL = `pin_salt, pin_hash, ip_hash`;
const sealV = `'seed', 'x', 'seed'`;   // 예시 글은 비밀번호로 열 수 없다
const stats = new Map();
const bump = (th, at) => { const s = stats.get(th) || { count: 0, last: 0 }; s.count++; s.last = Math.max(s.last, at); stats.set(th, s); };
const idents = new Set();
for (const p of d.posts) {
  const th = threadOf(p.thread);
  lines.push(`INSERT INTO posts (id, thread, kind, parent, reply_to, anon, anon_no, body, tags, build, likes, dislikes, ${SEAL}, created_at) VALUES (${[
    idOf.post(p.id), th, th.split(':')[0], p.parent ? idOf.post(p.parent) : null, p.replyTo ?? null, p.anon, p.anonNo, p.body, JSON.stringify(p.tags || []), p.build, p.likes, p.dislikes].map(q).join(', ')}, ${sealV}, ${p.at});`);
  bump(th, p.at); idents.add(`${th}|${p.anon}|${p.anonNo}`);
}
for (const t of d.tiers) {
  const id = idOf.tier(t.id);
  lines.push(`INSERT INTO tiers (id, title, basis, rows, descr, anon, anon_no, build, likes, dislikes, ${SEAL}, created_at) VALUES (${[id, t.title, t.basis, JSON.stringify(t.rows), t.descr || '', t.anon, t.anonNo, t.build, t.likes, t.dislikes].map(q).join(', ')}, ${sealV}, ${t.at});`);
  for (const [cid, pos] of tierPositions(t.rows)) lines.push(`INSERT INTO tier_pos (tier_id, char_id, pos) VALUES (${q(id)}, ${cid}, ${pos});`);
  idents.add(`tier:${id}|${t.anon}|${t.anonNo}`);
}
for (const m of d.teams) {
  const id = idOf.team(m.id);
  lines.push(`INSERT INTO teams (id, code, ids, summary, title, basis, descr, anon, anon_no, build, likes, dislikes, ${SEAL}, created_at) VALUES (${[id, m.code, m.ids.join(','), JSON.stringify(m.summary), m.title, m.basis, m.descr || '', m.anon, m.anonNo, m.build, m.likes, m.dislikes].map(q).join(', ')}, ${sealV}, ${m.at});`);
  for (const cid of m.ids) lines.push(`INSERT INTO team_char (team_id, char_id) VALUES (${q(id)}, ${cid});`);
  idents.add(`team:${id}|${m.anon}|${m.anonNo}`);
}
for (const [th, s] of stats) lines.push(`INSERT INTO thread_stats (thread, count, last) VALUES (${q(th)}, ${s.count}, ${s.last});`);
for (const k of idents) { const [th, a, n] = k.split('|'); lines.push(`INSERT OR IGNORE INTO idents (thread, anon, anon_no) VALUES (${q(th)}, ${a}, ${n});`); }

const file = new URL('../.wrangler/seed_local.sql', import.meta.url);
writeFileSync(file, lines.join('\n'), 'utf8');
execSync('npx wrangler d1 execute xxl-lounge --local --file .wrangler/seed_local.sql', { stdio: 'inherit', cwd: new URL('..', import.meta.url), env: { ...process.env, CI: '1' } });
console.log(`seed ok: posts ${d.posts.length}, tiers ${d.tiers.length}, teams ${d.teams.length}`);
