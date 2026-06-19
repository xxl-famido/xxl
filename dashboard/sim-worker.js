// Web Worker: GitHub Pages(정적)에서 Python 시뮬 엔진을 브라우저 안에서 실행한다.
// 메인 스레드(app.js)가 chars/char/simulate 메시지를 보내면 Pyodide로 처리해 JSON으로 돌려준다.
const PYODIDE_VER = 'v0.26.4';
importScripts(`https://cdn.jsdelivr.net/pyodide/${PYODIDE_VER}/full/pyodide.js`);

const PY_FILES = [
  'woofia_sim/__init__.py', 'woofia_sim/effects.py', 'woofia_sim/engine.py',
  'woofia_sim/harness.py', 'woofia_sim/kit.py', 'woofia_sim/names.py',
  'woofia_sim/stats.py', 'sim_api.py',
];
const DATA_FILES = ['data/chars.json', 'data/skills.json'];

let pyodide;
const ready = (async () => {
  postMessage({ type: 'progress', msg: 'Python 런타임 다운로드…' });
  pyodide = await loadPyodide({ indexURL: `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VER}/full/` });
  postMessage({ type: 'progress', msg: '엔진·데이터 불러오는 중…' });
  try { pyodide.FS.mkdir('woofia_sim'); } catch {}
  try { pyodide.FS.mkdir('data'); } catch {}
  const all = [...PY_FILES, ...DATA_FILES];
  const texts = await Promise.all(all.map(p => fetch(p).then(r => {
    if (!r.ok) throw new Error(`${p} 로드 실패 (${r.status})`); return r.text();
  })));
  all.forEach((p, i) => pyodide.FS.writeFile(p, texts[i]));
  pyodide.runPython('import sys, json\nif "/" not in sys.path: sys.path.insert(0, "/")\nimport sim_api\nsim_api.all_meta()');
  postMessage({ type: 'ready' });
})().catch(err => postMessage({ type: 'fatal', error: String(err && err.message || err) }));

onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    await ready;
    let out;
    if (type === 'chars') {
      out = pyodide.runPython('json.dumps(sim_api.all_meta(), ensure_ascii=False)');
    } else if (type === 'char') {
      pyodide.globals.set('_cid', payload);
      out = pyodide.runPython('json.dumps(sim_api.char_skills(int(_cid)), ensure_ascii=False)');
    } else if (type === 'simulate') {
      pyodide.globals.set('_cfg_json', payload);   // payload = cfg를 JSON 문자열로
      out = pyodide.runPython('json.dumps(sim_api.run_sim(json.loads(_cfg_json)), ensure_ascii=False)');
    }
    postMessage({ id, ok: true, result: out });
  } catch (err) {
    postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
