/**
 * core/api.js — 엔진 브릿지 (v1 app.js L11-39 이식).
 *
 * v2 로컬 개발 서버(server_v2.py, 8778)는 fetch(/api/*), 그 밖(GitHub Pages 등 정적)은 Pyodide 워커
 * (sim-worker.js). v1은 8777에서 fetch였다 — v2는 **8778** 기준이다.
 * 워커의 진행 메시지는 DOM에 쓰지 않고 `onProgress(fn)`로 흘린다(로딩 모션이 받는다).
 *
 *   const api = createApi();                  // 브라우저 기본
 *   const api = createApi({ mode: 'fetch', fetch: myFetch, base: 'http://localhost:8778' });   // 테스트·주입
 *   api.onProgress(p => …)   // p = { stage: 'runtime'|'engine'|'ready'|'fatal', msg, ratio(0~1 추정), error? }
 */

export const FETCH_PORT = '8778';
/** 워커 단계 → 진행률 추정(워커는 비율을 주지 않는다 — 단계 순서로 근사). */
const STAGES = [
  { stage: 'runtime', ratio: 0.1 },    // 'Python 런타임 다운로드…'
  { stage: 'engine', ratio: 0.6 },     // '엔진·데이터 불러오는 중…'
];

export function createApi(opts = {}) {
  const g = globalThis;
  const port = opts.port ?? (g.location ? g.location.port : '');
  const mode = opts.mode || (port === FETCH_PORT ? 'fetch' : 'worker');
  const listeners = new Set();
  let last = null;
  const emit = (p) => { last = p; listeners.forEach((fn) => { try { fn(p); } catch { /* 구독자 오류는 브릿지를 멈추지 않는다 */ } }); };
  const onProgress = (fn) => { listeners.add(fn); if (last) { try { fn(last); } catch { /* noop */ } } return () => listeners.delete(fn); };

  if (mode === 'fetch') {
    const f = opts.fetch || g.fetch.bind(g);
    const base = opts.base || '';
    // v1과 같이 상태 코드와 무관하게 JSON을 읽는다 — 엔진 오류는 { error } 본문으로 온다(호출부가 data.error 확인).
    const json = async (r) => {
      try { return await r.json(); } catch { throw new Error(`HTTP ${r.status}`); }
    };
    const post = (path, cfg) => f(base + path, { method: 'POST', body: JSON.stringify(cfg) }).then(json);
    const ready = Promise.resolve();
    emit({ stage: 'ready', msg: '', ratio: 1 });
    return {
      mode, ready, onProgress,
      chars: () => f(base + '/api/chars').then(json),
      char: (id) => f(base + '/api/char/' + id).then(json),
      simulate: (cfg) => post('/api/simulate', cfg),
      probe: (cfg) => post('/api/probe', cfg),
      dispose() { listeners.clear(); },
    };
  }

  const WorkerCtor = opts.Worker || g.Worker;
  const w = new WorkerCtor(opts.workerUrl || 'sim-worker.js');
  let seq = 0, stageIdx = 0;
  const cbs = new Map();
  let readyRes, readyRej;
  const ready = new Promise((res, rej) => { readyRes = res; readyRej = rej; });
  ready.catch(() => {});                     // 거부는 호출부(call/부트 화면)가 받는다 — 미처리 경고 방지
  w.onmessage = (e) => {
    const d = e.data || {};
    if (d.type === 'progress') {
      const s = STAGES[Math.min(stageIdx++, STAGES.length - 1)];
      emit({ stage: s.stage, msg: d.msg || '', ratio: s.ratio });
      return;
    }
    if (d.type === 'ready') { emit({ stage: 'ready', msg: '', ratio: 1 }); readyRes(); return; }
    if (d.type === 'fatal') {
      emit({ stage: 'fatal', msg: '', ratio: last ? last.ratio : 0, error: d.error });
      readyRej(new Error(d.error));
      return;
    }
    const cb = cbs.get(d.id);
    if (cb) { cbs.delete(d.id); cb(d); }
  };
  w.onerror = (e) => {
    const msg = (e && e.message) || 'worker error';
    emit({ stage: 'fatal', msg: '', ratio: last ? last.ratio : 0, error: msg });
    readyRej(new Error(msg));
    cbs.forEach((cb) => cb({ ok: false, error: msg }));
    cbs.clear();
  };
  const call = (type, payload) => ready.then(() => new Promise((res, rej) => {
    const id = ++seq;
    cbs.set(id, (d) => {
      if (!d.ok) return rej(new Error(d.error));
      try { res(JSON.parse(d.result)); } catch (err) { rej(err); }
    });
    w.postMessage({ id, type, payload });
  }));
  return {
    mode, ready, onProgress,
    chars: () => call('chars'),
    char: (id) => call('char', id),
    simulate: (cfg) => call('simulate', JSON.stringify(cfg)),
    probe: (cfg) => call('probe', JSON.stringify(cfg)),
    dispose() { listeners.clear(); cbs.clear(); w.terminate && w.terminate(); },
  };
}
