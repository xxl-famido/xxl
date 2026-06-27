'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = n => Math.round(n).toLocaleString('ko-KR');
const icon = id => `icons/${id}.png`;

// 배포 시 deploy.yml이 아래 자리표시자를 커밋시각(version.json.updated와 동일)으로 치환한다.
// 미치환(로컬·구 빌드)이면 stale 비교를 건너뛴다. (watchDeploy에서 분리 리터럴로 주입 여부 판별)
const BUILD_VERSION = '__BUILD_VERSION__';

// ── API 브릿지: 로컬 개발(server.py, 8777)은 fetch / GitHub Pages 등 정적은 Pyodide 워커 ──
const USE_PY = location.port !== '8777';
const API = (() => {
  if (!USE_PY) return {
    chars: () => fetch('/api/chars').then(r => r.json()),
    char: id => fetch('/api/char/' + id).then(r => r.json()),
    simulate: cfg => fetch('/api/simulate', { method: 'POST', body: JSON.stringify(cfg) }).then(r => r.json()),
  };
  const w = new Worker('sim-worker.js');
  let seq = 0; const cbs = {};
  const ready = new Promise((res, rej) => {
    w.onmessage = e => {
      const d = e.data;
      if (d.type === 'progress') { const el = document.getElementById('bootMsg'); if (el) el.textContent = d.msg; return; }
      if (d.type === 'ready') return res();
      if (d.type === 'fatal') { rej(new Error(d.error)); const o = document.getElementById('boot'); if (o) o.innerHTML = `<div class="boot-box err">엔진 로드 실패<br><small>${d.error}</small></div>`; return; }
      const cb = cbs[d.id]; if (cb) { delete cbs[d.id]; cb(d); }
    };
  });
  ready.then(() => { const o = document.getElementById('boot'); if (o) o.remove(); });
  const call = (type, payload) => ready.then(() => new Promise((res, rej) => {
    const id = ++seq; cbs[id] = d => d.ok ? res(JSON.parse(d.result)) : rej(new Error(d.error));
    w.postMessage({ id, type, payload });
  }));
  return { chars: () => call('chars'), char: id => call('char', id), simulate: cfg => call('simulate', JSON.stringify(cfg)) };
})();
// 스킬 슬롯 → 아이콘. 평타=01, 공통공격강화+고유1=03, 고유2+고강도훈련+고유3=04, 궁=룬(캐릭별)
const SKILL_ICON = { basicAtk: 'SkillIcon01', passive0: 'SkillIcon03', passive1: 'SkillIcon03',
  passive2: 'SkillIcon04', passive3: 'SkillIcon04', passive4: 'SkillIcon04' };
function skillIconSrc(slot, charId) {
  if (slot === 'ultimate' || slot === 'sigil') return `icons/skills/Rune${charId}.png`;
  const f = SKILL_ICON[slot];
  return f ? `icons/skills/${f}.png` : '';
}
const ROLE_RANK = { '보조': 1, '방해': 2, '치유': 3, '수호': 4, '전사': 5 };
const SPECIAL = { 10421: 4.5, 10401: 5.5 };
const PASSIVE_DEF_ID = 10421;   // 파미도 — 궁 직전 턴 방어로 패시브 활용 (전용 '패시브 방어' 버튼)
const TAEHO_ID = 10423;         // 이태호 — 1포지션 + 임부언 동반 시 'fed 추가행동' 선택 노출
const IMBUEON_ID = 10410;       // 임부언 — 궁으로 P1에게 CD-3 + 추가행동 부여
const EL_ORDER = ['fire', 'water', 'wood', 'light', 'dark'];
const EL_KR = { fire: '불', water: '물', wood: '나무', light: '빛', dark: '어둠', none: '무' };

let CHARS = {};                       // id -> meta
let team = [null, null, null, null, null];   // slot -> {id, skill, rune, rotation}
let filter = 'all';
let lastResult = null;

