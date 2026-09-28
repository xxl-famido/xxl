// 라이브 D1 백업 → 저장소 밖 비밀 폴더(lounge_backups/). 글 원문·비밀번호 해시가 들어 있으므로 저장소·클라우드에 올리지 않는다.
//   node scripts/backup.mjs            (로그인 필요)
//   node scripts/backup.mjs --local    로컬 DB
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SECRETS_DIR = process.env.LOUNGE_SECRETS_DIR || 'C:/Users/ZRUN/Documents/secrets';
const LOCAL = process.argv.includes('--local');
const dir = join(SECRETS_DIR, 'lounge_backups');
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
const out = join(dir, `xxl-lounge-${LOCAL ? 'local' : 'remote'}-${stamp}.sql`);
execFileSync(process.execPath, [join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'export', 'xxl-lounge', LOCAL ? '--local' : '--remote', '--output', out],
  { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' } });
console.log(`• 백업: ${out} (${(statSync(out).size / 1024).toFixed(1)}KB)`);
