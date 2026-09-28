/**
 * teamcode.js — 공유 코드를 서버에서 다시 읽어 동료 목록·요약을 **서버가** 정한다(클라이언트가 보낸 목록은 믿지 않음).
 * 시뮬과 같은 코덱(dashboard_v2/src/core/codec.js)의 unpackRecords 를 쓰되, 압축 해제는 크기 상한을 둔 자체 구현을 쓴다
 * — 작은 코드가 거대하게 풀리는 압축 폭탄으로 CPU·메모리를 쓰게 하는 공격 방지.
 */
import { unpackRecords, b64urlToBytes } from '../../dashboard_v2/src/core/codec.js';
import { LIMITS, summarizeSnap, teamIdsOf } from '../../dashboard_v2/src/lounge/shared.js';
import { HttpError, E } from './security.js';

const MAX_INFLATED_BYTES = 256 * 1024;

async function inflateBounded(bytes) {
  const ds = new DecompressionStream('deflate');
  const w = ds.writable.getWriter();
  w.write(bytes).catch(() => {});
  w.close().catch(() => {});
  const r = ds.readable.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_INFLATED_BYTES) { await r.cancel().catch(() => {}); throw E(400, 'codeTooBig'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return new TextDecoder().decode(out);
}

/** → { code, ids, summary }. validIds: 라운지에 있는 동료 ID 집합. */
export async function readTeamCode(raw, validIds) {
  const code = typeof raw === 'string' ? raw.trim() : '';
  if (!code) throw E(400, 'codeEmpty');
  if (code.length > LIMITS.code || !/^[#$*][A-Za-z0-9_-]+$/.test(code)) throw E(400, 'codeBad');
  let recs;
  try {
    const json = await inflateBounded(b64urlToBytes(code.slice(1)));
    const parsed = JSON.parse(json);
    recs = code[0] === '*' ? parsed : unpackRecords(parsed, code[0] === '$');
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw E(400, 'codeBad');
  }
  const snap = Array.isArray(recs) && recs[0] && recs[0].snap;
  const ids = teamIdsOf(snap);
  if (!ids.length) throw E(400, 'codeNoChars');
  if (new Set(ids).size !== ids.length || ids.some((id) => !validIds.has(id))) throw E(400, 'codeUnknown');
  return { code, ids, summary: summarizeSnap(snap) };
}