// ── 기록(캐시) 시스템 ──
const HKEY = 'woofia_history';
let simHistory = [];
let activeRecId = null;   // 현재 UI에 로드된 기록 id (없으면 null = 작업 중 상태)
let histSort = 'date';     // date | date-asc | name | dmg
let histSearch = '';
const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
function trimHistory() {            // 40개 한도 — 잠금·핀 기록은 보호, 오래된 비보호부터 제거
  while (simHistory.length > 40) {
    let idx = -1;
    for (let i = simHistory.length - 1; i >= 0; i--) if (!simHistory[i].locked && !simHistory[i].pinned) { idx = i; break; }
    if (idx < 0) break;
    simHistory.splice(idx, 1);
  }
}
function histView() {               // 검색 필터 + 정렬 + 핀 상단고정
  const q = histSearch.trim().toLowerCase();
  const arr = simHistory.filter(r => !q || (r.name || r.label).toLowerCase().includes(q));
  const cmp = { date: (a, b) => b.id - a.id, 'date-asc': (a, b) => a.id - b.id,
    name: (a, b) => (a.name || a.label).localeCompare(b.name || b.label, 'ko'),
    dmg: (a, b) => (b.total || 0) - (a.total || 0) }[histSort] || ((a, b) => b.id - a.id);
  arr.sort(cmp);
  arr.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));   // 핀 먼저 (안정 정렬)
  return arr;
}
function loadHistory() {
  try {
    simHistory = JSON.parse(localStorage.getItem(HKEY) || '[]');
    let changed = false;
    for (const r of simHistory) if (r.data) { delete r.data; changed = true; }   // 옛 대용량 기록 정리(용량 회수)
    if (changed) persistHistory();
  } catch { simHistory = []; }
}
function persistHistory() { try { localStorage.setItem(HKEY, JSON.stringify(simHistory)); } catch { } }
function fmtShort(n) {
  if (n >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, '') + '억';
  if (n >= 1e4) return Math.round(n / 1e4).toLocaleString('ko-KR') + '만';
  return fmt(n);
}
function snapshot() {
  return {
    team: team.map(s => s ? JSON.parse(JSON.stringify(s)) : null),
    turns: +$('#turns').value, dummies: $('#dummies').dataset.val, enemyHits: $('#enemyHits').dataset.val,
    dummyElement: $('#dummyElement').dataset.val,
    runs: +$('#runs').value, forceProc, hp10, turnOverrides: JSON.parse(JSON.stringify(turnOverrides)),
  };
}
function makeLabel(team, turns, total) {   // 팀에서 라벨 재생성 (공유 코드에선 라벨을 빼고 이걸로 복원)
  const names = (team || []).filter(Boolean).map(t => (CHARS[t.id] || t || {}).name || (t && t.id) || '?').join('·');
  return `${names} · ${turns}턴 · ${fmtShort(total || 0)}`;
}
function saveRecord(snap, data) {
  const label = makeLabel(data.team, data.meta.turns, data.meta.total);
  // 결과(data)는 저장하지 않는다 — 전투로그 포함 시 1건이 ~750KB라 localStorage(~5MB)가 금방 초과돼
  // setItem이 조용히 실패(새 기록 미저장)했음. 설정(snap)만 저장하고, 복원 시 재실행(시드 고정 = 동일 결과).
  simHistory.unshift({ id: Date.now(), label, snap, total: data.meta.total || 0 });
  activeRecId = simHistory[0].id;     // 방금 시뮬한 결과 = 현재 UI와 일치
  trimHistory();
  persistHistory();
  renderHistory(activeRecId);
}
function renderHistory(selId) {
  const sel = $('#history'); if (!sel) return;
  if (!simHistory.length) { sel.innerHTML = '<option value="">— 기록 없음 —</option>'; return; }
  const has = selId != null && simHistory.some(r => r.id == selId);   // 로드된 기록이 목록에 있나
  const opts = histView().map(r => `<option value="${r.id}"${r.id == selId ? ' selected' : ''}>${(r.pinned ? '📌' : '') + (r.locked ? '🔒' : '')}${esc(r.name || r.label)}</option>`).join('');
  sel.innerHTML = (has ? '' : '<option value="" selected>— 불러올 기록 선택 —</option>') + opts;
}
function setSeg(id, val) {
  const seg = $('#' + id); if (!seg) return;
  seg.dataset.val = val;
  seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v == val));
}
function restoreRecord(rec) {
  activeRecId = rec.id;       // 이 기록을 UI에 로드 → 선택 상태로 추적
  const s = rec.snap;
  team = s.team.map(x => x ? JSON.parse(JSON.stringify(x)) : null);
  turnOverrides = JSON.parse(JSON.stringify(s.turnOverrides || {}));
  selTurns = autoSelOverrides(turnOverrides);   // 설정된 턴 오버라이드 자동 표시
  forceProc = !!s.forceProc;
  const tr = $('#turns'); tr.value = s.turns; tr.dispatchEvent(new Event('input'));
  const rr = $('#runs'); if (rr) { rr.value = s.runs ?? 50; rr.dispatchEvent(new Event('input')); }
  setSeg('dummies', s.dummies); setSeg('enemyHits', s.enemyHits);
  setSeg('dummyElement', s.dummyElement ?? 0);
  hp10 = !!s.hp10; $('#hp10Btn').classList.toggle('on', hp10);
  $('#forceProc').classList.toggle('on', forceProc); syncRunsField();
  buildFilters(); renderRoster(); renderTeam(); renderPrio();
  if (rec.data) { lastResult = rec.data; renderResults(rec.data); }   // 구버전 기록(결과 내장)
  else { run(false); }                  // 결과 미저장 기록 → 동일 설정으로 재실행 (저장 안 함)
}
function renderHistList() {
  const list = $('#histList'); if (!list) return;
  const view = histView();
  list.innerHTML = view.length ? view.map(r => {
    const d = new Date(r.id).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const mark = `${r.pinned ? '📌' : ''}${r.locked ? '🔒' : ''}`;
    return `<label class="hist-item${r.pinned ? ' pinned' : ''}"><input type="checkbox" data-id="${r.id}">
      <span class="hi-label">${mark}${esc(r.name || r.label)}</span><span class="hi-date">${d}</span>
      <button class="hi-menu" data-menu="${r.id}" title="관리">⋮</button></label>`;
  }).join('') : `<div class="hist-empty">${histSearch ? '검색 결과 없음' : '저장된 기록이 없습니다'}</div>`;
  updateHselCount();
}
function selectedHistIds() { return new Set([...$$('#histList input:checked')].map(c => +c.dataset.id)); }
function updateHselCount() {
  const n = selectedHistIds().size;
  $('#hselCount').textContent = `${n}개 선택 / 전체 ${simHistory.length}`;
  $('#hDelSel').disabled = $('#hDelOther').disabled = !n;
  const ex = $('#hExport'); if (ex) ex.disabled = !n;   // 선택 없으면 내보내기 불가
}
function afterHistChange() { persistHistory(); renderHistList(); renderHistory(activeRecId); }   // 로드된 기록 선택 유지(가져오기로 강제 점프 안 함)
function bindHistory() {
  $('#history').onchange = e => { const r = simHistory.find(x => x.id == e.target.value); if (r) restoreRecord(r); };
  $('#histManage').onclick = () => { renderHistList(); $('#histModal').hidden = false; };
  $('#histModal').onclick = e => { if (e.target.dataset.hclose !== undefined) $('#histModal').hidden = true; };
  $('#hAll').onclick = () => { $$('#histList input').forEach(c => c.checked = true); updateHselCount(); };
  $('#hNone').onclick = () => { $$('#histList input').forEach(c => c.checked = false); updateHselCount(); };
  $('#histList').onchange = updateHselCount;
  $('#histList').onclick = e => {
    const mb = e.target.closest('.hi-menu'); if (!mb) return;
    e.preventDefault();
    const r = simHistory.find(x => x.id == mb.dataset.menu); if (r) openHistMenu(mb, r);
  };
  const sb = $('#histSearch'); if (sb) sb.oninput = () => { histSearch = sb.value; renderHistList(); };
  const so = $('#histSort'); if (so) so.onchange = () => { histSort = so.value; renderHistList(); };
  $('#hExport') && ($('#hExport').onclick = openExportPop);
  $('#hImport') && ($('#hImport').onclick = openImportPop);
  $('#hImportFile') && ($('#hImportFile').onchange = importHistory);
  $('#hDelSel').onclick = () => {
    const ids = selectedHistIds();
    const del = simHistory.filter(r => ids.has(r.id) && !r.locked);
    if (!del.length) return toast('삭제할 기록이 없어요 (잠긴 기록은 제외돼요)');
    if (!confirm(`선택한 ${del.length}개를 삭제할까요? (잠긴 기록 제외)`)) return;
    const dset = new Set(del.map(r => r.id));
    simHistory = simHistory.filter(r => !dset.has(r.id)); afterHistChange();
  };
  $('#hDelOther').onclick = () => {
    const ids = selectedHistIds(); if (!ids.size) return;
    const del = simHistory.filter(r => !ids.has(r.id) && !r.locked);
    if (!del.length) return toast('삭제할 기록이 없어요');
    if (!confirm(`선택 ${ids.size}개 + 잠긴 기록만 남기고 ${del.length}개를 삭제할까요?`)) return;
    const dset = new Set(del.map(r => r.id));
    simHistory = simHistory.filter(r => !dset.has(r.id)); afterHistChange();
  };
}
function openHistMenu(btn, r) {
  document.querySelector('.histmenu')?.remove();
  const m = document.createElement('div');
  m.className = 'histmenu';
  m.innerHTML = `<button data-act="rename">✏️ 이름 변경</button>
    <button data-act="pin">${r.pinned ? '📌 고정 해제' : '📌 상단 고정'}</button>
    <button data-act="lock">${r.locked ? '🔓 잠금 해제' : '🔒 잠금'}</button>
    <button data-act="del" class="danger"${r.locked ? ' disabled' : ''}>🗑️ 삭제</button>`;
  document.body.appendChild(m);
  const rect = btn.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(rect.right - m.offsetWidth, innerWidth - m.offsetWidth - 10)) + 'px';
  m.style.top = (rect.bottom + 4) + 'px';
  m.onclick = e => {
    const act = e.target.closest('button')?.dataset.act; if (!act) return;
    if (act === 'rename') { const nn = prompt('새 이름 (비우면 기본 이름)', r.name || r.label); if (nn !== null) { r.name = nn.trim() || undefined; afterHistChange(); } }
    else if (act === 'pin') { r.pinned = !r.pinned; afterHistChange(); }
    else if (act === 'lock') { r.locked = !r.locked; afterHistChange(); }
    else if (act === 'del') { if (r.locked) return; simHistory = simHistory.filter(x => x.id !== r.id); afterHistChange(); }
    m.remove();
  };
  setTimeout(() => document.addEventListener('click', function h(ev) {
    if (!m.contains(ev.target) && ev.target !== btn) { m.remove(); document.removeEventListener('click', h); }
  }), 0);
}
// ── 공유 코드 코덱 ──
// 전처리(조사 기반): 위치배열 + 기본값생략 + 비트팩 + id delta + 파생값 제거(label·rotation) + 토큰 ASCII화
// → deflate → base64url.  '#'=축약형 / '*'=전체JSON(미지원 필드 시 안전 폴백)
const CID0 = 10000, _TK = '평궁방';
const _encPlan = p => (p || []).map(x => _TK.indexOf(x)).join('');   // 평/궁/방 → 0/1/2 (3바이트→1바이트)
const _decPlan = s => [...String(s)].map(c => _TK[+c]);
const _trimDef = (a, D) => { while (a.length > 1 && JSON.stringify(a[a.length - 1]) === JSON.stringify(D[a.length - 1])) a.pop(); return a; };
function packSlot(s) {
  if (!s) return 0;
  const flags = (s.rune ? 1 : 0) | (s.sealOn ? 2 : 0) | (s.usePlan ? 4 : 0);   // rotation은 plan에서 파생 → 미저장
  return _trimDef([s.id - CID0, flags, s.skill ?? 10, s.priority ?? 0, s.sealAtk || 0, s.sealHp || 0, _encPlan(s.plan), _TK.indexOf(s.fedAction || '평')],
    [null, 1, 10, 0, 0, 0, '', 0]);   // fedAction 끝에 append (기본 '평'=0 → trim 생략, 구기록 호환)
}
function unpackSlot(a) {
  if (!a) return null;
  const [idD, flags = 1, skill = 10, priority = 0, sealAtk = 0, sealHp = 0, plan = '', fed = 0] = a;
  const s = { id: idD + CID0, skill, rune: !!(flags & 1) };
  if (priority) s.priority = priority;
  if (sealAtk) s.sealAtk = sealAtk;           // seal 값은 sealOn 플래그와 독립
  if (sealHp) s.sealHp = sealHp;
  if (flags & 2) s.sealOn = true;
  if (flags & 4) { s.usePlan = true; s.plan = _decPlan(plan); s.rotation = s.plan.join(''); } else s.rotation = '';
  if (fed) s.fedAction = _TK[fed];            // 0=평(기본) → 미설정, 1=궁·2=방만 복원
  return s;
}
function packSnap(s) {
  const flags = (s.forceProc ? 1 : 0) | (s.hp10 ? 2 : 0);
  const to = s.turnOverrides && Object.keys(s.turnOverrides).length ? s.turnOverrides : 0;
  return _trimDef([s.team.map(packSlot), +s.turns, +s.dummies, s.enemyHits, +s.dummyElement, +s.runs, flags, to],
    [null, 30, 1, 'all', 0, 50, 0, 0]);
}
function unpackSnap(a) {
  const [team, turns = 30, dummies = 1, enemyHits = 'all', dummyElement = 0, runs = 50, flags = 0, to = 0] = a;
  return { team: team.map(unpackSlot), turns, dummies, enemyHits, dummyElement, runs, forceProc: !!(flags & 1), hp10: !!(flags & 2), turnOverrides: to || {} };
}
function packRecords(arr) {                   // label은 팀에서 재생성 가능 → 미저장
  return arr.map(r => _trimDef([r.id, r.name || '', r.total || 0, (r.locked ? 1 : 0) | (r.pinned ? 2 : 0), packSnap(r.snap)],
    [null, '', 0, 0, null]));
}
function unpackRecords(arr) {
  return arr.map(a => { const [id, name = '', total = 0, flags = 0, snap] = a;
    const sn = unpackSnap(snap), r = { id, label: makeLabel(sn.team, sn.turns, total), snap: sn, total };
    if (name) r.name = name; if (flags & 1) r.locked = true; if (flags & 2) r.pinned = true; return r; });
}
// 누락 ≈ 0/""/false/[]/{} 동등, 숫자/문자 느슨 비교(==), label은 재생성이라 제외 — 다르면(미지원 필드) 폴백
const _isEmpty = x => x == null || x === 0 || x === '' || x === false || (Array.isArray(x) && !x.length) || (typeof x === 'object' && !Object.keys(x).length);
function looseEq(a, b) {
  if (a == b) return true;
  if (_isEmpty(a) && _isEmpty(b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return a == b;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { if (k === 'label') continue; if (!looseEq(a[k], b[k])) return false; }
  return true;
}
const _bytesToB64url = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const _b64urlToBytes = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
async function _deflate(str) { const cs = new CompressionStream('deflate'); const w = cs.writable.getWriter(); w.write(new TextEncoder().encode(str)); w.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); }
async function _inflate(bytes) { const ds = new DecompressionStream('deflate'); const w = ds.writable.getWriter(); w.write(bytes); w.close(); return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer()); }
async function compressCode(records) {       // records 배열 → 최단 코드
  let body, tag;
  try {
    if (records.every(r => looseEq(r, unpackRecords(packRecords([r]))[0]))) { body = JSON.stringify(packRecords(records)); tag = '#'; }
    else { body = JSON.stringify(records); tag = '*'; }
  } catch { body = JSON.stringify(records); tag = '*'; }
  return tag + _bytesToB64url(await _deflate(body));
}
async function decompressCode(code) {        // 코드 → records JSON 문자열
  code = code.trim();
  const tag = code[0], json = await _inflate(_b64urlToBytes(code.slice(1)));
  return tag === '#' ? JSON.stringify(unpackRecords(JSON.parse(json))) : json;
}
function importRecords(arr) {                 // 공통 머지 (성공 시 true)
  if (!Array.isArray(arr)) { toast('가져오기 실패 — 형식이 올바르지 않아요'); return false; }
  const have = new Set(simHistory.map(r => r.id));
  const add = arr.filter(r => r && r.id && r.snap && !have.has(r.id));
  simHistory = [...simHistory, ...add];
  simHistory.sort((a, b) => b.id - a.id);
  trimHistory(); afterHistChange();
  toast(`${add.length}개 기록을 가져왔어요 (중복 제외)`);
  return true;
}
async function openExportPop() {
  const ids = selectedHistIds();
  const out = simHistory.filter(r => ids.has(r.id));     // 선택분만
  if (!out.length) return toast('내보낼 기록을 먼저 선택하세요');
  const code = await compressCode(out);
  document.querySelector('.iopop')?.remove();
  const pop = document.createElement('div'); pop.className = 'iopop';
  pop.innerHTML = `<div class="io-card"><button class="mc-close" data-ioclose>×</button>
    <div class="pp-head"><h3>내보내기 <em>(${out.length}개 선택)</em></h3></div>
    <button class="io-big" id="ioFile">📁 파일로 저장</button>
    <div class="io-or">또는 코드로 공유</div>
    <textarea class="io-code" id="ioCode" readonly>${code}</textarea>
    <button class="io-big" id="ioCopy">📋 코드 복사</button></div>`;
  document.body.appendChild(pop);
  $('#ioFile').onclick = () => {
    const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `woofia_records_${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href); pop.remove();
    toast(`기록 ${out.length}개를 파일로 내보냈어요`);
  };
  $('#ioCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(code); } catch { $('#ioCode').select(); document.execCommand('copy'); }
    toast('코드를 복사했어요 — 상대가 가져오기에 붙여넣으면 돼요');
  };
  pop.onclick = e => { if (e.target.dataset.ioclose !== undefined || e.target === pop) pop.remove(); };
}
function openImportPop() {
  document.querySelector('.iopop')?.remove();
  const pop = document.createElement('div'); pop.className = 'iopop';
  pop.innerHTML = `<div class="io-card"><button class="mc-close" data-ioclose>×</button>
    <div class="pp-head"><h3>가져오기</h3></div>
    <button class="io-big" id="ioPickFile">📁 파일 선택</button>
    <div class="io-or">또는 코드 붙여넣기</div>
    <textarea class="io-code" id="ioPaste" placeholder="공유받은 코드를 여기에 붙여넣으세요"></textarea>
    <button class="io-big" id="ioPasteBtn">코드로 가져오기</button></div>`;
  document.body.appendChild(pop);
  $('#ioPickFile').onclick = () => $('#hImportFile').click();
  $('#ioPasteBtn').onclick = async () => {
    const v = $('#ioPaste').value.trim(); if (!v) return toast('코드를 붙여넣어 주세요');
    let arr;
    try { arr = JSON.parse(await decompressCode(v)); } catch { try { arr = JSON.parse(v); } catch { return toast('가져오기 실패 — 올바른 코드가 아니에요'); } }
    if (importRecords(arr)) pop.remove();
  };
  pop.onclick = e => { if (e.target.dataset.ioclose !== undefined || e.target === pop) pop.remove(); };
}
function importHistory(e) {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let arr;
    try { arr = JSON.parse(reader.result); }
    catch { try { arr = JSON.parse(await decompressCode(reader.result.trim())); } catch { toast('가져오기 실패 — 올바른 기록 파일이 아니에요'); e.target.value = ''; return; } }
    importRecords(arr); document.querySelector('.iopop')?.remove(); e.target.value = '';
  };
  reader.readAsText(f);
}

// 마지막 업데이트(배포) 시각 — version.json(배포 시 기록)을 읽어 우측 하단에 KST로 표시
(function showLastUpdate() {
  const el = document.getElementById('lastUpdate'); if (!el) return;
  fetch('version.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(v => {
    if (!v || !v.updated) { el.textContent = '개발 모드 · 로컬'; return; }
    const d = new Date(v.updated);
    const s = d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    el.textContent = `마지막 업데이트 ${s}`;
  }).catch(() => { el.textContent = '개발 모드 · 로컬'; });
})();

// ── boot ──
// ───────────── 조합 비교 ─────────────
let cmpData = { a: null, b: null };
let cmpPairs = [];                       // [{a:charObj|null, b:charObj|null}] 매칭 행
// 공통 전투 설정 — 두 비교군에 함께 적용해 재계산 (기본: 꺼짐·꺼짐·무속성·1·전체)
let cmpCommon = { forceProc: false, hp10: false, dummyElement: 0, dummies: 1, enemyHits: 'all', turns: 30 };
let cmpTurnsManual = false;              // 사용자가 턴 슬라이더를 직접 건드렸는지 (true면 자동설정 안 함)
let cmpTeam = { a: null, b: null };      // 편집 가능한 팀 cfg (snap.team 복사본)
let cmpLoaded = { a: null, b: null };    // 현재 로드된 기록 id
let cmpDmg = { a: {}, b: {} };           // 마지막 시뮬 캐릭별 데미지 (id→dmg)
let cmpPending = false;                  // 편집 후 재계산 대기 상태
let cmpTurnOv = { a: {}, b: {} };        // 비교군별 턴 오버라이드 {turn:[position,...]}
let cmpManual = false;                   // 사용자가 직접 위치를 옮기기 시작하면 true → 자동매칭 끄고 위치기반
function cmpSideRec(side) {              // 드롭다운 값 → 저장기록 또는 빈(커스텀) 그룹
  const val = $('#cmp' + (side === 'a' ? 'A' : 'B')).value;
  if (!val) return { id: '__' + side, snap: { team: [], turns: 30, runs: 50, turnOverrides: {} } };
  return simHistory.find(r => r.id == val) || null;
}
function loadCmpTeam(side, rec) {        // 기록이 바뀔 때만 snap에서 새로 복사(편집 보존)
  if (cmpLoaded[side] === rec.id) return;
  cmpTeam[side] = (rec.snap.team || []).map(t => t ? JSON.parse(JSON.stringify(t)) : null);
  cmpTurnOv[side] = JSON.parse(JSON.stringify(rec.snap.turnOverrides || {}));
  cmpLoaded[side] = rec.id;
}
function sideOrder(side) {               // 비교군 캐릭을 우선순위로 정렬 ({s,i,p})
  return (cmpTeam[side] || []).map((s, i) => s ? { s, i } : null).filter(Boolean)
    .map(o => ({ ...o, p: o.s.priority ?? basePriority(o.s, o.i + 1) }))
    .sort((a, b) => a.p - b.p);
}
function cfgFromTeam(side, snap) {        // 편집된 팀 + 공통설정으로 API cfg
  const picked = (cmpTeam[side] || []).map((t, i) => t ? { ...t, position: i + 1 } : null).filter(Boolean);
  return {
    team: picked.map(t => ({ id: t.id, position: t.position, skill: t.skill, rune: t.rune,
      rotation: t.usePlan ? ((t.plan && t.plan.length) ? t.plan.join('') : (t.rotation || null)) : null,
      fedAction: t.fedAction || null,
      priority: t.priority, sealAtk: t.sealOn ? (t.sealAtk ?? 0) : 0, sealHp: t.sealOn ? (t.sealHp ?? 0) : 0 })),
    turns: +snap.turns, turnOrders: cmpTurnOv[side] || {},
    dummies: cmpCommon.dummies, enemyHits: cmpCommon.enemyHits, dummyElement: cmpCommon.dummyElement,
    forceProc: cmpCommon.forceProc, hp10: cmpCommon.hp10, runs: cmpCommon.forceProc ? 1 : +(snap.runs || 50),
  };
}
function markCmpDirty() { cmpPending = true; $('#cmpRun')?.classList.add('dirty'); if (cmpData && cmpData.a) renderCmpLane(); }
function positionMatch(A, B) {            // 위치(행) 기반 1:1 — 같은캐릭 매칭 없이 행 인덱스로 짝
  const n = Math.max(A.length, B.length), rows = [];
  for (let i = 0; i < n; i++) rows.push({ a: A[i] || null, b: B[i] || null });
  return rows;
}
const cmpMatch = () => (cmpManual ? positionMatch : autoMatch)(cmpChars('a'), cmpChars('b'));
function cmpRelayout() { cmpPairs = cmpMatch(); markCmpDirty(); }
// 사용자가 처음 직접 옮길 때: 현재 화면(autoMatch) 배치를 슬롯 순서로 확정 → 이후 자동매칭 끔(완전 수동)
function cmpGoManual() {
  if (cmpManual) return;
  for (const sd of ['a', 'b']) {
    const remap = {}, newTeam = [];
    cmpPairs.forEach((r, i) => { const ch = r[sd];
      if (ch && ch.cfg) { remap[ch.slotIdx + 1] = i + 1; newTeam[i] = ch.cfg; } else newTeam[i] = null; });
    cmpTeam[sd] = newTeam;
    const ov = cmpTurnOv[sd];
    if (ov) for (const t in ov) ov[t] = ov[t].map(p => remap[p] ?? p);
  }
  cmpManual = true;
}
// 슬롯(포지션) 교체 시 turnOverrides의 포지션 번호도 함께 교체 — 턴별 우선순위가 같은 캐릭을 계속 가리키게
function cmpSwapTurnOv(side, p1, p2) {
  const ov = cmpTurnOv[side]; if (!ov) return;
  for (const t in ov) ov[t] = ov[t].map(p => p === p1 ? p2 : (p === p2 ? p1 : p));
}
function syncCommon() {
  cmpCommon = {
    forceProc: $('#cmpForce').classList.contains('on'), hp10: $('#cmpHp10').classList.contains('on'),
    dummyElement: +$('#cmpEl').dataset.val, dummies: +$('#cmpDummies').dataset.val, enemyHits: $('#cmpHits').dataset.val,
    turns: +($('#cmpTurns')?.value || 13),
  };
}
function cmpChars(side) {                 // cmpTeam 로스터 기반; damage=마지막 시뮬값(미계산이면 null)
  const dmg = cmpDmg[side] || {};
  return (cmpTeam[side] || []).map((t, i) => t ? {
    id: t.id, name: (CHARS[t.id] || {}).name || String(t.id), elementKey: (CHARS[t.id] || {}).elementKey,
    position: i + 1, damage: (t.id in dmg) ? dmg[t.id] : null, cfg: t, slotIdx: i, side
  } : null).filter(Boolean);
}
function autoMatch(A, B) {                // 같은 캐릭 1:1 → 남은 건 포지션 순 → 단독
  const rows = [], usedB = new Set();
  for (const ca of A) {
    const j = B.findIndex((cb, k) => !usedB.has(k) && cb.id === ca.id);
    if (j >= 0) { rows.push({ a: ca, b: B[j] }); usedB.add(j); } else rows.push({ a: ca, b: null });
  }
  for (const cb of B.filter((_, k) => !usedB.has(k)).sort((x, y) => x.position - y.position)) {
    const row = rows.find(r => !r.b); if (row) row.b = cb; else rows.push({ a: null, b: cb });
  }
  return rows;
}
// 방향성 비교: A·B 중 높은 쪽으로 화살표 + 더 높은 % / 딜 (A=파랑, B=골드)
function midHtml(da, db) {
  if (da == null || db == null) return `<div class="cmp-mid pend">↻</div>`;   // 재계산 대기
  if (!da || !db) return `<div class="cmp-mid solo">—</div>`;   // 한쪽이 무딜이면 비교 안 함
  if (da === db) return `<div class="cmp-mid eq"><b>=</b></div>`;
  const aWin = da > db, pct = Math.round((Math.max(da, db) / Math.max(Math.min(da, db), 1) - 1) * 100);
  return `<div class="cmp-mid ${aWin ? 'win-a' : 'win-b'}">
    <b>${aWin ? '◀ ' : ''}+${pct}%${aWin ? '' : ' ▶'}</b><span>+${fmtShort(Math.abs(da - db))}</span></div>`;
}
function cmpCell(c, side) {
  if (!c) return `<div class="cmp-cell empty" data-side="${side}" data-add>＋ 추가</div>`;
  const d = c.damage == null ? `<span class="cc-d pend">?</span>` : `<span class="cc-d">${fmtShort(c.damage)}</span>`;
  return `<div class="cmp-cell el-${c.elementKey}" data-side="${side}" draggable="true" title="눌러서 도장·행동·교체">
    <img src="${icon(c.id)}" alt=""><span class="cc-n">${esc(c.name)}</span>${d}</div>`;
}
function renderCmpLane() {
  const mvBtns = (sd, i) => `<div class="cc-mv"><button data-mv="up" data-mvside="${sd}" data-row="${i}">▲</button><button data-mv="down" data-mvside="${sd}" data-row="${i}">▼</button></div>`;
  const rows = cmpPairs.map((r, i) => {
    const mid = cmpPending ? `<div class="cmp-mid pend">↻</div>`
      : ((r.a && r.b) ? midHtml(r.a.damage, r.b.damage) : `<div class="cmp-mid solo">단독</div>`);
    return `<div class="cmp-row" data-row="${i}">
      <div class="cmp-awrap">${mvBtns('a', i)}${cmpCell(r.a, 'a')}</div>${mid}
      <div class="cmp-bwrap">${cmpCell(r.b, 'b')}${mvBtns('b', i)}</div></div>`;
  }).join('');
  const aN = (cmpTeam.a || []).filter(Boolean).length, bN = (cmpTeam.b || []).filter(Boolean).length;
  // 이미 단독 행에 빈칸(＋추가)이 있는 쪽엔 추가행을 또 붙이지 않음 (6번째 슬롯 방지)
  const aHasEmpty = cmpPairs.some(r => !r.a), bHasEmpty = cmpPairs.some(r => !r.b);
  const aAdd = aN < 5 && !aHasEmpty, bAdd = bN < 5 && !bHasEmpty;
  const addRow = (aAdd || bAdd)
    ? `<div class="cmp-row">${aAdd ? `<div class="cmp-awrap">${cmpCell(null, 'a')}</div>` : '<div></div>'}<div class="cmp-mid"></div>${bAdd ? `<div class="cmp-bwrap">${cmpCell(null, 'b')}</div>` : '<div></div>'}</div>`
    : '';
  let total;
  if (cmpPending) total = `<div class="cmp-pending">변경됨 — <b>비교하기</b>를 눌러 결과를 갱신하세요</div>`;
  else if (aN || bN) {
    const ta = cmpData.a.meta, tb = cmpData.b.meta, tA = ta.totalMid ?? ta.total, tB = tb.totalMid ?? tb.total;
    total = `<div class="cmp-total"><div class="ct-side a">${fmt(tA)}</div>${midHtml(tA, tB)}<div class="ct-side b">${fmt(tB)}</div></div>`;
  } else total = '';
  const prioRow = (aN || bN) ? `<div class="cmp-priorow">
    <span>${aN ? `<button class="ct-prio" data-prio="a">⇅ 행동 우선순위</button>` : ''}</span>
    <span>${bN ? `<button class="ct-prio" data-prio="b">⇅ 행동 우선순위</button>` : ''}</span></div>` : '';
  $('#cmpBody').innerHTML = `<div class="cmp-colhead"><span class="ch-a">A</span><span>높은 쪽 ◀▶ · ${cmpCommon.turns || ''}턴</span><span class="ch-b">B</span></div>
    <div class="cmp-lane">${rows}${addRow}</div>${total}${prioRow}
    <div class="cmp-chart" id="cmpChart"></div>`;
  if (!cmpPending) renderCmpChart();
}
function openCmpInfo(c) {
  if (!c) return;
  const cf = c.cfg || {}, ch = CHARS[c.id] || {};
  const ua = cf.sealOn ? (cf.sealAtk || 0) : 0, uh = cf.sealOn ? (cf.sealHp || 0) : 0;
  const isManual = !!(cf.usePlan && cf.plan && cf.plan.length);
  let pop = document.querySelector('.cmpinfo'); pop?.remove();
  pop = document.createElement('div'); pop.className = 'cmpinfo';
  pop.innerHTML = `<div class="ci-card el-${c.elementKey}" style="--el:var(--${c.elementKey})">
    <div class="ci-head">
      <div class="ci-top"><img src="${icon(c.id)}" alt=""><div><h3>${esc(c.name)}</h3>
        <div class="ci-tags"><span class="tag el">${ch.element || ''}속성</span><span class="tag">${ch.role || ''}</span><span class="tag">P${cf.position || c.position}</span></div></div></div>
      <div class="ci-hbtns"><button class="ci-swap" data-swap>⇄ 교체</button><button class="mc-close" data-ciclose>×</button></div>
    </div>
    <div class="ci-rows">
      <div class="ci-r tap" data-seal><span>도장 강화</span><b class="ci-state ${cf.sealOn ? 'on' : ''}" id="ciSeal">${cf.sealOn ? 'ON' : 'OFF'} ▸</b></div>
      <div class="ci-r"><span>기본 공격력</span><b id="ciAtk">${fmt((ch.atk || 0) + ua)}${ua ? `<em>(+${fmt(ua)})</em>` : ''}</b></div>
      <div class="ci-r"><span>최대 체력</span><b id="ciHp">${fmt((ch.hp || 0) + uh)}${uh ? `<em>(+${fmt(uh)})</em>` : ''}</b></div>
      <div class="ci-r tap" data-plan><span>행동</span><b class="ci-state" id="ciAct">${isManual ? '수동' : '자동'} ▸</b></div>
    </div></div>`;
  document.body.appendChild(pop);
  pop.onclick = e => {
    if (e.target.closest('[data-swap]')) { openSwapPop(c); return; }
    if (e.target.closest('[data-seal]')) { openSealPop(c); return; }
    if (e.target.closest('[data-plan]')) { openPlanPopup(c); return; }
    if (e.target.dataset.ciclose !== undefined || e.target === pop) pop.remove();
  };
}
function updateCiStats(c) {                // 도장 변경 시 정보카드 ATK/HP/도장상태 즉시 반영
  const cf = c.cfg || {}, ch = CHARS[c.id] || {};
  const ua = cf.sealOn ? (cf.sealAtk || 0) : 0, uh = cf.sealOn ? (cf.sealHp || 0) : 0;
  const s = $('#ciSeal'); if (s) { s.textContent = (cf.sealOn ? 'ON' : 'OFF') + ' ▸'; s.classList.toggle('on', !!cf.sealOn); }
  const a = $('#ciAtk'); if (a) a.innerHTML = `${fmt((ch.atk || 0) + ua)}${ua ? `<em>(+${fmt(ua)})</em>` : ''}`;
  const h = $('#ciHp'); if (h) h.innerHTML = `${fmt((ch.hp || 0) + uh)}${uh ? `<em>(+${fmt(uh)})</em>` : ''}`;
}
function openSealPop(c) {
  const meta = CHARS[c.id] || {}, limit = meta.sealLimit || 20000, cf = c.cfg;
  if (cf.sealAtk == null) { cf.sealAtk = 0; cf.sealHp = limit; }
  document.querySelector('.sealpop')?.remove();
  const pop = document.createElement('div'); pop.className = 'sealpop';
  pop.innerHTML = `<div class="sp-card"><button class="mc-close" data-spclose>×</button>
    <div class="pp-head"><img src="${icon(c.id)}" alt=""><h3>${esc(c.name)} · 도장 강화</h3></div>
    <label class="toggle pp-toggle"><input type="checkbox" id="spOn"><span class="sw"></span>도장 강화 <em>한계 ${fmt(limit)} (공격력+체력)</em></label>
    <div class="sp-body" id="spBody">
      <div class="seal-row"><span class="sl-lbl atk">공격력</span>
        <input type="range" id="spAtkR" min="0" max="${limit}" step="100"><input type="number" id="spAtkN" min="0" max="${limit}" step="100"></div>
      <div class="seal-row"><span class="sl-lbl hp">체력</span>
        <input type="range" id="spHpR" min="0" max="${limit}" step="100"><input type="number" id="spHpN" min="0" max="${limit}" step="100"></div>
      <div class="seal-ratio" id="spRatio"></div>
    </div></div>`;
  document.body.appendChild(pop);
  const sync = atk => {
    atk = Math.max(0, Math.min(limit, Math.round((atk || 0) / 100) * 100));
    cf.sealAtk = atk; cf.sealHp = limit - atk;
    $('#spAtkR').value = atk; $('#spAtkN').value = atk; $('#spHpR').value = cf.sealHp; $('#spHpN').value = cf.sealHp;
    $('#spAtkR').style.setProperty('--p', (atk / limit * 100) + '%'); $('#spHpR').style.setProperty('--p', (cf.sealHp / limit * 100) + '%');
    const ap = Math.round(atk / limit * 100);
    $('#spRatio').innerHTML = `공격력 <b class="atk">${ap}%</b> : 체력 <b class="hp">${100 - ap}%</b>`;
    updateCiStats(c); markCmpDirty();
  };
  $('#spOn').checked = !!cf.sealOn; $('#spBody').classList.toggle('off', !cf.sealOn);
  $('#spOn').onchange = () => { cf.sealOn = $('#spOn').checked; $('#spBody').classList.toggle('off', !cf.sealOn); sync(cf.sealAtk); };
  $('#spAtkR').oninput = e => sync(+e.target.value);
  $('#spAtkN').onchange = e => sync(+e.target.value);
  $('#spHpR').oninput = e => sync(limit - +e.target.value);
  $('#spHpN').onchange = e => sync(limit - +e.target.value);
  sync(cf.sealAtk);
  pop.onclick = e => { if (e.target.dataset.spclose !== undefined || e.target === pop) pop.remove(); };
}
function openAddPop(side) {
  if (!cmpTeam[side]) return;
  document.querySelector('.swappop')?.remove();
  const inGroup = new Set(cmpTeam[side].filter(Boolean).map(t => t.id));
  const list = Object.values(CHARS).sort((x, y) => (x.name || '').localeCompare(y.name || '', 'ko'));
  const grid = list.map(ch => `<button class="sw-ic el-${ch.elementKey}" data-id="${ch.id}"${inGroup.has(ch.id) ? ' disabled' : ''}>
    <img src="${icon(ch.id)}" alt=""><span>${esc(ch.name)}</span></button>`).join('');
  const pop = document.createElement('div'); pop.className = 'swappop';
  pop.innerHTML = `<div class="sw-card"><button class="mc-close" data-swclose>×</button>
    <div class="pp-head"><h3>캐릭터 추가 <em>(비교군 ${side === 'a' ? 'A' : 'B'})</em></h3></div>
    <div class="sw-grid">${grid}</div></div>`;
  document.body.appendChild(pop);
  pop.onclick = e => {
    const b = e.target.closest('.sw-ic');
    if (b && !b.disabled) {
      let idx = cmpTeam[side].findIndex(t => !t);     // 빈 슬롯 우선, 없으면 추가(최대 5)
      if (idx < 0) { if (cmpTeam[side].filter(Boolean).length >= 5) return toast('비교군이 가득 찼어요 (최대 5)'); idx = cmpTeam[side].length; }
      cmpTeam[side][idx] = { id: +b.dataset.id, skill: 10, rune: true, rotation: '' };
      pop.remove(); cmpRelayout(); return;
    }
    if (e.target.dataset.swclose !== undefined || e.target === pop) pop.remove();
  };
}
function openSwapPop(c) {
  document.querySelector('.swappop')?.remove();
  const inGroup = new Set((cmpTeam[c.side] || []).filter(Boolean).map(t => t.id));
  const list = Object.values(CHARS).sort((x, y) => (x.name || '').localeCompare(y.name || '', 'ko'));
  const grid = list.map(ch => {
    const dis = inGroup.has(ch.id) && ch.id !== c.id;
    return `<button class="sw-ic el-${ch.elementKey}${ch.id === c.id ? ' cur' : ''}" data-id="${ch.id}"${dis ? ' disabled' : ''}>
      <img src="${icon(ch.id)}" alt=""><span>${esc(ch.name)}</span></button>`;
  }).join('');
  const pop = document.createElement('div'); pop.className = 'swappop';
  pop.innerHTML = `<div class="sw-card"><button class="mc-close" data-swclose>×</button>
    <div class="pp-head"><h3>캐릭터 교체 <em>(비교군 ${c.side === 'a' ? 'A' : 'B'})</em></h3></div>
    <div class="sw-grid"><button class="sw-ic sw-none" data-id="none"><span class="sw-x">✕</span><span>제외</span></button>${grid}</div></div>`;
  document.body.appendChild(pop);
  pop.onclick = e => {
    const b = e.target.closest('.sw-ic');
    if (b && !b.disabled) {
      const idx = c.slotIdx;
      if (idx >= 0 && cmpTeam[c.side]) {
        if (b.dataset.id === 'none') {            // 로스터에서 제외(빈 슬롯)
          cmpTeam[c.side][idx] = null; pop.remove();
          document.querySelector('.cmpinfo')?.remove(); cmpRelayout(); return;
        }
        const newId = +b.dataset.id;
        if (newId !== c.id) {
          cmpTeam[c.side][idx] = { id: newId, skill: 10, rune: true, rotation: '' };
          pop.remove(); cmpRelayout();
          openCmpInfo({ id: newId, name: (CHARS[newId] || {}).name || String(newId), elementKey: (CHARS[newId] || {}).elementKey, position: c.position, damage: null, cfg: cmpTeam[c.side][idx], slotIdx: idx, side: c.side });
          return;
        }
      }
    }
    if (e.target.dataset.swclose !== undefined || e.target === pop) pop.remove();
  };
}
function openPlanPopup(c) {
  document.querySelector('.planpop')?.remove();
  const pop = document.createElement('div'); pop.className = 'planpop';
  pop.innerHTML = `<div class="pp-card"><button class="mc-close" data-ppclose>×</button>
    <div class="pp-head"><img src="${icon(c.id)}" alt=""><h3>${esc(c.name)} · 행동</h3></div>
    <label class="toggle pp-toggle"><input type="checkbox" id="ppOn"><span class="sw"></span>행동 직접 지정 <em>(끄면 자동)</em></label>
    <div class="pp-legend"><span class="ro-a a평">평</span>평타<span class="ro-a a궁">궁</span>필살<span class="ro-a a방">방</span>방어</div>
    <div class="plan-legend" id="ppRules"></div>
    <div id="ppGrid"></div><div id="ppFed"></div></div>`;
  document.body.appendChild(pop);
  $('#ppOn').checked = !!c.cfg.usePlan;
  $('#ppOn').onchange = () => {
    c.cfg.usePlan = $('#ppOn').checked;
    if (c.cfg.usePlan && !(c.cfg.plan && c.cfg.plan.length)) c.cfg.plan = defaultPlan(CHARS[c.id] || {}, cmpCommon.turns || 30);
    const a = $('#ciAct'); if (a) a.textContent = (c.cfg.usePlan ? '수동' : '자동') + ' ▸';   // 상세 팝업 라벨 즉시 갱신
    markCmpDirty(); renderPlanPop(c);
  };
  renderPlanPop(c);
  pop.onclick = e => { if (e.target.dataset.ppclose !== undefined || e.target === pop) pop.remove(); };
}
function renderPlanPop(c) {                 // 본 플래너와 동일: CD 게이팅·방어 CD감소·궁 재배치 적용
  const grid = $('#ppGrid'); if (!grid) return;
  const meta = CHARS[c.id] || {}, apt = meta.actionsPerTurn || 1, on = !!c.cfg.usePlan, turns = cmpCommon.turns || 30;
  let plan = (c.cfg.plan && c.cfg.plan.length) ? c.cfg.plan : (c.cfg.plan = defaultPlan(meta, turns));
  while (plan.length < turns * apt) plan.push('평');
  if (apt === 1) normalizePlan(plan, meta);          // CD 검증·게이팅 (단일행동 캐릭)
  const ok = apt === 1 ? ultAvail(plan, meta) : null;
  let html = '';
  for (let ti = 0; ti < turns; ti++) {
    let cells = '';
    for (let a = 0; a < apt; a++) {
      const idx = ti * apt + a, act = plan[idx];
      const btn = (k, l) => {
        const lockUlt = apt === 1 && k === '궁' && !ok[ti] && !(meta.cdDefendReduce > 0);   // CD 안 찬 턴 궁 잠금
        return `<button class="a${k}${act === k ? ' on' : ''}" data-idx="${idx}" data-a="${k}"${(!on || lockUlt) ? ' disabled' : ''}>${l}</button>`;
      };
      cells += `<div class="pp-acts">${btn('평', '평')}${btn('궁', '궁')}${btn('방', '방')}</div>`;
    }
    html += `<div class="pp-cell${apt > 1 ? ' dbl' : ''}"><div class="pp-t">${ti + 1}</div>${cells}</div>`;
  }
  const rules = $('#ppRules');
  if (rules) {
    const ruleTxt = apt > 1
      ? `매 턴 <b style="color:var(--gold)">${apt}회 행동</b> · 궁은 턴당 1회 (궁궁 불가) · 임부언 추가행동은 평타`
      : `필살 CD <b style="color:var(--gold)">${meta.fatalCd}턴</b> · 첫 사용 <b style="color:var(--gold)">${meta.firstFatal}턴</b> · 궁은 CD 안 찬 턴 비활성`;
    rules.innerHTML = `<span>${ruleTxt}</span><span class="plan-fill">
      <button data-fill="평"${on ? '' : ' disabled'}>모두 평타</button><button data-fill="방"${on ? '' : ' disabled'}>모두 방어</button>${c.id === PASSIVE_DEF_ID ? `<button data-pdef${on ? '' : ' disabled'} title="궁극기 직전 턴을 방어로 (패시브 활용) · 다시 누르면 평타로 복원">패시브 방어</button>` : ''}</span>`;
    rules.querySelectorAll('[data-fill]').forEach(b => b.onclick = () => {
      c.cfg.plan = fillPlan(meta, b.dataset.fill, turns);     // apt 인식: 단일행동은 궁 cadence 유지, 이태호는 순수 채움
      c.cfg.rotation = c.cfg.plan.join(''); markCmpDirty(); renderPlanPop(c);
    });
    const pdb = rules.querySelector('[data-pdef]');           // 파미도: 궁 직전 턴 방어 토글 (메인 모달과 동일)
    if (pdb) {
      const tgt = passiveDefendPlan(meta, turns);
      pdb.classList.toggle('on', on && !!(c.cfg.plan && c.cfg.plan.join('') === tgt.join('')));
      pdb.onclick = () => {
        const isOn = c.cfg.plan && c.cfg.plan.join('') === tgt.join('');
        c.cfg.plan = isOn ? fillPlan(meta, '평', turns) : passiveDefendPlan(meta, turns);
        c.cfg.rotation = c.cfg.plan.join(''); markCmpDirty(); renderPlanPop(c);
      };
    }
  }
  grid.className = 'pp-grid' + (on ? '' : ' off');
  grid.innerHTML = html;
  grid.onclick = on ? (e => {
    const btn = e.target.closest('button[data-a]'); if (!btn || btn.disabled) return;
    const idx = +btn.dataset.idx, a = btn.dataset.a;
    plan[idx] = a;
    if (apt > 1 && a === '궁') {                      // 궁은 턴당 1회 — 같은 턴 다른 슬롯의 궁 제거
      const ti0 = Math.floor(idx / apt);
      for (let a2 = 0; a2 < apt; a2++) { const j = ti0 * apt + a2; if (j !== idx && plan[j] === '궁') plan[j] = '평'; }
    }
    if (a === '궁' && meta.cdDefendReduce > 0) {      // 모이루·히토하: 앞턴 방어+입질 평타 자동 배치
      enforceCdDefend(plan, meta, idx + 1);
      toast(`${meta.name}: 필살 CD 감소를 위해 바로 앞 턴을 <b>방어</b>로, 그 앞에 입질용 <b>평타</b>를 자동 배치했어요`);
    } else if (apt === 1 && a === '궁') reflowUlts(plan, meta, idx + 1);   // 단일행동: 궁 자동 재배치
    if (apt === 1) normalizePlan(plan, meta);
    c.cfg.plan = plan; c.cfg.rotation = plan.join('');
    markCmpDirty(); renderPlanPop(c);
  }) : null;
  // 이태호(1포지션) + 임부언 동반 시: 임부언 fed 추가행동 선택 (메인 모달과 동일)
  const fedBox = $('#ppFed');
  if (fedBox) {
    const showFed = on && c.id === TAEHO_ID && c.slotIdx === 0
      && (cmpTeam[c.side] || []).some(t => t && t.id === IMBUEON_ID);
    if (!showFed) fedBox.innerHTML = '';
    else {
      const fv = c.cfg.fedAction || '평';
      fedBox.innerHTML = `<div class="fed-pick"><span class="pt-label">임부언의 추가행동으로 얻은 행동</span>
        <div class="seg" id="ppFedSeg">
          <button data-fv="평" class="${fv === '평' ? 'on' : ''}">평타</button>
          <button data-fv="궁" class="${fv === '궁' ? 'on' : ''}">궁극기</button>
          <button data-fv="방" class="${fv === '방' ? 'on' : ''}">방어</button>
        </div></div>`;
      fedBox.querySelectorAll('#ppFedSeg button').forEach(b => b.onclick = () => {
        c.cfg.fedAction = b.dataset.fv;
        fedBox.querySelectorAll('#ppFedSeg button').forEach(x => x.classList.toggle('on', x === b));
        markCmpDirty();
      });
    }
  }
}
function openPrioPop(side) {                // 비교군별 행동 우선순위 + 특정 턴 오버라이드
  document.querySelector('.priopop')?.remove();
  const pop = document.createElement('div'); pop.className = 'priopop';
  pop.innerHTML = `<div class="pr-card"><button class="mc-close" data-prclose>×</button>
    <div class="pp-head"><h3>행동 우선순위 <em>(비교군 ${side === 'a' ? 'A' : 'B'})</em></h3></div>
    <div class="pr-sub">행동 순서 <em>(드래그·▲▼)</em></div>
    <ol class="prio" id="prPrio"></ol>
    <div class="pr-sub">특정 턴만 다르게 <em>(턴 선택 후 순서 변경)</em></div>
    <div class="turn-chips" id="prChips"></div>
    <div id="prEditor"></div>
    <button class="btn-ghost sm" id="prReset" style="margin-top:10px">전부 기본값으로</button></div>`;
  document.body.appendChild(pop);
  const selT = autoSelOverrides(cmpTurnOv[side] || {}), turns = cmpCommon.turns || 30, order = () => sideOrder(side);
  function renderList() {
    const ord = order();
    $('#prPrio').innerHTML = ord.map((o, k) => { const c = CHARS[o.s.id] || {};
      return `<li class="${o.s.priority != null ? 'cust' : ''}" draggable="true"><span class="ord">${k + 1}</span>
        <img class="pic el-${c.elementKey}" src="${icon(o.s.id)}" alt="" draggable="false">
        <span class="nm">${c.name || o.s.id}</span>${mvArrows(k, ord.length)}</li>`; }).join('');
    const apply = arr => { arr.forEach((o, k) => o.s.priority = k + 1); markCmpDirty(); renderList(); };
    makeDraggable($('#prPrio'), (from, to) => { const arr = order(); const [m] = arr.splice(from, 1); arr.splice(to, 0, m); apply(arr); });
    $('#prPrio').onclick = e => { const b = e.target.closest('.mv'); if (!b) return;
      const arr = order(), k = +b.dataset.k, to = b.dataset.mv === 'up' ? k - 1 : k + 1; if (to < 0 || to >= arr.length) return;
      const [m] = arr.splice(k, 1); arr.splice(to, 0, m); apply(arr); };
    renderChips();
  }
  function renderChips() {
    for (const t of [...selT]) if (t > turns) selT.delete(t);
    const ov = cmpTurnOv[side] || (cmpTurnOv[side] = {});
    $('#prChips').innerHTML = Array.from({ length: turns }, (_, i) => { const t = i + 1;
      return `<button class="${ov[t] ? 'has' : ''} ${selT.has(t) ? 'sel' : ''}" data-t="${t}">${t}</button>`; }).join('');
    $('#prChips').onclick = e => { const b = e.target.closest('button'); if (!b) return;
      const t = +b.dataset.t;
      if (selT.has(t)) { selT.delete(t); if (ov[t]) { delete ov[t]; markCmpDirty(); } }   // 해제 = 완전 off (오버라이드까지 제거 → 재진입 시 재선택 방지)
      else selT.add(t);
      renderChips(); };
    renderEditor();
  }
  function renderEditor() {
    const ed = $('#prEditor'); if (!selT.size) { ed.innerHTML = ''; return; }
    const ov = cmpTurnOv[side] || (cmpTurnOv[side] = {});
    const sel = [...selT].sort((a, b) => a - b), first = sel[0];
    const baseOrd = order().map(o => o.i + 1);
    let ord = (ov[first] ? [...ov[first]] : [...baseOrd]).filter(p => (cmpTeam[side] || [])[p - 1]);
    const anyHas = sel.some(t => ov[t]);
    const label = sel.length === 1 ? `${first}턴` : `${sel.length}개 턴 (${sel.join('·')})`;
    ed.innerHTML = `<div class="te-head"><b>${label}</b> 행동 순서 — ${anyHas ? '변경됨' : '기본 따름'}${sel.length > 1 ? ' <em>같은 순서로 일괄 적용</em>' : ''}</div>
      <ol class="prio">${ord.map((p, k) => { const c = CHARS[cmpTeam[side][p - 1].id] || {};
        return `<li draggable="true"><span class="ord">${k + 1}</span><img class="pic el-${c.elementKey}" src="${icon(cmpTeam[side][p - 1].id)}" alt="" draggable="false">
          <span class="nm">${c.name || ''}</span>${mvArrows(k, ord.length)}</li>`; }).join('')}</ol>
      ${anyHas ? '<button class="btn-ghost sm" id="prClearTurn">선택 턴 기본값으로</button>' : ''}`;
    const applyTurn = () => { sel.forEach(t => ov[t] = [...ord]); markCmpDirty(); renderChips(); };
    makeDraggable(ed.querySelector('.prio'), (from, to) => { const [m] = ord.splice(from, 1); ord.splice(to, 0, m); applyTurn(); });
    ed.querySelector('.prio').onclick = e => { const b = e.target.closest('.mv'); if (!b) return;
      const k = +b.dataset.k, to = b.dataset.mv === 'up' ? k - 1 : k + 1; if (to < 0 || to >= ord.length) return;
      const [m] = ord.splice(k, 1); ord.splice(to, 0, m); applyTurn(); };
    const ct = $('#prClearTurn'); if (ct) ct.onclick = () => { sel.forEach(t => delete ov[t]); markCmpDirty(); renderChips(); };
  }
  $('#prReset').onclick = () => { (cmpTeam[side] || []).forEach(s => { if (s) delete s.priority; }); cmpTurnOv[side] = {}; selT.clear(); markCmpDirty(); renderList(); };
  renderList();
  pop.onclick = e => { if (e.target.dataset.prclose !== undefined || e.target === pop) pop.remove(); };
}
let cmpChart = null;                       // {ca, cb, n, mx} — 호버 조회용
function renderCmpChart() {
  const A = cmpData.a.chart || [], B = cmpData.b.chart || [];
  const n = Math.min(A.length, B.length); if (!n) { cmpChart = null; return; }   // 작은 쪽 턴까지만
  const cum = arr => { let s = 0; return arr.slice(0, n).map(t => (s += (t.total || 0))); };
  const ca = cum(A), cb = cum(B), mx = Math.max(...ca, ...cb, 1);
  cmpChart = { ca, cb, n, mx };
  const xp = i => i / Math.max(n - 1, 1) * 100;
  const pts = a => a.map((v, i) => `${xp(i).toFixed(1)},${(100 - v / mx * 100).toFixed(1)}`).join(' ');
  // 가로 그리드 (25/50/75%) + x축 턴 라벨
  const grid = [25, 50, 75].map(p => `<div class="cc-grid" style="top:${p}%"></div>`).join('');
  const step = Math.max(1, Math.ceil(n / 8)); let ticks = '';
  for (let i = 0; i < n; i += step) ticks += `<span style="left:${xp(i)}%;transform:translateX(${i === 0 ? '0' : '-50%'})">${i + 1}</span>`;
  ticks += `<span style="left:100%;transform:translateX(-100%)">${n}</span>`;
  $('#cmpChart').innerHTML = `<div class="cc-title">턴별 누적 딜 <em>(${n}턴 기준)</em></div>
    <div class="cc-plot" id="ccPlot">${grid}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline class="ln-a" points="${pts(ca)}"/><polyline class="ln-b" points="${pts(cb)}"/></svg>
      <div class="cc-cursor" hidden></div><div class="cc-dot a" hidden></div><div class="cc-dot b" hidden></div>
      <div class="cc-tip" hidden></div></div>
    <div class="cc-axis">${ticks}</div>
    <div class="cc-leg"><span class="lg a">A 총 ${fmtShort(ca[n-1])}</span><span class="lg b">B 총 ${fmtShort(cb[n-1])}</span><span class="cc-hh">막대 위에 마우스를 올려 턴별 차이 보기</span></div>`;
}
function cmpCursor(plot, i) {
  const { ca, cb, n, mx } = cmpChart;
  const xpc = i / Math.max(n - 1, 1) * 100, a = ca[i], b = cb[i];
  const cur = plot.querySelector('.cc-cursor'), tip = plot.querySelector('.cc-tip');
  const dA = plot.querySelector('.cc-dot.a'), dB = plot.querySelector('.cc-dot.b');
  cur.style.left = xpc + '%'; cur.hidden = false;
  dA.style.left = xpc + '%'; dA.style.top = (100 - a / mx * 100) + '%'; dA.hidden = false;
  dB.style.left = xpc + '%'; dB.style.top = (100 - b / mx * 100) + '%'; dB.hidden = false;
  const aWin = a > b, diff = Math.abs(a - b), pct = Math.min(a, b) ? Math.round((Math.max(a, b) / Math.min(a, b) - 1) * 100) : 0;
  tip.innerHTML = `<div class="ct-t">${i + 1}턴</div>
    <div class="ct-l"><span class="d-a">A</span>${fmt(a)}</div><div class="ct-l"><span class="d-b">B</span>${fmt(b)}</div>
    <div class="ct-d ${a === b ? 'eq' : aWin ? 'win-a' : 'win-b'}">${a === b ? '동일' : `${aWin ? 'A' : 'B'} +${fmtShort(diff)} · +${pct}%`}</div>`;
  tip.hidden = false;
  tip.style.left = (xpc > 58 ? xpc - 3 : xpc + 3) + '%';
  tip.style.transform = xpc > 58 ? 'translateX(-100%)' : '';
}
function cmpCursorHide() { document.querySelectorAll('.cc-cursor,.cc-dot,.cc-tip').forEach(el => el.hidden = true); }
async function runCompare() {
  const ra = cmpSideRec('a'), rb = cmpSideRec('b');
  if (!ra || !rb) { $('#cmpBody').innerHTML = `<div class="cmp-hint">비교할 대상을 골라주세요</div>`; return; }
  if (ra.id === rb.id) { $('#cmpBody').innerHTML = `<div class="cmp-hint">서로 다른 두 기록을 골라주세요</div>`; return; }
  loadCmpTeam('a', ra); loadCmpTeam('b', rb);
  $('#cmpRun')?.classList.remove('dirty');
  $('#cmpBody').innerHTML = `<div class="cmp-hint"><span class="spin"></span> 두 조합 재실행 중…</div>`;
  try {
    // 진행 턴 수: 사용자가 안 건드렸으면 두 그룹 최소턴(빈 그룹=30) 자동, 건드렸으면 슬라이더 우선
    if (!cmpTurnsManual) {
      const autoT = Math.min(+ra.snap.turns || 30, +rb.snap.turns || 30);
      cmpCommon.turns = autoT;
      const ct = $('#cmpTurns'); if (ct) { ct.value = autoT; ct.style.setProperty('--p', (autoT / 30 * 100) + '%'); $('#cmpTurnsVal').textContent = autoT; }
    }
    const mt = cmpCommon.turns || 30;
    const simSide = (side, rec) => {        // 빈 편성이면 시뮬 생략(빈 결과)
      if (!(cmpTeam[side] || []).some(Boolean)) return Promise.resolve({ meta: { total: 0, totalMid: 0, turns: mt }, perChar: [], chart: [], team: [] });
      const cfg = cfgFromTeam(side, rec.snap); cfg.turns = mt;
      return API.simulate(cfg);
    };
    const [da, db] = await Promise.all([simSide('a', ra), simSide('b', rb)]);
    if (da.error || db.error) throw new Error(da.error || db.error);
    cmpDmg.a = {}; (da.perChar || []).forEach(c => cmpDmg.a[c.id] = c.damage);
    cmpDmg.b = {}; (db.perChar || []).forEach(c => cmpDmg.b[c.id] = c.damage);
    cmpData = { a: { ...da, snap: ra.snap }, b: { ...db, snap: rb.snap }, turns: mt };
    cmpPending = false;
    cmpPairs = cmpMatch();                 // 수동 모드면 위치기반(스냅백 없음), 아니면 자동매칭
    renderCmpLane();
  } catch (e) { $('#cmpBody').innerHTML = `<div class="cmp-hint">비교 실패 — ${esc(e.message || '오류')}</div>`; }
}
function bindCompare() {
  const opts = () => histView().map(r => `<option value="${r.id}">${(r.pinned ? '📌' : '') + (r.locked ? '🔒' : '')}${esc(r.name || r.label)}</option>`).join('');
  $('#cmpBtn').onclick = () => {
    // 매번 빈 편성으로 초기화 — 최상단 "비교군 A/B"(빈 편성) 기본 선택
    $('#cmpA').innerHTML = `<option value="">＋ 비교군 A (빈 편성)</option>` + opts();
    $('#cmpB').innerHTML = `<option value="">＋ 비교군 B (빈 편성)</option>` + opts();
    $('#cmpA').value = ''; $('#cmpB').value = '';
    cmpLoaded = { a: null, b: null }; cmpTeam = { a: null, b: null }; cmpTurnOv = { a: {}, b: {} };
    cmpTurnsManual = false; cmpManual = false;
    const ct0 = $('#cmpTurns'); if (ct0) { ct0.value = 30; ct0.style.setProperty('--p', '100%'); $('#cmpTurnsVal').textContent = 30; }
    syncCommon();
    $('#cmpModal').hidden = false; runCompare();
  };
  $('#cmpModal').onclick = e => { if (e.target.dataset.cclose !== undefined) $('#cmpModal').hidden = true; };
  // 가이드 모달
  $('#guideBtn').onclick = () => { $('#guideModal').querySelector('.guide-body').scrollTop = 0; $('#guideModal').hidden = false; };
  $('#guideModal').onclick = e => { if (e.target.dataset.gclose !== undefined) $('#guideModal').hidden = true; };
  $('#cmpA').onchange = () => { cmpManual = false; runCompare(); };   // 새 기록 = 자동매칭 다시
  $('#cmpB').onchange = () => { cmpManual = false; runCompare(); };
  // 공통 전투 설정 — 변경은 상태만 갱신, 재계산은 '비교하기' 버튼으로 (매번 재실행 방지)
  $('#cmpForce').onclick = () => { $('#cmpForce').classList.toggle('on'); syncCommon(); markCmpDirty(); };
  $('#cmpHp10').onclick = () => { $('#cmpHp10').classList.toggle('on'); syncCommon(); markCmpDirty(); };
  ['cmpEl', 'cmpDummies', 'cmpHits'].forEach(id => {
    $('#' + id).onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      const seg = $('#' + id); seg.dataset.val = b.dataset.v;
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      syncCommon(); markCmpDirty();
    };
  });
  const ct = $('#cmpTurns');
  if (ct) {
    const ctUpd = () => { $('#cmpTurnsVal').textContent = ct.value; ct.style.setProperty('--p', (ct.value / 30 * 100) + '%'); };
    ct.oninput = () => { cmpTurnsManual = true; ctUpd(); };
    ct.onchange = () => { cmpTurnsManual = true; syncCommon(); markCmpDirty(); }; ctUpd();
  }
  $('#cmpRun').onclick = () => runCompare();
  $('#cmpBody').onclick = e => {
    const prio = e.target.closest('[data-prio]');
    if (prio) { openPrioPop(prio.dataset.prio); return; }     // 행동 우선순위 팝업
    const mv = e.target.closest('[data-mv]');
    if (mv) {                                  // ▲▼: 위치 이동(수동 전환 후 이웃 행과 교체)
      const i = +mv.dataset.row, sd = mv.dataset.mvside, dir = mv.dataset.mv;
      const ch = cmpPairs[i] && cmpPairs[i][sd]; if (!ch || !ch.cfg) return;
      cmpGoManual();
      const arr = cmpTeam[sd] || [], k = arr.indexOf(ch.cfg); if (k < 0) return;
      let t = -1;
      if (dir === 'up') { for (let x = k - 1; x >= 0; x--) if (arr[x]) { t = x; break; } }
      else { for (let x = k + 1; x < arr.length; x++) if (arr[x]) { t = x; break; } }
      if (t < 0) return;
      [arr[k], arr[t]] = [arr[t], arr[k]]; cmpSwapTurnOv(sd, k + 1, t + 1); cmpRelayout(); return;
    }
    const add = e.target.closest('.cmp-cell.empty[data-side]');     // 빈칸 클릭 → 캐릭터 추가
    if (add) { openAddPop(add.dataset.side); return; }
    const cell = e.target.closest('.cmp-cell[data-side]'); if (!cell) return;   // 아이콘 클릭 → 도장·행동·교체
    openCmpInfo(cmpPairs[+cell.closest('.cmp-row').dataset.row][cell.dataset.side]);
  };
  $('#cmpBody').addEventListener('mousemove', e => {       // 그래프 호버 → 턴별 차이
    const plot = e.target.closest('#ccPlot');
    if (!plot || !cmpChart) { cmpCursorHide(); return; }
    const rect = plot.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    cmpCursor(plot, Math.round(x * (cmpChart.n - 1)));
  });
  $('#cmpBody').addEventListener('mouseleave', cmpCursorHide);
  let dragRow = null, dragSide = null;
  $('#cmpBody').addEventListener('dragstart', e => {
    const c = e.target.closest('.cmp-cell[data-side]');
    if (c && !c.classList.contains('empty')) { dragSide = c.dataset.side; dragRow = +c.closest('.cmp-row').dataset.row; }
  });
  $('#cmpBody').addEventListener('dragover', e => { if (dragRow !== null && e.target.closest('.cmp-row')) e.preventDefault(); });
  $('#cmpBody').addEventListener('drop', e => {
    const row = e.target.closest('.cmp-row'); if (dragRow === null || !row) { dragRow = dragSide = null; return; }
    const j = +row.dataset.row;
    if (j !== dragRow) {                        // 드래그: 수동 전환 후 두 캐릭 위치(슬롯) 교체 — 스냅백 없음
      const ca = cmpPairs[dragRow] && cmpPairs[dragRow][dragSide], cb = cmpPairs[j] && cmpPairs[j][dragSide];
      if (ca && cb && ca.cfg && cb.cfg) {
        cmpGoManual();
        const arr = cmpTeam[dragSide], ka = arr.indexOf(ca.cfg), kb = arr.indexOf(cb.cfg);
        if (ka >= 0 && kb >= 0) { [arr[ka], arr[kb]] = [arr[kb], arr[ka]]; cmpSwapTurnOv(dragSide, ka + 1, kb + 1); cmpRelayout(); }
      }
    }
    dragRow = dragSide = null;
  });
}

(async function init() {
  if (!USE_PY) document.getElementById('boot')?.remove();   // 로컬(fetch)은 즉시 로딩
  const list = await API.chars();
  list.forEach(c => CHARS[c.id] = c);
  loadHistory();
  bindSettings();
  bindHistory();
  bindCompare();
  renderHistory(simHistory[0]?.id);
  if (simHistory.length) {                 // 재진입 시 가장 최근 기록으로 복원
    restoreRecord(simHistory[0]);
  } else {
    const def = [10401, 10410, 10421, 10428, 10425];
    def.forEach((id, i) => team[i] = { id, skill: 10, rune: true, rotation: '' });
    buildFilters(); renderRoster(); renderTeam(); renderPrio();
  }
})();

// ── roster ──
function buildFilters() {
  const f = $('#rosterFilter');
  const mk = (v, t) => `<button data-f="${v}" class="${v === filter ? 'on' : ''}">${t}</button>`;
  f.innerHTML = mk('all', '전체') + EL_ORDER.map(e => mk(e, EL_KR[e])).join('');
  f.onclick = e => { const b = e.target.closest('button'); if (!b) return; filter = b.dataset.f; buildFilters(); renderRoster(); };
}
function renderRoster() {
  const wrap = $('#roster');
  const ids = Object.keys(CHARS).map(Number)
    .filter(id => filter === 'all' || CHARS[id].elementKey === filter)
    .sort((a, b) => a - b);
  wrap.innerHTML = ids.map(id => {
    const c = CHARS[id], picked = team.some(s => s && s.id === id);
    return `<div class="rc el-${c.elementKey} ${picked ? 'picked' : ''}" data-id="${id}" title="${c.name}">
      <img src="${icon(id)}" loading="lazy" alt=""><span class="dot"></span></div>`;
  }).join('');
  wrap.onclick = e => { const el = e.target.closest('.rc'); if (el) pick(+el.dataset.id); };
}
function pick(id) {
  const at = team.findIndex(s => s && s.id === id);
  if (at >= 0) { team[at] = null; }            // toggle off
  else { const empty = team.findIndex(s => !s); if (empty < 0) return; team[empty] = { id, skill: 10, rune: true, rotation: '' }; }
  renderRoster(); renderTeam(); renderPrio();
}

// ── team slots ──
function renderTeam() {
  $('#teamSlots').innerHTML = team.map((s, i) => {
    if (!s) return `<div class="slot" data-i="${i}"><span class="pos">P${i + 1}</span><span class="empty">+</span></div>`;
    const c = CHARS[s.id];
    return `<div class="slot filled el-${c.elementKey}" data-i="${i}" style="--el:var(--${c.elementKey})">
      <span class="pos">P${i + 1}</span><button class="rm" data-rm="${i}">×</button>
      <img src="${icon(s.id)}" alt=""><span class="nm">${c.name}</span></div>`;
  }).join('');
  $('#teamSlots').onclick = e => {
    const rm = e.target.closest('.rm'); if (rm) { team[+rm.dataset.rm] = null; renderRoster(); renderTeam(); renderPrio(); return; }
    const sl = e.target.closest('.slot'); if (!sl) return;
    const i = +sl.dataset.i;
    if (team[i]) openModal(i); else { filter = 'all'; buildFilters(); renderRoster(); $('#roster').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  };
}

// ── priority ──
function basePriority(s, pos) { return (SPECIAL[s.id] ?? ROLE_RANK[CHARS[s.id].role] ?? 9) + pos * 0.01; }
function teamOrder() {
  return team.map((s, i) => s ? { s, i } : null).filter(Boolean)
    .map(o => ({ ...o, p: o.s.priority ?? basePriority(o.s, o.i + 1) }))
    .sort((a, b) => a.p - b.p);
}
let turnOverrides = {};   // {turn:[position,...]}  per-turn order override
let selTurns = new Set();  // 다중선택된 턴들 (토글)
// 진입 시 오버라이드 설정된 턴 자동 선택 — 첫 턴과 같은 순서를 가진 것만 묶어(드래그 덮어쓰기 방지)
function autoSelOverrides(ov) {
  const keys = Object.keys(ov || {}).map(Number).sort((a, b) => a - b), set = new Set();
  if (keys.length) {
    const first = JSON.stringify(ov[keys[0]]);
    keys.forEach(t => { if (JSON.stringify(ov[t]) === first) set.add(t); });
  }
  return set;
}

function makeDraggable(list, onReorder) {
  let dragEl = null;
  [...list.children].forEach(li => {
    li.addEventListener('dragstart', e => { dragEl = li; e.dataTransfer.effectAllowed = 'move'; setTimeout(() => li.classList.add('dragging'), 0); });
    li.addEventListener('dragend', () => { li.classList.remove('dragging'); [...list.children].forEach(x => x.classList.remove('over')); dragEl = null; });
    li.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    li.addEventListener('dragenter', () => { if (dragEl && li !== dragEl) li.classList.add('over'); });
    li.addEventListener('dragleave', () => li.classList.remove('over'));
    li.addEventListener('drop', e => {
      e.preventDefault(); li.classList.remove('over');
      if (!dragEl || dragEl === li) return;
      const items = [...list.children];
      onReorder(items.indexOf(dragEl), items.indexOf(li));
    });
  });
}
function mvArrows(k, len) {   // 터치용 위/아래 버튼 (드래그가 안 되는 모바일 대비)
  return `<span class="mv-col">
    <button class="mv" data-mv="up" data-k="${k}"${k === 0 ? ' disabled' : ''} aria-label="위로">▲</button>
    <button class="mv" data-mv="dn" data-k="${k}"${k === len - 1 ? ' disabled' : ''} aria-label="아래로">▼</button></span>`;
}
function renderPrio() {
  const ord = teamOrder();
  $('#prio').innerHTML = ord.map((o, k) => {
    const c = CHARS[o.s.id], cust = o.s.priority != null;
    return `<li class="${cust ? 'cust' : ''}" draggable="true"><span class="ord">${k + 1}</span>
      <img class="pic el-${c.elementKey}" src="${icon(o.s.id)}" alt="" draggable="false">
      <span class="nm">${c.name}</span>${mvArrows(k, ord.length)}</li>`;
  }).join('');
  const apply = arr => { arr.forEach((o, k) => o.s.priority = k + 1); renderPrio(); };
  makeDraggable($('#prio'), (from, to) => {
    const arr = teamOrder(); const [m] = arr.splice(from, 1); arr.splice(to, 0, m); apply(arr);
  });
  $('#prio').onclick = e => {
    const b = e.target.closest('.mv'); if (!b) return;
    const arr = teamOrder(), k = +b.dataset.k, to = b.dataset.mv === 'up' ? k - 1 : k + 1;
    if (to < 0 || to >= arr.length) return;
    const [m] = arr.splice(k, 1); arr.splice(to, 0, m); apply(arr);
  };
  renderTurnChips();
}
function renderTurnChips() {
  const n = +$('#turns').value;
  for (const t of [...selTurns]) if (t > n) selTurns.delete(t);   // 턴 수 줄면 정리
  const chips = $('#turnChips');
  chips.innerHTML = Array.from({ length: n }, (_, i) => {
    const t = i + 1;
    return `<button class="${turnOverrides[t] ? 'has' : ''} ${selTurns.has(t) ? 'sel' : ''}" data-t="${t}">${t}</button>`;
  }).join('');
  chips.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const t = +b.dataset.t;
    if (selTurns.has(t)) { selTurns.delete(t); delete turnOverrides[t]; }   // 해제 = 완전 off (오버라이드까지 제거 → 재진입 시 재선택 방지)
    else selTurns.add(t);
    renderTurnChips();
  };
  renderTurnEditor();
}
function renderTurnEditor() {
  const ed = $('#turnEditor');
  if (!selTurns.size) { ed.innerHTML = ''; return; }
  const sel = [...selTurns].sort((a, b) => a - b);
  const first = sel[0];
  const baseOrd = teamOrder().map(o => o.i + 1);
  let ord = (turnOverrides[first] ? [...turnOverrides[first]] : [...baseOrd]).filter(p => team[p - 1]);
  const anyHas = sel.some(t => turnOverrides[t]);
  const label = sel.length === 1 ? `${first}턴` : `${sel.length}개 턴 (${sel.join('·')})`;
  ed.innerHTML = `<div class="te-head"><b>${label}</b> 행동 순서 — ${anyHas ? '변경됨' : '기본 따름'}${sel.length > 1 ? ' <em>같은 순서로 일괄 적용</em>' : ''}</div>
    <ol class="prio">${ord.map((p, k) => { const c = CHARS[team[p - 1].id];
      return `<li draggable="true"><span class="ord">${k + 1}</span><img class="pic el-${c.elementKey}" src="${icon(team[p - 1].id)}" alt="" draggable="false">
        <span class="nm">${c.name}</span>${mvArrows(k, ord.length)}</li>`; }).join('')}</ol>
    ${anyHas ? '<button class="btn-ghost sm" id="clearTurn">선택 턴 기본값으로</button>' : ''}`;
  const applyTurn = () => { sel.forEach(t => turnOverrides[t] = [...ord]); renderTurnChips(); };
  makeDraggable(ed.querySelector('.prio'), (from, to) => {
    const [m] = ord.splice(from, 1); ord.splice(to, 0, m); applyTurn();
  });
  ed.querySelector('.prio').onclick = e => {
    const b = e.target.closest('.mv'); if (!b) return;
    const k = +b.dataset.k, to = b.dataset.mv === 'up' ? k - 1 : k + 1;
    if (to < 0 || to >= ord.length) return;
    const [m] = ord.splice(k, 1); ord.splice(to, 0, m); applyTurn();
  };
  const ct = $('#clearTurn'); if (ct) ct.onclick = () => { sel.forEach(t => delete turnOverrides[t]); renderTurnChips(); };
}
$('#prioReset').onclick = () => { team.forEach(s => { if (s) delete s.priority; }); turnOverrides = {}; selTurns.clear(); renderPrio(); };

// ── settings ──
function syncRunsField() {   // 100% 모드(결정론)면 반복 횟수 무의미 → 흐리게
  const f = $('#runsField'); if (f) f.classList.toggle('dim', forceProc);
}
function bindSettings() {
  const t = $('#turns'); const upd = () => { $('#turnsVal').textContent = t.value; t.style.setProperty('--p', (t.value / 30 * 100) + '%'); if ($('#turnChips')) renderTurnChips(); };
  t.oninput = upd; upd();
  const r = $('#runs'); const rupd = () => { $('#runsVal').textContent = r.value; r.style.setProperty('--p', (r.value / 200 * 100) + '%'); };
  r.oninput = rupd; rupd();
  $$('.seg').forEach(seg => seg.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    seg.dataset.val = b.dataset.v; seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  });
  $('#forceProc').onclick = () => {
    forceProc = !forceProc; $('#forceProc').classList.toggle('on', forceProc); syncRunsField();
    toast(forceProc ? '확률 100% 모드 ON<br>· 모든 확률형 스킬 100% 강제' : '확률 100% 모드 OFF');
  };
  $('#hp10Btn').onclick = () => {
    hp10 = !hp10; $('#hp10Btn').classList.toggle('on', hp10);
    toast(hp10 ? '체력 10% 모드 ON<br>· 더미 체력 10% 고정 (카라트 등 저HP 게이트 발동)' : '체력 10% 모드 OFF');
  };
  $('#runBtn').onclick = () => run(true);
}
let forceProc = false;   // 확률 100% 모드
let hp10 = false;        // 체력 10% 모드 (더미 HP 고정)

// ── char detail modal ──
async function openModal(i) {
  const s = team[i], c = CHARS[s.id];
  const limit = c.sealLimit || 20000;
  if (s.sealAtk == null) { s.sealAtk = 0; s.sealHp = limit; }   // 기본: 한계 전부 체력
  const m = $('#modal'), card = $('#modalCard');
  card.className = 'modal-card el-' + c.elementKey; card.style.setProperty('--el', `var(--${c.elementKey})`);
  card.innerHTML = `<button class="mc-close" data-close>×</button>
    <div class="mc-top"><img src="${icon(s.id)}" alt="">
      <div class="info"><h2>${c.name}</h2><div class="tags">
        <span class="tag el">${c.element}속성</span><span class="tag">${c.role}</span><span class="tag">P${i + 1}</span></div></div></div>
    <div class="mc-seal${s.sealOn ? ' on' : ''}" id="mcSeal">
      <label class="toggle seal-head"><input type="checkbox" id="sealOn" ${s.sealOn ? 'checked' : ''}><span class="sw"></span>도장 강화 <em>한계 ${fmt(limit)} (공격력+체력)</em></label>
      <div class="seal-body">
        <div class="seal-row"><span class="sl-lbl atk">공격력</span>
          <input type="range" id="sealAtkR" min="0" max="${limit}" step="100" value="${s.sealAtk}">
          <input type="number" id="sealAtkN" min="0" max="${limit}" step="100" value="${s.sealAtk}"></div>
        <div class="seal-row"><span class="sl-lbl hp">체력</span>
          <input type="range" id="sealHpR" min="0" max="${limit}" step="100" value="${s.sealHp}">
          <input type="number" id="sealHpN" min="0" max="${limit}" step="100" value="${s.sealHp}"></div>
        <div class="seal-ratio" id="sealRatio"></div>
      </div>
    </div>
    <div class="mc-stats">
      <div class="s"><label>기본 공격력 <em id="stAtkAdd"></em></label><b class="num" id="stAtk">${fmt(c.atk + s.sealAtk)}</b></div>
      <div class="s"><label>최대 체력 <em id="stHpAdd"></em></label><b class="num" id="stHp">${fmt(c.hp + s.sealHp)}</b></div></div>
    <div class="mc-ctrl">
      <label class="field"><span>스킬 레벨 <b id="sklVal" style="color:var(--gold)">${s.skill}</b></span>
        <div class="row"><input type="range" id="skl" min="1" max="10" value="${s.skill}"></div></label>
      <label class="toggle"><input type="checkbox" id="rune" ${s.rune ? 'checked' : ''}><span class="sw"></span>도장(룬) 해제</label>
    </div>
    <div class="field">
      <label class="toggle" style="margin-bottom:10px"><input type="checkbox" id="usePlan" ${s.usePlan ? 'checked' : ''}><span class="sw"></span>턴별 행동 직접 계획 <em style="margin-left:4px">(끄면 자동)</em></label>
      <div id="plannerWrap" ${s.usePlan ? '' : 'hidden'}>
        <div class="plan-legend">
          <span>${(c.actionsPerTurn || 1) > 1
            ? `매 턴 <b style="color:var(--gold)">${c.actionsPerTurn}회 행동</b> · <b style="color:var(--gold)">궁은 턴당 1회</b> (궁궁 불가, 궁평/평궁만) · 임부언 추가행동은 평타`
            : `필살 CD <b style="color:var(--gold)">${c.fatalCd}턴</b> · 첫 사용 <b style="color:var(--gold)">${c.firstFatal}턴</b> — <b style="color:var(--gold)">궁</b>은 CD 안 찬 턴엔 비활성`}</span>
          <span class="plan-fill"><button data-fill="평">모두 평타</button><button data-fill="방">모두 방어</button>${c.id === PASSIVE_DEF_ID ? '<button data-pdef title="궁극기 직전 턴을 방어로 (패시브 활용) · 다시 누르면 평타로 복원">패시브 방어</button>' : ''}</span>
        </div>
        <div class="planner" id="planner"></div>
        ${(c.id === TAEHO_ID && i === 0 && team.some(t => t && t.id === IMBUEON_ID)) ? `
        <div class="fed-pick">
          <span class="pt-label">임부언의 추가행동으로 얻은 행동</span>
          <div class="seg" id="fedSeg">
            <button data-fv="평" class="${(s.fedAction || '평') === '평' ? 'on' : ''}">평타</button>
            <button data-fv="궁" class="${s.fedAction === '궁' ? 'on' : ''}">궁극기</button>
            <button data-fv="방" class="${s.fedAction === '방' ? 'on' : ''}">방어</button>
          </div>
        </div>` : ''}
      </div>
    </div>
    <div class="skills" id="skills"><div class="empty-state"><span class="spin"></span>스킬 로딩…</div></div>`;
  m.hidden = false;

  const skl = $('#skl', card), sklVal = $('#sklVal', card);
  skl.style.setProperty('--p', (s.skill / 10 * 100) + '%');
  skl.oninput = () => { s.skill = +skl.value; sklVal.textContent = skl.value; skl.style.setProperty('--p', (skl.value / 10 * 100) + '%'); renderSkills(detail, s.skill); };
  $('#rune', card).onchange = e => { s.rune = e.target.checked; renderSkills(detail, s.skill); };
  const syncSeal = atk => {
    atk = Math.max(0, Math.min(limit, Math.round((atk || 0) / 100) * 100));
    s.sealAtk = atk; s.sealHp = limit - atk;
    $('#sealAtkR', card).value = atk; $('#sealAtkN', card).value = atk;
    $('#sealHpR', card).value = s.sealHp; $('#sealHpN', card).value = s.sealHp;
    $('#sealAtkR', card).style.setProperty('--p', (atk / limit * 100) + '%');
    $('#sealHpR', card).style.setProperty('--p', (s.sealHp / limit * 100) + '%');
    const ap = Math.round(atk / limit * 100);
    $('#sealRatio', card).innerHTML = `공격력 <b class="atk">${ap}%</b> : 체력 <b class="hp">${100 - ap}%</b>`;
    const ua = s.sealOn ? atk : 0, uh = s.sealOn ? s.sealHp : 0;   // 강화 꺼지면 기본값만
    $('#stAtk', card).textContent = fmt(c.atk + ua);
    $('#stHp', card).textContent = fmt(c.hp + uh);
    $('#stAtkAdd', card).textContent = ua ? `+${fmt(ua)}` : '';
    $('#stHpAdd', card).textContent = uh ? `+${fmt(uh)}` : '';
  };
  $('#sealOn', card).onchange = e => { s.sealOn = e.target.checked; $('#mcSeal', card).classList.toggle('on', s.sealOn); syncSeal(s.sealAtk); };
  $('#sealAtkR', card).oninput = e => syncSeal(+e.target.value);
  $('#sealAtkN', card).onchange = e => syncSeal(+e.target.value);
  $('#sealHpR', card).oninput = e => syncSeal(limit - +e.target.value);
  $('#sealHpN', card).onchange = e => syncSeal(limit - +e.target.value);
  syncSeal(s.sealAtk);
  $('#usePlan', card).onchange = e => {
    s.usePlan = e.target.checked;
    $('#plannerWrap', card).hidden = !s.usePlan;
    if (s.usePlan) { if (!s.plan) s.plan = defaultPlan(c); renderPlanner(s, c); }
    s.rotation = s.usePlan ? s.plan.join('') : '';
  };
  const pdefBtn = $('.plan-fill [data-pdef]', card);
  const syncPdef = () => {   // 현재 plan이 '패시브 방어' 배치와 정확히 일치하면 버튼 활성 표시
    if (!pdefBtn) return;
    const n = (s.plan?.length || 30) / (c.actionsPerTurn || 1);
    pdefBtn.classList.toggle('on', !!(s.usePlan && s.plan && s.plan.join('') === passiveDefendPlan(c, n).join('')));
  };
  $$('.plan-fill button[data-fill]', card).forEach(b => b.onclick = () => {
    s.plan = fillPlan(c, b.dataset.fill, 30); s.rotation = s.plan.join(''); renderPlanner(s, c); syncPdef();
  });
  if (pdefBtn) pdefBtn.onclick = () => {
    const target = passiveDefendPlan(c, 30);
    const isOn = s.plan && s.plan.join('') === target.join('');
    s.plan = isOn ? fillPlan(c, '평', 30) : target;   // 켜져 있으면 모두 평타로 복원, 아니면 패시브 방어 적용
    s.rotation = s.plan.join(''); renderPlanner(s, c); syncPdef();
  };
  if (s.usePlan) { if (!s.plan) s.plan = defaultPlan(c); renderPlanner(s, c); }
  syncPdef();
  $$('#fedSeg button', card).forEach(b => b.onclick = () => {   // 이태호 임부언 fed 추가행동 선택(평/궁/방)
    s.fedAction = b.dataset.fv;
    $$('#fedSeg button', card).forEach(x => x.classList.toggle('on', x === b));
  });

  const detail = await API.char(s.id);
  renderSkills(detail, s.skill);
}

// ── per-turn action planner (apt = actions per turn; 이태호 = 2) ──
function fillPlan(meta, action, n = 30) {
  const apt = meta.actionsPerTurn || 1;
  const plan = Array(n * apt).fill(action);
  if (apt === 1) {                          // 일반: 궁극기 최소 턴은 유지 (전부 평타/방어 + 궁 cadence)
    for (let t = meta.firstFatal; t <= n; t += meta.fatalCd) plan[t - 1] = '궁';
  }
  return plan;                              // 이태호(apt>1): 순수 평타/방어, 자동 궁 없음
}
function defaultPlan(meta, n = 30) {
  const plan = fillPlan(meta, '평', n);
  // 이태호(apt>1): 첫 행동을 궁으로 → 일지어천 진입 후 평타가 내기혼신 쌓아 데미지 (AUTO와 동일 사이클)
  if ((meta.actionsPerTurn || 1) > 1 && meta.firstFatal <= 1) plan[0] = '궁';
  return plan;
}
// 파미도용: 모두 평타(+궁 cadence) 위에 '궁 직전 턴'을 방어로 (패시브 활용). cdDefendReduce=0이라 궁 타이밍 불변.
function passiveDefendPlan(meta, n = 30) {
  const plan = fillPlan(meta, '평', n);                          // 평타 + 궁(4·7·10…)
  for (let i = 0; i < plan.length; i++)
    if (plan[i] === '궁' && i - 1 >= 0) plan[i - 1] = '방';      // 궁 직전 턴 → 방어
  return plan;
}
// CD 모델 (defend-aware). 히토하·모이루: 입질 보유(평타 후) 상태로 방어 시 필살 CD 1 감소
// → 4턴궁을 3턴 사이클로. 궁은 입질을 제거하므로 매 사이클 평타가 다시 필요.
function ultAvail(plan, meta) {           // ok[i] = 궁 usable on turn i+1, given the plan
  const ok = []; const red = meta.cdDefendReduce || 0;
  let cd = meta.firstFatal - 1, hooked = false;
  for (let t = 1; t <= plan.length; t++) {
    ok[t - 1] = cd <= 0;
    const act = plan[t - 1];
    if (act === '방' && red && hooked) cd -= red;     // 입질 보유 방어 = CD 가속
    if (act === '평') hooked = true;                  // 평타가 입질 부여
    if (act === '궁' && ok[t - 1]) { cd = meta.fatalCd; hooked = false; }  // 궁: CD 리셋 + 입질 제거
    cd -= 1;                                          // 턴 종료 자연 감소
  }
  return ok;
}
function normalizePlan(plan, meta) {      // drop 궁s that fall on a CD-locked turn
  const red = meta.cdDefendReduce || 0;
  let cd = meta.firstFatal - 1, hooked = false;
  for (let t = 1; t <= plan.length; t++) {
    const ready = cd <= 0, act = plan[t - 1];
    if (act === '방' && red && hooked) cd -= red;
    if (act === '평') hooked = true;
    if (act === '궁') { if (ready) { cd = meta.fatalCd; hooked = false; } else plan[t - 1] = '평'; }
    cd -= 1;
  }
}
// 히토하·모이루 전용: 궁을 놓으면 바로 앞 턴을 방어로 강제하고, 이번 사이클(직전 궁 이후)에
// 평타가 하나도 없으면 입질 부여용 평타를 하나 넣는다 (방어가 CD를 줄이려면 입질이 떠 있어야 함).
function enforceCdDefend(plan, meta, ultTurn) {   // ultTurn = 1-based 궁 턴
  if (!(meta.cdDefendReduce > 0) || ultTurn < 2) return;
  plan[ultTurn - 2] = '방';                       // 앞 턴 강제 방어
  let lastUlt = 0;
  for (let t = 1; t < ultTurn - 1; t++) if (plan[t - 1] === '궁') lastUlt = t;
  let hasBasic = false;
  for (let t = lastUlt + 1; t <= ultTurn - 2; t++) if (plan[t - 1] === '평') { hasBasic = true; break; }
  if (!hasBasic) for (let t = lastUlt + 1; t <= ultTurn - 2; t++)
    if (plan[t - 1] !== '궁') { plan[t - 1] = '평'; break; }   // 입질용 평타 1개 확보
}
function reflowUlts(plan, meta, anchor) { // re-place 궁s AFTER `anchor` at the earliest cadence
  let lastUlt = 0;                        // (preserves how many, and any 방어 turns)
  for (let t = 1; t <= anchor; t++) if (plan[t - 1] === '궁') lastUlt = t;
  let count = 0;
  for (let t = anchor + 1; t <= plan.length; t++) if (plan[t - 1] === '궁') { count++; plan[t - 1] = '평'; }
  let next = lastUlt ? lastUlt + meta.fatalCd : meta.firstFatal;
  for (let t = anchor + 1; t <= plan.length && count > 0; t++) {
    if (t < next || plan[t - 1] === '방') continue;
    plan[t - 1] = '궁'; next = t + meta.fatalCd; count--;
  }
}
function renderPlanner(s, meta) {
  const wrap = $('#planner'); if (!wrap) return;
  const apt = meta.actionsPerTurn || 1;
  const n = +$('#turns').value;
  while (s.plan.length < n * apt) s.plan.push('평');
  if (apt === 1) normalizePlan(s.plan, meta);     // CD 검증·게이팅은 단일행동 캐릭만
  const ok = apt === 1 ? ultAvail(s.plan, meta) : null;
  wrap.innerHTML = Array.from({ length: n }, (_, ti) => {
    const t = ti + 1;
    let cells = '';
    for (let a = 0; a < apt; a++) {
      const idx = ti * apt + a, act = s.plan[idx];
      // cdDefendReduce 캐릭(모이루 등)은 궁을 누르면 앞 턴 방어를 자동 배치해 쿨을 맞추므로
      // 현재 ok[]로 비활성하지 않는다(누른 뒤 enforceCdDefend+normalizePlan이 검증·정리).
      const b = (k, l) => {
        const lockUlt = apt === 1 && k === '궁' && !ok[ti] && !(meta.cdDefendReduce > 0);
        return `<button class="a${k} ${act === k ? 'on' : ''}" data-idx="${idx}" data-a="${k}"${lockUlt ? ' disabled' : ''}>${l}</button>`;
      };
      cells += `<div class="acts">${b('평', '평')}${b('궁', '궁')}${b('방', '방')}</div>`;
    }
    return `<div class="pcell${apt > 1 ? ' dbl' : ''}"><div class="tn">${t}</div>${cells}</div>`;
  }).join('');
  wrap.onclick = e => {
    const btn = e.target.closest('button'); if (!btn || btn.disabled) return;
    const idx = +btn.dataset.idx, a = btn.dataset.a;
    s.plan[idx] = a;
    if (apt > 1 && a === '궁') {                        // 궁은 턴당 1회 — 같은 턴 다른 슬롯의 궁은 평으로
      const ti0 = Math.floor(idx / apt);
      for (let a2 = 0; a2 < apt; a2++) { const j = ti0 * apt + a2; if (j !== idx && s.plan[j] === '궁') s.plan[j] = '평'; }
    }
    if (a === '궁' && meta.cdDefendReduce > 0) {       // 앞턴 방어+평타 강제 (입질 보유 방어 = CD 가속)
      enforceCdDefend(s.plan, meta, idx + 1);
      toast(`${meta.name}: 필살 CD 감소를 위해 바로 앞 턴을 <b>방어</b>로, 그 앞에 입질용 <b>평타</b>를 자동 배치했어요`);
    }
    else if (apt === 1 && a === '궁') reflowUlts(s.plan, meta, idx + 1);   // 단일행동: 궁 자동 재배치
    if (apt === 1) normalizePlan(s.plan, meta);
    s.rotation = s.plan.join('');
    renderPlanner(s, meta);
  };
}
function renderSkills(detail, lvl) {
  const wrap = $('#skills'); if (!wrap) return;
  const rune = $('#rune')?.checked;
  const li = Math.min(lvl, 10) - 1;
  wrap.innerHTML = detail.skills.filter(sk => {
    if (sk.slot === 'sigil') return rune;          // 룬 필살기는 도장 해제 시만
    if (sk.slot === 'ultimate') return !rune;      // 도장 해제 시 ultimate→sigil 대체
    return true;
  }).map(sk => {
    const e = sk.levels[Math.min(li, sk.levels.length - 1)] || {};
    const cd = e.cd ? `CD ${e.cd}` : '';
    const ic = skillIconSrc(sk.slot, detail.id);
    const slotEl = ic ? `<img class="slot-ic" src="${ic}" alt="${sk.slotKr}" title="${sk.slotKr}">` : `<span class="slot">${sk.slotKr}</span>`;
    return `<div class="sk"><div class="sk-h">${slotEl}<span class="skn">${sk.name}</span><span class="cd">${cd}</span></div>
      <div class="sk-b">${(e.kr || '').trim() || '—'}</div></div>`;
  }).join('');
  wrap.onclick = e => { const h = e.target.closest('.sk-h'); if (h) h.parentElement.classList.toggle('open'); };
}
$('#modal').onclick = e => { if (e.target.dataset.close !== undefined) $('#modal').hidden = true; };
document.addEventListener('keydown', e => { if (e.key === 'Escape') {
  const sub = document.querySelector('.iopop, .swappop, .sealpop, .planpop, .priopop'); if (sub) { sub.remove(); return; }   // 위 팝업부터 닫기
  const ci = document.querySelector('.cmpinfo'); if (ci) { ci.remove(); return; }
  $('#modal').hidden = true; $('#histModal').hidden = true; $('#cmpModal').hidden = true; $('#guideModal').hidden = true;
} });

function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.onclick = () => t.classList.remove('show'); document.body.appendChild(t); }
  t.innerHTML = `<span class="ti">⚠</span>${msg}`; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 5000);
}
function notifyUpdate(stale) {   // 새 배포 감지(또는 stale=옛 캐시 사용 중) 시 고정 알림(눌러서 새로고침)
  if ($('#upToast')) return;
  const t = document.createElement('div');
  t.id = 'upToast'; t.className = 'up-toast';
  t.innerHTML = stale
    ? `⚠️ 옛 버전을 쓰고 있어요 — <b>눌러서 새로고침</b>`
    : `🔄 새 버전이 배포됐어요 — <b>눌러서 새로고침</b>`;
  t.onclick = () => hardReload(t);
  document.body.appendChild(t);
}
// Ctrl+Shift+R 효과: 정적 자산을 HTTP 캐시 우회(cache:'reload')로 재다운로드 후 리로드.
// (Pyodide Python 엔진은 sim-worker.js가 ?v=버전으로 자체 캐시버스팅하므로 제외)
async function hardReload(toast) {
  if (toast) { toast.style.pointerEvents = 'none'; toast.innerHTML = '🔄 새로고침 중…'; }
  const bust = url => fetch(url, { cache: 'reload' }).catch(() => {});
  try {
    if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
    await Promise.all([location.href, 'index.html', 'style.css', 'mobile.css',
      'app.js', 'i18n.js', 'feedback.js', 'sim-worker.js'].map(bust));
  } catch (e) { /* 캐시 우회 실패해도 아래 리로드는 진행 */ }
  location.reload();
}
// 배포 감지: version.json을 주기적으로 확인. 내가 로드한 버전과 달라지면(=그새 새 배포) 알림.
// 새로 접속한 사람은 이미 최신이라 차이가 없어 알림이 안 뜬다. (로컬은 version.json 없음 → 무시)
(function watchDeploy() {
  let loaded = null, busy = false;
  const check = () => {
    if (busy) return; busy = true;
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then(v => {
        const cur = v && v.updated;
        if (!cur) return;
        if (loaded === null) {
          loaded = cur;
          // 최초 로드: 실행 중인 코드의 빌드버전이 배포본보다 옛것이면 = F5로 옛 캐시 사용 중 → 알림
          const NOT_BUILT = '__BUILD' + '_VERSION__';   // sed가 못 건드리게 분리(주입 여부 판별용)
          if (BUILD_VERSION !== NOT_BUILT && BUILD_VERSION !== cur) notifyUpdate(true);
        } else if (cur !== loaded) notifyUpdate();
      }).catch(() => { }).finally(() => { busy = false; });
  };
  check();
  setInterval(check, 60000);                       // 1분마다
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });  // 탭 복귀 시 즉시
})();

// ── run simulation ──
async function run(save = true) {
  const picked = team.map((s, i) => s ? { ...s, position: i + 1, priority: s.priority ?? null } : null).filter(Boolean);
  if (picked.length === 0) return;
  // 이태호처럼 매턴 2회 행동·테세 전환 캐릭은 턴별 설정을 권장
  const unplanned = picked.find(s => (CHARS[s.id].actionsPerTurn || 1) > 1 && !s.usePlan);
  if (unplanned) toast(`주의 — ${CHARS[unplanned.id].name}의 턴별 행동을 설정하는 걸 추천드립니다`);
  const hpSchedChar = picked.find(s => CHARS[s.id].hpSchedule);   // 카라트: 적 HP 의존
    if (hpSchedChar && !hp10) toast(`${CHARS[hpSchedChar.id].name} 동반 — 적 HP%가 진행 턴을 4등분해 단계적으로 감소합니다 (앞 1/4 ≥75% → 막 1/4 &lt;25%)`);
  const btn = $('#runBtn'); btn.classList.add('busy'); btn.querySelector('span').innerHTML = '<span class="spin"></span>계산 중…';
  const cfg = {
    team: picked.map(s => ({ id: s.id, position: s.position, skill: s.skill, rune: s.rune, rotation: s.rotation || null, fedAction: s.fedAction || null, priority: s.priority, sealAtk: s.sealOn ? (s.sealAtk ?? 0) : 0, sealHp: s.sealOn ? (s.sealHp ?? 0) : 0 })),
    turns: +$('#turns').value, dummies: +$('#dummies').dataset.val, enemyHits: $('#enemyHits').dataset.val,
    dummyElement: +$('#dummyElement').dataset.val,
    turnOrders: turnOverrides, forceProc, hp10, runs: +$('#runs').value,
  };
  try {
    const data = await API.simulate(cfg);
    if (data.error) throw new Error(data.error);
    lastResult = data; renderResults(data);
    if (save) saveRecord(snapshot(), data);   // 새 실행만 기록 저장 (복원 재실행은 저장 안 함)
    $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) { alert('시뮬 오류: ' + err.message); }
  finally { btn.classList.remove('busy'); btn.querySelector('span').textContent = '시뮬레이션 실행'; }
}

function renderResults(d) {
  $('#results').hidden = false;
  const m = d.meta;
  const multi = m.runs > 1;
  // 헤더는 N회 분포의 중앙값(median)을 메인으로, 최소~최대를 범위로 (로그·차트는 평균/표본 기준)
  $('#hTotal').textContent = fmt(multi ? m.totalMid : m.total);
  $('#hDps').textContent = fmt(multi ? m.dpsMid : m.dps);
  $('#hTurns').textContent = m.turns;
  $('#hTotalRange').textContent = multi ? `최소 ${fmtShort(m.totalMin)} ~ 최대 ${fmtShort(m.totalMax)}` : '';
  $('#hDpsRange').textContent = multi ? `최소 ${fmtShort(m.dpsMin)} ~ 최대 ${fmtShort(m.dpsMax)}` : '';
  $$('.hero-num label em').forEach(e => e.style.display = multi ? '' : 'none');
  $('#topMeta').textContent = multi
    ? `${m.runs}회 · 평균 ${fmtShort(m.total)} · ±${fmtShort(m.totalStd)}`
    : '확률 100% · 결정론';
  $('#logOrder').textContent = '행동 순서: ' + m.order.join(' → ') + (multi ? `  ·  로그는 평균에 가까운 1회 표본` : '');

  // ranking
  const max = Math.max(...d.perChar.map(c => c.damage), 1);
  $('#rank').innerHTML = d.perChar.map((c, i) => `
    <div class="rbar el-${c.elementKey}" style="--el:var(--${c.elementKey})">
      <span class="rk">${i + 1}</span>
      <img class="pic" src="${icon(c.id)}" alt="">
      <div class="track"><div class="fill" style="width:0"></div>
        <div class="lab">${c.name}<span class="role">${c.role}</span></div></div>
      <div class="val">${fmt(c.damage)}<small>${c.share}%${c.healing ? ' · 힐 ' + fmt(c.healing) : ''}</small></div>
    </div>`).join('');
  requestAnimationFrame(() => $$('#rank .fill').forEach((f, i) => f.style.width = (d.perChar[i].damage / max * 100) + '%'));

  // chart (stacked by actor element) + per-character hover tooltip
  const actorEl = {}, actorId = {};
  d.team.forEach(t => { actorEl[t.name] = t.elementKey; actorId[t.name] = t.id; });
  const cmax = Math.max(...d.chart.map(t => t.total), 1);
  $('#chart').innerHTML = d.chart.map(t => {
    const entries = Object.entries(t.byActor).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const segs = entries.map(([a, v]) =>
      `<div class="seg-el" style="height:${v / cmax * 100}%;background:var(--${actorEl[a] || 'none'})"></div>`).join('');
    const rows = entries.map(([a, v]) => {
      const ic = actorId[a] ? `<img class="tip-ic el-${actorEl[a] || 'none'}" src="${icon(actorId[a])}" alt="">` : '<span class="tip-ic sys">적</span>';
      return `<div class="tip-row">${ic}<span class="tip-nm">${a}</span><span class="tip-dv">${fmt(v)}</span></div>`;
    }).join('');
    const tip = `<div class="tip"><div class="tip-h">${t.turn}턴 <b>${fmt(t.total)}</b></div>${rows || '<div class="tip-row empty">데미지 없음</div>'}</div>`;
    return `<div class="col"><div class="bar">${segs}</div>${tip}</div>`;
  }).join('');

  renderLog(d);
}

// ── log: turn(총딜) → action(서순별) → hit(분해) → %(출처) ──
let CHARMAP = {};
function renderLog(d) {
  CHARMAP = {}; d.team.forEach(t => CHARMAP[t.id] = t);
  const turns = {};
  d.log.forEach(l => (turns[l.turn] ||= []).push(l));
  $('#log').innerHTML = Object.keys(turns).map(Number).sort((a, b) => a - b).map(tn => {
    const evs = turns[tn];
    const dmg = evs.filter(l => l.detail && l.detail.act && !l.detail.kind).reduce((s, l) => s + l.amount, 0);
    const heal = evs.filter(l => l.detail && l.detail.kind === 'heal').reduce((s, l) => s + l.amount, 0);
    const bar = evs.filter(l => l.detail && l.detail.kind === 'barrier').reduce((s, l) => s + l.amount, 0);
    return `<div class="turn"><div class="turn-h"><b class="tn-num">${tn}턴</b>
      <span class="sum"><span class="s-val dmg">${fmt(dmg)}<em>딜</em></span>${heal ? `<span class="s-val heal">${fmt(heal)}<em>힐</em></span>` : ''}${bar ? `<span class="s-val bar">${fmt(bar)}<em>베리어</em></span>` : ''}</span>
      <span class="tn-caret">▾</span></div>
      <div class="turn-b">${renderActions(evs)}</div></div>`;
  }).join('');
  $('#log').onclick = e => {
    const sk = e.target.closest('.skchip'); if (sk) { openSkillFromSource(+sk.dataset.sid, sk.dataset.sn); return; }
    const nd = e.target.closest('.ndl.clk'); if (nd) { openSkillFromSource(+nd.dataset.sid, nd.dataset.sn); return; }
    const ch = e.target.closest('.chan'); if (ch) { showSource(ch); return; }
    const fa = e.target.closest('.ndl.fatk'); if (fa) { fa.classList.toggle('open'); return; }
    const ah = e.target.closest('.act-h'); if (ah) { ah.parentElement.classList.toggle('open'); return; }
    const th = e.target.closest('.turn-h'); if (th) th.parentElement.classList.toggle('open');
  };
}
function renderActions(evs) {
  const acts = {};
  evs.forEach(l => (acts[l.act] ||= []).push(l));
  const isHit = l => l.detail && l.detail.act && !l.detail.kind;   // 데미지 hit만 (힐/베리어는 버프라인으로)
  const KCLASS = { '필살기': 'fatal', '보통공격': 'basic', '패시브': 'passive', '방어': 'defend', '지속딜': 'dot' };
  const ally = [], hitg = [];   // 아군 행동 그룹 / 적 피격 그룹(중첩용)
  let hitTotal = 0;
  Object.keys(acts).map(Number).sort((a, b) => a - b).forEach(aid => {
    const lines = acts[aid], id = lines[0].actorId, c = CHARMAP[id];
    const total = lines.filter(isHit).reduce((s, l) => s + l.amount, 0);  // 데미지만 (isHit이 이미 제외)
    const hits = lines.filter(isHit), nd = lines.filter(l => !isHit(l));
    const kind = id ? (lines.find(l => l.kind)?.kind || '') : '';
    if (kind === '피격') {        // "더미N → [피격 아군]" — 적의 공격 묶음 안에 들어감
      const atkBy = lines.find(l => l.atkBy)?.atkBy || '적';
      const body = nd.filter(l => !l.text.endsWith('에게 피격'));
      const pic = `<img class="ai el-${c ? c.elementKey : 'none'}" src="${icon(id)}" alt="">`;
      hitTotal += total;
      hitg.push(`<div class="act hitgrp">
        <div class="act-h"><span class="atkr">${atkBy}</span><span class="hit-arrow">→</span>
          ${pic}<span class="an">${lines[0].actor}</span><span class="ak ak-hit">피격</span>
          <span class="at">${total ? fmt(total) : '<i>반응 없음</i>'}</span></div>
        <div class="act-b">${hits.map(renderHit).join('')}${body.map(renderND).join('')}</div></div>`);
      return;
    }
    if (!hits.length && !nd.length) return;
    const pic = id ? `<img class="ai el-${c ? c.elementKey : 'none'}" src="${icon(id)}" alt="">` : '<span class="ai sys">적</span>';
    const kindEl = kind ? `<span class="ak ak-${KCLASS[kind] || ''}">${kind}</span>` : '';
    ally.push(`<div class="act">
      <div class="act-h">${pic}<span class="an">${id ? lines[0].actor : '적의 행동'}</span>${kindEl}
        <span class="at">${total ? fmt(total) : '<i>버프/스택</i>'}</span></div>
      <div class="act-b">${hits.map(renderHit).join('')}${nd.map(renderND).join('')}</div></div>`);
  });
  let html = ally.join('');
  if (hitg.length) {              // 적 공격은 한 줄로 접고, 누르면 피격 그룹들이 펼쳐짐
    html += `<div class="act enemy-grp">
      <div class="act-h"><span class="ai sys">적</span><span class="an">적의 공격</span>
        <span class="ak ak-hit">${hitg.length}회 피격</span>
        <span class="at">${hitTotal ? fmt(hitTotal) : '<i>반응 없음</i>'}</span></div>
      <div class="act-b">${hitg.join('')}</div></div>`;
  }
  return html;
}
function renderND(l) {
  // 색: 힐=초록(heal) · 베리어=회색(bar) · 버프/디버프=빨강(buf/deb)
  const cls = l.text.includes('베리어') ? 'bar'
    : l.text.includes('힐') ? 'heal'
    : l.text.includes('디버프') ? 'deb'
    : l.text.includes('버프') ? 'buf' : '';
  const text = l.text.replace(/^\S+\s/, '');
  // 고정ATK 버프 → 누르면 ATK 계산식 (각 기초ATK% 칩은 출처로 이어짐)
  if (l.detail && l.detail.calc === 'flatAtk') {
    const d = l.detail;
    const baseAtk = chan('기초ATK', d.baseAtk) || '<span class="chan-static">기초ATK +0%</span>';
    const pctEl = l.srcId
      ? `<span class="skchip" data-sid="${l.srcId}" data-sn="${(l.srcSkill || '').replace(/"/g, '&quot;')}">${d.pct}% 계수</span>`
      : `<span class="sk">${d.pct}%</span>`;
    return `<div class="ndl ${cls} fatk">
      <div class="ndl-h">${text}<span class="ndl-caret">▾</span></div>
      <div class="ndl-calc"><b>${fmt(d.val)}</b> = (${fmt(d.base)} × (1 + ${baseAtk})) × ${pctEl} <em>자기 기초ATK의</em></div></div>`;
  }
  // 힐 / 베리어 → 데미지 hit처럼 풀 분해 (base × 기초ATK% × ATK% + 고정) × 계수 × 효과 …
  if (l.detail && (l.detail.kind === 'heal' || l.detail.kind === 'barrier')) {
    const d = l.detail;
    let inner;
    if (d.baseLabel === 'ATK') {
      inner = fmt(d.base);
      const bc = chan('기초ATK', d.baseAtk), ac = chan('ATK', d.atk);
      if (bc) inner += ' × ' + bc;
      if (ac) inner += ' × ' + ac;
      if (sumv(d.flat || [])) inner += ' + ' + chan('고정', d.flat, '');
      inner = '(' + inner + ')';
    } else { inner = `${fmt(d.baseTotal)} ${d.baseLabel}`; }   // 최대HP 기반
    const pctEl = l.srcId
      ? `<span class="skchip" data-sid="${l.srcId}" data-sn="${(l.srcSkill || '').replace(/"/g, '&quot;')}">${d.skillPct}% 계수</span>`
      : `<span class="sk">${d.skillPct}% 계수</span>`;
    const eff = (d.eff || []).length ? ' × ' + chan('효과', d.eff) : '';
    const recv = d.healRecv ? ` × <span class="chan-static">받는회복 +${d.healRecv}%</span>` : '';
    return `<div class="ndl ${cls} fatk">
      <div class="ndl-h">${text}<span class="ndl-caret">▾</span></div>
      <div class="ndl-calc"><b>${fmt(d.final)}</b> = ${inner} × ${pctEl}${eff}${recv}</div></div>`;
  }
  const clk = l.srcId ? ` clk" data-sid="${l.srcId}" data-sn="${(l.srcSkill || '').replace(/"/g, '&quot;')}` : '';
  return `<div class="ndl ${cls}${clk}">${text}</div>`;
}
const sumv = a => a.reduce((s, c) => s + c.v, 0);
function chan(label, comps, suffix = '%') {
  if (!comps.length) return '';
  const tot = +sumv(comps).toFixed(2);
  const data = encodeURIComponent(JSON.stringify({ label, comps }));
  return `<span class="chan" data-c="${data}">${label} ${tot > 0 && suffix === '%' ? '+' : ''}${tot}${suffix}</span>`;
}
function renderHit(l) {
  const d = l.detail;
  let inner = fmt(d.base);
  const bc = chan('기초ATK', d.baseAtk), ac = chan('ATK', d.atk);
  if (bc) inner += ' × ' + bc;
  if (ac) inner += ' × ' + ac;
  if (sumv(d.flat)) inner += ' + ' + chan('고정', d.flat, '');
  const sk = d.skillId
    ? `<span class="skchip" data-sid="${d.skillId}" data-sn="${(d.skillName || '').replace(/"/g, '&quot;')}">스킬 ${d.skillPct}% 계수</span>`
    : `<span class="sk">스킬 ${d.skillPct}% 계수</span>`;
  const dealt = d.dealt.length ? ' × ' + chan('주는딜', d.dealt) : '';
  const eff = d.eff.length ? ' × ' + chan(d.effLabel, d.eff) : '';
  // 받뎀증 = 일반 × 속성 (별개 곱연산 채널이라 따로 표시). 구버전(d.taken)은 합쳐서 표시.
  const tg = (d.takenG || []).length ? ' × ' + chan('받는딜', d.takenG) : '';
  const tp = (d.takenP || []).length ? ' × ' + chan('속성 받는딜', d.takenP) : '';
  const takenOld = (d.taken || []).length ? ' × ' + chan('받는딜', d.taken) : '';
  // 지속(도트) 전용 채널 — DoT 틱에만 표시
  const dd = (d.dotDealt || []).length ? ' × ' + chan('지속딜 증가', d.dotDealt) : '';
  const dt = (d.dotTaken || []).length ? ' × ' + chan('받는 지속딜', d.dotTaken) : '';
  // 속성 상성 배율 (1.0 아닐 때만): 상성 ×1.5(초록) / 역상성 ×0.75(빨강)
  const em = d.elemMult;
  const elem = (em && em !== 1)
    ? ` × <span class="elemx ${em > 1 ? 'adv' : 'dis'}">${em > 1 ? '상성' : '역상성'} ×${em}</span>` : '';
  return `<div class="hit"><div class="hit-top"><b class="num">${fmt(d.final)}</b><span class="hm">ATK ${fmt(d.atkTotal)}</span></div>
    <div class="formula">(${inner}) × ${sk}${dealt}${eff}${tg}${tp}${takenOld}${dd}${dt}${elem}</div></div>`;
}
function showSource(chip) {
  document.querySelector('.srcpop')?.remove();
  const { label, comps } = JSON.parse(decodeURIComponent(chip.dataset.c));
  const pop = document.createElement('div'); pop.className = 'srcpop';
  pop.innerHTML = `<div class="sp-h">${label} 출처</div>` + comps.map(c => {
    const ch = CHARMAP[c.by];
    const pic = c.by ? `<img src="${icon(c.by)}" class="el-${ch ? ch.elementKey : 'none'}">` : '<span class="np"></span>';
    const tag = c.cond ? ` <em>(${c.cond} 시)</em>` : c.el ? ` <em>(${c.el})</em>` : '';
    return `<div class="sp-row" data-id="${c.by}" data-skill="${(c.skill || '').replace(/"/g, '&quot;')}">
      ${pic}<span class="sp-v">${c.v > 0 ? '+' : ''}${c.v}${label === '고정' ? '' : '%'}</span>
      <span class="sp-s">${c.skill || '기본'}${tag}</span></div>`;
  }).join('') + '<div class="sp-tip">스킬을 누르면 설명이 열려요</div>';
  document.body.appendChild(pop);
  const r = chip.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 12)) + 'px';
  pop.style.top = (r.bottom + 6) + 'px';
  pop.onclick = e => { const row = e.target.closest('.sp-row'); if (row && row.dataset.id !== '0') openSkillFromSource(+row.dataset.id, row.dataset.skill); };
  setTimeout(() => document.addEventListener('click', function h(ev) { if (!pop.contains(ev.target) && !chip.contains(ev.target)) { pop.remove(); document.removeEventListener('click', h); } }), 0);
}
async function openSkillFromSource(id, skillName) {
  const detail = await API.char(id);
  // 필살기는 ultimate/sigil 이름이 같을 수 있음 → 룬 해제(sigil) 설명을 우선 표시
  const matches = detail.skills.filter(s => s.name === skillName);
  const sk = matches.find(s => s.slot === 'sigil') || matches[0] || detail.skills[0];
  const c = CHARMAP[id] || {};
  const card = $('#modalCard');
  card.className = 'modal-card el-' + (c.elementKey || 'none'); card.style.setProperty('--el', `var(--${c.elementKey || 'none'})`);
  const lv = sk.levels[sk.levels.length - 1] || {};
  const ic = skillIconSrc(sk.slot, id);
  const slotTag = ic ? `<img class="slot-ic" src="${ic}" alt="${sk.slotKr}" title="${sk.slotKr}">` : `<span class="tag el">${sk.slotKr}</span>`;
  card.innerHTML = `<button class="mc-close" data-close>×</button>
    <div class="mc-top"><img src="${icon(id)}" alt="">
      <div class="info"><h2>${c.name || ''}</h2><div class="tags">${slotTag}<span class="tag">${sk.name}</span></div></div></div>
    <div class="sk open"><div class="sk-b" style="display:block;padding:14px 2px 0">${(lv.kr || '').trim()}</div></div>`;
  $('#modal').hidden = false;
}
