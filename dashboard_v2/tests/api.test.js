/** core/api.js — 8778 이면 fetch, 아니면 워커. 워커 progress 는 onProgress 로(가짜 fetch·Worker). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/core/api.js';

test('fetch 모드: 포트 8778 → /api/* (엔진 오류 본문도 그대로 돌려준다)', async () => {
  const seen = [];
  const fetch = async (url, o) => { seen.push([url, o && o.method, o && o.body]); return { ok: !url.endsWith('simulate'), status: 500, json: async () => (url.endsWith('simulate') ? { error: 'boom' } : [{ id: 1 }]) }; };
  const api = createApi({ port: '8778', fetch });
  assert.equal(api.mode, 'fetch');
  const prog = [];
  api.onProgress((p) => prog.push(p.stage));
  assert.deepEqual(prog, ['ready']);
  assert.deepEqual(await api.chars(), [{ id: 1 }]);
  assert.deepEqual(await api.simulate({ turns: 3 }), { error: 'boom' });
  await api.probe({ a: 1 });
  await api.char(10401);
  assert.deepEqual(seen.map((s) => s[0]), ['/api/chars', '/api/simulate', '/api/probe', '/api/char/10401']);
  assert.equal(seen[1][1], 'POST');
  assert.equal(seen[1][2], JSON.stringify({ turns: 3 }));
});

test('워커 모드: progress → onProgress(단계·추정 비율), ready 뒤 요청, 오류 전달', async () => {
  let inst;
  class FakeWorker {
    constructor(url) { this.url = url; inst = this; this.sent = []; }
    postMessage(m) {
      this.sent.push(m);
      setTimeout(() => this.onmessage({ data: m.type === 'probe' ? { id: m.id, ok: false, error: 'nope' } : { id: m.id, ok: true, result: JSON.stringify({ t: m.type, p: m.payload }) } }), 0);
    }
    terminate() {}
  }
  const api = createApi({ port: '', Worker: FakeWorker });
  assert.equal(api.mode, 'worker');
  assert.equal(inst.url, 'sim-worker.js');
  const prog = [];
  api.onProgress((p) => prog.push(`${p.stage}:${p.ratio}`));
  const pending = api.simulate({ x: 1 });
  inst.onmessage({ data: { type: 'progress', msg: 'Python 런타임 다운로드…' } });
  inst.onmessage({ data: { type: 'progress', msg: '엔진·데이터 불러오는 중…' } });
  assert.equal(inst.sent.length, 0, 'ready 전에는 보내지 않는다');
  inst.onmessage({ data: { type: 'ready' } });
  assert.deepEqual(await pending, { t: 'simulate', p: JSON.stringify({ x: 1 }) });
  assert.deepEqual(prog, ['runtime:0.1', 'engine:0.6', 'ready:1']);
  await assert.rejects(api.probe({}), /nope/);
});

test('워커 모드: fatal → ready 거부 + onProgress fatal', async () => {
  let inst;
  class W { constructor() { inst = this; } postMessage() {} }
  const api = createApi({ port: '8777', Worker: W });
  const prog = [];
  api.onProgress((p) => prog.push(p.stage));
  const call = api.chars();
  inst.onmessage({ data: { type: 'fatal', error: 'pyodide 실패' } });
  await assert.rejects(call, /pyodide 실패/);
  assert.deepEqual(prog, ['fatal']);
});
