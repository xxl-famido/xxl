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
    probe: cfg => fetch('/api/probe', { method: 'POST', body: JSON.stringify(cfg) }).then(r => r.json()),
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
  return { chars: () => call('chars'), char: id => call('char', id),
    simulate: cfg => call('simulate', JSON.stringify(cfg)),
    probe: cfg => call('probe', JSON.stringify(cfg)) };
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
const SPECIAL = { 10421: 4.5, 10401: 5.5, 10436: 5.6, 10439: 5.7, 10410: 6.0 };   // 백엔드 SPECIAL_ROLE_RANK와 동기화(모이루·욱영·임부언은 아군 뒤 행동)
const PASSIVE_DEF_ID = 10421;   // 파미도 — 궁 직전 턴 방어로 패시브 활용 (전용 '패시브 방어' 버튼)
const ULT3_IDS = new Set([10437, 10442]);   // 3턴궁 사이클(4·7·10…) 토글 — 투명인간(네온 표식)·마타야(파세)
const ULT3_TITLE = {
  10437: "궁을 3턴 주기(4·7·10·13…)로 · 평타 3번으로 네온 표식 5중첩을 만들어 도장 AoE 발동 · 다시 누르면 기본 2턴궁으로 복원",
  10442: "궁을 3턴 주기(4·7·10·13…)로 · 평타로 파세를 쌓아 필살기 위력을 키운 뒤 발동 · 다시 누르면 매턴 평타로 복원",
};
// 궁쿨이 짧아도 필살을 홀드하는 캐릭(마타야 cd1) — 모두평타/방어는 자동 궁 없이 순수 채움, 기본도 순수 평타
const HOLD_ULT_IDS = new Set([10442]);
const TAEHO_ID = 10423;         // 이태호 — 1포지션 + 임부언 동반 시 'fed 추가행동' 선택 노출
const UK_ID = 10439;           // 욱영 — 인접 아군 필살을 욱영 궁 '후' 회복행동으로 미루는 토글(배터리)
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
    for (const r of simHistory) {
      if (r.data) { delete r.data; changed = true; }   // 옛 대용량 기록 정리(용량 회수)
      if (migrateSnapSync(r.snap)) changed = true;     // 연동 그룹: altar.groups(구) → sync(신)
    }
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
    incomingOn, incomingPct: incomingOn ? +($('#incoming')?.value || 0) : 0,   // OFF면 0으로 저장 → 공유코드 기본값 트리밍 복원(슬라이더값은 복원 시 기본 유지)
    advOn,
    altar: altarPayload(),     // 길드 제단 설정(OFF면 null) — 복원 시 그때의 조건 재현
    sync: syncPayload(),       // 연동(궁 맞추기) 그룹(없으면 null) — 제단과 별개로 저장
    turnDamage: tdmgPayload(), // 턴 피해 설정(OFF면 null) — 기록에만 실림(공유 코드 압축은 추후)
    // 현재 턴 수를 넘는 계획은 버린다 — 남겨두면 나중에 턴을 늘렸을 때 옛 계획이
    // 되살아나 기본값 대신 들어오고, 기록 용량도 헛되이 커진다.
    turnPlans: Object.fromEntries(Object.entries(turnPlans)
      .filter(([t]) => +t <= +$('#turns').value)
      .map(([t, v]) => [t, JSON.parse(JSON.stringify(v))])),
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
  team = s.team.map(x => x ? promoteLegacySpec(JSON.parse(JSON.stringify(x))) : null);
  turnOverrides = JSON.parse(JSON.stringify(s.turnOverrides || {}));
  advOn = !!s.advOn;                                            // 행동 고급 설정
  turnPlans = JSON.parse(JSON.stringify(s.turnPlans || {}));
  // 복원한 타임라인은 '그 기록의 편성' 기준이다. 지문을 다시 잡아야 이후 교체를 감지하고,
  // 이전 세션의 지문이 남아 오경보를 내는 것도 막는다.
  advTeamSig = Object.keys(turnPlans).length ? advTeamFingerprint() : '';
  advTouched = new Set(Object.keys(turnPlans).map(Number));
  advPrevBudget = {};
  syncAdvLock();
  selTurns = autoSelOverrides(turnOverrides);   // 설정된 턴 오버라이드 자동 표시
  forceProc = !!s.forceProc;
  const tr = $('#turns'); tr.value = s.turns; tr.dispatchEvent(new Event('input'));
  const rr = $('#runs'); if (rr) { rr.value = s.runs ?? 50; rr.dispatchEvent(new Event('input')); }
  setSeg('dummies', s.dummies); setSeg('enemyHits', s.enemyHits);
  setSeg('dummyElement', s.dummyElement ?? 0);
  hp10 = !!s.hp10; $('#hp10Btn').classList.toggle('on', hp10);
  incomingOn = !!s.incomingOn;                          // 피격 데미지 모드 복원 (토글+슬라이더)
  const incEl = $('#incoming');
  if (incEl) { if (s.incomingPct) incEl.value = s.incomingPct; incEl.dispatchEvent(new Event('input')); incEl.style.opacity = incomingOn ? '' : '.4'; }
  const ibEl = $('#incomingBtn');
  if (ibEl) { ibEl.classList.toggle('on', incomingOn); ibEl.textContent = incomingOn ? '💥 켬' : '💥 끔'; }
  $('#forceProc').classList.toggle('on', forceProc); syncRunsField();
  applyAltarSnap(s.altar);                               // 제단 설정 복원(옛 기록=OFF) → 잠금도 여기서 최종 판정
  applySyncSnap(s.sync || (s.altar && s.altar.groups) || null);   // 연동 그룹(옛 기록은 제단 안에 있었다)
  applyTdmgSnap(s.turnDamage);                           // 턴 피해 설정 복원(옛 기록=OFF)
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
// 이태호 턴별 fed 추가행동 {turn:토큰} → "4궁7방" (평=기본이라 미저장). 구기록의 단일 fed(숫자)는 복원 시 무시.
const _encFed = f => Object.keys(f || {}).filter(t => f[t] && f[t] !== '평').sort((a, b) => a - b).map(t => t + f[t]).join('');
const _decFed = s => { const o = {}; String(s).replace(/(\d+)([궁방])/g, (_, t, k) => (o[t] = k, '')); return o; };
const _trimDef = (a, D) => { while (a.length > 1 && JSON.stringify(a[a.length - 1]) === JSON.stringify(D[a.length - 1])) a.pop(); return a; };
/** 스펙 설정 이전 기록 승격.
 *
 * 예전엔 스킬 레벨(전 슬롯 공통)과 도장 해제가 모달에 직접 있었다. 지금은 스펙
 * 설정에만 있으므로, 기본값이 아니었던 기록은 **스펙을 켠 상태로 옮겨 담아야**
 * 예전 결과가 그대로 재현된다. 안 그러면 조용히 풀육성으로 바뀐다.
 */
function promoteLegacySpec(s) {
  if (!s || s.spec) return s;
  const skill = s.skill ?? 10, rune = s.rune !== false;
  if (skill === 10 && rune) return s;                 // 기본값이면 그대로 풀육성
  s.spec = { on: true, ...SPEC_FULL, lv: {} };
  if (skill !== 10) SPEC_SLOTS.forEach(k => { s.spec.lv[k] = skill; });
  return s;
}
// 캐릭터 스펙 → "레벨.성급.진화.육성도.스킬8자" (레벨 1~10을 36진수 한 자리로: 1~9, a=10).
// 꺼져 있으면 '' 라서 끝에서 잘려 나가고, 기존 공유코드 길이가 그대로 유지된다.
const _encSpec = s => {
  if (!specOn(s)) return '';
  const p = specOf(s);
  const lv = SPEC_SLOTS.map(k => Math.max(1, Math.min(10, p.lv[k] ?? 10)).toString(36))
    .join('').replace(/a+$/, '');            // 뒤쪽 10레벨은 기본값이라 생략
  return [p.level, p.evo, p.pevo, p.compat, lv].join('.');
};
const _decSpec = str => {
  // 스킬 레벨은 0~8자 — 뒤쪽 10(a)은 생략돼 오므로 다시 채운다
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)\.([0-9a]{0,8})$/.exec(String(str || ''));
  if (!m) return null;
  const p = { on: true, level: +m[1], evo: +m[2], pevo: +m[3], compat: +m[4], lv: {} };
  const lv = m[5].padEnd(SPEC_SLOTS.length, 'a');
  SPEC_SLOTS.forEach((k, i) => { p.lv[k] = parseInt(lv[i], 36); });
  return p;
};

// ── 고급 설정 타임라인 압축 (v2 전용) ──────────────────────────────────────
// {턴: [{p,a}, ...]} 를 그대로 실으면 항목마다 `{"p":3,"a":"궁"}` 라 30턴이면 3KB가 넘는다.
// 포지션(1~5) × 행동(평·궁·방) = 15가지뿐이라 **항목 하나를 한 글자**로 접고,
// 턴은 1번부터 순서대로 '.' 로 잇는다. 빈 문자열=그 턴 미지정, '-'=그 턴은 아무도 행동 안 함
// (둘은 의미가 달라 반드시 구분해야 한다).
const _PT = '0123456789abcde';
function _encTP(tp) {
  const keys = Object.keys(tp || {}).map(Number).filter(t => t >= 1);
  if (!keys.length) return '';
  const out = [];
  for (let t = 1; t <= Math.max(...keys); t++) {
    const seq = tp[t];
    if (seq === undefined) { out.push(''); continue; }
    if (!seq.length) { out.push('-'); continue; }
    let s = '';
    for (const e of seq) {
      const ai = _TK.indexOf(e.a), p = +e.p;
      if (ai < 0 || !(p >= 1 && p <= 5)) return null;   // 표현 밖 → 호출부가 구형식으로 폴백
      s += _PT[(p - 1) * 3 + ai];
    }
    out.push(s);
  }
  return out.join('.');
}
function _decTP(str) {
  const o = {};
  if (!str) return o;
  String(str).split('.').forEach((s, i) => {
    if (s === '') return;                               // 미지정 턴
    o[i + 1] = s === '-' ? [] : [...s].map(c => {
      const k = _PT.indexOf(c);
      return { p: (k / 3 | 0) + 1, a: _TK[k % 3] };
    });
  });
  return o;
}
function packSlot(s) {
  if (!s) return 0;
  const flags = (s.rune ? 1 : 0) | (s.sealOn ? 2 : 0) | (s.usePlan ? 4 : 0) | (s.allyUltAfter ? 8 : 0);   // rotation은 plan에서 파생 → 미저장
  return _trimDef([s.id - CID0, flags, s.skill ?? 10, s.priority ?? 0, s.sealAtk || 0, s.sealHp || 0, _encPlan(s.plan), _encFed(s.fedActions), _encSpec(s), _encUlt(s)],
    [null, 1, 10, 0, 0, 0, '', '', '', '']);   // 끝에 스펙 · 궁극기 사용 방식(기본 '' → trim 생략)
}
function unpackSlot(a) {
  if (!a) return null;
  const [idD, flags = 1, skill = 10, priority = 0, sealAtk = 0, sealHp = 0, plan = '', fed = '', spec = '', ult = ''] = a;
  const s = { id: idD + CID0, skill, rune: !!(flags & 1) };
  const up = _decUlt(ult); if (up) s.ult = up;          // 궁극기 사용 방식(기본이면 키 없음)
  const dec = _decSpec(spec);
  if (dec) s.spec = dec; else promoteLegacySpec(s);
  if (priority) s.priority = priority;
  if (sealAtk) s.sealAtk = sealAtk;           // seal 값은 sealOn 플래그와 독립
  if (sealHp) s.sealHp = sealHp;
  if (flags & 2) s.sealOn = true;
  if (plan) s.plan = _decPlan(plan);          // 계획은 usePlan과 무관하게 보존 — 자동모드 유령 plan도 무손실 왕복 → 공유코드가 *(전체JSON)로 폴백하지 않고 #(축약)를 유지
  if (flags & 4) { s.usePlan = true; s.rotation = (s.plan || []).join(''); } else s.rotation = '';
  if (flags & 8) s.allyUltAfter = true;       // 욱영 토글
  if (fed && typeof fed === 'string') { const fa = _decFed(fed); if (Object.keys(fa).length) s.fedActions = fa; }   // 구기록의 숫자 fed는 무시(단일 fed 폐지)
  return s;
}
function packSnap(s) {
  const flags = (s.forceProc ? 1 : 0) | (s.hp10 ? 2 : 0) | (s.incomingOn ? 4 : 0) | (s.advOn ? 8 : 0);
  const to = s.turnOverrides && Object.keys(s.turnOverrides).length ? s.turnOverrides : 0;
  const tp = s.turnPlans && Object.keys(s.turnPlans).length ? s.turnPlans : 0;
  return _trimDef([s.team.map(packSlot), +s.turns, +s.dummies, s.enemyHits, +s.dummyElement, +s.runs, flags, to, +(s.incomingPct || 0), tp],
    [null, 30, 1, 'all', 0, 50, 0, 0, 0, 0]);
}
function unpackSnap(a) {
  const [team, turns = 30, dummies = 1, enemyHits = 'all', dummyElement = 0, runs = 50, flags = 0, to = 0, incomingPct = 0, tp = 0] = a;
  return { team: team.map(unpackSlot), turns, dummies, enemyHits, dummyElement, runs, forceProc: !!(flags & 1), hp10: !!(flags & 2), incomingOn: !!(flags & 4), incomingPct, turnOverrides: to || {},
    advOn: !!(flags & 8), turnPlans: tp || {} };
}
// ── v2 스냅샷: 타임라인만 접는다 ──────────────────────────────────────────
// 슬롯 구조(packSlot)는 그대로 재사용한다. 달라지는 건 turnPlans 자리뿐이라,
// 두 형식이 갈라지는 지점을 한 곳으로 묶어 두는 편이 오래 간다.
function packSnapV2(s) {
  const tpStr = _encTP(s.turnPlans);
  if (tpStr === null) return null;            // 표현할 수 없는 항목 → 구형식으로
  const flags = (s.forceProc ? 1 : 0) | (s.hp10 ? 2 : 0) | (s.incomingOn ? 4 : 0) | (s.advOn ? 8 : 0);
  const to = s.turnOverrides && Object.keys(s.turnOverrides).length ? s.turnOverrides : 0;
  return _trimDef([s.team.map(packSlot), +s.turns, +s.dummies, s.enemyHits, +s.dummyElement, +s.runs, flags, to, +(s.incomingPct || 0), tpStr, _encAltar(s.altar), _encTdmg(s.turnDamage), _encGroups(s.sync)],
    [null, 30, 1, 'all', 0, 50, 0, 0, 0, '', '', '', '']);   // 꼬리: 길드 제단 · 턴 피해 · 연동 그룹('' = 없음 → trim, 켠 것만 코드에 실린다)
}
function unpackSnapV2(a) {
  const [team, turns = 30, dummies = 1, enemyHits = 'all', dummyElement = 0, runs = 50, flags = 0, to = 0, incomingPct = 0, tp = '', alt = '', td = '', sy = ''] = a;
  const out = { team: team.map(unpackSlot), turns, dummies, enemyHits, dummyElement, runs,
    forceProc: !!(flags & 1), hp10: !!(flags & 2), incomingOn: !!(flags & 4), incomingPct,
    turnOverrides: to || {}, advOn: !!(flags & 8), turnPlans: _decTP(tp) };
  const altar = _decAltar(alt);
  if (altar) out.altar = altar;                       // OFF면 키 자체를 두지 않는다(looseEq: null≈누락)
  const tdm = _decTdmg(td);
  if (tdm) out.turnDamage = tdm;                      // 턴 피해도 동일 — OFF면 키 없음
  const sg = _decGroups(sy).filter(g => g.anchor && g.members.length);
  if (sg.length) out.sync = sg;                       // 연동 그룹(신 꼬리 필드). 구 코드는 altar 안에 실려 왔다 → sync 로 옮긴다
  migrateSnapSync(out);
  return out;
}
// 턴 피해 공유 코드 압축(최소형): ''=OFF / 'P'=매 턴 P% / 'P;t:v,t:v'=고급 턴별 값(비운 칸은 안 실림).
//   대상 수(hits)가 전체(5)가 아니면 끝에 'hN' 부착: 'P hN' → '30h2'(30%·상위2인). 5=기본은 생략.
function _encTdmg(t) {
  if (!t || !t.on) return '';
  const pct = Math.max(1, Math.min(99, Math.round(+t.pct || 0)));
  const per = Object.entries(t.per || {}).map(([k, v]) => [+k, Math.max(0, Math.min(99, Math.round(+v)))])
    .filter(([k, v]) => k >= 1 && Number.isFinite(v)).sort((a, b) => a[0] - b[0]);
  const hits = Math.max(1, Math.min(5, Math.round(+t.hits || 5)));
  return String(pct) + (per.length ? ';' + per.map(([k, v]) => k + ':' + v).join(',') : '')
    + (hits < 5 ? 'h' + hits : '');
}
function _decTdmg(str) {
  if (!str || typeof str !== 'string') return null;
  const m = /^(\d{1,2})(?:;([\d:,]*))?(?:h([1-5]))?$/.exec(str); if (!m) return null;
  const pct = +m[1]; if (!(pct >= 1 && pct <= 99)) return null;
  const out = { on: true, pct };
  if (m[2]) {
    const per = {};
    m[2].split(',').forEach(kv => { const [k, v] = kv.split(':').map(Number); if (k >= 1 && v >= 0 && v <= 99) per[k] = v; });
    if (Object.keys(per).length) out.per = per;
  }
  if (m[3]) out.hits = +m[3];
  return out;
}
function packRecords(arr, v2) {               // label은 팀에서 재생성 가능 → 미저장
  const packSn = v2 ? packSnapV2 : packSnap;
  const out = [];
  for (const r of arr) {
    const sn = packSn(r.snap);
    if (sn === null) return null;             // v2로 접을 수 없는 기록이 하나라도 있으면 통째로 포기
    out.push(_trimDef([r.id, r.name || '', r.total || 0, (r.locked ? 1 : 0) | (r.pinned ? 2 : 0), sn],
      [null, '', 0, 0, null]));
  }
  return out;
}
function unpackRecords(arr, v2) {
  const unpackSn = v2 ? unpackSnapV2 : unpackSnap;
  return arr.map(a => { const [id, name = '', total = 0, flags = 0, snap] = a;
    const sn = unpackSn(snap), r = { id, label: makeLabel(sn.team, sn.turns, total), snap: sn, total };
    if (name) r.name = name; if (flags & 1) r.locked = true; if (flags & 2) r.pinned = true; return r; });
}
/** 이 기록이 새 기능(캐릭터 스펙 · 행동 고급 설정)을 쓰고 있는가. */
function _usesNewFeatures(r) {
  const sn = (r && r.snap) || {};
  if (sn.turnPlans && Object.keys(sn.turnPlans).length) return true;
  if (sn.altar && sn.altar.on) return true;          // 길드 제단은 v2 꼬리 필드에만 실린다
  if (Array.isArray(sn.sync) && sn.sync.length) return true;   // 연동 그룹도 v2 꼬리 필드에만
  if (sn.turnDamage && sn.turnDamage.on) return true;   // 턴 피해도 v2 꼬리 필드에만
  return (sn.team || []).some(t => t && t.spec && t.spec.on);
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
// 형식 선택 — 새 기능(스펙·고급 설정)을 안 쓰면 **예전과 완전히 같은 '#' 코드**가 나오고,
// 쓰는 순간에만 타임라인을 접은 '$'로 간다. 어느 쪽이든 왕복 자기검증에 실패하면 '*'(전체 JSON).
function _tryPack(records, v2) {
  const packed = packRecords(records, v2);
  if (packed === null) return null;
  const back = unpackRecords(JSON.parse(JSON.stringify(packed)), v2);
  return records.every((r, i) => looseEq(r, back[i])) ? packed : null;
}
async function compressCode(records) {       // records 배열 → 최단 코드
  let body = null, tag = '*';
  try {
    // 새 기능을 쓰면 v2 우선, 접히지 않으면 구형식으로 물러난다(구형식도 타임라인을 담을 수 있다)
    const order = records.some(_usesNewFeatures) ? [true, false] : [false];
    for (const v2 of order) {
      const packed = _tryPack(records, v2);
      if (packed) { body = JSON.stringify(packed); tag = v2 ? '$' : '#'; break; }
    }
  } catch { body = null; }
  if (body === null) { body = JSON.stringify(records); tag = '*'; }
  return tag + _bytesToB64url(await _deflate(body));
}
async function decompressCode(code) {        // 코드 → records JSON 문자열
  code = code.trim();
  const tag = code[0], json = await _inflate(_b64urlToBytes(code.slice(1)));
  if (tag === '#') return JSON.stringify(unpackRecords(JSON.parse(json), false));
  if (tag === '$') return JSON.stringify(unpackRecords(JSON.parse(json), true));
  return json;                                // '*' = 전체 JSON
}
function importRecords(arr) {                 // 공통 머지 (성공 시 true)
  if (!Array.isArray(arr)) { toast('가져오기 실패 — 형식이 올바르지 않아요'); return false; }
  const have = new Set(simHistory.map(r => r.id));
  const add = arr.filter(r => r && r.id && r.snap && !have.has(r.id));
  add.forEach(r => migrateSnapSync(r.snap));           // 구 형식(제단 안의 그룹)도 신 형식으로
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
let cmpCommon = { forceProc: false, hp10: false, dummyElement: 0, dummies: 1, enemyHits: 'all', turns: 30, incomingOn: false, incomingPct: 30 };
let cmpTurnsManual = false;              // 사용자가 턴 슬라이더를 직접 건드렸는지 (true면 자동설정 안 함)
let cmpTeam = { a: null, b: null };      // 편집 가능한 팀 cfg (snap.team 복사본)
let cmpLoaded = { a: null, b: null };    // 현재 로드된 기록 id
let cmpDmg = { a: {}, b: {} };           // 마지막 시뮬 캐릭별 데미지 (id→dmg)
let cmpPending = false;                  // 편집 후 재계산 대기 상태
let cmpTurnOv = { a: {}, b: {} };        // 비교군별 턴 오버라이드 {turn:[position,...]}
let cmpAdv = { a: null, b: null };       // 비교군별 타임라인(보관) — 꺼도 지우지 않는다
let cmpAdvOn = { a: false, b: false };   // 그 타임라인을 실제로 적용할지 (메인 스위치와 같은 의미)
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
  // 고급 설정으로 만든 기록이면 그 타임라인을 그대로 들고 온다 (없으면 null = 기존 방식)
  const tp = rec.snap.turnPlans && Object.keys(rec.snap.turnPlans).length
    ? JSON.parse(JSON.stringify(rec.snap.turnPlans)) : null;
  cmpAdv[side] = tp;
  cmpAdvOn[side] = !!(rec.snap.advOn && tp);
  cmpLoaded[side] = rec.id;
}
function sideOrder(side) {               // 비교군 캐릭을 우선순위로 정렬 ({s,i,p})
  return (cmpTeam[side] || []).map((s, i) => s ? { s, i } : null).filter(Boolean)
    .map(o => ({ ...o, p: o.s.priority ?? basePriority(o.s, o.i + 1) }))
    .sort((a, b) => a.p - b.p);
}
// 비교군의 팀 구성이 바뀌면 고급 타임라인은 '이전 편성 기준'이 된다. 메인처럼 경고를
// 띄울 자리가 없어(비교 화면은 편집 UI가 얕다) 조용히 틀리는 대신 폐기하고 알린다.
function cmpAdvInvalidate(side) {
  if (!cmpAdv[side] && !cmpAdvOn[side]) return;
  cmpAdv[side] = null; cmpAdvOn[side] = false;
  toast('편성이 바뀌어 그 비교군의 <b>행동 고급 설정</b>을 해제했어요 — 기존 설정으로 계산합니다');
}

function cfgFromTeam(side, snap) {        // 편집된 팀 + 공통설정으로 API cfg
  const picked = (cmpTeam[side] || []).map((t, i) => t ? { ...t, position: i + 1 } : null).filter(Boolean);
  const adv = cmpAdvOn[side] ? cmpAdv[side] : null;   // 켜져 있을 때만 적용
  return {
    // 고급 설정 타임라인이 있으면 메인과 같은 규칙: 계획·우선순위·특정 턴 순서는 보내지 않는다
    team: picked.map(t => ({ id: t.id, position: t.position, skill: t.skill, rune: t.rune,
      rotation: adv ? null : (t.usePlan ? ((t.plan && t.plan.length) ? t.plan.join('') : (t.rotation || null)) : null),
      fedActions: (t.usePlan && t.fedActions && Object.keys(t.fedActions).length) ? t.fedActions : null,
      allyUltAfter: !!t.allyUltAfter,
      priority: adv ? null : t.priority, sealAtk: t.sealOn ? (t.sealAtk ?? 0) : 0, sealHp: t.sealOn ? (t.sealHp ?? 0) : 0,
      ult: ultPayload(t),
      ...specPayload(t) })),
    turns: +snap.turns, turnOrders: adv ? {} : (cmpTurnOv[side] || {}), turnPlans: adv || {},
    dummies: cmpCommon.dummies, enemyHits: cmpCommon.enemyHits, dummyElement: cmpCommon.dummyElement,
    forceProc: cmpCommon.forceProc, hp10: cmpCommon.hp10, runs: cmpCommon.forceProc ? 1 : +(snap.runs || 50),
    incomingHpPct: cmpCommon.incomingOn ? cmpCommon.incomingPct : 0,   // 피격 데미지 모드 (비교 공통설정)
    altar: altarPayload(),           // 길드 제단은 메인 설정을 양쪽 비교군에 공통 적용
    sync: syncPayload(),             // 연동 그룹도 공통(포지션 기준)
    turnDamage: tdmgPayload(),       // 턴 피해도 메인 설정을 양쪽에 공통 적용
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
    incomingOn: $('#cmpIncomingBtn')?.classList.contains('on') || false,
    incomingPct: +($('#cmpIncoming')?.value || 30),
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
    // 편차 밴드(바닥~천장): 두 조합의 확률 의존도를 나란히 비교. 데이터 없는 빈 편성은 생략.
    const band = m => (m && m.totalFloor != null)
      ? `<div class="ct-band">최소 ${fmtShort(m.totalFloor)} ~ 최대 ${fmtShort(m.totalCeil)}</div>` : '';
    total = `<div class="cmp-total"><div class="ct-side a">${fmt(tA)}${band(ta)}</div>${midHtml(tA, tB)}<div class="ct-side b">${fmt(tB)}${band(tb)}</div></div>`;
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
  const [bA, bH] = specAtkHp(cf.id ? cf : { ...cf, id: c.id });
  // 그 비교군에 고급 설정이 켜져 있으면 턴별 행동은 그쪽에서만 정한다 — 여기서 또 만지면
  // 규칙이 둘로 갈린다. 적용 여부는 cfgFromTeam 과 같은 기준(cmpAdvOn)으로 판단한다.
  const advLock = !!(cmpAdvOn && cmpAdvOn[c.side]);
  pop = document.createElement('div'); pop.className = 'cmpinfo';
  pop.innerHTML = `<div class="modal-wrap ci-wrap">
    <div class="ci-card el-${c.elementKey}" style="--el:var(--${c.elementKey})">
    <div class="ci-head">
      <div class="ci-top"><img src="${icon(c.id)}" alt=""><div><h3>${esc(c.name)}</h3>
        <div class="ci-tags"><span class="tag el">${ch.element || ''}속성</span><span class="tag">${ch.role || ''}</span><span class="tag">P${cf.position || c.position}</span></div></div></div>
      <div class="ci-hbtns"><button class="ci-spec${specOn(cf) ? ' on' : ''}" data-cspec>◈ 스펙</button><button class="ci-swap" data-swap>⇄ 교체</button><button class="mc-close" data-ciclose>×</button></div>
    </div>
    <div class="ci-rows">
      <div class="ci-r tap" data-seal><span>도장 강화</span><b class="ci-state ${cf.sealOn ? 'on' : ''}" id="ciSeal">${cf.sealOn ? 'ON' : 'OFF'} ▸</b></div>
      <div class="ci-r"><span>기본 공격력</span><b id="ciAtk">${fmt(bA + ua)}${ua ? `<em>(+${fmt(ua)})</em>` : ''}</b></div>
      <div class="ci-r"><span>최대 체력</span><b id="ciHp">${fmt(bH + uh)}${uh ? `<em>(+${fmt(uh)})</em>` : ''}</b></div>
      <div class="ci-r${advLock ? ' locked' : ' tap'}"${advLock ? '' : ' data-plan'}><span>행동</span>
        <b class="ci-state" id="ciAct">${advLock ? '고급 설정에서' : `${isManual ? '수동' : '자동'} ▸`}</b></div>
    </div></div>
    <aside class="specpanel ci-spanel" hidden></aside></div>`;
  document.body.appendChild(pop);
  pop.onclick = e => {
    if (e.target.closest('[data-cspec]')) { openCmpSpec(c, pop); return; }
    if (e.target.closest('[data-swap]')) { openSwapPop(c); return; }
    if (e.target.closest('[data-seal]')) { openSealPop(c); return; }
    if (e.target.closest('[data-plan]')) { openPlanPopup(c); return; }
    if (e.target.closest('.specpanel')) return;              // 패널 내부 클릭은 닫지 않는다
    if (e.target.dataset.ciclose !== undefined || e.target === pop) { closeSpecPanel(); pop.remove(); }
  };
}

/** 비교군 슬롯의 스펙 편집 — 메인과 같은 패널을 이 카드 옆에 띄운다. */
function openCmpSpec(c, pop) {
  const slot = c.cfg;
  if (!slot) return;
  if (slot.id == null) slot.id = c.id;        // 스탯 계산에 캐릭터 id가 필요
  openSpecFor(slot, pop.querySelector('.ci-spanel'), pop.querySelector('.ci-wrap'), () => {
    const b = pop.querySelector('[data-cspec]');
    if (b) b.classList.toggle('on', specOn(slot));
    updateCiStats(c);
    markCmpDirty();
  });
}
function updateCiStats(c) {                // 도장 변경 시 정보카드 ATK/HP/도장상태 즉시 반영
  const cf = c.cfg || {}, ch = CHARS[c.id] || {};
  const ua = cf.sealOn ? (cf.sealAtk || 0) : 0, uh = cf.sealOn ? (cf.sealHp || 0) : 0;
  const [bA, bH] = specAtkHp(cf.id ? cf : { ...cf, id: c.id });   // 육성 스펙 반영된 기본값
  const s = $('#ciSeal'); if (s) { s.textContent = (cf.sealOn ? 'ON' : 'OFF') + ' ▸'; s.classList.toggle('on', !!cf.sealOn); }
  const a = $('#ciAtk'); if (a) a.innerHTML = `${fmt(bA + ua)}${ua ? `<em>(+${fmt(ua)})</em>` : ''}`;
  const h = $('#ciHp'); if (h) h.innerHTML = `${fmt(bH + uh)}${uh ? `<em>(+${fmt(uh)})</em>` : ''}`;
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
      if (+b.dataset.id === IMBUEON_ID && !cmpTeam[side][0]) {   // 메인과 같은 규칙
        toast('임부언은 <b>1번 자리</b>에 배치할 수 없어요 — 2~5번 자리를 비워주세요'); return;
      }
      cmpAdvInvalidate(side);
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
          cmpAdvInvalidate(c.side); cmpTeam[c.side][idx] = null; pop.remove();
          document.querySelector('.cmpinfo')?.remove(); cmpRelayout(); return;
        }
        const newId = +b.dataset.id;
        if (newId !== c.id) {
          if (newId === IMBUEON_ID && idx === 0) {
            toast('임부언은 <b>1번 자리</b>에 배치할 수 없어요'); return;
          }
          cmpAdvInvalidate(c.side);
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
    ${ultSectionHTML(c.cfg, c.position || (c.slotIdx + 1), !!(cmpAdvOn && cmpAdvOn[c.side]))}
    <div id="ppGrid"></div></div>`;
  document.body.appendChild(pop);
  bindUltSection(pop, c.cfg, markCmpDirty);      // 궁극기 사용 방식(비교군 슬롯 — 여기서 바로 편집)
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
  padPlan(plan, meta, turns);                        // 턴 수를 늘렸으면 기본 궁 주기로 이어붙임
  const teamArr = cmpTeam[c.side] || [];             // 이태호(1포지션)+임부언 → 임부언 궁 턴에 fed 슬롯
  const ab = allyBasicCounts(teamArr, c.slotIdx, turns);   // 모이루: 아군 평타 → 추격 → 방어 시 CD 감소
  if (apt === 1) normalizePlan(plan, meta, ab);      // CD 검증·게이팅 (단일행동 캐릭)
  const ok = apt === 1 ? ultAvail(plan, meta, ab) : null;
  const fedTurns = (on && c.id === TAEHO_ID && c.slotIdx === 0 && teamArr.some(t => t && t.id === IMBUEON_ID))
    ? imbueonUltTurns(teamArr, turns) : null;
  if (fedTurns) c.cfg.fedActions = c.cfg.fedActions || {};
  const prevFed = grid._fedShown || new Set(), curFed = new Set();
  let html = '';
  for (let ti = 0; ti < turns; ti++) {
    const t = ti + 1;
    let cells = '';
    for (let a = 0; a < apt; a++) {
      const idx = ti * apt + a, act = plan[idx];
      const btn = (k, l) => {
        const lockUlt = apt === 1 && k === '궁' && !ok[ti] && !(meta.cdDefendReduce > 0);   // CD 안 찬 턴 궁 잠금
        return `<button class="a${k}${act === k ? ' on' : ''}" data-idx="${idx}" data-a="${k}"${(!on || lockUlt) ? ' disabled' : ''}>${l}</button>`;
      };
      cells += `<div class="pp-acts">${btn('평', '평')}${btn('궁', '궁')}${btn('방', '방')}</div>`;
    }
    let fedCell = '';
    if (fedTurns && fedTurns.has(t)) {                // 임부언 궁 턴 → 이태호 추가행동(평/궁/방) 한 줄 더
      curFed.add(t);
      const fv = c.cfg.fedActions[t] || '평', isNew = !prevFed.has(t);
      const fb = k => `<button class="a${k}${fv === k ? ' on' : ''}" data-fedturn="${t}" data-fa="${k}"${on ? '' : ' disabled'}>${k}</button>`;
      fedCell = `<div class="pp-acts fed-slot${isNew ? ' fed-new' : ''}" title="임부언 궁 추가행동">${fb('평')}${fb('궁')}${fb('방')}</div>`;
    }
    html += `<div class="pp-cell${apt > 1 ? ' dbl' : ''}${fedCell ? ' has-fed' : ''}"><div class="pp-t">${t}</div>${cells}${fedCell}</div>`;
  }
  grid._fedShown = curFed;
  const rules = $('#ppRules');
  if (rules) {
    const ruleTxt = apt > 1
      ? `매 턴 <b style="color:var(--gold)">${apt}회 행동</b> · 궁은 턴당 1회 (궁궁 불가) · 임부언 추가행동은 평타`
      : `필살 CD <b style="color:var(--gold)">${fcd(meta)}턴</b> · 첫 사용 <b style="color:var(--gold)">${ffat(meta)}턴</b> · 궁은 CD 안 찬 턴 비활성`;
    rules.innerHTML = `<span>${ruleTxt}</span><span class="plan-fill">
      <button data-fill="평"${on ? '' : ' disabled'}>모두 평타</button><button data-fill="방"${on ? '' : ' disabled'}>모두 방어</button>${c.id === PASSIVE_DEF_ID ? `<button data-pdef${on ? '' : ' disabled'} title="궁극기 직전 턴을 방어로 (패시브 활용) · 다시 누르면 평타로 복원">패시브 방어</button>` : ''}${ULT3_IDS.has(c.id) ? `<button data-u3${on ? '' : ' disabled'} title="${ULT3_TITLE[c.id]}">3턴궁</button>` : ''}${c.id === UK_ID ? `<button data-ukafter${c.cfg.allyUltAfter ? ' class="on"' : ''} title="ON: 인접 아군이 욱영 궁 '후' 회복 행동으로 필살(욱영 버프 받고 궁). OFF(기본): 인접 아군 먼저 필살, 회복은 평타(+45% 평타뎀)">아군 필살 나중</button>` : ''}</span>`;
    rules.querySelectorAll('[data-fill]').forEach(b => b.onclick = () => {
      // 3턴궁 토글 ON이면 궁턴(4·7·10)을 유지한 채 나머지만 평타/방어로 채운다.
      // 아니면 fillPlan — 홀드필살(마타야)은 순수 채움(자동 궁 없음), 일반은 궁 cadence 유지.
      c.cfg.plan = isUlt3Plan(c.cfg.plan, meta)
        ? ult3Plan(meta, turns, b.dataset.fill)
        : fillPlan(meta, b.dataset.fill, turns);
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
    const u3b = rules.querySelector('[data-u3]');             // 3턴궁 사이클 토글 (투명인간·마타야)
    if (u3b) {
      const cur3 = isUlt3Plan(c.cfg.plan, meta);              // 채움 액션(평/방) 무관하게 궁턴만으로 판정
      u3b.classList.toggle('on', on && cur3);
      u3b.onclick = () => {
        // 해제 시 fillPlan 기본: 마타야=순수 평타, 투명인간=2턴궁 cadence.
        c.cfg.plan = cur3 ? fillPlan(meta, '평', turns) : ult3Plan(meta, turns);
        c.cfg.rotation = c.cfg.plan.join(''); markCmpDirty(); renderPlanPop(c);
      };
    }
    const ukb = rules.querySelector('[data-ukafter]');       // 욱영: 인접 아군 필살 타이밍 토글
    if (ukb) ukb.onclick = () => {
      c.cfg.allyUltAfter = !c.cfg.allyUltAfter;
      ukb.classList.toggle('on', c.cfg.allyUltAfter); markCmpDirty();
    };
  }
  grid.className = 'pp-grid' + (on ? '' : ' off');
  grid.innerHTML = html;
  grid.onclick = on ? (e => {
    const fbtn = e.target.closest('button[data-fedturn]');
    if (fbtn) {                                       // 이태호 fed 추가행동(턴별)
      const ft = +fbtn.dataset.fedturn, fa = fbtn.dataset.fa;
      if (fa === '평') delete c.cfg.fedActions[ft]; else c.cfg.fedActions[ft] = fa;
      markCmpDirty(); renderPlanPop(c);
      return;
    }
    const btn = e.target.closest('button[data-a]'); if (!btn || btn.disabled) return;
    const idx = +btn.dataset.idx, a = btn.dataset.a;
    plan[idx] = a;
    if (apt > 1 && a === '궁') {                      // 궁은 턴당 1회 — 같은 턴 다른 슬롯의 궁 제거
      const ti0 = Math.floor(idx / apt);
      for (let a2 = 0; a2 < apt; a2++) { const j = ti0 * apt + a2; if (j !== idx && plan[j] === '궁') plan[j] = '평'; }
    }
    if (a === '궁' && meta.singleUlt)                 // 제토: 필살은 전투당 1회 — 다른 턴 궁은 모두 평으로
      for (let j = 0; j < plan.length; j++) if (j !== idx && plan[j] === '궁') plan[j] = '평';
    const ab2 = allyBasicCounts(cmpTeam[c.side] || [], c.slotIdx, turns);
    if (a === '궁' && meta.cdDefendReduce > 0) {      // 모이루(추격)·히토하(입질): 앞턴 방어 자동 배치
      if (enforceCdDefend(plan, meta, idx + 1, ab2))
        toast(`${meta.name}: 필살 CD를 맞추려고 앞 턴을 <b>방어</b>로 자동 배치했어요`);
      else
        toast(`${meta.name}: <b>${idx + 1}턴엔 필살 불가</b> — 아군 평타가 부족해 방어로도 CD를 못 맞춰요`);
    } else if (apt === 1 && a === '궁') reflowUlts(plan, meta, idx + 1);   // 단일행동: 궁 자동 재배치
    if (apt === 1) normalizePlan(plan, meta, ab2);
    c.cfg.plan = plan; c.cfg.rotation = plan.join('');
    markCmpDirty(); renderPlanPop(c);
  }) : null;
}
function openPrioPop(side) {                // 비교군별 행동 우선순위 + 특정 턴 오버라이드
  document.querySelector('.priopop')?.remove();
  const pop = document.createElement('div'); pop.className = 'priopop';
  pop.innerHTML = `<div class="pr-card"><button class="mc-close" data-prclose>×</button>
    <div class="pp-head pr-head"><h3>행동 우선순위 <em>(비교군 ${side === 'a' ? 'A' : 'B'})</em></h3>
      <button class="ct-prio ct-adv${cmpAdvOn[side] ? ' on' : ''}" data-cadv="${side}">◆ 행동 고급 설정</button></div>
    <div class="pr-lock" ${cmpAdvOn[side] ? '' : 'hidden'}>고급 설정이 켜져 있어요 — 순서는 고급 설정에서 정합니다</div>
    <div class="pr-body${cmpAdvOn[side] ? ' locked' : ''}">
      <div class="pr-sub">행동 순서 <em>(드래그·▲▼)</em></div>
      <ol class="prio" id="prPrio"></ol>
      <div class="pr-sub">특정 턴만 다르게 <em>(턴 선택 후 순서 변경)</em></div>
      <div class="turn-chips" id="prChips"></div>
      <div id="prEditor"></div>
      <button class="btn-ghost sm" id="prReset" style="margin-top:10px">전부 기본값으로</button>
    </div></div>`;
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
  pop.onclick = e => {
    const cadv = e.target.closest('[data-cadv]');
    if (cadv) { pop.remove(); openAdvFor(cadv.dataset.cadv); return; }   // 고급 설정으로 전환
    if (e.target.dataset.prclose !== undefined || e.target === pop) pop.remove();
  };
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
  const ci = $('#cmpIncoming'), cib = $('#cmpIncomingBtn');
  if (ci) {
    const ciUpd = () => { $('#cmpIncomingVal').textContent = ci.value + '%'; ci.style.setProperty('--p', (ci.value / 99 * 100) + '%'); };
    ci.oninput = ciUpd;
    ci.onchange = () => { syncCommon(); markCmpDirty(); }; ciUpd();
  }
  if (cib) {
    cib.onclick = () => {
      cib.classList.toggle('on');
      const on = cib.classList.contains('on');
      cib.textContent = on ? '💥 켬' : '💥 끔';
      $('#cmpIncoming').style.opacity = on ? '' : '.4';
      syncCommon(); markCmpDirty();
    };
    $('#cmpIncoming').style.opacity = cib.classList.contains('on') ? '' : '.4';
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
  initAltar();
  initTdmg();
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
  else {
    // 임부언은 1번 자리 배치 금지 — P1에 있으면 자기 궁의 CD-3+추가행동이 자신에게 걸려
    // 무한 자가피드가 되는데 인게임에선 불가능하므로 시스템적으로 차단(P1은 건너뛰고 배치).
    let empty;
    if (id === IMBUEON_ID) {
      empty = team.findIndex((s, i) => !s && i !== 0);
      if (empty < 0) { toast('임부언은 <b>1번 자리</b>에 배치할 수 없어요 — 2~5번 중 한 자리를 비워주세요'); return; }
    } else {
      empty = team.findIndex(s => !s);
      if (empty < 0) return;
    }
    team[empty] = { id, skill: 10, rune: true, rotation: '' };
  }
  renderRoster(); renderTeam(); renderPrio();
}

// ── team slots ──
function renderTeam() {
  $('#teamSlots').innerHTML = team.map((s, i) => {
    if (!s) return `<div class="slot" data-i="${i}"><span class="pos">P${i + 1}</span><span class="empty">+</span></div>`;
    const c = CHARS[s.id];
    // 풀육성이 아닌 슬롯은 한눈에 보이게 — 안 그러면 왜 딜이 낮은지 찾기 어렵다
    const inv = specInv(s);
    const badge = specOn(s)
      ? `<span class="spec-badge" title="캐릭터 스펙 설정 사용 중 — 스타 ${inv.evo} · Lv${inv.level} · 육성도 ${inv.compat}">★${inv.evo}</span>`
      : '';
    return `<div class="slot filled el-${c.elementKey}" data-i="${i}" style="--el:var(--${c.elementKey})">
      <span class="pos">P${i + 1}</span><button class="rm" data-rm="${i}">×</button>
      <img src="${icon(s.id)}" alt=""><span class="nm">${c.name}</span>${badge}</div>`;
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

// ── 행동 고급 설정 ────────────────────────────────────────────────────────────
// 턴마다 "누가 · 어떤 순서로 · 무엇을" 할지 전부 사용자가 정한다. 끄면(기본) 지금까지의
// 동작 그대로고, 켜면 행동 우선순위·특정 턴 순서·캐릭터별 턴별 계획을 이 화면이 대체한다.
// 행동 예산(추가 행동)은 JS에서 다시 계산하지 않는다 — 엔진 plan_probe가 정답을 준다.
// (같은 규칙을 JS와 Python 양쪽에 두면 반드시 어긋난다 — CD 모델에서 이미 겪은 함정)
let advOn = false;              // 전역 스위치(턴별 타임라인)
let advTab = 'time';            // 열려 있는 탭: time(턴별 타임라인) · ult(궁극기 사용 방식) · sync(연동)
let turnPlans = {};             // {turn: [{p, a}]} — 켜졌을 때 사용자가 손댄 턴
let advSel = 1;                 // 지금 편집 중인 턴
let advProbe = null;            // 마지막 프로브 결과 {turns, team, plan}
let advPrevBudget = {};         // {turn:{pos:n}} 직전 예산 — '늘어난 만큼만' 자동 추가하는 기준선
let advTouched = new Set();     // 사용자가 실제로 손댄 턴 (자동 채움과 구분해 표시)
let advBusy = false;

const ADV_ACTS = ['평', '궁', '방'];

// ── 궁극기 사용 방식 · 연동 탭 문구 — i18n-skip 본문을 이 모듈이 5개 언어로 직접 렌더한다(제단 패널과 같은 방식) ──
const ADV_T = {
  tabTime:   { kr: '턴별 타임라인', en: 'Turn timeline', zh: '回合時間軸', zhs: '回合时间轴', ja: 'ターン別タイムライン' },
  tabSync:   { kr: '연동 (궁 맞추기)', en: 'Sync (ultimate timing)', zh: '連動（必殺同步）', zhs: '联动（必杀同步）', ja: '連動（必殺同期）' },
  timeOn:    { kr: '타임라인이 켜져 있어요 — 켜져 있는 동안엔 타임라인이 궁 시점을 정하고, 이 탭의 설정은 쉽니다.',
               en: 'The timeline is on — while it is on, the timeline decides ultimate timing and this tab’s settings are paused.',
               zh: '時間軸已開啟 — 開啟期間由時間軸決定必殺時機，此分頁的設定暫停。',
               zhs: '时间轴已开启 — 开启期间由时间轴决定必杀时机，此分页的设置暂停。',
               ja: 'タイムラインがオンです — オンの間はタイムラインが必殺のタイミングを決め、このタブの設定は休みます。' },
  ultHint:   { kr: '필살기를 언제 쓸지 캐릭터마다 정합니다. 기본은 ‘정해진 턴’ — 계획한 턴에 쓰고, 그 턴에 준비가 안 됐으면 준비되는 즉시 씁니다.',
               en: 'Decide per character when to use the ultimate. Default is ‘Planned turns’ — use it on the planned turn, or as soon as it is ready if it was not ready then.',
               zh: '為每位角色決定何時使用必殺技。預設為「指定回合」— 在計畫的回合使用，若該回合未就緒則一就緒立即使用。',
               zhs: '为每位角色决定何时使用必杀技。默认为「指定回合」— 在计划的回合使用，若该回合未就绪则一就绪立即使用。',
               ja: 'キャラごとに必殺技をいつ使うか決めます。既定は「指定ターン」— 計画したターンに使い、そのターンに準備できていなければ準備でき次第使います。' },
  cdProcWarn: { kr: '길드 제단 효과(행동 시·필살 시 확률로 쿨 감소)로 필살기 쿨타임이 앞당겨질 수 있어요. ‘정해진 턴’은 앞당겨진 쿨을 살리지 못하니 ‘준비되면 바로’를 권장합니다.',
               en: 'Guild altar effects (chance to cut the cooldown on action / on ultimate) can bring the ultimate earlier. ‘Planned turns’ cannot use that earlier cooldown, so ‘As soon as ready’ is recommended.',
               zh: '公會祭壇效果（行動時・必殺時有機率縮短CD）可能提早必殺技冷卻。「指定回合」無法利用提早的CD，建議改用「就緒即用」。',
               zhs: '公会祭坛效果（行动时・必杀时有概率缩短CD）可能提早必杀技冷却。「指定回合」无法利用提早的CD，建议改用「就绪即用」。',
               ja: 'ギルド祭壇の効果（行動時・必殺時に確率でCD短縮）で必殺技のクールが早まることがあります。「指定ターン」では早まったクールを活かせないため「準備でき次第」をおすすめします。' },
  cdProcAll: { kr: '모두 ‘준비되면 바로’로', en: 'Set all to ‘As soon as ready’', zh: '全部改為「就緒即用」', zhs: '全部改为「就绪即用」', ja: '全員「準備でき次第」にする' },
  cdProcDone: { kr: '궁극기 사용 방식을 모두 ‘준비되면 바로’로 바꿨어요 (연동 멤버 제외)', en: 'Set every ultimate policy to ‘As soon as ready’ (sync members excluded)',
               zh: '已將所有必殺技使用方式改為「就緒即用」（連動成員除外）', zhs: '已将所有必杀技使用方式改为「就绪即用」（联动成员除外）', ja: '必殺技の使い方をすべて「準備でき次第」にしました（連動メンバーを除く）' },
  ultMember: { kr: '연동 그룹 {0} 멤버 — {1}의 궁 턴에 맞춰요 (연동 탭에서 변경)', en: 'Sync group {0} member — follows {1}’s ultimate turns (change in the Sync tab)',
               zh: '連動組 {0} 成員 — 配合 {1} 的必殺回合（於連動分頁變更）', zhs: '联动组 {0} 成员 — 配合 {1} 的必杀回合（于联动分页变更）', ja: '連動グループ {0} のメンバー — {1} の必殺ターンに合わせます（連動タブで変更）' },
  ultSyncShort: { kr: '연동 그룹 {0} 멤버 · 앵커 {1}', en: 'Sync group {0} member · anchor {1}', zh: '連動組 {0} 成員 · 錨點 {1}', zhs: '联动组 {0} 成员 · 锚点 {1}', ja: '連動グループ {0} メンバー · アンカー {1}' },
  openUlt:   { kr: '행동 고급 설정에서 변경', en: 'Change in Advanced Action Setup', zh: '於行動進階設定變更', zhs: '于行动进阶设置变更', ja: '行動詳細設定で変更' },
  syncHint:  { kr: '한 캐릭터(앵커)가 필살기를 쓰는 턴에 다른 캐릭터(멤버)의 행동을 맞춥니다. 최대 3그룹, 한 캐릭터는 한 그룹에만 들어갈 수 있어요.',
               en: 'Align other characters (members) to the turns one character (the anchor) uses its ultimate. Up to 3 groups; a character can be in only one group.',
               zh: '讓其他角色（成員）配合某位角色（錨點）使用必殺技的回合行動。最多 3 組，一名角色只能屬於一組。',
               zhs: '让其他角色（成员）配合某位角色（锚点）使用必杀技的回合行动。最多 3 组，一名角色只能属于一组。',
               ja: 'あるキャラ（アンカー）が必殺技を使うターンに、他のキャラ（メンバー）の行動を合わせます。最大3グループ、1キャラは1グループのみ。' },
  members:   { kr: '멤버', en: 'Members', zh: '成員', zhs: '成员', ja: 'メンバー' },
  memberAct: { kr: '앵커 궁 턴에', en: 'On the anchor’s ultimate turn', zh: '錨點必殺回合', zhs: '锚点必杀回合', ja: 'アンカーの必殺ターンに' },
  actUlt:    { kr: '같이 궁', en: 'Ultimate together', zh: '一起放必殺', zhs: '一起放必杀', ja: '一緒に必殺' },
  actDef:    { kr: '방어 → 받은 추가 행동에서 궁', en: 'Defend → ultimate in the granted extra action', zh: '防禦 → 用獲得的追加行動放必殺', zhs: '防御 → 用获得的追加行动放必杀', ja: '防御 → もらった追加行動で必殺' },
  actBasic:  { kr: '평타 → 받은 추가 행동에서 궁', en: 'Attack → ultimate in the granted extra action', zh: '普攻 → 用獲得的追加行動放必殺', zhs: '普攻 → 用获得的追加行动放必杀', ja: '通常攻撃 → もらった追加行動で必殺' },
  orderLbl:  { kr: '행동 순서', en: 'Order', zh: '行動順', zhs: '行动顺', ja: '行動順' },
  orderFixed: { kr: '앵커 앞 — 추가 행동은 이미 행동을 마친 아군에게만 들어가서, 앵커보다 먼저 행동해야 해요',
               en: 'Before the anchor — extra actions only go to allies who already acted this turn, so this member must act before the anchor',
               zh: '錨點前 — 追加行動只會給本回合已行動的隊員，所以必須先於錨點行動',
               zhs: '锚点前 — 追加行动只会给本回合已行动的队员，所以必须先于锚点行动',
               ja: 'アンカー前 — 追加行動はそのターンに行動済みの味方にしか入らないため、アンカーより先に行動する必要があります' },
  noGrant:   { kr: '{0}의 필살기는 추가 행동을 주지 않아요 — 보류한 궁은 ‘미준비면’ 규칙대로 나갑니다 (대기 = 다음 앵커 궁 턴까지 아낌).',
               en: '{0}’s ultimate does not grant extra actions — the held ultimate follows the ‘If not ready’ rule (Wait = saved until the anchor’s next ultimate turn).',
               zh: '{0} 的必殺技不會給予追加行動 — 保留的必殺依「未就緒時」規則處理（等待 = 留到錨點下次必殺回合）。',
               zhs: '{0} 的必杀技不会给予追加行动 — 保留的必杀依「未就绪时」规则处理（等待 = 留到锚点下次必杀回合）。',
               ja: '{0} の必殺技は追加行動を与えません — 保留した必殺は「未準備なら」のルールに従います（待つ = アンカーの次の必殺ターンまで温存）。' },
  flow:      { kr: '{0}이(가) 궁을 쓰는 턴:', en: 'On {0}’s ultimate turn:', zh: '{0} 使用必殺的回合：', zhs: '{0} 使用必杀的回合：', ja: '{0} が必殺を使うターン：' },
  stepUlt:   { kr: '궁', en: 'ultimate', zh: '必殺', zhs: '必杀', ja: '必殺' },
  stepDef:   { kr: '방어', en: 'defend', zh: '防禦', zhs: '防御', ja: '防御' },
  stepBasic: { kr: '평타', en: 'attack', zh: '普攻', zhs: '普攻', ja: '通常攻撃' },
  stepBonus: { kr: '궁 (받은 추가 행동)', en: 'ultimate (granted extra action)', zh: '必殺（獲得的追加行動）', zhs: '必杀（获得的追加行动）', ja: '必殺（もらった追加行動）' },
  presetUk:  { kr: '{0} 연동 자동 설정', en: '{0} sync preset', zh: '{0} 連動快速設定', zhs: '{0} 联动快速设置', ja: '{0} 連動プリセット' },
  presetUkDesc: { kr: '인접 아군이 평타 → {0} 궁 → 받은 추가 행동에서 궁. 원하는 멤버는 ‘방어 →’로 바꾸세요.',
               en: 'Adjacent allies attack → {0} ultimate → ultimate in the granted extra action. Switch a member to ‘Defend →’ if wanted.',
               zh: '相鄰隊員普攻 → {0} 必殺 → 用獲得的追加行動放必殺。想要的成員可改為「防禦 →」。',
               zhs: '相邻队员普攻 → {0} 必杀 → 用获得的追加行动放必杀。想要的成员可改为「防御 →」。',
               ja: '隣接する味方が通常攻撃 → {0} 必殺 → もらった追加行動で必殺。必要なメンバーは「防御 →」に変更してください。' },
  presetDone: { kr: '연동 그룹을 만들었어요 — 멤버별 행동을 아래에서 조정할 수 있어요', en: 'Sync group created — adjust each member below',
               zh: '已建立連動組 — 可在下方調整各成員行動', zhs: '已建立联动组 — 可在下方调整各成员行动', ja: '連動グループを作成しました — 下でメンバーごとの行動を調整できます' },
  presetFull: { kr: '빈 그룹이 없어요 — 그룹을 하나 비운 뒤 다시 눌러 주세요', en: 'No free group — clear one group and try again',
               zh: '沒有空的組 — 請先清空一組再試', zhs: '没有空的组 — 请先清空一组再试', ja: '空きグループがありません — 1つ空けてからもう一度押してください' },
  conflict:  { kr: '타임라인이 켜져 있는 동안 적용되지 않는 설정: {0}. 반영하려면 ‘기존 설정 불러오기’를 누르세요.',
               en: 'Not applied while the timeline is on: {0}. Press ‘Import current settings’ to bring them into the timeline.',
               zh: '時間軸開啟期間不套用的設定：{0}。要反映請按「匯入現有設定」。',
               zhs: '时间轴开启期间不应用的设置：{0}。要反映请按「导入现有设置」。',
               ja: 'タイムラインがオンの間は適用されない設定：{0}。反映するには「既存設定を読み込む」を押してください。' },
  conflictOv: { kr: '특정 턴만 다르게({0}턴)', en: 'Per-turn order (T{0})', zh: '特定回合順序（第 {0} 回合）', zhs: '特定回合顺序（第 {0} 回合）', ja: '特定ターンの順序（{0}ターン）' },
  conflictPlan: { kr: '캐릭터별 턴 계획({0})', en: 'Per-character turn plans ({0})', zh: '角色回合計畫（{0}）', zhs: '角色回合计划（{0}）', ja: 'キャラ別ターン計画（{0}）' },
  altarMoved: { kr: '연동(궁 맞추기)과 궁극기 사용 방식은 행동 고급 설정으로 옮겨졌어요 — 제단을 켜지 않아도 쓸 수 있어요.',
               en: 'Sync (ultimate timing) and Ultimate policy moved to Advanced Action Setup — they work without altars too.',
               zh: '連動（必殺同步）與必殺技使用方式已移至行動進階設定 — 不開祭壇也能使用。',
               zhs: '联动（必杀同步）与必杀技使用方式已移至行动进阶设置 — 不开祭坛也能使用。',
               ja: '連動（必殺同期）と必殺技の使い方は行動詳細設定に移りました — 祭壇を使わなくても使えます。' },
  altarMovedOpen: { kr: '열기', en: 'Open', zh: '開啟', zhs: '打开', ja: '開く' },
};
function advT(key, ...args) {             // 로컬 사전 → 현재 언어(없으면 kr) + {n} 치환
  const v = ADV_T[key];
  let str = (v && (v[altarLang()] || v.kr)) || key;
  args.forEach((a, i) => { str = str.replace('{' + i + '}', a); });
  return str;
}
// 고급 설정이 열려 있으면 다시 계산·렌더(연동·궁극기 사용 방식이 바뀌면 타임라인 프로브도 달라진다)
function advRerender() { if (document.querySelector('.adv-card')) advRefresh(); }
// 확률 CD 감소 제단(1012 행동 시 CD-1 · 1013 필살 시 CD-3)이 걸려 있는가 — 플래너의 보장 CD 모델엔 없어
// '정해진 턴' 계획이 실제 실행과 어긋난다. 걸려 있으면 '준비되면 바로' 를 권한다.
const ALTAR_CD_PROC_IDS = [1012, 1013];
function altarProcCdActive() {
  const f = altarOn && altarCfg.floors[1];
  if (!f || f.on === false) return [];
  return ALTAR_CD_PROC_IDS.filter(id => !(f.off && f.off[id]));
}

function advTurns() { return advScope ? (+cmpCommon.turns || 30) : (+$('#turns').value || 30); }
// 타임라인은 '포지션' 기준이라 캐릭터가 바뀌면 같은 자리의 계획을 다른 캐릭터가 물려받는다.
// 교체는 실행 자체는 되기 때문에 문제 표시로 잡히지 않아, 편성 지문을 따로 들고 비교한다.
function advTeamFingerprint() { return aTeam().map(s => (s ? s.id : 0)).join(','); }

// 고급 설정이 켜지면 기존 행동 UI를 잠근다 — 한 화면에서 두 규칙이 싸우지 않게.
function syncAdvLock() {
  if (advScope) return;            // 비교군 편집 중엔 메인 UI를 건드리지 않는다
  $('#advOpen')?.classList.toggle('on', advOn);
  const lock = $('#advLock'); if (lock) lock.hidden = !advOn;
  for (const sel of ['#prio', '.prio-turn']) {
    const el = document.querySelector(sel); if (!el) continue;
    el.style.opacity = advOn ? .3 : '';
    el.style.pointerEvents = advOn ? 'none' : '';
  }
  const rs = $('#prioReset'); if (rs) rs.disabled = advOn;
}

// 프로브용 cfg — run()의 cfg와 같은 모양(확률 100%·1회로 고정해 결정론적으로 본다).
// useLegacy=true 면 고급 설정이 켜져 있어도 기존 설정(캐릭 계획·우선순위·특정 턴 순서)을
// 그대로 실어 보낸다 — '기존 설정 불러오기'가 그때의 진행을 그대로 받아오기 위한 경로.
function advCfg(plansOverride, useLegacy) {
  const plans = plansOverride || (advOn ? turnPlans : {});
  if (advScope) {                    // 비교군: 비교 공통 설정 + 그 비교군 편성으로 구성
    const sd = advScope;
    return {
      team: (cmpTeam[sd] || []).map((t, i) => t && ({
        id: t.id, position: i + 1, skill: t.skill, rune: t.rune,
        rotation: (advOn && !useLegacy) ? null
          : (t.usePlan ? ((t.plan && t.plan.length) ? t.plan.join('') : (t.rotation || null)) : null),
        fedActions: (t.usePlan && t.fedActions && Object.keys(t.fedActions).length) ? t.fedActions : null,
        allyUltAfter: !!t.allyUltAfter,
        priority: (advOn && !useLegacy) ? null : (t.priority ?? null),
        sealAtk: t.sealOn ? (t.sealAtk ?? 0) : 0, sealHp: t.sealOn ? (t.sealHp ?? 0) : 0,
        ult: ultPayload(t),
        ...specPayload(t),
      })).filter(Boolean),
      turns: advTurns(), dummies: cmpCommon.dummies, enemyHits: cmpCommon.enemyHits,
      dummyElement: cmpCommon.dummyElement,
      turnOrders: (advOn && !useLegacy) ? {} : (cmpTurnOv[sd] || {}),
      turnPlans: plans, forceProc: true, hp10: !!cmpCommon.hp10, runs: 1,
      incomingHpPct: cmpCommon.incomingOn ? +(cmpCommon.incomingPct || 0) : 0,
      altar: altarPayload(),         // 길드 제단(메인과 공통) — 최대 CD+1 등이 타임라인에 그대로 반영되게
      sync: syncPayload(),           // 연동 그룹(메인과 공통 · 포지션 기준)
      turnDamage: tdmgPayload(),     // 턴 피해(메인과 공통)
    };
  }
  return {
    team: team.map((s, i) => s && ({
      id: s.id, position: i + 1, skill: s.skill, rune: s.rune,
      // 고급 설정이 켜지면 캐릭터별 턴 계획을 물려받지 않는다 — 물려받으면 파미도의
      // '패시브 방어'처럼 사용자화가 기본값인 척 딸려 들어와, 기본값으로 되돌려도
      // 궁 앞 턴이 방어로 남는다. 고급 설정은 기본 세팅에서 출발해 사용자가 다 정한다.
      // (전 턴이 지정 상태라 rotation은 행동 선택에 쓰이지 않으므로 결과에도 영향 없음)
      rotation: (advOn && !useLegacy) ? null : (s.rotation || null),
      fedActions: s.fedActions || null, allyUltAfter: !!s.allyUltAfter,
      priority: (advOn && !useLegacy) ? null : (s.priority ?? null),
      sealAtk: s.sealOn ? (s.sealAtk ?? 0) : 0, sealHp: s.sealOn ? (s.sealHp ?? 0) : 0,
      ult: ultPayload(s),
      ...specPayload(s),
    })).filter(Boolean),
    turns: advTurns(), dummies: +$('#dummies').dataset.val,
    enemyHits: $('#enemyHits').dataset.val, dummyElement: +$('#dummyElement').dataset.val,
    turnOrders: (advOn && !useLegacy) ? {} : turnOverrides,
    turnPlans: plans,
    altar: altarPayload(),           // 길드 제단(메인 설정)
    sync: syncPayload(),             // 연동 그룹
    turnDamage: tdmgPayload(),       // 턴 피해(메인 설정)
    forceProc: true, hp10, runs: 1,
    incomingHpPct: incomingOn ? +$('#incoming').value : 0,
  };
}

// "이 설정이면 실제로 이렇게 굴러간다"를 엔진에게 묻는다. 편집할 때마다 호출.
// 예산이 늘면 뒤에 자동으로 붙이고, 줄면 실행 못 하는 뒷부분을 걷어낸다.
// 기준을 '직전 예산'으로 잡는 게 핵심 — 항상 예산까지 채우면 사용자가 지운 행동이
// 곧바로 되살아나 삭제가 불가능해진다. 늘어난 델타만 반영하면 삭제는 그대로 유지된다.
function advReconcile(turn) {
  const seq = turnPlans[turn];
  if (!seq) return false;                       // 아직 편집 전인 턴은 기본값 그대로 둔다
  const live = (advProbe && advProbe.plan && advProbe.plan[String(turn)]) || {};
  const budget = live.budget || {};
  const prev = advPrevBudget[turn];
  advPrevBudget[turn] = { ...budget };
  if (!prev) return false;                      // 첫 프로브는 기준선만 잡고 넘어간다
  const want = {};
  seq.forEach(e => { want[e.p] = (want[e.p] || 0) + 1; });
  let changed = false, added = 0;
  for (const key of new Set([...Object.keys(budget), ...Object.keys(prev)])) {
    const pos = +key, now = budget[key] || 0, was = prev[key] || 0;
    const grew = now - was;
    if (grew > 0) {                             // 추가 행동이 새로 생겼다 → 뒤에 붙인다
      for (let i = 0; i < grew; i++) seq.push({ p: pos, a: '평' });
      added += grew; changed = true;
    }
    let excess = (want[pos] || 0) + (grew > 0 ? grew : 0) - now;
    while (excess > 0) {                        // 예산이 줄어 실행 못 하는 꼬리를 제거
      const at = seq.map(e => e.p).lastIndexOf(pos);
      if (at < 0) break;
      seq.splice(at, 1); excess--; changed = true;
    }
  }
  if (added) toast(`추가 행동 ${added}개를 뒤에 넣었어요 — 순서는 끌어서 바꿀 수 있어요`);
  return changed;
}

// 고급 설정이 켜진 동안엔 모든 턴을 명시 타임라인으로 채운다. 지정 턴과 자동 턴이 섞이면
// 자동 턴의 로테이션이 어긋나 계획이 통째로 밀린다(2턴을 고정했더니 팀 궁이 4턴→5턴).
// 채우는 값은 프로브가 준 '지금 그대로의 진행'이라 켜는 순간 결과는 바뀌지 않는다.
function advMaterialize() {
  if (!advOn || !advProbe || !advProbe.plan) return false;
  let filled = false;
  for (let t = 1; t <= advTurns(); t++) {
    if (turnPlans[t]) continue;
    const src = advProbe.plan[String(t)];
    if (!src) continue;
    turnPlans[t] = src.seq.map(e => ({ p: e.p, a: e.a }));
    filled = true;
  }
  if (filled) advTeamSig = advTeamFingerprint();
  return filled;
}

// 진행 중이면 요청을 '버리지' 않고 뒤에 한 번만 예약해 두고 그 결과를 함께 기다린다.
// 예전엔 그냥 return 해버려서, 빠르게 두 번 누르면 두 번째 편집이 프로브·검증·렌더를
// 통째로 건너뛰고 화면이 낡은 판정을 보여줬다(실행 안 됨 표시 누락, 잘못된 강등 배지).
let advTail = null;
async function advRefresh(render = true) {
  if (advBusy) {
    if (!advTail) advTail = { render, p: null, res: null };
    advTail.render = advTail.render || render;
    if (!advTail.p) advTail.p = new Promise((res) => { advTail.res = res; });
    return advTail.p;
  }
  advBusy = true;
  const gen = advGen;                 // 프로브 대기 중 닫히거나 대상이 바뀌면 반영하면 안 된다
  try {
    const probe = await API.probe(advCfg());
    if (gen !== advGen) { advBusy = false; return advProbe; }
    advProbe = probe;
    if (advMaterialize()) advProbe = await API.probe(advCfg());
    if (gen !== advGen) { advBusy = false; return advProbe; }
    // 예산 변화를 반영해 타임라인을 맞춘 뒤, 바뀌었으면 한 번 더 물어 최종 상태를 받는다.
    // 붙이는 건 평타뿐이라 새 추가 행동을 만들지 않으므로 여기서 수렴한다.
    if (advReconcile(advSel)) advProbe = await API.probe(advCfg());
  } catch (err) { toast(`행동을 계산하지 못했어요 — ${err.message}`); }
  advBusy = false;
  if (gen !== advGen) return advProbe;
  if (render) renderAdv();
  const tail = advTail;
  advTail = null;
  if (tail) { const r = await advRefresh(tail.render); tail.res(r); return r; }
  return advProbe;
}

// 편집 중인 턴의 항목. 아직 손대지 않은 턴은 프로브가 준 '실제 진행'을 시작점으로 쓴다.
function advSeq(turn) {
  // 꺼져 있을 땐 저장해 둔 지정을 보여주지 않는다 — 그때 실제로 도는 건 기존 설정이라
  // 보관 중인 타임라인을 띄우면 화면과 결과가 어긋난다.
  if (advOn && turnPlans[turn]) return turnPlans[turn];
  const p = advProbe && advProbe.plan && advProbe.plan[String(turn)];
  return p ? p.seq.map(e => ({ p: e.p, a: e.a })) : [];
}

function advCommit(turn, seq) { advPushUndo(`${turn}턴 편집`); advTouched.add(turn); turnPlans[turn] = seq; advRefresh(); }

// 순서 이동 전용 커밋. 옮긴 그 항목이 실행 불가가 되면 되돌린다 — 추가로 얻은 행동을
// 그걸 만들어 준 필살기보다 앞에 두는 건 인과적으로 불가능하기 때문. (필살기 자체를
// 앞으로 옮겨 부여를 낭비하는 건 정당한 선택이라 막지 않는다.)
async function advReorder(turn, seq, movedIdx) {
  const gen = advGen;
  advPushUndo(`${turn}턴 순서 변경`);        // 순서 이동도 되돌릴 수 있어야 한다
  advTouched.add(turn);
  const had = !!turnPlans[turn];
  const prev = (turnPlans[turn] || []).map(x => ({ ...x }));
  turnPlans[turn] = seq;
  await advRefresh(false);
  if (gen !== advGen) return;
  const mask = ((advProbe && advProbe.plan && advProbe.plan[String(turn)]) || {}).exec;
  if (mask && mask[movedIdx] == null) {
    if (had) turnPlans[turn] = prev; else delete turnPlans[turn];
    advUndo.pop();                            // 되돌려졌으니 스택에 남길 필요가 없다
    await advRefresh(false);
    if (gen !== advGen) return;
    toast('추가로 얻은 행동이에요 — 그걸 만들어 준 <b>필살기보다 앞</b>에는 둘 수 없어요');
  }
  renderAdv();
}


// ── 고급 설정: 복사/붙여넣기 · 되돌리기 · 구간 · 전체 보기 ──────────────────────
// 호환 턴을 미리 계산해 두지 않는다 — 턴별 개별 검증은 프로브 30회(라이브 ~2.7초)라
// 미리 칠하기엔 너무 비싸다. 대신 '행동할 때' 검증한다: 붙여넣기 1회 = 프로브 1회.
let advClip = null;             // {from, seq} 복사한 턴
let advUndo = [];               // 되돌리기 스택 (편집이 파괴적이라 필수)
let advSelSet = null;           // 선택된 턴 집합 (shift+클릭 구간 · 호환 턴 체크 결과). null = 현재 턴만
let advGrid = false;            // 전체 턴 요약 격자 표시
let advCell = null;             // 격자에서 연 칸 편집기 {pos, turn, x, y}
let advTeamSig = '';            // 타임라인을 만들 당시의 편성 지문 — 팀이 바뀌면 경고한다
let advGen = 0;                 // 편집기 세대. await 뒤 이 값이 바뀌었으면 그 사이 닫혔거나
                                //   스코프가 바뀐 것이라 결과를 반영하면 안 된다(메인 오염 방지)
let advCloseFn = null;          // 현재 열린 편집기의 닫기 함수 — 중복 오픈 시 먼저 정리한다
let advScope = null;            // null=메인 · 'a'|'b'=비교군. 같은 편집기를 다른 팀에 붙인다
let advSaved = null;            // 비교군 편집 중 잠시 치워둔 메인 상태
// 고급 설정이 대상으로 삼는 팀 — 비교군을 편집할 땐 그쪽 편성을 본다
function aTeam() { return advScope ? (cmpTeam[advScope] || []) : team; }
const ADV_UNDO_MAX = 30;

function advPushUndo(label) {
  advUndo.push({ label, plans: JSON.parse(JSON.stringify(turnPlans)),
                 touched: [...advTouched], budget: JSON.parse(JSON.stringify(advPrevBudget)) });
  if (advUndo.length > ADV_UNDO_MAX) advUndo.shift();
}
function advDoUndo() {
  const u = advUndo.pop();
  if (!u) return toast('되돌릴 편집이 없어요');
  turnPlans = u.plans; advTouched = new Set(u.touched); advPrevBudget = u.budget;
  advRefresh();
  toast(`되돌렸어요 — ${u.label}`);
}

// 주어진 계획으로 프로브만 돌린다 (상태를 건드리지 않음 — 붙여넣기 사전 검증용)
async function advProbeWith(plans) {
  const cfg = advCfg();
  cfg.turnPlans = plans;
  return await API.probe(cfg);
}
// 그 턴의 모든 항목이 요청대로 실행됐는가
function advTurnClean(probe, turn, want) {
  const pl = probe && probe.plan && probe.plan[String(turn)];
  const ex = pl && pl.exec;
  return !!ex && ex.length === want.length && want.every((e, i) => ex[i] === e.a);
}
function advWhyBad(probe, turn, want) {
  const ex = ((probe.plan || {})[String(turn)] || {}).exec || [];
  const miss = want.filter((e, i) => ex[i] == null).length;
  const down = want.filter((e, i) => ex[i] != null && ex[i] !== e.a).length;
  const bits = [];
  if (down) bits.push(`필살 ${down}개가 쿨타임`);
  if (miss) bits.push(`행동 ${miss}개가 예산 초과`);
  return bits.join(' · ') || '실행 결과가 달라요';
}

function advCopyTurn(turn) {
  const seq = advSeq(turn);
  if (!seq.length) return toast('복사할 행동이 없어요');
  advClip = { from: turn, seq: seq.map(e => ({ ...e })) };
  renderAdv();
  toast(`${turn}턴 ${seq.length}행동을 복사했어요`);
}

async function advPasteInto(turns) {
  if (!advClip) return toast('먼저 턴을 복사하세요');
  const want = advClip.seq;
  const gen = advGen;                       // await 사이에 닫히면 반영하지 않는다
  const trial = JSON.parse(JSON.stringify(turnPlans));
  turns.forEach(t => { trial[t] = want.map(e => ({ ...e })); });
  let probe;
  try { probe = await advProbeWith(trial); }
  catch (err) { return toast(`붙여넣기를 확인하지 못했어요 — ${err.message}`); }
  if (gen !== advGen) return;               // 그 사이 닫혔거나 다른 대상으로 바뀜
  const bad = turns.filter(t => !advTurnClean(probe, t, want));
  if (bad.length) {
    const t0 = bad[0];
    return toast(`${bad.length === 1 ? `${t0}턴에는` : `${bad.join('·')}턴에는`} 붙여넣을 수 없어요 — ${advWhyBad(probe, t0, want)}`);
  }
  advPushUndo(`${turns.join('·')}턴 붙여넣기`);
  turns.forEach(t => { turnPlans[t] = want.map(e => ({ ...e })); advTouched.add(t); delete advPrevBudget[t]; });
  await advRefresh();
  toast(`${turns.length}개 턴에 붙여넣었어요 — 선택은 유지됩니다`);
}

// 클립보드를 그대로 넣을 수 있는 턴을 찾아 '선택'만 해 둔다(붙여넣지 않는다).
// 앞 턴을 넣으면 뒤 턴의 쿨이 바뀌므로, 실제 적용 순서대로 확정해 나가며 검사한다.
async function advCheckCompatible() {
  if (!advClip) return toast('먼저 턴을 복사하세요');
  const want = advClip.seq, n = advTurns();
  const btn = document.querySelector('#advPasteAll');
  const label = '호환 턴 전부 체크';
  const gen = advGen, clip0 = advClip;
  if (btn) { btn.disabled = true; btn.textContent = '맞는 턴 찾는 중…'; }
  const trial = JSON.parse(JSON.stringify(turnPlans));
  const hit = [];
  try {
    for (let t = 1; t <= n; t++) {
      const keep = trial[t];
      trial[t] = want.map(e => ({ ...e }));
      const probe = await advProbeWith(trial);
      if (gen !== advGen) return;                    // 닫혔으면 즉시 중단
      if (advTurnClean(probe, t, want)) hit.push(t);
      else trial[t] = keep;
      if (btn) btn.textContent = `찾는 중… ${t}/${n}`;
    }
  } catch (err) {
    return toast(`호환 턴을 확인하지 못했어요 — ${err.message}`);
  } finally {
    // 실패해도 버튼 라벨·활성 상태를 반드시 되돌린다 (안 그러면 '찾는 중…'이 영영 남는다)
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
  if (advClip !== clip0) return toast('찾는 도중 복사한 내용이 바뀌었어요 — 다시 눌러 주세요');
  if (!hit.length) { advSelSet = null; renderAdv(); return toast('이 계획을 그대로 넣을 수 있는 턴이 없어요'); }
  advSelSet = new Set(hit);
  renderAdv();
  toast(`${hit.length}개 턴이 호환돼요 (${hit.join('·')}턴) — <b>붙여넣기</b>를 누르면 적용됩니다`);
}

// 기존 설정(캐릭터별 턴 계획 · 행동 우선순위 · 특정 턴 순서)으로 돌린 결과를 그대로
// 타임라인에 받아온다. 고급 설정은 평소엔 기본 세팅에서 출발하지만, 이미 짜둔 설정을
// 출발점으로 쓰고 싶을 때가 있어 따로 버튼을 둔다.
async function advImportLegacy() {
  const btn = document.querySelector('#advImport');
  if (btn) { btn.disabled = true; btn.textContent = '불러오는 중…'; }
  const gen = advGen;
  let pr = null;
  try { pr = await API.probe(advCfg({}, true)); }
  catch (err) { toast(`기존 설정을 불러오지 못했어요 — ${err.message}`); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '기존 설정 불러오기'; } }
  if (!pr || !pr.plan || gen !== advGen) return;
  // 제토 도장의 확률·체이닝 자기 추가행동(seq의 x:true)은 엔진이 자동 발동하므로 타임라인에 굳히면
  // 예산 초과 에러가 난다 → import에서 제외. 임부언·욱영이 준 '외부' 추가행동(x 없음)은 결정형이라
  // 그대로 보여준다(사용자가 순서를 편집할 수 있어야 하므로).
  const next = {};
  for (let t = 1; t <= advTurns(); t++) {
    const src = pr.plan[String(t)];
    if (!src) continue;
    next[t] = src.seq.filter(e => !e.x).map(e => ({ p: e.p, a: e.a }));
  }
  if (JSON.stringify(next) === JSON.stringify(turnPlans)) {
    return toast('기존 설정과 지금 타임라인이 이미 같아요');
  }
  advPushUndo('기존 설정 불러오기');
  const got = Object.keys(next).length;
  Object.entries(next).forEach(([t, seq]) => {
    turnPlans[t] = seq; advTouched.add(+t); delete advPrevBudget[t];
  });
  await advRefresh();
  toast(`기존 설정을 ${got}개 턴으로 가져왔어요 — 되돌리기로 취소할 수 있어요`);
}

function advResetTurns(turns, label) {
  const hit = turns.filter(t => advTouched.has(t));
  if (!hit.length) return toast('되돌릴 편집이 없어요');
  advPushUndo(label);
  hit.forEach(t => { advTouched.delete(t); delete turnPlans[t]; delete advPrevBudget[t]; });
  advRefresh();
  toast(`${hit.length}개 턴을 기본값으로 되돌렸어요`);
}

function advRangeTurns() {
  return advSelSet && advSelSet.size ? [...advSelSet].sort((a, b) => a - b) : [advSel];
}

// 전체 턴 요약 — 세로 캐릭터 × 가로 턴. 계획의 리듬(궁 주기)을 한 화면에서 본다.
function renderAdvGrid(card) {
  const wrap = $('.adv-gridwrap', card);
  wrap.hidden = !advGrid;
  if (!advGrid) return;
  const n = advTurns();
  const roster = aTeam().map((s, i) => s && { pos: i + 1, id: s.id }).filter(Boolean);
  const cell = (pos, t) => {
    const seq = advSeq(t).filter(e => e.p === pos);
    if (!seq.length) return '<i class="g-none"></i>';
    return seq.map(a => `<i class="g-${a.a === '궁' ? 'ult' : a.a === '방' ? 'def' : 'atk'}"></i>`).join('');
  };
  wrap.innerHTML = `<div class="adv-grid" style="--n:${n}">
    <div class="g-head"><span></span>${Array.from({ length: n }, (_, i) =>
      `<b class="${i + 1 === advSel ? 'on' : ''}" data-advt="${i + 1}">${i + 1}</b>`).join('')}</div>
    ${roster.map(r => `<div class="g-row"><span class="g-nm">${(CHARS[r.id] || {}).name || r.id}</span>${
      Array.from({ length: n }, (_, i) => {
        const t = i + 1, sel = advCell && advCell.pos === r.pos && advCell.turn === t;
        return `<u class="${t === advSel ? 'on' : ''}${sel ? ' pick' : ''}" data-gp="${r.pos}" data-gt="${t}"
          title="${(CHARS[r.id] || {}).name || ''} ${t}턴 — 눌러서 행동 변경">${cell(r.pos, t)}</u>`;
      }).join('')
    }</div>`).join('')}
    <div class="g-legend"><i class="g-atk"></i>평타 <i class="g-ult"></i>필살 <i class="g-def"></i>방어</div>
  </div>`;
}

// 격자 칸 편집기 — 그 캐릭터의 그 턴 행동만 고친다. 행동 횟수(예산)와 필살 쿨을
// 항목별로 검사해 불가능한 선택은 못 하게 막는다.


function renderCellPop(card) {
  let pop = $('.adv-cellpop', card);
  if (!advCell) { if (pop) pop.remove(); return; }
  if (!pop) { pop = document.createElement('div'); pop.className = 'adv-cellpop'; card.appendChild(pop); }
  const { pos, turn } = advCell;
  const cid = (aTeam()[pos - 1] || {}).id, meta = CHARS[cid] || {};
  const seq = advSeq(turn);
  const idxs = seq.map((e, i) => (e.p === pos ? i : -1)).filter(i => i >= 0);
  const live = (advProbe && advProbe.plan && advProbe.plan[String(turn)]) || {};
  const budget = (live.budget || {})[pos] || 0;
  const cdOk = live.cdOk || null, exec = live.exec || null;
  const left = budget - idxs.length;
  pop.style.left = advCell.x + 'px';
  pop.style.top = advCell.y + 'px';
  pop.innerHTML = `<div class="cp-head"><b>${turn}턴</b> ${meta.name || pos}
      <span class="cp-bud">행동 ${idxs.length}/${budget}</span>
      <button type="button" class="cp-x" data-cpclose aria-label="닫기">✕</button></div>
    ${idxs.length ? idxs.map((k, i) => {
      const e = seq[k];
      const canUlt = (cdOk ? cdOk[k] : true) || e.a === '궁';
      const done = exec ? exec[k] : e.a;
      const note = done == null ? '<em class="bad">실행 안 됨</em>'
                 : (done !== e.a ? `<em class="bad">${done}(으)로</em>` : '');
      return `<div class="cp-row"><span class="cp-n">${i + 1}</span>
        ${['평', '궁', '방'].map(a => `<button type="button" data-cpa="${a}" data-cpk="${k}"
          class="${e.a === a ? 'on' : ''}"${a === '궁' && !canUlt ? ' disabled title="이 시점엔 필살기 불가 — 쿨타임"' : ''}>${a}</button>`).join('')}
        ${note}<button type="button" class="cp-del" data-cpdel="${k}" aria-label="삭제">✕</button></div>`;
    }).join('') : '<div class="cp-empty">이 턴엔 행동이 없어요</div>'}
    <button type="button" class="cp-add" data-cpadd="1"${left > 0 ? '' : ' disabled'}>
      ${left > 0 ? `행동 추가 (남은 ${left})` : '더 행동할 수 없어요'}</button>`;
}

function renderAdv() {
  const card = document.querySelector('.adv-card'); if (!card) return;
  // ── 탭: 세 패널 중 하나만 보인다. '사용' 스위치는 타임라인 탭에만 뜬다(다른 두 탭은 항상 적용).
  card.querySelectorAll('[data-advtab]').forEach(b => {
    b.classList.toggle('on', b.dataset.advtab === advTab);
    b.setAttribute('aria-selected', b.dataset.advtab === advTab ? 'true' : 'false');
  });
  ['time', 'ult', 'sync'].forEach(t => { const pane = $('.adv-pane-' + t, card); if (pane) pane.hidden = advTab !== t; });
  const swWrap = $('#advSwitchWrap', card); if (swWrap) swWrap.hidden = advTab !== 'time';
  renderAdvUlt(card);
  renderAdvSync(card);
  renderAdvConflict(card);
  $('.adv-pane-time', card).classList.toggle('off', !advOn);
  const n = advTurns();
  if (advSel > n) advSel = n;

  // 턴별 이상 여부를 미리 계산 — 전 턴이 지정 상태라 다른 턴의 문제를 놓치기 쉽다.
  const turnBad = t => {
    if (!advOn) return false;
    const q = turnPlans[t], pl = advProbe && advProbe.plan && advProbe.plan[String(t)];
    if (!q || !pl || !pl.exec) return false;
    return q.some((e, i) => pl.exec[i] == null || pl.exec[i] !== e.a);
  };
  $('.adv-rail', card).innerHTML = Array.from({ length: n }, (_, i) => {
    const t = i + 1;
    const cls = [t === advSel ? 'sel' : '', advOn && advTouched.has(t) ? 'edited' : '',
      turnBad(t) ? 'bad' : ''].filter(Boolean).join(' ');
    const tip = turnBad(t) ? ' title="요청과 다르게 실행되는 행동이 있어요"' : '';
    return `<button type="button" class="${cls}"${tip} data-advt="${t}">${t}</button>`;
  }).join('');
  card.querySelectorAll('.adv-rail button').forEach(b => {
    if (advSelSet && advSelSet.has(+b.dataset.advt)) b.classList.add('rng');
  });
  const clipBar = $('.adv-clip', card);
  clipBar.hidden = !advClip;
  if (advClip) clipBar.innerHTML =
    `클립보드 <b>${advClip.from}턴</b> · ${advClip.seq.length}행동 <button type="button" id="advClipClear">비우기</button>`;
  const rng = advRangeTurns();
  const selBar = $('.adv-selbar', card);
  const many = !!(advSelSet && advSelSet.size);
  selBar.hidden = !many;
  if (many) {
    const list = [...advSelSet].sort((a, b) => a - b);
    const shown = list.length > 12 ? list.slice(0, 12).join('·') + `… (${list.length}개)` : list.join('·');
    selBar.innerHTML = `선택 <b>${shown}</b>턴 — 붙여넣기·기본값이 여기에 적용됩니다
      <button type="button" id="advSelClear">선택 해제</button>`;
  }
  $('#advResetSel', card).textContent = rng.length > 1 ? `${rng.length}턴 기본값으로` : '이 턴 기본값으로';
  $('#advPaste', card).disabled = !advClip;
  $('#advPasteAll', card).disabled = !advClip;
  $('#advUndoBtn', card).disabled = !advUndo.length;
  $('#advGridBtn', card).classList.toggle('on', advGrid);
  renderAdvGrid(card);
  renderCellPop(card);
  // 편성이 바뀌었으면 알린다 — 교체는 조용히 다른 캐릭터가 계획을 물려받는다
  const tw = $('.adv-teamwarn', card);
  const sigChanged = advOn && advTeamSig && advTeamSig !== advTeamFingerprint()
                     && Object.keys(turnPlans).length > 0;
  tw.hidden = !sigChanged;
  if (sigChanged) tw.innerHTML =
    `팀 편성이 바뀌었어요 — 이 타임라인은 <b>이전 편성 기준</b>이라 같은 자리의 계획을 다른 캐릭터가 이어받습니다.
     <button type="button" id="advSigReset">기본값으로 다시 시작</button>
     <button type="button" id="advSigKeep">그대로 두기</button>`;

  const badTurns = Array.from({ length: n }, (_, i) => i + 1).filter(turnBad);
  const rw = $('.adv-railwarn', card);
  rw.hidden = !badTurns.length || (badTurns.length === 1 && badTurns[0] === advSel);
  if (!rw.hidden) rw.innerHTML = `다른 턴에도 확인할 게 있어요 — <b>${badTurns.join(' · ')}턴</b>`;

  const seq = advSeq(advSel);
  const live = (advProbe && advProbe.plan && advProbe.plan[String(advSel)]) || { seq: [], budget: {}, ultOk: [] };
  const budget = live.budget || {};     // {포지션: 그 턴에 쓸 수 있는 행동 횟수} — 엔진이 계산
  const ultOk = new Set(live.ultOk || []);   // 그 턴 시작 시 필살 쿨이 찬 포지션
  const execMask = live.exec || null;        // 항목별 실행 여부(명시 타임라인일 때만)
  const cdOkMask = live.cdOk || null;        // 항목별 '그 시점' 필살 가능 — 같은 턴 안의
                                             // 방어(히토하·모이루)·임부언 CD-3까지 반영된다
  const want = {};
  seq.forEach(e => { want[e.p] = (want[e.p] || 0) + 1; });
  // '턴당 궁 1회'로 막지 않는다 — 임부언 필살은 1번 자리 동료의 필살 CD를 초기화하므로
  // 그 캐리는 한 턴에 두 번 궁을 쏘는 게 정상이다. 판정은 턴 시작 쿨(ultOk)만 보고,
  // 실제로 쿨이 안 찼으면 엔진이 평타로 내린 결과를 아래에서 그대로 표시한다.

  $('.adv-turnhead b', card).textContent = `${advSel}턴`;
  $('.adv-turnhead .cnt', card).textContent = `${seq.length}행동${advTouched.has(advSel) ? '' : ' · 기본값'}`;
  $('#advResetTurn', card).disabled = !advTouched.has(advSel);

  const seen = {};
  $('.adv-track', card).innerHTML = seq.length
    ? seq.map((e, k) => {
      const cid = (aTeam()[e.p - 1] || {}).id;
      const c = CHARS[cid] || {};
      seen[e.p] = (seen[e.p] || 0) + 1;
      // '추가' = 동료가 만들어 준 행동. 이태호처럼 원래 턴당 2회인 캐릭은 2번째까지가 자기 몫이다.
      const granted = seen[e.p] > (c.actionsPerTurn || 1);
      // 실행 여부는 엔진이 항목별로 알려준다 — 추가 행동을 부여 이전에 두면 그 시점엔
      // 예산이 없어 건너뛰는데, 예산 '총량'만 보면 이걸 놓친다.
      const done = execMask ? execMask[k] : e.a;      // 실제로 나간 행동 (null = 실행 안 됨)
      const over = execMask ? done == null : seen[e.p] > (budget[e.p] || 0);
      const downgraded = !over && done && done !== e.a;
      // 이 칸에서 궁을 고를 수 있는가: 쿨이 찼고, 같은 턴 앞에서 이미 쓰지 않았을 것
      // 궁 가능 판정은 항목별 실시간 쿨을 쓴다. 턴 시작 스냅샷만 보면 '방어로 쿨을 당겨
      // 같은 턴에 궁' 같은 수(모이루+욱영 조합에서 딜 +32%)를 UI가 원천 봉쇄해 버린다.
      const canUlt = (cdOkMask ? cdOkMask[k] : ultOk.has(e.p)) || e.a === '궁';

      return `<div class="adv-step ${granted ? 'granted' : ''}" data-k="${k}" draggable="true">
  <div class="sn"><i>${k + 1}</i></div>
  <div class="adv-row" style="--el:var(--${c.elementKey || 'none'})">
    <img class="pic" src="${icon(cid)}" alt="" draggable="false">
    <span class="nm">${c.name || '?'}</span>
    ${granted ? '<span class="gtag">추가</span>' : ''}
    ${over ? '<span class="gtag bad">실행 안 됨</span>' : ''}
    ${downgraded ? `<span class="gtag bad">${done}(으)로 나감</span>` : ''}
    <span class="acts">${ADV_ACTS.map(a => {
        // 쓸 수 있는 자리를 금색으로 강조했더니 대부분의 평타 칸이 켜져 상시 노랗고 오히려 헷갈렸다.
        // 버튼이 '눌리는 상태'라는 것 자체가 이미 신호이므로 별도 강조는 두지 않는다.
        const off = a === '궁' && !canUlt;
        return `<button type="button" data-a="${a}" data-k="${k}" class="${e.a === a ? 'on' : ''}"${
          off ? ' disabled title="이 시점엔 필살기를 쓸 수 없어요 — 쿨타임"' : ''}>${a}</button>`;
      }).join('')}</span>
    <span class="mv">
      <button type="button" data-mv="-1" data-k="${k}" ${k === 0 ? 'disabled' : ''} aria-label="위로">▲</button>
      <button type="button" data-mv="1" data-k="${k}" ${k === seq.length - 1 ? 'disabled' : ''} aria-label="아래로">▼</button>
    </span>
    <button type="button" class="del" data-del="${k}" aria-label="이 행동 삭제">✕</button>
  </div></div>`;
    }).join('')
    : '<div class="adv-empty">이 턴엔 행동이 없어요 — 아래에서 추가하세요</div>';

  $('.adv-add', card).innerHTML = '<span>행동 추가</span>' +
    aTeam().map((s, i) => {
      if (!s) return '';
      const pos = i + 1, c = CHARS[s.id] || {};
      const left = (budget[pos] || 0) - (want[pos] || 0);   // 남은 행동 횟수 (엔진 판정)
      return `<button type="button" data-add="${pos}"${left > 0 ? '' :
        ' disabled title="이 턴엔 더 행동할 수 없어요 — 추가 행동은 임부언·욱영의 필살기가 만들어 줍니다"'}>
        <img src="${icon(s.id)}" alt="">${c.name || s.id}</button>`;
    }).join('');

  const over = execMask
    ? [...new Set(seq.filter((e, i) => execMask[i] == null).map(e => e.p))]
    : Object.keys(want).filter(p => want[p] > (budget[p] || 0));
  const warn = $('.adv-warn', card);
  warn.hidden = !over.length;
  if (over.length) {
    const who = over.map(p => (CHARS[(aTeam()[p - 1] || {}).id] || {}).name).join(' · ');
    warn.innerHTML = `<b>${who}</b> — 표시된 행동은 실행되지 않아요. 추가 행동은 <b>임부언·욱영의 필살기</b>가
      만들어 주고 <b>이미 행동을 마친</b> 동료에게만 들어가므로, 그 필살기보다 뒤에 있어야 합니다.`;
  }
}

// ── 궁극기 사용 방식 탭: 캐릭터별 fixed/strict/asap + 방어 턴 유지. 연동 멤버는 앵커를 따르므로 방식 대신 안내만.
function ultRowHTML(s, pos) {
  const c = CHARS[s.id] || {}, u = ultOf(s), grp = syncGroupOf(pos), roster = aTeam();
  let body;
  if (grp && grp.role === 'member') {
    body = `<div class="ult-sync">${esc(advT('ultMember', grp.idx + 1, altarSlotName(grp.g.anchor, roster)))}</div>
      <label class="toggle ult-keep"><input type="checkbox" data-ultkeep="${pos}" ${u.keepDef ? 'checked' : ''}><span class="sw"></span>${esc(altarT('ultKeepDef'))}</label>`;
  } else {
    body = `<div class="seg ult-modes">${ULT_MODES.map(m => `<button type="button" data-ultmode="${m}" data-pos="${pos}" class="${u.mode === m ? 'on' : ''}" title="${esc(altarT('ult_' + m + 'Tip'))}">${esc(altarT('ult_' + m))}</button>`).join('')}</div>
      <div class="ult-desc">${esc(altarT('ult_' + u.mode + 'Tip'))}</div>
      <label class="toggle ult-keep${u.mode === 'asap' ? '' : ' dim'}"><input type="checkbox" data-ultkeep="${pos}" ${u.keepDef ? 'checked' : ''}><span class="sw"></span>${esc(altarT('ultKeepDef'))}</label>
      ${grp && grp.role === 'anchor' ? `<div class="ult-sync">${esc(altarT('ultAnchorInfo', grp.idx + 1))}</div>` : ''}`;
  }
  return `<div class="au-row" style="--el:var(--${c.elementKey || 'none'})">
    <div class="au-head"><img class="pic" src="${icon(s.id)}" alt=""><b>${esc(altarSlotName(pos, roster))}</b></div>${body}</div>`;
}
function renderAdvUlt(card) {
  const pane = $('.adv-pane-ult', card); if (!pane) return;
  const roster = aTeam();
  let html = `<div class="adv-hint">${esc(advT('ultHint'))}</div>`;
  if (advOn) html += `<div class="adv-note lock">${esc(advT('timeOn'))}</div>`;
  if (altarProcCdActive().length) html += `<div class="adv-note warn"><span>${esc(advT('cdProcWarn'))}</span>
    <button type="button" class="btn-ghost sm" data-ultall="asap">${esc(advT('cdProcAll'))}</button></div>`;
  html += roster.map((s, i) => (s ? ultRowHTML(s, i + 1) : '')).join('');
  pane.innerHTML = html;
}

// ── 연동 탭: 앵커 궁 턴에 멤버가 무엇을 하는지(같이 궁 / 방어·평타 후 받은 추가 행동에서 궁) + 순서·미준비 규칙.
function syncFlowHTML(g, name) {          // 그룹이 만드는 실제 흐름을 한 줄 문장으로 — 사용자가 결과를 바로 읽게
  const before = g.members.filter(m => !m.base && m.order !== 'after');
  const after = g.members.filter(m => !m.base && m.order === 'after');
  const defer = g.members.filter(m => m.base);
  const steps = [
    ...before.map(m => `${esc(name(m.p))} ${esc(advT('stepUlt'))}`),
    ...defer.map(m => `${esc(name(m.p))} ${esc(advT(m.base === 'defend' ? 'stepDef' : 'stepBasic'))}`),
    `<b>${esc(name(g.anchor))} ${esc(advT('stepUlt'))}</b>`,
    ...after.map(m => `${esc(name(m.p))} ${esc(advT('stepUlt'))}`),
    ...defer.map(m => `${esc(name(m.p))} ${esc(advT('stepBonus'))}`),
  ];
  return `<div class="sg-flow"><span>${esc(advT('flow', name(g.anchor)))}</span> ${steps.join(' → ')}</div>`;
}
function renderAdvSync(card) {
  const pane = $('.adv-pane-sync', card); if (!pane) return;
  const roster = aTeam();
  const name = p => altarSlotName(p, roster);
  const gs = normalizeSyncGroups(syncGroups);
  // 설정된 그룹 다음에 빈 그룹 1개만 보인다 — 그룹1을 정하면 그룹2가, 그룹2를 정하면 그룹3이 나타난다
  if (gs.length < SYNC_MAX_GROUPS) gs.push({ anchor: 0, members: [], miss: 'wait' });
  const usedBy = {};
  gs.forEach((g, i) => { if (g.anchor) usedBy[g.anchor] = i; g.members.forEach(m => { usedBy[m.p] = i; }); });
  const cards = gs.map((g, i) => {
    const opts = [`<option value="0">${esc(altarT('syncNone'))}</option>`]
      .concat([1, 2, 3, 4, 5].map(p => {
        const taken = usedBy[p] != null && usedBy[p] !== i, empty = !roster[p - 1];
        return `<option value="${p}"${g.anchor === p ? ' selected' : ''}${(taken || empty) ? ' disabled' : ''}>${esc(name(p))}${empty ? ` (${esc(altarT('syncEmpty'))})` : ''}</option>`;
      })).join('');
    const chips = [1, 2, 3, 4, 5].filter(p => p !== g.anchor).map(p => {
      const on = g.members.some(x => x.p === p);
      const taken = usedBy[p] != null && usedBy[p] !== i, empty = !roster[p - 1];
      return `<button type="button" class="as-m${on ? ' on' : ''}" data-g="${i}" data-p="${p}"${(taken || empty || !g.anchor) ? ' disabled' : ''} title="${esc(name(p))}">${esc(name(p))}</button>`;
    }).join('');
    const anchorMeta = g.anchor && roster[g.anchor - 1] ? (CHARS[roster[g.anchor - 1].id] || {}) : null;
    const rows = g.members.map(m => {
      const base = m.base || 'fatal', slot = roster[m.p - 1];
      const baseSeg = SYNC_BASES.map(b => `<button type="button" data-g="${i}" data-p="${m.p}" data-sbase="${b}" class="${base === b ? 'on' : ''}">${esc(advT(b === 'fatal' ? 'actUlt' : b === 'defend' ? 'actDef' : 'actBasic'))}</button>`).join('');
      const order = base === 'fatal'
        ? `<span class="seg sm-ord"><button type="button" data-g="${i}" data-p="${m.p}" data-sord="before" class="${m.order !== 'after' ? 'on' : ''}">${esc(altarT('syncBefore'))}</button><button type="button" data-g="${i}" data-p="${m.p}" data-sord="after" class="${m.order === 'after' ? 'on' : ''}">${esc(altarT('syncAfter'))}</button></span>`
        : `<span class="sm-fixed">${esc(advT('orderFixed'))}</span>`;
      const noGrant = (base !== 'fatal' && anchorMeta && !anchorMeta.grantsExtra) ? `<div class="sm-note">${esc(advT('noGrant', name(g.anchor)))}</div>` : '';
      return `<div class="sm-row"><div class="sm-name">${slot ? `<img class="pic" src="${icon(slot.id)}" alt="">` : ''}<b>${esc(name(m.p))}</b></div>
        <div class="sm-opt"><span class="as-lbl">${esc(advT('memberAct'))}</span><span class="seg sm-base">${baseSeg}</span></div>
        <div class="sm-opt"><span class="as-lbl">${esc(advT('orderLbl'))}</span>${order}</div>${noGrant}</div>`;
    }).join('');
    const miss = g.members.length ? `<div class="as-row as-missrow"><span class="as-lbl">${esc(altarT('syncMiss'))}</span>
        <span class="seg as-miss"><button type="button" data-g="${i}" data-miss="wait" class="${g.miss !== 'asap' ? 'on' : ''}">${esc(altarT('syncMissWait'))}</button><button type="button" data-g="${i}" data-miss="asap" class="${g.miss === 'asap' ? 'on' : ''}">${esc(altarT('syncMissAsap'))}</button></span></div>` : '';
    return `<div class="as-group${g.anchor ? ' on' : ''}" data-g="${i}">
      <div class="as-row"><span class="as-lbl">${esc(altarT('syncGroup', i + 1))}</span>
        <select class="as-anchor" data-anchor="${i}" aria-label="${esc(altarT('syncAnchor'))}">${opts}</select></div>
      <div class="as-row"><span class="as-lbl">${esc(advT('members'))}</span><div class="as-members">${chips}</div></div>
      ${rows}${miss}${g.anchor && g.members.length ? syncFlowHTML(g, name) : ''}
    </div>`;
  }).join('');
  const ukPos = roster.findIndex(x => x && x.id === UK_ID) + 1;
  const ukName = ukPos ? name(ukPos) : '';
  const preset = ukPos ? `<div class="sg-preset"><button type="button" class="btn-ghost sm" data-spreset="uk">${esc(advT('presetUk', ukName))}</button><span>${esc(advT('presetUkDesc', ukName))}</span></div>` : '';
  pane.innerHTML = `<div class="adv-hint">${esc(advT('syncHint'))}</div>${advOn ? `<div class="adv-note lock">${esc(advT('timeOn'))}</div>` : ''}${preset}${cards}`;
}
// 프리셋: 욱영(인접 아군 행동 회복)을 앵커로, 인접 아군을 '평타 → 받은 추가 행동에서 궁' 멤버로. 인접 = 채워진 자리만의
// 원형 링(엔진 _adjacent_allies 와 같은 규칙 — 양 끝이 이어지고 빈 자리는 압축).
function applySyncPreset(kind) {
  if (kind !== 'uk') return;
  const roster = aTeam();
  const ukPos = roster.findIndex(x => x && x.id === UK_ID) + 1; if (!ukPos) return;
  const ring = roster.map((x, i) => (x ? i + 1 : 0)).filter(Boolean);
  const k = ring.indexOf(ukPos), n = ring.length;
  const adj = n <= 1 ? [] : [...new Set([ring[(k - 1 + n) % n], ring[(k + 1) % n]])].filter(p => p !== ukPos);
  const gs = normalizeSyncGroups(syncGroups);
  let i = gs.findIndex(g => g.anchor === ukPos);
  if (i < 0) {
    i = gs.findIndex(g => !g.anchor);
    if (i < 0 && gs.length < SYNC_MAX_GROUPS) { gs.push({ anchor: 0, members: [], miss: 'wait' }); i = gs.length - 1; }
  }
  if (i < 0) return toast(advT('presetFull'));
  gs.forEach((g, j) => {                    // 한 캐릭터는 한 그룹에만 — 다른 그룹에서 욱영·인접 아군을 빼 온다
    if (j === i) return;
    if (adj.includes(g.anchor) || g.anchor === ukPos) g.anchor = 0;
    g.members = g.members.filter(m => m.p !== ukPos && !adj.includes(m.p));
  });
  gs[i] = { anchor: ukPos, members: adj.map(p => ({ p, order: 'before', base: 'basic' })), miss: gs[i].miss || 'wait' };
  syncGroups = normalizeSyncGroups(gs);
  saveSyncState();
  toast(advT('presetDone'));
  if (advScope) markCmpDirty();
  advRerender();
}
// 타임라인이 켜져 있으면 특정 턴 순서·캐릭터별 턴 계획은 조용히 무시된다 — 그 사실을 화면에 적는다(충돌 경고).
function renderAdvConflict(card) {
  const el = $('.adv-conflict', card); if (!el) return;
  const roster = aTeam();
  const ov = advScope ? (cmpTurnOv[advScope] || {}) : turnOverrides;
  const ovTurns = Object.keys(ov).map(Number).filter(t => Array.isArray(ov[t]) && ov[t].length && t <= advTurns()).sort((a, b) => a - b);
  const plans = roster.map((x, i) => (x && x.usePlan ? altarSlotName(i + 1, roster) : '')).filter(Boolean);
  const parts = [];
  if (ovTurns.length) parts.push(advT('conflictOv', ovTurns.join('·')));
  if (plans.length) parts.push(advT('conflictPlan', plans.join(', ')));
  el.hidden = !(advOn && parts.length);
  if (!el.hidden) el.textContent = advT('conflict', parts.join(' · '));
}

// 비교군용으로 고급 설정을 연다. 편집기 전체가 전역 상태(turnPlans 등)를 쓰므로,
// 메인 것을 잠시 치워두고 그 비교군의 타임라인으로 갈아끼운 뒤 닫을 때 되돌린다.
function openAdvFor(scope) {
  if (advCloseFn) advCloseFn();        // 열려 있으면 먼저 정리 (advSaved 덮어쓰기 방지)
  advSaved = { on: advOn, plans: turnPlans, touched: advTouched, prev: advPrevBudget,
               sig: advTeamSig, sel: advSel, selSet: advSelSet, undo: advUndo,
               clip: advClip, grid: advGrid, cell: advCell, probe: advProbe };
  advScope = scope;
  advOn = !!cmpAdvOn[scope];
  turnPlans = cmpAdv[scope] ? JSON.parse(JSON.stringify(cmpAdv[scope])) : {};
  advTouched = new Set(Object.keys(turnPlans).map(Number));
  advPrevBudget = {}; advSel = 1; advSelSet = null; advUndo = []; advClip = null;
  advCell = null; advGrid = false;
  advTeamSig = advOn ? advTeamFingerprint() : '';
  openAdvPop();
}
function advLeaveScope() {
  if (!advScope) return;
  const back = advScope;                       // 돌아갈 비교군 (아래에서 초기화되므로 먼저 잡는다)
  // 타임라인은 껐어도 보관한다(메인과 같은 규칙 — 껐다 켜도 작업물이 남는다).
  // 실제 적용 여부만 스위치를 따른다.
  const nextPlans = Object.keys(turnPlans).length ? JSON.parse(JSON.stringify(turnPlans)) : null;
  const nextOn = !!(advOn && nextPlans);
  const changed = nextOn !== cmpAdvOn[advScope]
    || JSON.stringify(nextPlans) !== JSON.stringify(cmpAdv[advScope]);
  cmpAdv[advScope] = nextPlans;
  cmpAdvOn[advScope] = nextOn;
  if (changed) markCmpDirty();       // 아무것도 안 바꿨으면 비교 결과를 무효화하지 않는다
  const v = advSaved;
  advOn = v.on; turnPlans = v.plans; advTouched = v.touched; advPrevBudget = v.prev;
  advTeamSig = v.sig; advSel = v.sel; advSelSet = v.selSet; advUndo = v.undo;
  advClip = v.clip; advGrid = v.grid; advCell = v.cell; advProbe = v.probe;
  advScope = null; advSaved = null;
  // 비교군 고급 설정은 우선순위 팝업에서만 들어온다 → 닫으면 왔던 자리로 되돌린다.
  // (잠금 표시와 버튼 상태가 바뀌므로 다시 그려야 한다)
  openPrioPop(back);
}

function openAdvPop() {
  // 닫지 않고 다시 열면 이전 키보드 리스너가 남고(턴이 두 칸씩 이동) advSaved가 덮여
  // 메인 타임라인이 통째로 날아간다. 반드시 기존 편집기를 정상 경로로 먼저 닫는다.
  if (advCloseFn) advCloseFn();
  document.querySelector('.advpop')?.remove();
  advGen++;
  const pop = document.createElement('div');
  pop.className = 'advpop';
  pop.innerHTML = `<div class="adv-card" role="dialog" aria-modal="true" aria-label="행동 고급 설정">
  <div class="adv-head">
    <h3>행동 고급 설정${advScope ? ` <em class="adv-scope">비교군 ${advScope.toUpperCase()}</em>` : ''}<span class="adv-sub">턴마다 누가 · 어떤 순서로 · 무엇을 할지 직접 정합니다</span></h3>
    <label class="toggle" id="advSwitchWrap"><input type="checkbox" id="advSwitch" ${advOn ? 'checked' : ''}><span class="sw"></span>사용</label>
    <button type="button" class="adv-x" data-advclose aria-label="닫기">✕</button>
  </div>
  <div class="adv-tabs i18n-skip" role="tablist">
    <button type="button" role="tab" data-advtab="time">${esc(advT('tabTime'))}</button>
    <button type="button" role="tab" data-advtab="ult">${esc(altarT('ultTitle'))}</button>
    <button type="button" role="tab" data-advtab="sync">${esc(advT('tabSync'))}</button>
  </div>
  <div class="adv-body adv-pane adv-pane-time ${advOn ? '' : 'off'}">
    <div class="adv-hint">켜면 행동 우선순위 · 특정 턴만 다르게 · 캐릭터별 턴별 행동 계획이 모두 이 화면으로 대체됩니다. 같은 캐릭터가 한 턴에 여러 번 행동할 수 있고, ‘추가’ 표시는 앞선 필살기가 만들어 준 행동입니다.</div>
    <div class="adv-note warn adv-conflict i18n-skip" hidden></div>
    <div class="adv-tools">
      <button type="button" class="btn-ghost sm" id="advCopy">복사</button>
      <button type="button" class="btn-ghost sm" id="advPaste">붙여넣기</button>
      <button type="button" class="btn-ghost sm" id="advPasteAll" title="클립보드를 그대로 넣을 수 있는 턴을 찾아 선택합니다 — 적용은 붙여넣기">호환 턴 전부 체크</button>
      <span class="adv-sep"></span>
      <button type="button" class="btn-ghost sm" id="advUndoBtn">되돌리기</button>
      <button type="button" class="btn-ghost sm" id="advGridBtn">전체 보기</button>
    </div>
    <div class="adv-clip" hidden></div>
    <div class="adv-teamwarn" hidden></div>
    <div class="adv-rail"></div>
    <div class="adv-railwarn" hidden></div>
    <div class="adv-selbar" hidden></div>
    <div class="adv-gridwrap" hidden></div>
    <div class="adv-turnhead"><b></b><span class="cnt"></span>
      <button type="button" class="btn-ghost sm" id="advResetTurn">이 턴 기본값으로</button></div>
    <div class="adv-track"></div>
    <div class="adv-add"></div>
    <div class="adv-warn" hidden></div>
    <div class="adv-foot">
      <button type="button" class="btn-ghost sm" id="advResetSel">선택 턴 기본값으로</button>
      <button type="button" class="btn-ghost sm" id="advResetAll">전체 턴 기본값으로</button>
      <button type="button" class="btn-ghost sm" id="advImport"
        title="캐릭터별 턴 계획 · 행동 우선순위 · 특정 턴 순서로 돌린 결과를 타임라인으로 가져옵니다">기존 설정 불러오기</button>
    </div>
  </div>
  <div class="adv-body adv-pane adv-pane-ult i18n-skip" hidden></div>
  <div class="adv-body adv-pane adv-pane-sync i18n-skip" hidden></div></div>`;
  document.body.appendChild(pop);
  // aria-modal을 선언만 하고 지키지 않으면 Tab으로 뒤 컨트롤에 닿는다. 기록 드롭다운에서
  // 다른 기록을 복원하면 편집 중인 상태가 통째로 뒤집히므로 배경을 실제로 비활성화한다.
  // inert를 쓰는 곳은 이 편집기뿐 — 위에서 팝업을 비정상 경로로 제거했다면 잔류분이 남아
  // 화면이 영구히 굳으므로 여기서 먼저 턴다.
  document.querySelectorAll('body > [inert]').forEach(el => el.removeAttribute('inert'));
  const bgInert = [...document.body.children].filter(el => el !== pop);
  bgInert.forEach(el => el.setAttribute('inert', ''));
  const card = $('.adv-card', pop);

  $('#advSwitch', card).onchange = e => {
    // 끈다고 지정 내용을 버리지 않는다 — 껐다 켤 때마다 초기화되면 작업물이 날아간다.
    // 끄면 엔진에 turnPlans를 안 보내므로(advCfg/run) 기존 설정 그대로 돌아간다.
    // 처음 켤 때만 advMaterialize가 '기본 세팅'으로 채운다. 다시 기본값에서 시작하려면
    // '전체 턴 기본값으로'를 누르면 된다.
    advOn = e.target.checked;
    syncAdvLock();
    advRefresh();
  };
  card.addEventListener('click', e => {
    // 격자 칸 클릭 = 그 캐릭터의 그 턴 행동 편집기 (버튼이 아니라 <u>라 먼저 처리)
    const cellEl = e.target.closest('.adv-grid .g-row u');
    if (cellEl) {
      const pos = +cellEl.dataset.gp, turn = +cellEl.dataset.gt;
      if (advCell && advCell.pos === pos && advCell.turn === turn) advCell = null;   // 같은 칸 = 닫기
      else {
        const r = cellEl.getBoundingClientRect();
        // 화면 밖으로 나가지 않게 좌우/상하 보정
        advCell = { pos, turn,
          x: Math.min(Math.max(8, r.left - 60), window.innerWidth - 232),
          y: Math.min(r.bottom + 6, window.innerHeight - 240) };
        advSel = turn;
      }
      return renderAdv();
    }
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    // ── 탭 · 궁극기 사용 방식 탭 (연동 탭의 버튼은 전역 상태라 body 핸들러(initAltar)가 받는다)
    if (b.dataset.advtab) { advTab = b.dataset.advtab; return renderAdv(); }
    if (b.dataset.ultmode && b.dataset.pos) {
      const s = aTeam()[+b.dataset.pos - 1]; if (!s) return;
      setUlt(s, { ...ultOf(s), mode: b.dataset.ultmode });
      if (advScope) markCmpDirty();
      return advRefresh();
    }
    if (b.dataset.ultall) {                // 확률 CD 감소 제단 안내의 원클릭 전환 — 연동 멤버는 앵커를 따르므로 제외
      aTeam().forEach((s, i) => {
        if (!s) return;
        const g = syncGroupOf(i + 1); if (g && g.role === 'member') return;
        setUlt(s, { ...ultOf(s), mode: 'asap' });
      });
      toast(advT('cdProcDone'));
      if (advScope) markCmpDirty();
      return advRefresh();
    }
    if (b.classList.contains('as-m') || b.dataset.sord !== undefined || b.dataset.sbase !== undefined
        || b.dataset.miss !== undefined || b.dataset.spreset !== undefined) return;
    // ── 칸 편집기 조작 (그 캐릭터의 항목만 바꾸고 나머지 순서는 그대로 둔다)
    if (b.dataset.cpclose !== undefined) { advCell = null; return renderAdv(); }
    if (advCell && (b.dataset.cpa !== undefined || b.dataset.cpdel !== undefined || b.dataset.cpadd !== undefined)) {
      const t = advCell.turn, seq = advSeq(t).map(x => ({ ...x }));
      if (b.dataset.cpa !== undefined) seq[+b.dataset.cpk].a = b.dataset.cpa;
      else if (b.dataset.cpdel !== undefined) seq.splice(+b.dataset.cpdel, 1);
      else seq.push({ p: advCell.pos, a: '평' });
      return advCommit(t, seq);
    }
    if (b.dataset.advt !== undefined) {
      const t = +b.dataset.advt;
      if (e.shiftKey) {                                    // shift = 현재 턴부터 여기까지 구간 선택
        const [a, b2] = [advSel, t].sort((x, y) => x - y);
        advSelSet = advSelSet || new Set();
        for (let k = a; k <= b2; k++) advSelSet.add(k);
      } else if (e.ctrlKey || e.metaKey) {                 // ctrl = 이 턴만 선택에 넣고 빼기
        advSelSet = advSelSet || new Set();
        advSelSet.has(t) ? advSelSet.delete(t) : advSelSet.add(t);
        advSel = t;
      } else { advSelSet = null; advSel = t; }
      return renderAdv();
    }
    if (b.id === 'advCopy') return advCopyTurn(advSel);
    if (b.id === 'advClipClear') { advClip = null; return renderAdv(); }
    if (b.id === 'advPaste') return advPasteInto(advRangeTurns());
    if (b.id === 'advPasteAll') return advCheckCompatible();
    if (b.id === 'advUndoBtn') return advDoUndo();
    if (b.id === 'advGridBtn') { advGrid = !advGrid; return renderAdv(); }
    if (b.id === 'advResetSel') return advResetTurns(advRangeTurns(), '선택 턴 기본값으로');
    if (b.id === 'advSelClear') { advSelSet = null; return renderAdv(); }
    if (b.id === 'advSigKeep') { advTeamSig = advTeamFingerprint(); return renderAdv(); }
    if (b.id === 'advSigReset') { advTeamSig = advTeamFingerprint();
      return advResetTurns(Array.from({ length: advTurns() }, (_, i) => i + 1), '편성 변경 후 기본값으로'); }
    if (b.id === 'advImport') return advImportLegacy();
    if (b.id === 'advResetAll') return advResetTurns(
      Array.from({ length: advTurns() }, (_, i) => i + 1), '전부 기본값으로');
    if (b.id === 'advResetTurn') return advResetTurns([advSel], `${advSel}턴 기본값으로`);
    const seq = advSeq(advSel).map(x => ({ ...x }));
    if (b.dataset.a !== undefined) { seq[+b.dataset.k].a = b.dataset.a; return advCommit(advSel, seq); }
    if (b.dataset.mv !== undefined) {
      const k = +b.dataset.k, to = k + (+b.dataset.mv);
      if (to < 0 || to >= seq.length) return;
      [seq[k], seq[to]] = [seq[to], seq[k]];
      return advReorder(advSel, seq, to);
    }
    if (b.dataset.del !== undefined) { seq.splice(+b.dataset.del, 1); return advCommit(advSel, seq); }
    if (b.dataset.add !== undefined) { seq.push({ p: +b.dataset.add, a: '평' }); return advCommit(advSel, seq); }
  });

  card.addEventListener('change', e => {   // 궁극기 사용 방식 탭: 방어 턴 유지 토글
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.dataset.ultkeep) return;
    const s = aTeam()[+t.dataset.ultkeep - 1]; if (!s) return;
    setUlt(s, { ...ultOf(s), keepDef: t.checked });
    if (advScope) markCmpDirty();
    advRefresh();
  });

  // 드래그 재배치 — 터치에선 HTML5 DnD가 안 되므로 ▲▼ 버튼이 항상 함께 제공된다.
  let dragK = null;
  card.addEventListener('dragstart', e => {
    const st = e.target.closest('.adv-step'); if (!st) return;
    dragK = +st.dataset.k; st.classList.add('dragging');
  });
  card.addEventListener('dragend', e => {
    e.target.closest('.adv-step')?.classList.remove('dragging');
    card.querySelectorAll('.adv-step.over').forEach(x => x.classList.remove('over'));
    dragK = null;
  });
  card.addEventListener('dragover', e => {
    const st = e.target.closest('.adv-step'); if (!st || dragK === null) return;
    e.preventDefault();
    card.querySelectorAll('.adv-step').forEach(x => x.classList.toggle('over', x === st));
  });
  card.addEventListener('drop', e => {
    const st = e.target.closest('.adv-step'); if (!st || dragK === null) return;
    e.preventDefault();
    const to = +st.dataset.k, seq = advSeq(advSel).map(x => ({ ...x }));
    const [m] = seq.splice(dragK, 1);
    seq.splice(to, 0, m);
    dragK = null;
    advReorder(advSel, seq, to);
  });

  const close = () => {
    if (advCloseFn === close) advCloseFn = null;
    advGen++;                        // 진행 중인 비동기 작업이 결과를 반영하지 못하게 한다
    // inert를 먼저 푼다 — advLeaveScope가 우선순위 팝업을 새로 띄우므로 그 전에 해제해야 한다
    bgInert.forEach(el => el.removeAttribute('inert'));
    advLeaveScope(); pop.remove(); document.removeEventListener('keydown', onKey, true);
  };
  advCloseFn = close;
  const onKey = ev => {
    if (ev.key === 'Tab') {          // inert 미지원 브라우저 대비 — 포커스를 카드 안에 가둔다
      // 숨겨진 컨트롤은 focus()가 조용히 실패해 포커스가 밖에 남는다 — 미리 걸러낸다
      const f = [...pop.querySelectorAll('button:not([disabled]), input:not([disabled]), select, [tabindex="0"]')]
        .filter(el => !el.closest('[hidden]'));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (!pop.contains(document.activeElement)) { ev.preventDefault(); first.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      else if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      return;
    }
    if (ev.key === 'Escape') {
      // 전역 Esc 핸들러가 뒤이어 비교 모달까지 닫아 화면이 어긋나므로 여기서 끊는다
      ev.stopPropagation(); ev.preventDefault();
      if (advCell) { advCell = null; return renderAdv(); }
      return close();
    }
    if (!advOn || advTab !== 'time') return;   // 단축키·화살표는 타임라인 탭에서만
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key.toLowerCase() === 'c') { ev.preventDefault(); return advCopyTurn(advSel); }
    if (mod && ev.key.toLowerCase() === 'v') { ev.preventDefault(); return advPasteInto(advRangeTurns()); }
    if (mod && ev.key.toLowerCase() === 'z') { ev.preventDefault(); return advDoUndo(); }
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      ev.preventDefault();
      const t = advSel + (ev.key === 'ArrowRight' ? 1 : -1);
      if (t < 1 || t > advTurns()) return;
      if (ev.shiftKey) { advSelSet = advSelSet || new Set([advSel]); advSelSet.add(t); }
      else advSelSet = null;
      advSel = t; return renderAdv();
    }
  };
  document.addEventListener('keydown', onKey, true);   // 캡처 단계 — 전역 핸들러보다 먼저
  pop.onclick = e => {
    if (e.target.dataset.advclose !== undefined || e.target === pop) return close();
    if (advCell && !e.target.closest('.adv-cellpop') && !e.target.closest('.adv-grid .g-row u')) {
      advCell = null; renderAdv();          // 칸 편집기는 바깥을 누르면 닫는다
    }
  };
  advRefresh();
}

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
$('#advOpen').onclick = () => openAdvPop();
syncAdvLock();
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
  const inc = $('#incoming'); const iupd = () => { $('#incomingVal').textContent = inc.value + '%'; inc.style.setProperty('--p', (inc.value / 99 * 100) + '%'); };
  if (inc) { inc.oninput = iupd; iupd(); inc.style.opacity = incomingOn ? '' : '.4'; }
  $$('.seg').forEach(seg => seg.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    seg.dataset.val = b.dataset.v; seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  });
  $('#forceProc').onclick = () => {
    if (altarOn) return;                                   // 제단 설정 중엔 활성화 불가(버튼도 disabled)
    forceProc = !forceProc; $('#forceProc').classList.toggle('on', forceProc); syncRunsField();
    toast(forceProc ? '확률 100% 모드 ON<br>· 모든 확률형 스킬 100% 강제' : '확률 100% 모드 OFF');
  };
  $('#hp10Btn').onclick = () => {
    hp10 = !hp10; $('#hp10Btn').classList.toggle('on', hp10);
    toast(hp10 ? '체력 10% 모드 ON<br>· 더미 체력 10% 고정 (카라트 등 저HP 게이트 발동)' : '체력 10% 모드 OFF');
  };
  const ib = $('#incomingBtn');
  if (ib) ib.onclick = () => {
    incomingOn = !incomingOn;
    ib.classList.toggle('on', incomingOn);
    ib.textContent = incomingOn ? '💥 켬' : '💥 끔';
    $('#incoming').style.opacity = incomingOn ? '' : '.4';
    toast(incomingOn ? `피격 데미지 모드 ON<br>· 더미가 아군 피격 시 최대HP ${$('#incoming').value}% 데미지 (배리어 먼저 흡수, HP 0이면 전투불능·이탈)` : '피격 데미지 모드 OFF');
  };
  $('#runBtn').onclick = () => run(true);
}
let forceProc = false;   // 확률 100% 모드
let hp10 = false;        // 체력 10% 모드 (더미 HP 고정)
let incomingOn = false;  // 피격 데미지 모드 (더미→아군 최대HP n% 데미지, 배리어 흡수)

// ══ 턴 피해 설정 ═══════════════════════════════════════════════════════════
// 길드전 보스처럼 매 턴 종료 시 아군 전체가 최대HP의 n% 피해를 받는 모드(무명 등 자기 HP 반응 캐릭 검증용).
// 고급을 켜면 턴마다 %를 따로 정한다(빈 칸 = 기본 %). 엔진 cfg.turnDamage = {on, pct, per:{턴:%}}.
// 패널은 길드 제단 설정과 같은 자리(사이드 3열/모바일 팝업)를 쓰는 '탭' — 한쪽을 열면 다른 쪽이 밀려나며 교체된다.
// 두 기능 자체는 동시에 켤 수 있다. 저장 = localStorage + 기록 스냅샷(turnDamage). 공유 코드 압축은 추후(전체 최적화 때).
let tdmgOn = false;
let tdmgOpened = false;
let tdmgCfg = { pct: 10, adv: false, per: {}, hits: 5 };   // hits: 피해 대상 아군 수(1~5, 5=전체)
const TDMG_KEY = 'woofia_tdmg';
const TDMG_T = {
  title:  { kr: '턴 피해 설정', en: 'Turn Damage Settings', zh: '回合傷害設定', zhs: '回合伤害设置', ja: 'ターンダメージ設定' },
  sub:    { kr: '매 턴 아군 전체가 피해를 받습니다', en: 'The whole team takes damage every turn', zh: '每回合全隊承受傷害', zhs: '每回合全队承受伤害', ja: '毎ターン味方全員がダメージを受けます' },
  use:    { kr: '사용', en: 'Use', zh: '使用', zhs: '使用', ja: '使用' },
  close:  { kr: '닫기', en: 'Close', zh: '關閉', zhs: '关闭', ja: '閉じる' },
  pct:    { kr: '매 턴 피해 (최대HP의 %)', en: 'Damage per turn (% of Max HP)', zh: '每回合傷害（最大生命的 %）', zhs: '每回合伤害（最大生命的 %）', ja: '毎ターンのダメージ（最大HPの%）' },
  targets: { kr: '피해 대상 (아군 수)', en: 'Targets (allies hit)', zh: '傷害對象（受擊人數）', zhs: '伤害对象（受击人数）', ja: 'ダメージ対象（人数）' },
  targetsSub: { kr: '전체보다 적으면 현재 HP%가 높은 아군부터 맞습니다 (동률은 랜덤)', en: 'Fewer than all: allies with the highest current HP% are hit first (ties random)', zh: '少於全體時，優先擊中當前HP%最高的隊員（同值隨機）', zhs: '少于全体时，优先击中当前HP%最高的队员（同值随机）', ja: '全体より少ない場合、現在HP%が高い味方から狙います（同値はランダム）' },
  targetAll: { kr: '전체', en: 'All', zh: '全體', zhs: '全体', ja: '全体' },
  adv:    { kr: '고급 · 턴별로 다르게', en: 'Advanced · per-turn values', zh: '進階 · 各回合分別設定', zhs: '高级 · 各回合分别设置', ja: '詳細 · ターンごとに設定' },
  advSub: { kr: '켜면 아래 칸에 턴마다 피해 %를 따로 정할 수 있어요 (비우면 위 값)', en: 'When on, set each turn’s % below (blank = the value above)', zh: '開啟後可在下方為每回合單獨設定傷害%（留空 = 上方數值）', zhs: '开启后可在下方为每回合单独设置伤害%（留空 = 上方数值）', ja: 'オンにすると下でターンごとの%を個別に設定できます（空欄 = 上の値）' },
  turn:   { kr: '{0}턴', en: 'T{0}', zh: '第{0}回合', zhs: '第{0}回合', ja: '{0}T' },
  reset:  { kr: '턴별 값 비우기', en: 'Clear per-turn values', zh: '清除各回合數值', zhs: '清除各回合数值', ja: 'ターン別の値を消去' },
  hint:   { kr: '적 페이즈가 끝날 때 아군 전체가 최대HP의 지정 %만큼 피해를 받습니다. 배리어가 먼저 흡수하고, 방어한 턴은 50%만 받으며, 받는 데미지 증감이 적용돼요. 반격은 발동하지 않고, HP가 0이 되면 전투불능이 되어 이탈합니다(일부 힐러의 부활로 복귀 가능).',
            en: 'At the end of each enemy phase the whole team takes the set % of Max HP as damage. Barriers absorb first, a defending turn takes 50%, and damage-taken modifiers apply. No counterattacks trigger, and at 0 HP an ally is incapacitated and leaves the battle (some healers can revive).',
            zh: '每次敵方回合結束時，全隊承受最大生命指定%的傷害。護盾先吸收，防禦回合只受50%，並套用受傷增減。不會觸發反擊；HP歸零時陣亡並退場（部分治療可復活）。',
            zhs: '每次敌方回合结束时，全队承受最大生命指定%的伤害。护盾先吸收，防御回合只受50%，并套用受伤增减。不会触发反击；HP归零时阵亡并退场（部分治疗可复活）。',
            ja: '敵フェーズ終了時に味方全員が最大HPの指定%のダメージを受けます。バリアが先に吸収し、防御したターンは50%のみ、被ダメージ増減も適用。反撃は発動せず、HP0で戦闘不能になり離脱します（一部ヒーラーが復活可能）。' },
  note:   { kr: '아군 피격 설정·길드 제단 설정과 함께 켤 수 있어요 (패널은 한 번에 하나만 보여요). 무명처럼 자기 HP에 반응하는 캐릭터를 시험할 때 쓰세요.',
            en: 'Can be combined with Incoming Damage and Guild Altar Settings (one panel shows at a time). Use it to test characters that react to their own HP, like Mumei.',
            zh: '可與受擊傷害、公會祭壇設定同時開啟（面板一次只顯示一個）。用來測試像無名這樣依自身生命變化的角色。',
            zhs: '可与受击伤害、公会祭坛设置同时开启（面板一次只显示一个）。用来测试像无名这样依自身生命变化的角色。',
            ja: '被弾ダメージ・ギルド祭壇設定と同時にオンにできます（パネルは一度に一つ）。無名のように自分のHPに反応するキャラの検証に。' },
  result: { kr: '턴 피해 {0}%', en: 'Turn dmg {0}%', zh: '回合傷害 {0}%', zhs: '回合伤害 {0}%', ja: 'ターンダメージ {0}%' },
  resultRange: { kr: '턴 피해 {0}~{1}%', en: 'Turn dmg {0}–{1}%', zh: '回合傷害 {0}~{1}%', zhs: '回合伤害 {0}~{1}%', ja: 'ターンダメージ {0}~{1}%' },
  toastOn:  { kr: '턴 피해 설정 ON', en: 'Turn Damage Settings ON', zh: '回合傷害設定 ON', zhs: '回合伤害设置 ON', ja: 'ターンダメージ設定 ON' },
  toastOnSub: { kr: '· 매 턴 아군 전체가 최대HP의 {0}% 피해', en: '· every turn the whole team takes {0}% of Max HP', zh: '· 每回合全隊承受最大生命 {0}% 傷害', zhs: '· 每回合全队承受最大生命 {0}% 伤害', ja: '· 毎ターン味方全員が最大HPの{0}%ダメージ' },
  toastOff: { kr: '턴 피해 설정 OFF', en: 'Turn Damage Settings OFF', zh: '回合傷害設定 OFF', zhs: '回合伤害设置 OFF', ja: 'ターンダメージ設定 OFF' },
};
function tdmgT(key, ...args) {
  const v = TDMG_T[key];
  let s = (v && (v[altarLang()] || v.kr)) || key;
  args.forEach((a, i) => { s = s.replace(`{${i}}`, a); });
  return s;
}
const tdmgClamp = v => Math.max(0, Math.min(99, Math.round(+v || 0)));
function tdmgTurns() { return Math.max(1, +($('#turns')?.value || 30)); }
function tdmgPerClean() {                    // 현재 턴 수 안의 유효한 턴별 값만 {턴: %}
  const n = tdmgTurns(), out = {};
  Object.entries(tdmgCfg.per || {}).forEach(([t, v]) => {
    const tt = +t;
    if (tt >= 1 && tt <= n && v !== '' && v != null && Number.isFinite(+v)) out[tt] = tdmgClamp(v);
  });
  return out;
}
function loadTdmgState() {
  try {
    const s = JSON.parse(localStorage.getItem(TDMG_KEY) || 'null');
    if (!s) return;
    tdmgOn = !!s.on;
    if (Number.isFinite(+s.pct) && +s.pct > 0) tdmgCfg.pct = Math.max(1, tdmgClamp(s.pct));
    tdmgCfg.adv = !!s.adv;
    tdmgCfg.per = (s.per && typeof s.per === 'object') ? s.per : {};
    if (Number.isFinite(+s.hits)) tdmgCfg.hits = Math.max(1, Math.min(5, +s.hits));
  } catch { /* 손상된 저장값은 기본값으로 */ }
}
function saveTdmgState() {
  try { localStorage.setItem(TDMG_KEY, JSON.stringify({ on: tdmgOn, pct: tdmgCfg.pct, adv: tdmgCfg.adv, per: tdmgCfg.per, hits: tdmgCfg.hits })); } catch { }
}
// 엔진 cfg.turnDamage / 기록 snapshot.turnDamage 계약: OFF면 null, ON이면 { on:true, pct, per?:{턴:%} }.
function tdmgPayload() {
  if (!tdmgOn) return null;
  const out = { on: true, pct: tdmgCfg.pct };
  if (tdmgCfg.adv) { const per = tdmgPerClean(); if (Object.keys(per).length) out.per = per; }
  const hits = Math.max(1, Math.min(5, +tdmgCfg.hits || 5));
  if (hits < 5) out.hits = hits;             // 5=전체(기본)는 생략 → 기록·공유코드 경량 유지
  return out;
}
function applyTdmgSnap(t) {                 // 기록 복원(null/없음 = OFF, 옛 기록도 OFF)
  tdmgOn = !!(t && t.on);
  if (t && t.on) {
    if (Number.isFinite(+t.pct) && +t.pct > 0) tdmgCfg.pct = Math.max(1, tdmgClamp(t.pct));
    const per = (t.per && typeof t.per === 'object') ? t.per : {};
    tdmgCfg.adv = Object.keys(per).length > 0;
    tdmgCfg.per = { ...per };
    tdmgCfg.hits = Number.isFinite(+t.hits) ? Math.max(1, Math.min(5, +t.hits)) : 5;   // 없으면 전체
  }
  saveTdmgState();
  renderTdmg();
  syncTdmgUI();
}
function syncTdmgUI() {
  const b = $('#tdmgOpen');
  if (b) {
    b.classList.toggle('on', tdmgOn);
    b.classList.toggle('open', tdmgOpened);
    b.setAttribute('aria-expanded', tdmgOpened ? 'true' : 'false');
  }
}
function tdmgHeadHTML() {
  return `<div class="adv-head altar-head">
    <h3>${esc(tdmgT('title'))}<span class="adv-sub">${esc(tdmgT('sub'))}</span></h3>
    <label class="toggle"><input type="checkbox" data-tdmgsw ${tdmgOn ? 'checked' : ''}><span class="sw"></span>${esc(tdmgT('use'))}</label>
    <button type="button" class="adv-x" data-tdmgclose aria-label="${esc(tdmgT('close'))}">✕</button>
  </div>`;
}
function tdmgBodyHTML() {
  const n = tdmgTurns(), per = tdmgPerClean();
  const cells = Array.from({ length: n }, (_, i) => {
    const t = i + 1, set = per[t] != null;
    return `<div class="tdmg-row ${set ? 'set' : ''}" style="--i:${i}"><label>${esc(tdmgT('turn', t))}</label>
      <input type="number" min="0" max="99" step="1" inputmode="numeric" data-tdturn="${t}" value="${set ? per[t] : ''}" placeholder="${tdmgCfg.pct}" ${tdmgCfg.adv ? '' : 'disabled'}></div>`;
  }).join('');
  const hits = Math.max(1, Math.min(5, +tdmgCfg.hits || 5));
  const hitBtns = [1, 2, 3, 4, 5].map(k =>
    `<button type="button" data-tdhits="${k}" class="${k === hits ? 'on' : ''}">${k === 5 ? esc(tdmgT('targetAll')) : k}</button>`).join('');
  return `<div class="altar-hint">${esc(tdmgT('hint'))}</div>
    <section class="tdmg-field">
      <div class="tf-head"><b>${esc(tdmgT('pct'))}</b></div>
      <div class="tdmg-pct"><input type="range" min="1" max="99" value="${tdmgCfg.pct}" data-tdpct><b data-tdpctval>${tdmgCfg.pct}%</b></div>
    </section>
    <section class="tdmg-field">
      <div class="tf-head"><b>${esc(tdmgT('targets'))}</b><em>${esc(tdmgT('targetsSub'))}</em></div>
      <div class="seg tdmg-hits">${hitBtns}</div>
    </section>
    <section class="tdmg-field tdmg-adv ${tdmgCfg.adv ? '' : 'off'}">
      <div class="tf-head"><b>${esc(tdmgT('adv'))}</b>
        <label class="toggle"><input type="checkbox" data-tdadv ${tdmgCfg.adv ? 'checked' : ''}><span class="sw"></span>${esc(tdmgT('use'))}</label>
        <em>${esc(tdmgT('advSub'))}</em></div>
      <div class="tdmg-grid">${cells}</div>
      <div class="tdmg-tools"><button type="button" class="btn-ghost sm" data-tdreset>${esc(tdmgT('reset'))}</button></div>
    </section>
    <div class="altar-note">${esc(tdmgT('note'))}</div>`;
}
function tdmgHost() {                      // 현재 열린 컨테이너(팝업 .altar-card / 사이드 .altar-inner)
  return document.querySelector('.tdmg-modal .altar-card') || document.querySelector('#tdmgSide .altar-inner');
}
function renderTdmg() {
  const host = tdmgOpened ? tdmgHost() : null;
  if (!host) return;
  host.innerHTML = tdmgHeadHTML() + `<div class="adv-body altar-body tdmg-body ${tdmgOn ? '' : 'off'}">${tdmgBodyHTML()}</div>`;
}
function tdmgEsc(e) { if (e.key === 'Escape') closeTdmg(); }
// 탭 교체: 나가는 패널을 swap 모드로 닫고(왼쪽으로 빠짐) 잠깐 뒤 들어오는 패널을 연다(오른쪽에서 들어옴).
function swapSide(closeFn, openFn) {
  closeFn(true);
  if (_reduceMotion()) openFn(); else setTimeout(openFn, 200);
}
function openTdmg() {
  if (tdmgOpened) return closeTdmg();
  if (altarOpened) return swapSide(closeAltar, openTdmg);   // 제단 탭이 열려 있으면 이 탭으로 교체
  tdmgOpened = true;
  if (altarIsMobile()) {
    document.querySelector('.tdmg-modal')?.remove();
    const pop = document.createElement('div');
    pop.className = 'advpop tdmg-modal i18n-skip';
    pop.innerHTML = `<div class="adv-card altar-card" role="dialog" aria-modal="true" aria-label="${esc(tdmgT('title'))}"></div>`;
    pop.addEventListener('click', e => { if (e.target === pop) closeTdmg(); });
    document.body.appendChild(pop);
  } else {
    const side = $('#tdmgSide'), wrap = document.querySelector('.wrap');
    if (side) {
      side.hidden = false;
      side.classList.remove('swap-out');
      side.innerHTML = '<div class="altar-inner"></div>';
      wrap?.classList.add('altar-open');
      requestAnimationFrame(() => requestAnimationFrame(() => { if (tdmgOpened) side.classList.add('in'); }));
    }
  }
  renderTdmg();
  syncTdmgUI();
  document.addEventListener('keydown', tdmgEsc);
}
function closeTdmg(swap) {
  if (!tdmgOpened) return;
  tdmgOpened = false;
  document.removeEventListener('keydown', tdmgEsc);
  document.querySelector('.tdmg-modal')?.remove();
  const side = $('#tdmgSide'), wrap = document.querySelector('.wrap');
  if (side && !side.hidden) {
    side.classList.remove('in');
    if (swap === true) side.classList.add('swap-out');
    const done = () => {
      if (!tdmgOpened) {
        side.hidden = true; side.innerHTML = ''; side.classList.remove('swap-out');
        if (!altarOpened) wrap?.classList.remove('altar-open');   // 다른 탭이 열려 있으면 열은 유지
      }
    };
    if (_reduceMotion()) done(); else setTimeout(done, swap === true ? 220 : 360);
  }
  syncTdmgUI();
}
function setTdmgOn(v) {
  tdmgOn = !!v;
  saveTdmgState();
  syncTdmgUI();
  $$('.tdmg-body').forEach(b => b.classList.toggle('off', !tdmgOn));
  toast(tdmgOn ? `${tdmgT('toastOn')}<br>${tdmgT('toastOnSub', tdmgCfg.pct)}` : tdmgT('toastOff'));
}
function initTdmg() {
  loadTdmgState();
  const btn = $('#tdmgOpen');
  if (btn) btn.onclick = () => openTdmg();
  syncTdmgUI();
  document.body.addEventListener('change', e => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.hasAttribute('data-tdmgsw')) return setTdmgOn(t.checked);
    if (t.hasAttribute('data-tdadv')) {
      tdmgCfg.adv = t.checked; saveTdmgState();
      const sec = t.closest('.tdmg-adv'); if (sec) sec.classList.toggle('off', !tdmgCfg.adv);
      $$('[data-tdturn]').forEach(i => { i.disabled = !tdmgCfg.adv; });
      return;
    }
    if (t.hasAttribute('data-tdpct')) { tdmgCfg.pct = Math.max(1, tdmgClamp(t.value)); saveTdmgState(); return; }
    if (t.dataset.tdturn) {
      const turn = +t.dataset.tdturn, v = String(t.value).trim();
      if (v === '') delete tdmgCfg.per[turn]; else { tdmgCfg.per[turn] = tdmgClamp(v); t.value = tdmgCfg.per[turn]; }
      t.closest('.tdmg-row')?.classList.toggle('set', v !== '');
      saveTdmgState();
    }
  });
  document.body.addEventListener('input', e => {       // 슬라이더는 드래그 중에도 값·자리표시자 갱신
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.hasAttribute('data-tdpct')) return;
    const p = Math.max(1, tdmgClamp(t.value));
    const lbl = document.querySelector('[data-tdpctval]'); if (lbl) lbl.textContent = p + '%';
    $$('[data-tdturn]').forEach(i => { i.placeholder = p; });
  });
  document.body.addEventListener('click', e => {
    if (e.target.closest('[data-tdmgclose]')) return closeTdmg();
    if (e.target.closest('[data-tdreset]')) { tdmgCfg.per = {}; saveTdmgState(); renderTdmg(); return; }
    const hb = e.target.closest('[data-tdhits]');
    if (hb) {
      tdmgCfg.hits = Math.max(1, Math.min(5, +hb.dataset.tdhits || 5));
      $$('[data-tdhits]', hb.parentElement).forEach(b => b.classList.toggle('on', b === hb));
      saveTdmgState();
    }
  });
  $('#turns')?.addEventListener('input', () => { if (tdmgOpened) renderTdmg(); });   // 턴 수가 바뀌면 칸 수도
  document.addEventListener('woofia:lang', () => { renderTdmg(); syncTdmgUI(); });
  const mq = window.matchMedia(ALTAR_MQ);
  const onMq = () => { if (tdmgOpened) { closeTdmg(); openTdmg(); } };
  if (mq.addEventListener) mq.addEventListener('change', onMq); else mq.addListener(onMq);
}

// ══ 길드 제단 설정 ═══════════════════════════════════════════════════════════
// 길드전 방탈출(맵 111/112/113)의 별·달 제단을 층별로 켜고 끈다. 데이터 = altars.json
// (mining results/altar_by_floor.json 검증본 — 게임 오브젝트 Id·EffectValue 포함).
// 본문은 i18n-skip — 패치 히스토리처럼 이 모듈이 woofia_lang 을 직접 읽어 5개 언어로 렌더한다.
// 켜면 확률 100% 모드는 활성화 불가(이미 켜져 있었으면 끈다).
// 전투 반영: altarPayload() 가 cfg.altar 로 실려 엔진(woofia_sim/altar.py)이 층 누적·별/달 부호로 푼다.
// 설정은 localStorage 와 기록(snapshot.altar)·공유 코드($ 형식 꼬리 필드)에 함께 실린다.
let altarOn = false;                       // 마스터 스위치
let altarCfg = { floors: { 1: { on: true, off: {} }, 2: { on: true, off: {} }, 3: { on: true, off: {} } } };
let altarData = null;                      // altars.json (false = 로드 실패)
let altarOpened = false;                   // 패널(사이드/팝업) 열림
let altarFpTitle0 = null;                  // 확률 100% 버튼의 원래 툴팁(잠금 해제 시 복원)
const ALTAR_KEY = 'woofia_altar';
const ALTAR_MQ = '(max-width:900px)';      // 이하 = 팝업, 초과 = 사이드 패널
const ALTAR_T = {
  title:      { kr: '길드 제단 설정', en: 'Guild Altar Settings', zh: '公會祭壇設定', zhs: '公会祭坛设置', ja: 'ギルド祭壇設定' },
  sub:        { kr: '길드전 방탈출 · 층별 제단 효과', en: 'Guild Escape Room · altar effects by floor', zh: '公會戰密室 · 各層祭壇效果', zhs: '公会战密室 · 各层祭坛效果', ja: 'ギルド脱出部屋 · 階層別の祭壇効果' },
  use:        { kr: '사용', en: 'Enable', zh: '使用', zhs: '使用', ja: '使用' },
  close:      { kr: '닫기', en: 'Close', zh: '關閉', zhs: '关闭', ja: '閉じる' },
  active:     { kr: '활성화', en: 'Active', zh: '啟用', zhs: '启用', ja: '有効' },
  floor:      { kr: '{0}층', en: 'Floor {0}', zh: '{0}層', zhs: '{0}层', ja: '{0}階' },
  energy:     { kr: '에너지', en: 'Energy', zh: '能量', zhs: '能量', ja: 'エネルギー' },
  count:      { kr: '별 {0} · 달 {1}', en: 'Star {0} · Moon {1}', zh: '星 {0} · 月 {1}', zhs: '星 {0} · 月 {1}', ja: '星 {0} · 月 {1}' },
  star:       { kr: '별 제단', en: 'Star Altar', zh: '星之祭壇', zhs: '星之祭坛', ja: '星の祭壇' },
  moon:       { kr: '달 제단', en: 'Moon Altar', zh: '月之祭壇', zhs: '月之祭坛', ja: '月の祭壇' },
  starSub:    { kr: '활성화시 제단 효과가 비활성화됩니다', en: 'Enabling turns the altar effect off',
                zh: '啟用時該祭壇效果將被停用', zhs: '启用时该祭坛效果将被停用', ja: '有効にすると祭壇効果が無効になります' },
  moonSub:    { kr: '활성화시 제단 효과가 활성화됩니다', en: 'Enabling turns the altar effect on',
                zh: '啟用時該祭壇效果將生效', zhs: '启用时该祭坛效果将生效', ja: '有効にすると祭壇効果が有効になります' },
  hint:       { kr: '제단을 눌러 활성화 여부를 바꿉니다. 별 제단과 달 제단은 활성화의 의미가 서로 반대입니다.',
                en: 'Click an altar to toggle it. Enabling means the opposite for Star and Moon altars.',
                zh: '點擊祭壇即可切換啟用狀態。星之祭壇與月之祭壇的「啟用」含義相反。',
                zhs: '点击祭坛即可切换启用状态。星之祭坛与月之祭坛的「启用」含义相反。',
                ja: '祭壇を押すと有効・無効を切り替えられます。星の祭壇と月の祭壇では「有効」の意味が逆になります。' },
  floorRule:  { kr: '층은 1층부터 순서대로만 켤 수 있습니다 — 위층을 켜면 아래층도 함께 켜집니다.',
                en: 'Floors enable in order from the first — enabling an upper floor also enables the ones below.',
                zh: '樓層須自 1 樓起依序啟用 — 啟用上層時下層也會一併啟用。',
                zhs: '楼层须自 1 层起依序启用 — 启用上层时下层也会一并启用。',
                ja: '階層は1階から順にのみ有効化できます — 上の階を有効にすると下の階も一緒に有効になります。' },
  note:       { kr: '보스 ATK · 보스 주는 데미지 · 아군 받는 데미지 별 제단은 피격 데미지 모드를 켰을 때만 결과에 반영돼요. 같은 효과가 여러 층에 있으면 전부 더해집니다.',
                en: 'The Boss ATK, Boss damage dealt and Buddies\u2019 damage taken Star altars only affect results when Incoming Damage mode is on. The same effect on several floors adds up.',
                zh: '頭目ATK・頭目造成傷害・我方受到傷害的星之祭壇僅在開啟被擊傷害模式時才會反映到結果。多層出現的相同效果會全部累加。',
                zhs: '头目ATK・头目造成伤害・我方受到伤害的星之祭坛仅在开启被击伤害模式时才会反映到结果。多层出现的相同效果会全部累加。',
                ja: 'ボスATK・ボス与ダメージ・味方被ダメージの星の祭壇は、被ダメージモードをオンにしたときだけ結果に反映されます。複数階にある同じ効果はすべて加算されます。' },
  result:     { kr: '제단 별 {0} · 달 {1}', en: 'Altars: Star {0} · Moon {1}', zh: '祭壇 星 {0} · 月 {1}', zhs: '祭坛 星 {0} · 月 {1}', ja: '祭壇 星 {0} · 月 {1}' },
  resultGroups: { kr: ' · 연동 {0}그룹', en: ' · {0} sync group(s)', zh: ' · 連動 {0} 組', zhs: ' · 联动 {0} 组', ja: ' · 連動 {0} グループ' },
  ultTitle:   { kr: '궁극기 사용 방식', en: 'Ultimate policy', zh: '必殺技使用方式', zhs: '必杀技使用方式', ja: '必殺技の使い方' },
  ultSub:     { kr: '필살기를 언제 쓸지', en: 'when to use the ultimate', zh: '何時使用必殺技', zhs: '何时使用必杀技', ja: '必殺技をいつ使うか' },
  ult_fixed:  { kr: '정해진 턴', en: 'Planned turns', zh: '指定回合', zhs: '指定回合', ja: '指定ターン' },
  ult_fixedTip: { kr: '계획한 턴에 궁을 씁니다. 그 턴에 준비가 안 됐으면 준비되는 즉시 씁니다.', en: 'Uses the ultimate on planned turns; if not ready then, uses it as soon as it is.',
                zh: '在計畫的回合使用必殺技；若該回合未就緒，則一就緒立即使用。', zhs: '在计划的回合使用必杀技；若该回合未就绪，则一就绪立即使用。', ja: '計画したターンに必殺技を使います。そのターンに準備できていなければ、準備でき次第使います。' },
  ult_strict: { kr: '정해진 턴만', en: 'Planned turns only', zh: '僅指定回合', zhs: '仅指定回合', ja: '指定ターンのみ' },
  ult_strictTip: { kr: '계획한 턴에만 궁을 씁니다. 준비가 안 됐으면 건너뛰고 다음 계획 턴을 기다립니다.', en: 'Only on planned turns; if not ready, skips and waits for the next planned turn.',
                zh: '僅在計畫的回合使用；未就緒則跳過並等待下一個計畫回合。', zhs: '仅在计划的回合使用；未就绪则跳过并等待下一个计划回合。', ja: '計画したターンだけ使います。準備できていなければ飛ばして次の計画ターンを待ちます。' },
  ult_asap:   { kr: '준비되면 바로', en: 'As soon as ready', zh: '就緒即用', zhs: '就绪即用', ja: '準備でき次第' },
  ult_asapTip: { kr: '궁이 준비되는 행동마다 바로 씁니다. 계획의 궁 자리는 무시합니다.', en: 'Uses the ultimate on every action where it is ready, ignoring planned ultimate slots.',
                zh: '必殺技一就緒就立即使用，忽略計畫中的必殺位置。', zhs: '必杀技一就绪就立即使用，忽略计划中的必杀位置。', ja: '必殺技が準備できた行動で即座に使います。計画の必殺枠は無視します。' },
  ultKeepDef: { kr: '계획의 방어 턴은 방어 유지', en: 'Keep planned defend turns', zh: '保留計畫的防禦回合', zhs: '保留计划的防御回合', ja: '計画の防御ターンは防御を維持' },
  ultLocked:  { kr: '행동 고급 설정이 켜져 있어요 — 타임라인이 궁 시점을 정합니다', en: 'Advanced action settings are on — the timeline decides ultimate timing',
                zh: '已開啟進階行動設定 — 由時間軸決定必殺時機', zhs: '已开启高级行动设置 — 由时间轴决定必杀时机', ja: '高度な行動設定がオンです — タイムラインが必殺のタイミングを決めます' },
  ultSyncInfo: { kr: '연동 그룹 {0} · {1}이(가) 궁을 쓰는 턴에 {2} 같이 씁니다 (행동 고급 설정 › 연동에서 변경)', en: 'Sync group {0} · uses its ultimate {2} {1} on the turns they ultimate (change in Advanced Action Setup › Sync)',
                zh: '連動組 {0} · 在 {1} 使用必殺的回合{2}一起使用（於行動進階設定 › 連動變更）', zhs: '联动组 {0} · 在 {1} 使用必杀的回合{2}一起使用（于行动进阶设置 › 联动变更）', ja: '連動グループ {0} · {1} が必殺を使うターンに{2}一緒に使います（行動詳細設定 › 連動で変更）' },
  ultAnchorInfo: { kr: '연동 그룹 {0}의 앵커예요 — 멤버들이 이 캐릭터의 궁 턴에 맞춥니다', en: 'Anchor of sync group {0} — members align to this character\u2019s ultimate turns',
                zh: '連動組 {0} 的錨點 — 成員會配合此角色的必殺回合', zhs: '联动组 {0} 的锚点 — 成员会配合此角色的必杀回合', ja: '連動グループ {0} のアンカーです — メンバーがこのキャラの必殺ターンに合わせます' },
  syncTitle:  { kr: '궁극기 맞추기', en: 'Ultimate sync', zh: '必殺技同步', zhs: '必杀技同步', ja: '必殺技の同期' },
  syncSub:    { kr: '앵커가 궁을 쓰는 턴에 멤버도 같이 씁니다 · 최대 3그룹, 한 캐릭터는 한 그룹에만 · 우선순위 2순위 (1순위 = 행동 고급 설정에서 편집한 턴, 그 턴은 맞추기 미적용)',
                en: 'Members ultimate on the turns the anchor does · up to 3 groups, one group per character · priority 2 (priority 1 = turns edited in advanced action settings; sync is skipped there)',
                zh: '成員會在錨點使用必殺的回合一起使用 · 最多 3 組，一名角色只能屬於一組 · 優先度第 2（第 1 = 進階行動設定中編輯的回合，該回合不套用同步）',
                zhs: '成员会在锚点使用必杀的回合一起使用 · 最多 3 组，一名角色只能属于一组 · 优先级第 2（第 1 = 高级行动设置中编辑的回合，该回合不应用同步）',
                ja: 'アンカーが必殺を使うターンにメンバーも使います · 最大3グループ、1キャラは1グループのみ · 優先度2位（1位 = 行動詳細設定で編集したターン、そのターンは同期しない）' },
  syncGroup:  { kr: '그룹 {0} 앵커', en: 'Group {0} anchor', zh: '第 {0} 組錨點', zhs: '第 {0} 组锚点', ja: 'グループ {0} アンカー' },
  syncAnchor: { kr: '앵커', en: 'Anchor', zh: '錨點', zhs: '锚点', ja: 'アンカー' },
  syncNone:   { kr: '— 없음 —', en: '— none —', zh: '— 無 —', zhs: '— 无 —', ja: '— なし —' },
  syncEmpty:  { kr: '빈 자리', en: 'empty', zh: '空位', zhs: '空位', ja: '空き' },
  syncBefore: { kr: '앵커 앞', en: 'before', zh: '錨點前', zhs: '锚点前', ja: 'アンカー前' },
  syncAfter:  { kr: '앵커 뒤', en: 'after', zh: '錨點後', zhs: '锚点后', ja: 'アンカー後' },
  syncOrderTip: { kr: '그 턴에 앵커 앞에 행동할지 뒤에 행동할지 (눌러서 전환)', en: 'Act before or after the anchor on that turn (click to switch)', zh: '該回合在錨點前或後行動（點擊切換）', zhs: '该回合在锚点前或后行动（点击切换）', ja: 'そのターンにアンカーの前か後に行動するか（押して切替）' },
  syncMiss:   { kr: '앵커 궁 턴에 미준비면', en: 'If not ready on the anchor turn', zh: '錨點回合未就緒時', zhs: '锚点回合未就绪时', ja: 'アンカーのターンに未準備なら' },
  syncMissWait: { kr: '다음까지 대기', en: 'Wait for next', zh: '等待下一次', zhs: '等待下一次', ja: '次まで待つ' },
  syncMissAsap: { kr: '준비되면 바로', en: 'Use when ready', zh: '就緒即用', zhs: '就绪即用', ja: '準備でき次第' },
  lock:       { kr: '길드 제단 설정이 켜져 있어요 — 확률 100% 모드는 함께 쓸 수 없어요', en: "Guild Altar Settings is on — 100% Proc mode can't be used together",
                zh: '已開啟公會祭壇設定 — 無法同時使用機率100%模式', zhs: '已开启公会祭坛设置 — 无法同时使用概率100%模式', ja: 'ギルド祭壇設定がオンです — 確率100%モードは併用できません' },
  toastOn:    { kr: '길드 제단 설정 ON', en: 'Guild Altar Settings ON', zh: '公會祭壇設定 ON', zhs: '公会祭坛设置 ON', ja: 'ギルド祭壇設定 ON' },
  toastOnSub: { kr: '· 확률 100% 모드는 함께 쓸 수 없어요', en: '· 100% Proc mode is unavailable while on', zh: '· 無法同時使用機率100%模式', zhs: '· 无法同时使用概率100%模式', ja: '· 確率100%モードは併用できません' },
  toastOff:   { kr: '길드 제단 설정 OFF', en: 'Guild Altar Settings OFF', zh: '公會祭壇設定 OFF', zhs: '公会祭坛设置 OFF', ja: 'ギルド祭壇設定 OFF' },
  loading:    { kr: '제단 데이터를 불러오는 중…', en: 'Loading altar data…', zh: '載入祭壇資料中…', zhs: '加载祭坛数据中…', ja: '祭壇データを読み込み中…' },
  loadFail:   { kr: '제단 데이터를 불러오지 못했어요 (altars.json)', en: 'Failed to load altar data (altars.json)', zh: '無法載入祭壇資料 (altars.json)', zhs: '无法加载祭坛数据 (altars.json)', ja: '祭壇データを読み込めませんでした (altars.json)' },
};
const altarLang = () => localStorage.getItem('woofia_lang') || 'kr';
function altarT(key, ...args) {           // 로컬 사전 → 현재 언어(없으면 kr) + {n} 치환
  const v = ALTAR_T[key];
  let s = (v && (v[altarLang()] || v.kr)) || key;
  args.forEach((a, i) => { s = s.replace('{' + i + '}', a); });
  return s;
}
const altarTx = o => (o && (o[altarLang()] || o.kr)) || '';   // altars.json 다국어 필드
const altarIsMobile = () => window.matchMedia(ALTAR_MQ).matches;

// ── 궁극기 사용 방식 · 402(최대 CD+1) ──────────────────────────────────────────
// 제단과 무관하게 항상 적용된다(편집은 행동 고급 설정 '궁극기 사용 방식' 탭). 슬롯 필드 s.ult = { mode, keepDef }.
//   fixed  = 계획 턴에 궁, 미준비면 차는 즉시(종전 동작 · 기본)
//   strict = 계획 턴에만, 미준비면 건너뜀
//   asap   = 준비되면 바로(계획의 궁 자리 무시). keepDef=true 면 계획의 방어 턴은 방어 유지
const ULT_MODES = ['fixed', 'strict', 'asap'];
function ultOf(s) { const u = (s && s.ult) || {}; return { mode: ULT_MODES.includes(u.mode) ? u.mode : 'fixed', keepDef: u.keepDef !== false }; }
function ultPayload(s) { const u = ultOf(s); return (u.mode === 'fixed' && u.keepDef) ? null : u; }
// 기본(fixed·유지)이면 키를 지운다 — 기록/공유 코드 왕복(looseEq)에서 '기본 객체' 와 '누락' 이 같아지도록
function setUlt(slot, u) { if (u.mode === 'fixed' && u.keepDef) delete slot.ult; else slot.ult = { mode: u.mode, keepDef: u.keepDef }; }
// 공유 코드: '' = 기본(fixed·유지) / 'a' 'a!' 's' 'f!' (첫 글자 = 방식, '!' = 방어 턴을 궁으로 덮음)
const _encUlt = s => { const u = ultOf(s); if (u.mode === 'fixed' && u.keepDef) return ''; return u.mode[0] + (u.keepDef ? '' : '!'); };
const _decUlt = str => { const m = /^([fsa])(!?)$/.exec(String(str || '')); if (!m) return null; return { mode: { f: 'fixed', s: 'strict', a: 'asap' }[m[1]], keepDef: !m[2] }; };
// 402 "필살기 최대 CD +1" 이 걸려 있는가(마스터 ON · 1층 ON · 402 해제=서 있음). 플래너 CD 모델이 이 값을 더한다.
function cdPlus() { const f = altarOn && altarCfg.floors[1]; return (f && f.on !== false && f.off && f.off[402]) ? 1 : 0; }
function fcd(m) { return (m.fatalCd || 0) + cdPlus(); }        // 계획 도구가 보는 필살 CD (보장 CD: 402 반영, 확률 감소 제외)
function ffat(m) { return (m.firstFatal || 1) + cdPlus(); }    // 첫 궁 가능 턴
// ── 연동(궁 맞추기) 그룹(최대 3) — 제단과 무관하게 항상 적용. 편집은 행동 고급 설정 '연동' 탭 ──
// { anchor: 포지션, members: [{ p, order:'before'|'after', base?:'defend'|'basic' }], miss:'wait'|'asap' }
//   base 없음 = 앵커와 같이 궁(종전). defend·basic = 앵커 궁 턴엔 그 행동을 하고, 궁은 '앵커가 준 추가 행동'에서 쓴다.
//   추가 행동은 이미 행동을 마친 아군에게만 들어가므로 base 가 있으면 order 는 before 로 고정(엔진 파서와 동일 규칙).
// 저장: localStorage(woofia_sync) · 기록 snapshot.sync · 공유 코드 v2 꼬리 필드. 옛 기록의 altar.groups 도 읽는다.
let syncGroups = [];
const SYNC_KEY = 'woofia_sync';
const SYNC_MAX_GROUPS = 3;
const SYNC_BASES = ['fatal', 'defend', 'basic'];
function normalizeSyncGroups(raw) {
  const used = new Set(), out = [];
  (Array.isArray(raw) ? raw : []).slice(0, SYNC_MAX_GROUPS).forEach(g => {
    if (!g || typeof g !== 'object') return;
    const anchor = +g.anchor;
    const members = [];
    (Array.isArray(g.members) ? g.members : []).forEach(m => {
      const obj = !!(m && typeof m === 'object');
      const p = +(obj ? m.p : m);
      if (!(p >= 1 && p <= 5) || p === anchor || used.has(p) || members.some(x => x.p === p)) return;
      const base = (obj && SYNC_BASES.includes(m.base) && m.base !== 'fatal') ? m.base : null;
      const mem = { p, order: (!base && obj && m.order === 'after') ? 'after' : 'before' };
      if (base) mem.base = base;                    // 기본(같이 궁)이면 키를 두지 않는다 — 기록/공유 코드 looseEq
      members.push(mem);
    });
    if (!(anchor >= 1 && anchor <= 5) || used.has(anchor)) {
      if (members.length || (anchor >= 1 && anchor <= 5)) out.push({ anchor: (anchor >= 1 && anchor <= 5 && !used.has(anchor)) ? anchor : 0, members: [], miss: g.miss === 'asap' ? 'asap' : 'wait' });
      return;
    }
    used.add(anchor); members.forEach(m => used.add(m.p));
    out.push({ anchor, members, miss: g.miss === 'asap' ? 'asap' : 'wait' });
  });
  return out.filter(g => g.anchor || g.members.length);
}
// 엔진 cfg.sync / 기록 snapshot.sync 계약: 유효 그룹(앵커+멤버) 배열, 없으면 null(키 생략과 동치 → 공유 코드 왕복)
function syncPayload() { const g = normalizeSyncGroups(syncGroups).filter(x => x.anchor && x.members.length); return g.length ? g : null; }
function syncGroupOf(pos) {               // 이 포지션이 속한 그룹 → { g, idx, role:'anchor'|'member', m }
  const gs = normalizeSyncGroups(syncGroups);
  for (let i = 0; i < gs.length; i++) {
    const g = gs[i];
    if (g.anchor === pos) return { g, idx: i, role: 'anchor' };
    const m = g.members.find(x => x.p === pos);
    if (m) return { g, idx: i, role: 'member', m };
  }
  return null;
}
// 공유 코드용: "12b3a;45bd*" (앵커 + 멤버[포지션 + b/a(앞/뒤) + d/p(방어/평타 후 추가 행동에서 궁)]… , '*' = 미준비 시 준비되면 바로)
const _SYNC_BASE_CH = { defend: 'd', basic: 'p' }, _SYNC_CH_BASE = { d: 'defend', p: 'basic' };
function _encGroups(gs) {
  return (gs || []).filter(g => g && g.anchor && g.members && g.members.length)
    .map(g => g.anchor + g.members.map(m => m.p + (m.order === 'after' ? 'a' : 'b') + (_SYNC_BASE_CH[m.base] || '')).join('') + (g.miss === 'asap' ? '*' : '')).join(';');
}
function _decGroups(str) {
  if (!str) return [];
  return normalizeSyncGroups(String(str).split(';').map(t => {
    const m = /^(\d)((?:\d[ab][dp]?)*)(\*?)$/.exec(t); if (!m) return null;
    return { anchor: +m[1], members: (m[2].match(/\d[ab][dp]?/g) || []).map(x => ({ p: +x[0], order: x[1] === 'a' ? 'after' : 'before', base: _SYNC_CH_BASE[x[2]] })), miss: m[3] ? 'asap' : 'wait' };
  }).filter(Boolean));
}
function loadSyncState() {
  try {
    const v = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null');
    if (Array.isArray(v)) { syncGroups = normalizeSyncGroups(v); return; }
    const a = JSON.parse(localStorage.getItem(ALTAR_KEY) || 'null');      // 구버전: 제단 설정 안에 저장돼 있었다
    syncGroups = normalizeSyncGroups(a && a.groups);
  } catch { syncGroups = []; }
}
function saveSyncState() { try { localStorage.setItem(SYNC_KEY, JSON.stringify(normalizeSyncGroups(syncGroups))); } catch { } }
// 기록/공유 코드에서 온 연동 그룹을 현재 설정으로(null·[] = 없음). 옛 기록은 altar.groups 에 실려 온다(restoreRecord 가 넘겨줌).
function applySyncSnap(g) { syncGroups = normalizeSyncGroups(g); saveSyncState(); advRerender(); }
function setSyncGroup(i, fn) {            // 그룹 i 를 수정(fn) → 정규화·저장·재렌더(고급 설정이 열려 있으면 프로브까지)
  const gs = normalizeSyncGroups(syncGroups);
  while (gs.length <= i) gs.push({ anchor: 0, members: [], miss: 'wait' });
  fn(gs[i]);
  syncGroups = normalizeSyncGroups(gs);
  saveSyncState();
  if (advScope) markCmpDirty();
  advRerender();
}
// 옛 기록 정규화: snapshot.altar.groups(구) → snapshot.sync(신). 제단이 꺼진 기록에서도 연동이 살아남고,
// 공유 코드 왕복(looseEq)이 신 형식과 맞아떨어지도록 로드·가져오기 때 한 번 옮긴다.
function migrateSnapSync(sn) {
  if (!sn || !sn.altar || !Array.isArray(sn.altar.groups)) return false;
  if (!sn.sync) sn.sync = sn.altar.groups;
  delete sn.altar.groups;
  return true;
}
// 다국어 캐릭터 이름은 data/chars.json 에만 있다(/api/chars 는 한국어 name 뿐) — 패치 히스토리 모듈과 같은 소스.
// 한국어가 아닌 언어에서 아직 못 불러왔으면 이름을 생략해(P2 만) 영어 패널에 한글이 남지 않게 한다.
const ALTAR_NAME_FIELD = { kr: 'name_kr', en: 'name_en', zh: 'name_cn', zhs: 'name_sc', ja: 'name_ja' };
let altarNames = null;                    // id -> chars.json 원본 메타 (null = 미로드)
function altarLoadNames() {
  if (altarNames !== null) return;
  altarNames = {};
  fetch('data/chars.json', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : null))
    .then(j => { if (!j) return; (Array.isArray(j) ? j : Object.values(j)).forEach(c => { if (c && c.id != null) altarNames[c.id] = c; }); renderAltar(); })
    .catch(() => {});
}
function altarCharName(id) {
  const lang = altarLang(), c = altarNames && altarNames[id];
  if (c) return c[ALTAR_NAME_FIELD[lang]] || c.name_kr || '';
  return lang === 'kr' && CHARS[id] ? (CHARS[id].name || '') : '';
}
function altarSlotName(pos, teamArr) {    // 포지션 라벨: "P2 리카노" (빈 자리·이름 미로드는 P2 만)
  const t = (teamArr || team)[pos - 1];
  const nm = t ? altarCharName(t.id) : '';
  return `P${pos}${nm ? ' ' + nm : ''}`;
}

function loadAltarState() {
  try {
    const s = JSON.parse(localStorage.getItem(ALTAR_KEY) || 'null');
    if (!s) return;
    altarOn = !!s.on;
    [1, 2, 3].forEach(f => {
      const v = s.floors && s.floors[f];
      if (v) altarCfg.floors[f] = { on: v.on !== false, off: (v.off && typeof v.off === 'object') ? v.off : {} };
    });
    normalizeAltarFloors();      // 규칙을 어긴 저장값(구버전 포함)은 접두 구간으로 교정
  } catch { /* 손상된 저장값은 기본값으로 */ }
}
function saveAltarState() {
  try { localStorage.setItem(ALTAR_KEY, JSON.stringify({ on: altarOn, floors: altarCfg.floors })); } catch { }
}
// 엔진 cfg.altar / 기록 snapshot.altar 계약: OFF면 null, ON이면 { on:true, floors:{1:{on, off:[id...]}} }.
// off 는 '체크 해제한 제단' — 별은 해제=서 있음=페널티 적용, 달은 해제=안 열음=축복 미적용(엔진이 부호 처리).
function altarPayload() {
  if (!altarOn) return null;
  const floors = {};
  ALTAR_FLOORS.forEach(f => {
    const c = altarCfg.floors[f] || { on: true, off: {} };
    floors[f] = { on: c.on !== false, off: Object.keys(c.off || {}).map(Number).filter(n => n > 0).sort((a, b) => a - b) };
  });
  return { on: true, floors };                         // 연동 그룹은 snapshot.sync / cfg.sync 로 따로 실린다
}
// 기록/공유 코드에서 온 altar 스냅샷을 현재 설정으로 (null = 제단 OFF). 기록은 '그때의 조건'을 재현해야 하므로
// 제단이 없는 옛 기록을 불러오면 제단도 꺼진다.
function applyAltarSnap(a) {
  altarOn = !!(a && a.on);
  ALTAR_FLOORS.forEach(f => {
    const v = a && a.floors && (a.floors[f] || a.floors[String(f)]);
    const off = {};
    (v && Array.isArray(v.off) ? v.off : []).forEach(id => { if (+id > 0) off[+id] = true; });
    altarCfg.floors[f] = { on: v ? v.on !== false : true, off };
  });
  normalizeAltarFloors();
  saveAltarState();
  renderAltar();
  syncAltarLock();
}
// 공유 코드용 압축: ''=OFF / 'N:off1/off2/off3' (N=켜진 층 수 1~3, 층별 해제 id는 ',' 로). 층은 접두 구간이라 수만 있으면 된다.
function _encAltar(a) {
  if (!a || !a.on) return '';
  let n = 0;
  for (const f of ALTAR_FLOORS) { const v = a.floors && a.floors[f]; if (v && v.on !== false) n = f; else break; }
  const offs = ALTAR_FLOORS.map(f => ((a.floors && a.floors[f] && a.floors[f].off) || []).map(Number).filter(x => x > 0).sort((x, y) => x - y).join(','));
  return n + ':' + offs.join('/');                       // 연동 그룹은 v2 꼬리의 별도 필드(_encGroups)로 실린다
}
function _decAltar(str) {
  if (!str || typeof str !== 'string') return null;
  const m = /^(\d):([^|]*)(?:\|(.*))?$/.exec(str); if (!m) return null;
  const n = +m[1], parts = m[2].split('/');
  const floors = {};
  ALTAR_FLOORS.forEach((f, i) => {
    floors[f] = { on: f <= n, off: (parts[i] || '').split(',').map(Number).filter(x => x > 0).sort((a, b) => a - b) };
  });
  const out = { on: true, floors };
  const groups = _decGroups(m[3]).filter(g => g.anchor && g.members.length);   // 구 코드의 '|그룹' 꼬리 — unpackSnapV2 가 sync 로 옮긴다
  if (groups.length) out.groups = groups;
  return out;
}

function altarMovedHTML() {               // 패널 하단: 연동·궁극기 사용 방식이 행동 고급 설정으로 옮겨졌다는 안내 + 바로 열기
  return `<div class="altar-moved"><span>${esc(advT('altarMoved'))}</span>
    <button type="button" class="btn-ghost sm" data-advopen="sync">${esc(advT('altarMovedOpen'))}</button></div>`;
}
// 메인 캐릭터 창: 현재 방식 요약 + '행동 고급 설정에서 변경'(편집은 한 곳으로). i18n-skip — 이 모듈이 직접 렌더.
function ultSummaryHTML(slot, pos) {
  const u = ultOf(slot), grp = syncGroupOf(pos);
  const now = (grp && grp.role === 'member')
    ? advT('ultSyncShort', grp.idx + 1, altarSlotName(grp.g.anchor))
    : `${altarT('ult_' + u.mode)}${u.mode === 'asap' && u.keepDef ? ' · ' + altarT('ultKeepDef') : ''}${grp && grp.role === 'anchor' ? ' · ' + altarT('ultAnchorInfo', grp.idx + 1) : ''}`;
  return `<div class="mc-ult i18n-skip"><div class="ult-title"><img src="icons/altar_moon.webp" alt=""><b>${esc(altarT('ultTitle'))}</b><em>${esc(now)}</em>
    <button type="button" class="btn-ghost sm ult-open" data-advopen="ult">${esc(advT('openUlt'))}</button></div></div>`;
}
// 비교 팝업(행동 카드)에 넣는 '궁극기 사용 방식' 섹션 — 비교군 슬롯은 자기 팀 컨텍스트라 여기서 바로 편집한다. i18n-skip.
function ultSectionHTML(slot, pos, locked) {
  const u = ultOf(slot), grp = pos ? syncGroupOf(pos) : null;
  const inSync = grp && grp.role === 'member' && grp.g.anchor;
  let body;
  if (locked) body = `<div class="ult-lock">${esc(altarT('ultLocked'))}</div>`;
  else if (inSync) body = `<div class="ult-sync">${esc(altarT('ultSyncInfo', grp.idx + 1, altarSlotName(grp.g.anchor), altarT(grp.m.order === 'after' ? 'syncAfter' : 'syncBefore')))}</div>
      <label class="toggle ult-keep"><input type="checkbox" data-ultkeep ${u.keepDef ? 'checked' : ''}><span class="sw"></span>${esc(altarT('ultKeepDef'))}</label>`;
  else body = `<div class="seg ult-modes">${ULT_MODES.map(m => `<button type="button" data-ultmode="${m}" class="${u.mode === m ? 'on' : ''}" title="${esc(altarT('ult_' + m + 'Tip'))}">${esc(altarT('ult_' + m))}</button>`).join('')}</div>
      <div class="ult-desc">${esc(altarT('ult_' + u.mode + 'Tip'))}</div>
      <label class="toggle ult-keep${u.mode === 'asap' ? '' : ' dim'}"><input type="checkbox" data-ultkeep ${u.keepDef ? 'checked' : ''}><span class="sw"></span>${esc(altarT('ultKeepDef'))}</label>
      ${grp && grp.role === 'anchor' ? `<div class="ult-sync">${esc(altarT('ultAnchorInfo', grp.idx + 1))}</div>` : ''}`;
  return `<div class="mc-ult i18n-skip"><div class="ult-title"><img src="icons/altar_moon.webp" alt=""><b>${esc(altarT('ultTitle'))}</b><em>${esc(altarT('ultSub'))}</em></div>${body}</div>`;
}
function bindUltSection(root, slot, after) {
  const box = root && root.querySelector('.mc-ult'); if (!box) return;
  $$('[data-ultmode]', box).forEach(b => b.onclick = () => {
    setUlt(slot, { ...ultOf(slot), mode: b.dataset.ultmode });
    $$('[data-ultmode]', box).forEach(x => x.classList.toggle('on', x === b));
    const d = $('.ult-desc', box); if (d) d.textContent = altarT('ult_' + b.dataset.ultmode + 'Tip');
    const k = $('.ult-keep', box); if (k) k.classList.toggle('dim', b.dataset.ultmode !== 'asap');
    if (after) after();
  });
  const keep = $('[data-ultkeep]', box);
  if (keep) keep.onchange = () => { setUlt(slot, { ...ultOf(slot), keepDef: keep.checked }); if (after) after(); };
}

// 층은 1층부터 쌓인다 — 게임에서 아래층을 지나야 위층에 가므로 '1층 끔 + 2층 켬' 같은 역관계는 없다.
// 켜진 층은 항상 1..N 의 접두 구간이어야 한다.
const ALTAR_FLOORS = [1, 2, 3];
function normalizeAltarFloors() {
  let open = true;                 // 아래층이 꺼지는 순간부터 위층은 전부 꺼진다
  ALTAR_FLOORS.forEach(f => {
    const cfg = altarCfg.floors[f]; if (!cfg) return;
    if (!open) cfg.on = false;
    else if (!cfg.on) open = false;
  });
}
// N층을 켜면 아래층이 함께 켜지고, N층을 끄면 위층이 함께 꺼진다.
function setAltarFloor(floor, on) {
  ALTAR_FLOORS.forEach(f => {
    const cfg = altarCfg.floors[f]; if (!cfg) return;
    if (on && f <= floor) cfg.on = true;
    else if (!on && f >= floor) cfg.on = false;
  });
  normalizeAltarFloors();
  saveAltarState();
  syncAltarFloorUI();
}
// 캐스케이드로 함께 바뀐 다른 층까지 화면에 반영 (체크박스 + 흐림 처리)
function syncAltarFloorUI() {
  $$('.altar-floor').forEach(sec => {
    const cfg = altarCfg.floors[+sec.dataset.floor]; if (!cfg) return;
    sec.classList.toggle('off', !cfg.on);
    const sw = $('[data-floorsw]', sec);
    if (sw) sw.checked = cfg.on;
  });
}

// 제단 설정 ON ⇄ 확률 100% 상호배제. 기록 복원(restoreRecord)이 forceProc 를 되살려도 여기서 최종 판정.
function syncAltarLock() {
  const fp = $('#forceProc');
  if (fp) {
    if (altarOn && forceProc) { forceProc = false; fp.classList.remove('on'); syncRunsField(); }
    fp.disabled = altarOn;
    if (altarOn) {
      if (altarFpTitle0 == null) altarFpTitle0 = fp.title;   // 원래 툴팁 보관
      fp.title = altarT('lock');
    } else if (altarFpTitle0 != null) {
      fp.title = altarFpTitle0; altarFpTitle0 = null;
    }
  }
  const b = $('#altarOpen');
  if (b) {
    b.classList.toggle('on', altarOn);
    b.classList.toggle('open', altarOpened);
    b.setAttribute('aria-expanded', altarOpened ? 'true' : 'false');
  }
}

function altarHeadHTML() {
  return `<div class="adv-head altar-head">
    <h3>${esc(altarT('title'))}<span class="adv-sub">${esc(altarT('sub'))}</span></h3>
    <label class="toggle"><input type="checkbox" data-altarsw ${altarOn ? 'checked' : ''}><span class="sw"></span>${esc(altarT('use'))}</label>
    <button type="button" class="adv-x" data-altarclose aria-label="${esc(altarT('close'))}">✕</button>
  </div>`;
}
function altarBodyHTML() {
  if (altarData === false) return `<div class="altar-hint">${esc(altarT('loadFail'))}</div>`;
  if (!altarData) return `<div class="altar-hint">${esc(altarT('loading'))}</div>`;
  const floors = (altarData.floors || []).map(f => {
    const cfg = altarCfg.floors[f.floor] || { on: true, off: {} };
    let seq = 0;                                             // 층 안 등장 순번(애니메이션 지연)
    const group = kind => {
      const list = (f[kind] || []).map(a => {
        const on = !cfg.off[a.id];
        return `<li class="altar-row ${on ? 'on' : ''}" data-aid="${a.id}" data-floor="${f.floor}" style="--i:${seq++}"
          role="checkbox" aria-checked="${on}" tabindex="0">
          <img class="ai" src="icons/altar_${kind}.webp" alt="">
          <span class="at">${esc(altarTx(a.text)).replace(/\n/g, '<br>')}</span>
          <i class="ck" aria-hidden="true"></i></li>`;
      }).join('');
      return `<div class="af-group ${kind}">
        <div class="ag-title"><img src="icons/altar_${kind}.webp" alt=""><b>${esc(altarT(kind))}</b><em>${esc(altarT(kind + 'Sub'))}</em></div>
        <ul class="af-list">${list}</ul></div>`;
    };
    return `<section class="altar-floor ${cfg.on ? '' : 'off'}" data-floor="${f.floor}">
      <header class="af-head">
        <div class="af-t"><b>${esc(altarT('floor', f.floor))}</b>
          <em>${esc(altarT('energy'))} ${f.energy} · ${esc(altarT('count', (f.star || []).length, (f.moon || []).length))}</em></div>
        <label class="toggle"><input type="checkbox" data-floorsw="${f.floor}" ${cfg.on ? 'checked' : ''}><span class="sw"></span>${esc(altarT('active'))}</label>
      </header>
      ${group('star')}${group('moon')}
    </section>`;
  }).join('');
  return `<div class="altar-hint">${esc(altarT('hint'))}<br><b>${esc(altarT('floorRule'))}</b></div>`
    + `${floors}${altarMovedHTML()}<div class="altar-note">${esc(altarT('note'))}</div>`;
}
function altarHost() {                     // 현재 열린 컨테이너(팝업 .altar-card / 사이드 .altar-inner)
  return document.querySelector('.altar-modal .altar-card') || document.querySelector('#altarSide .altar-inner');
}
function renderAltar() {
  const host = altarOpened ? altarHost() : null;
  if (!host) return;
  host.innerHTML = altarHeadHTML() + `<div class="adv-body altar-body ${altarOn ? '' : 'off'}">${altarBodyHTML()}</div>`;
}
function altarEsc(e) { if (e.key === 'Escape') closeAltar(); }
function openAltar() {
  if (altarOpened) return closeAltar();
  if (tdmgOpened) return swapSide(closeTdmg, openAltar);   // 턴 피해 탭이 열려 있으면 이 탭으로 교체
  altarOpened = true;
  if (altarIsMobile()) {
    document.querySelector('.altar-modal')?.remove();
    const pop = document.createElement('div');
    pop.className = 'advpop altar-modal i18n-skip';
    pop.innerHTML = `<div class="adv-card altar-card" role="dialog" aria-modal="true" aria-label="${esc(altarT('title'))}"></div>`;
    pop.addEventListener('click', e => { if (e.target === pop) closeAltar(); });   // 배경 클릭 = 닫기
    document.body.appendChild(pop);
  } else {
    const side = $('#altarSide'), wrap = document.querySelector('.wrap');
    if (side) {
      side.hidden = false;
      side.classList.remove('swap-out');
      side.innerHTML = '<div class="altar-inner"></div>';
      wrap?.classList.add('altar-open');
      // 폭 0 상태로 한 프레임 그린 뒤 .in → 트랜지션이 실제로 재생된다
      requestAnimationFrame(() => requestAnimationFrame(() => { if (altarOpened) side.classList.add('in'); }));
    }
  }
  renderAltar();
  syncAltarLock();
  document.addEventListener('keydown', altarEsc);
}
function closeAltar(swap) {                // swap=true: 턴 피해 탭으로 교체되며 닫힘(왼쪽으로 빠지는 애니메이션)
  if (!altarOpened) return;
  altarOpened = false;
  document.removeEventListener('keydown', altarEsc);
  document.querySelector('.altar-modal')?.remove();
  const side = $('#altarSide'), wrap = document.querySelector('.wrap');
  if (side && !side.hidden) {
    side.classList.remove('in');
    if (swap === true) side.classList.add('swap-out');
    const done = () => {
      if (!altarOpened) {
        side.hidden = true; side.innerHTML = ''; side.classList.remove('swap-out');
        if (!tdmgOpened) wrap?.classList.remove('altar-open');   // 턴 피해 탭이 열려 있으면 열은 유지
      }
    };
    if (_reduceMotion()) done(); else setTimeout(done, swap === true ? 220 : 360);   // 트랜지션 끝난 뒤 열을 접는다
  }
  syncAltarLock();
}
function setAltarOn(v) {
  altarOn = !!v;
  saveAltarState();
  syncAltarLock();
  $$('.altar-body').forEach(b => b.classList.toggle('off', !altarOn));
  toast(altarOn ? `${altarT('toastOn')}<br>${altarT('toastOnSub')}` : altarT('toastOff'));
}
function toggleAltarRow(row) {
  const id = +row.dataset.aid, floor = +row.dataset.floor;
  const cfg = altarCfg.floors[floor]; if (!cfg) return;
  if (cfg.off[id]) delete cfg.off[id]; else cfg.off[id] = true;
  const on = !cfg.off[id];
  row.classList.toggle('on', on); row.setAttribute('aria-checked', on ? 'true' : 'false');
  saveAltarState();
}
function initAltar() {
  loadAltarState();
  loadSyncState();                        // 연동 그룹(구버전은 제단 설정 안에 있던 것을 옮겨 온다)
  const btn = $('#altarOpen');
  if (btn) btn.onclick = () => openAltar();
  document.body.addEventListener('change', e => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.hasAttribute('data-altarsw')) return setAltarOn(t.checked);
    if (t.dataset.floorsw) {
      const f = +t.dataset.floorsw; if (!altarCfg.floors[f]) return;
      setAltarFloor(f, t.checked);
    }
  });
  document.body.addEventListener('change', e => {       // 연동 탭(행동 고급 설정): 앵커 선택
    const t = e.target;
    if (!(t instanceof HTMLSelectElement) || t.dataset.anchor == null) return;
    const i = +t.dataset.anchor, p = +t.value;
    setSyncGroup(i, g => { g.anchor = p; g.members = g.members.filter(m => m.p !== p); });
  });
  document.body.addEventListener('click', e => {
    if (e.target.closest('[data-altarclose]')) return closeAltar();
    const row = e.target.closest('.altar-row'); if (row) return toggleAltarRow(row);
    const ao = e.target.closest('[data-advopen]');        // 캐릭터 창·제단 패널 → 행동 고급 설정의 해당 탭으로
    if (ao) { closeCharModal(); advTab = ao.dataset.advopen === 'sync' ? 'sync' : 'ult'; return openAdvPop(); }
    // ── 연동 탭(행동 고급 설정) 조작 — 팝업 안이지만 그룹 상태는 전역이라 여기서 받는다
    const mb = e.target.closest('.as-m');                // 멤버 토글
    if (mb && !mb.disabled) return setSyncGroup(+mb.dataset.g, g => {
      const p = +mb.dataset.p, k = g.members.findIndex(m => m.p === p);
      if (k >= 0) g.members.splice(k, 1); else g.members.push({ p, order: 'before' });
    });
    const ob = e.target.closest('[data-sord]');            // 앞/뒤
    if (ob && ob.dataset.g != null) return setSyncGroup(+ob.dataset.g, g => { const m = g.members.find(x => x.p === +ob.dataset.p); if (m) m.order = ob.dataset.sord === 'after' ? 'after' : 'before'; });
    const sb = e.target.closest('[data-sbase]');           // 앵커 궁 턴의 내 행동(같이 궁 / 방어→추가 행동에서 궁 / 평타→…)
    if (sb && sb.dataset.g != null) return setSyncGroup(+sb.dataset.g, g => {
      const m = g.members.find(x => x.p === +sb.dataset.p); if (!m) return;
      if (sb.dataset.sbase === 'fatal') delete m.base; else { m.base = sb.dataset.sbase; m.order = 'before'; }
    });
    const ms = e.target.closest('[data-miss]');           // 미준비 시 처리
    if (ms && ms.dataset.g != null) return setSyncGroup(+ms.dataset.g, g => { g.miss = ms.dataset.miss === 'asap' ? 'asap' : 'wait'; });
    const pr = e.target.closest('[data-spreset]');         // 프리셋(욱영: 인접 아군 평타 → 욱영 궁 → 추가 행동에서 궁)
    if (pr) return applySyncPreset(pr.dataset.spreset);
  });
  document.body.addEventListener('keydown', e => {
    const row = e.target.closest ? e.target.closest('.altar-row') : null; if (!row) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleAltarRow(row); }
  });
  document.addEventListener('woofia:lang', () => { renderAltar(); syncAltarLock(); });   // 언어 전환 시 재렌더
  const mq = window.matchMedia(ALTAR_MQ);
  const onMq = () => { if (altarOpened) { closeAltar(); openAltar(); } };    // 폭 경계를 넘으면 컨테이너 교체
  if (mq.addEventListener) mq.addEventListener('change', onMq); else mq.addListener(onMq);
  altarLoadNames();                       // 맞추기 그룹·캐릭터 창 안내에 쓰는 다국어 이름
  fetch('altars.json', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : null))
    .then(d => { altarData = (d && Array.isArray(d.floors)) ? d : false; renderAltar(); })
    .catch(() => { altarData = false; renderAltar(); });
  syncAltarLock();
}

// ══ 캐릭터 스펙 설정 ═══════════════════════════════════════════════════════
// 슬롯마다 육성 상태를 따로 들고 간다. 꺼져 있으면(기본) 지금까지처럼 **풀육성**
// (Lv60·★5·육성도5·전 스킬 10·도장 해제)으로 계산하므로 기존 결과가 그대로다.
// 성급이 무엇을 잠그는지는 게임 TCharacterStarData 규칙 → dashboard/spec.js.
const SPEC_SLOTS = ['basicAtk', 'ultimate', 'sigil',
  'passive0', 'passive1', 'passive2', 'passive3', 'passive4'];
const SPEC_SLOT_KR = {
  basicAtk: '평타', ultimate: '필살기', sigil: '도장 필살기',
  passive0: '패시브 1', passive1: '패시브 2', passive2: '패시브 3',
  passive3: '패시브 4', passive4: '패시브 5',
};
const SPEC_FULL = { level: 60, evo: 5, pevo: 0, compat: 5 };
// 슬롯이 열리는 성급 — 잠긴 줄에 "★N부터" 를 적어 주기 위한 표(spec.js 규칙과 동치)
const SPEC_NEED = { sigil: 3, passive2: 3, passive3: 4, passive4: 5 };
const SPEC_NEED_LV = { passive1: 2 };   // 해방은 됐지만 레벨업이 열리는 성급

/** 편집용 — 없으면 만든다. **읽기 경로에서는 쓰지 말 것**(빈 spec이 기록에 눌어붙는다). */
function specOf(s) {
  if (!s.spec) s.spec = { on: false, ...SPEC_FULL, lv: {} };
  if (!s.spec.lv) s.spec.lv = {};
  return s.spec;
}
const specOn = s => !!(s && s.spec && s.spec.on);
/** 엔진에 보낼 투자값. 꺼져 있으면 풀육성. (읽기 전용 — 슬롯을 건드리지 않는다) */
function specInv(s) {
  const p = s && s.spec;
  return (p && p.on) ? { level: p.level, evo: p.evo, pevo: p.pevo, compat: p.compat }
                     : { ...SPEC_FULL };
}
const specEvo = s => specInv(s).evo;
const specRune = s => (specOn(s) ? (s.rune !== false && SPEC.canUnlockRune(specEvo(s))) : true);
const specSlotState = (s, slot) => SPEC.slotState(slot, specEvo(s));
/** 슬롯의 실효 레벨 — 레벨업이 잠긴 패시브는 1로 고정된다(엔진과 같은 규칙). */
function specLevel(s, slot) {
  if (specSlotState(s, slot) === 'pinned') return 1;
  if (!specOn(s)) return 10;
  const v = (s.spec.lv || {})[slot];
  return v == null ? 10 : Math.max(1, Math.min(10, v));
}
/** 도장 강화 가산 전의 기본 ATK/HP. 공식은 spec.js(=stats.py 이식본). */
function specAtkHp(s) {
  const c = CHARS[s.id] || {};
  if (c.baseATK == null) return [c.atk || 0, c.hp || 0];   // 구버전 메타 방어
  return SPEC.scaleAtkHp(c.baseATK, c.baseHP, c.rarity, specInv(s));
}
/** 서버로 보낼 조각. 꺼져 있으면 아무것도 안 보내 = 풀육성 기본값. */
function specPayload(s) {
  if (!specOn(s)) return { specOn: false };
  const p = specOf(s);
  const lv = {};
  SPEC_SLOTS.forEach(k => { lv[k] = specLevel(s, k); });
  return { specOn: true, level: p.level, evo: p.evo, pevo: p.pevo, compat: p.compat,
           skillLevels: lv };
}

// 패널은 메인 모달과 비교 모달 양쪽에서 쓴다 — 어느 슬롯을 어느 껍데기 안에 그리는지만
// 다르므로 대상(host)으로 묶어 두고, 렌더 코드는 하나만 유지한다.
let specHost = null;         // {slot, pan, wrap, sync} · null=닫힘
let _onSpecChange = () => {};   // openModal 이 매번 갈아 끼우는 리스너 (중복 누적 방지)
let specPrevState = {};      // 직전 슬롯 상태 — 성급을 바꿨을 때 '방금 바뀐 줄'만 강조하려고

const _reduceMotion = () =>
  !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/** 숫자를 목표값까지 굴린다. 스탯이 얼마나 움직였는지 눈으로 잡히게 하는 용도. */
function tweenNum(el, to) {
  if (!el) return;
  const from = el._twFrom == null ? to : el._twFrom;   // 첫 호출은 튀지 않게 목표값에서 시작
  el._twFrom = to;
  if (from === to || _reduceMotion()) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 260;
  cancelAnimationFrame(el._twRaf || 0);
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);                 // easeOutCubic
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (k < 1) el._twRaf = requestAnimationFrame(step);
  };
  el._twRaf = requestAnimationFrame(step);
}

/** 슬롯 하나를 지정한 껍데기(pan) 안에서 편집한다. sync = 값이 바뀔 때 바깥을 갱신하는 콜백. */
function openSpecFor(slot, pan, wrap, sync) {
  if (!slot || !pan) return;
  closeSpecPanel();
  specHost = { slot, pan, wrap, sync: sync || (() => {}) };
  specPrevState = {};
  pan.hidden = false;
  if (wrap) wrap.classList.add('with-spec');
  renderSpec();
  // 켜져 있을 때만 첫 조작 지점으로 포커스를 옮긴다 — 꺼져 있으면 스위치가 먼저다
  const first = pan.querySelector(specOn(slot) ? '.cs-star button' : '#csUse');
  if (first) first.focus({ preventScroll: true });
}

function openSpecPanel(i) {
  openSpecFor(team[i], $('#specPanel'), $('#modalWrap'), () => {
    const btn = $('#csOpen', $('#modalCard'));
    if (btn) btn.classList.toggle('on', specOn(team[i]));
    document.dispatchEvent(new CustomEvent('specchange', { detail: { idx: i } }));
    renderTeam();                  // 편성 카드 스펙 배지
  });
}

function closeSpecPanel() {
  const h = specHost;
  specHost = null;
  if (!h || !h.pan || h.pan.hidden) return;
  if (h.wrap) h.wrap.classList.remove('with-spec');
  h.pan.classList.add('closing');
  const done = () => { h.pan.hidden = true; h.pan.classList.remove('closing'); h.pan.innerHTML = ''; };
  if (_reduceMotion()) done(); else setTimeout(done, 200);
}

function renderSpec() {
  if (!specHost) return;
  const pan = specHost.pan, s = specHost.slot, c = CHARS[s.id] || {};
  const p = specOf(s), on = p.on;
  const evo = specInv(s).evo;
  const cap = SPEC.pevoCap(evo);
  const inv = specInv(s);
  const [atk, hp] = specAtkHp(s);
  const [fA, fH] = SPEC.scaleAtkHp(c.baseATK || 0, c.baseHP || 0, c.rarity || 4, SPEC_FULL);
  const pct = fA ? Math.round(atk / fA * 100) : 100;
  const maxBond = (c.rarity === 3 || c.rarity === 4) ? 5 : 0;

  const runeOn = s.rune !== false && SPEC.canUnlockRune(evo);
  const names = c.skillNames || {};
  // 스타는 0~5지만 아이콘은 5개 — n번째 별은 스타가 n+1 이상일 때 켜진다
  const pips = (n, lit, cls, glyph) => Array.from({ length: n }, (_, i) =>
    `<i class="${cls}${i < lit ? ' lit' : ''}">${glyph}</i>`).join('');

  // 필살기는 한 줄로 합치고, 도장 스위치로 어느 쪽이 나가는지만 바뀐다
  const ROWS = ['basicAtk', 'fatal', 'passive0', 'passive1', 'passive2', 'passive3', 'passive4'];
  const rows = ROWS.map(k => {
    const slot = k === 'fatal' ? (runeOn ? 'sigil' : 'ultimate') : k;
    const st = k === 'fatal' ? 'open' : specSlotState(s, k);
    const lv = specLevel(s, slot);
    const need = SPEC_NEED[k], needLv = SPEC_NEED_LV[k];
    const changed = specPrevState[k] && specPrevState[k] !== st;
    const note = st === 'locked' ? `<span class="sr-need">스타 ${need} 해금</span>`
      : st === 'pinned' ? `<span class="sr-pin">스타 ${needLv}부터</span>` : '';
    const bar = st === 'open'
      ? `<input type="range" class="sr-range" data-lv="${k}" min="1" max="10" value="${lv}"
           style="--p:${(lv - 1) / 9 * 100}%" aria-label="${esc(names[slot] || k)} 레벨">`
      : '<span class="sr-blank"></span>';
    const ic = skillIconSrc(slot, s.id);
    const label = k === 'fatal' ? (names[slot] || '필살기')
      : (names[slot] || SPEC_SLOT_KR[slot] || slot);
    // 도장 스위치는 필살기 줄 바로 아래에 붙는다 (스타 3부터만 조작 가능)
    const runeSw = k !== 'fatal' ? '' :
      `<div class="cs-rune${SPEC.canUnlockRune(evo) ? '' : ' na'}">
         <label class="toggle"><input type="checkbox" id="csRune" ${runeOn ? 'checked' : ''}
           ${SPEC.canUnlockRune(evo) ? '' : 'disabled'}><span class="sw"></span>도장 해제</label>
         <em>${SPEC.canUnlockRune(evo) ? (runeOn ? '도장 필살기로 나갑니다' : '일반 필살기로 나갑니다')
                                        : '스타 3부터 해제할 수 있어요'}</em></div>`;
    return `<div class="cs-row ${st}${changed ? ' flash' : ''}" data-slot="${k}">
        ${ic ? `<img class="sr-ic" src="${ic}" alt="" loading="lazy">` : '<span class="sr-ic ph"></span>'}
        <span class="sr-n" title="${esc(label)}">${esc(label)}</span>
        <span class="sr-lv">${st === 'locked' ? '—' : `Lv <b>${lv}</b>`}</span>
        ${bar}${note}
      </div>${runeSw}`;
  }).join('');
  ROWS.forEach(k => { specPrevState[k] = k === 'fatal' ? 'open' : specSlotState(s, k); });

  pan.innerHTML = `<div class="cs-head">
      <div class="cs-ttl"><span class="cs-kick">캐릭터 스펙 설정</span><b>${esc(c.name || '')}</b></div>
      <label class="toggle cs-use"><input type="checkbox" id="csUse" ${on ? 'checked' : ''}>
        <span class="sw"></span>사용</label>
      <button type="button" class="mc-close" id="csClose" aria-label="닫기">×</button>
    </div>
    <p class="cs-hint">끄면 풀육성(Lv60 · 스타5 · 육성도5 · 전 스킬 10 · 도장 해제) 기준으로 계산합니다.</p>
    <div class="cs-body${on ? '' : ' off'}" id="csBody">
      <div class="cs-read">
        <div class="cs-stat"><label>공격력</label><b class="num" id="csAtk">${fmt(atk)}</b></div>
        <div class="cs-stat"><label>체력</label><b class="num" id="csHp">${fmt(hp)}</b></div>
        <div class="cs-ratio" id="csRatio">풀육성 대비 <b>${pct}%</b></div>
      </div>

      <div class="cs-grp">
        <div class="cs-lbl">스타 <b id="csEvoV">${evo}</b><em> / 5 · 아래 스킬 해금을 결정합니다</em></div>
        <div class="cs-pips star" id="csStarPips">${pips(5, evo, 'pip', '★')}</div>
        <input type="range" id="csEvo" min="0" max="5" value="${evo}"
          style="--p:${evo / 5 * 100}%" aria-label="스타">
      </div>

      <div class="cs-grp">
        <div class="cs-lbl">진화 단계 <b id="csPevoV">${inv.pevo}</b><em> / ${cap}</em></div>
        <input type="range" id="csPevo" min="0" max="${Math.max(cap, 1)}" value="${inv.pevo}"
          ${cap ? '' : 'disabled'} style="--p:${cap ? inv.pevo / cap * 100 : 100}%"
          aria-label="진화 단계">
        ${cap ? '' : '<div class="cs-note">★5는 더 밟을 단계가 없어요</div>'}
      </div>

      <div class="cs-grp">
        <div class="cs-lbl">레벨 <b id="csLvV">${inv.level}</b><em> / 60</em></div>
        <input type="range" id="csLevel" min="1" max="60" value="${inv.level}"
          style="--p:${(inv.level - 1) / 59 * 100}%" aria-label="캐릭터 레벨">
      </div>

      <div class="cs-grp${maxBond ? '' : ' na'}">
        <div class="cs-lbl">육성도 <b id="csBondV">${inv.compat}</b><em> / 5</em></div>
        <div class="cs-pips bond" id="csBondPips">${pips(5, inv.compat, 'pip', '♥')}</div>
        <input type="range" id="csBond" min="0" max="5" value="${inv.compat}"
          ${maxBond ? '' : 'disabled'} style="--p:${inv.compat / 5 * 100}%" aria-label="육성도">
        ${maxBond ? '' : '<div class="cs-note">이 희귀도는 육성도 보정이 없어요</div>'}
      </div>

      <div class="cs-grp cs-skills">
        <div class="cs-lbl">스킬 레벨</div>
        ${rows}
      </div>
    </div>`;

  $('#csUse', pan).onchange = e => {
    p.on = e.target.checked;
    specPrevState = {};                       // 켜고 끌 때의 상태 변화는 강조하지 않는다
    renderSpec(); specSyncModal();
  };
  $('#csClose', pan).onclick = closeSpecPanel;
  if (!on) return;                            // 꺼져 있으면 아래 컨트롤은 비활성

  const live = (el, set) => {
    if (!el) return;
    el.oninput = () => { set(+el.value); specSyncStats(); };   // 드래그 중엔 숫자·아이콘만
    el.onchange = () => { renderSpec(); specSyncModal(); };    // 놓을 때 전체 갱신
  };
  live($('#csEvo', pan), v => {
    p.evo = v;
    p.pevo = Math.min(p.pevo, SPEC.pevoCap(v));       // 스타를 내리면 진화 상한도 내려간다
  });
  live($('#csPevo', pan), v => { p.pevo = v; });
  live($('#csLevel', pan), v => { p.level = v; });
  live($('#csBond', pan), v => { p.compat = v; });
  const rsw = $('#csRune', pan);
  if (rsw) rsw.onchange = e => { s.rune = e.target.checked; renderSpec(); specSyncModal(); };
  $$('.sr-range', pan).forEach(r => {
    r.oninput = () => {
      // 필살기 줄은 한 컨트롤이라 일반/도장 양쪽에 같은 레벨을 쓴다
      const keys = r.dataset.lv === 'fatal' ? ['ultimate', 'sigil'] : [r.dataset.lv];
      keys.forEach(k => { p.lv[k] = +r.value; });
      r.style.setProperty('--p', (r.value - 1) / 9 * 100 + '%');
      const cell = r.closest('.cs-row').querySelector('.sr-lv b');
      if (cell) cell.textContent = r.value;
    };
    r.onchange = () => specSyncModal();
  });
}

/** 드래그 중 갱신 — 다시 그리지 않고 숫자와 채움만 (드래그가 끊기지 않게) */
function specSyncStats() {
  if (!specHost || specHost.pan.hidden) return;
  const pan = specHost.pan, s = specHost.slot, c = CHARS[s.id] || {};
  const inv = specInv(s), cap = SPEC.pevoCap(inv.evo);
  const [atk, hp] = specAtkHp(s);
  const [fA] = SPEC.scaleAtkHp(c.baseATK || 0, c.baseHP || 0, c.rarity || 4, SPEC_FULL);
  tweenNum($('#csAtk', pan), atk);
  tweenNum($('#csHp', pan), hp);
  const ratio = $('#csRatio', pan);
  if (ratio) ratio.innerHTML = `풀육성 대비 <b>${fA ? Math.round(atk / fA * 100) : 100}%</b>`;
  const num = (id, v) => { const el = $(id, pan); if (el) el.textContent = v; };
  num('#csPevoV', inv.pevo); num('#csLvV', inv.level);
  num('#csEvoV', inv.evo); num('#csBondV', inv.compat);
  const fill = (id, pct) => { const el = $(id, pan); if (el) el.style.setProperty('--p', pct + '%'); };
  fill('#csPevo', cap ? inv.pevo / cap * 100 : 100);
  fill('#csLevel', (inv.level - 1) / 59 * 100);
  fill('#csEvo', inv.evo / 5 * 100);
  fill('#csBond', inv.compat / 5 * 100);
  // 별·하트는 슬라이더를 끄는 동안 함께 켜져야 조작감이 이어진다
  const light = (id, n) => $$(id + ' .pip', pan).forEach((el, i) => el.classList.toggle('lit', i < n));
  light('#csStarPips', inv.evo);
  light('#csBondPips', inv.compat);
}

/** 스펙이 바뀌면 뒤쪽 모달(스탯·스킬 목록·버튼 표시)도 같이 맞춘다. */
function specSyncModal() {
  specSyncStats();
  if (specHost) specHost.sync();   // 바깥(모달 스탯 · 비교 카드)을 갱신
}

// ── char detail modal ──
async function openModal(i) {
  closeSpecPanel();          // 다른 슬롯의 패널이 열린 채로 남으면 엉뚱한 캐릭터를 편집하게 된다
  const s = team[i], c = CHARS[s.id];
  const limit = c.sealLimit || 20000;
  if (s.sealAtk == null) { s.sealAtk = 0; s.sealHp = limit; }   // 기본: 한계 전부 체력
  const m = $('#modal'), card = $('#modalCard');
  card.className = 'modal-card el-' + c.elementKey; card.style.setProperty('--el', `var(--${c.elementKey})`);
  card.innerHTML = `<button class="mc-close" data-close>×</button>
    <div class="mc-top"><img src="${icon(s.id)}" alt="">
      <div class="info"><h2>${c.name}</h2><div class="tags">
        <span class="tag el">${c.element}속성</span><span class="tag">${c.role}</span><span class="tag">P${i + 1}</span></div></div></div>
    <div class="mc-specbar">
      <button type="button" class="spec-open${specOn(s) ? ' on' : ''}" id="csOpen">
        <span class="so-ic" aria-hidden="true">◈</span>캐릭터 스펙 설정<span class="so-dot"></span></button>
    </div>
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
      <div class="s"><label>기본 공격력 <em id="stAtkAdd"></em></label><b class="num" id="stAtk">${fmt(specAtkHp(s)[0] + s.sealAtk)}</b></div>
      <div class="s"><label>최대 체력 <em id="stHpAdd"></em></label><b class="num" id="stHp">${fmt(specAtkHp(s)[1] + s.sealHp)}</b></div></div>
    ${ultSummaryHTML(s, i + 1)}
    <div class="field">
      ${advOn ? '<div class="adv-lock">행동 고급 설정이 켜져 있어요 — 이 캐릭터의 턴별 행동도 고급 설정에서 정합니다</div>' : ''}
      <div class="mc-plan${advOn ? ' locked' : ''}">
      <label class="toggle" style="margin-bottom:10px"><input type="checkbox" id="usePlan" ${s.usePlan ? 'checked' : ''}${advOn ? ' disabled' : ''}><span class="sw"></span>턴별 행동 직접 계획 <em style="margin-left:4px">(끄면 자동)</em></label>
      <div id="plannerWrap" ${s.usePlan ? '' : 'hidden'}>
        <div class="plan-legend">
          <span>${(c.actionsPerTurn || 1) > 1
            ? `매 턴 <b style="color:var(--gold)">${c.actionsPerTurn}회 행동</b> · <b style="color:var(--gold)">궁은 턴당 1회</b> (궁궁 불가, 궁평/평궁만) · 임부언 추가행동은 평타`
            : `필살 CD <b style="color:var(--gold)">${fcd(c)}턴</b> · 첫 사용 <b style="color:var(--gold)">${ffat(c)}턴</b> — <b style="color:var(--gold)">궁</b>은 CD 안 찬 턴엔 비활성`}</span>
          <span class="plan-fill"><button data-fill="평">모두 평타</button><button data-fill="방">모두 방어</button>${c.id === PASSIVE_DEF_ID ? '<button data-pdef title="궁극기 직전 턴을 방어로 (패시브 활용) · 다시 누르면 평타로 복원">패시브 방어</button>' : ''}${ULT3_IDS.has(c.id) ? `<button data-u3 title="${ULT3_TITLE[c.id]}">3턴궁</button>` : ''}${c.id === UK_ID ? `<button data-ukafter${s.allyUltAfter ? ' class="on"' : ''} title="ON: 인접 아군이 욱영 궁 '후' 회복 행동으로 필살(욱영 버프 받고 궁). OFF(기본): 인접 아군이 먼저 필살, 회복 행동은 평타(도장 +45% 평타뎀 수령)">아군 필살 나중</button>` : ''}</span>
        </div>
        <div class="planner" id="planner"></div>
      </div>
    </div></div>
    <div class="skills" id="skills"><div class="empty-state"><span class="spin"></span>스킬 로딩…</div></div>`;
  m.hidden = false;

  $('#csOpen', card).onclick = () => openSpecPanel(i);
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
    const [bA, bH] = specAtkHp(s);                                  // 육성 스펙 반영된 기본값
    $('#stAtk', card).textContent = fmt(bA + ua);
    $('#stHp', card).textContent = fmt(bH + uh);
    $('#stAtkAdd', card).textContent = ua ? `+${fmt(ua)}` : '';
    $('#stHpAdd', card).textContent = uh ? `+${fmt(uh)}` : '';
  };
  $('#sealOn', card).onchange = e => { s.sealOn = e.target.checked; $('#mcSeal', card).classList.toggle('on', s.sealOn); syncSeal(s.sealAtk); };
  $('#sealAtkR', card).oninput = e => syncSeal(+e.target.value);
  $('#sealAtkN', card).onchange = e => syncSeal(+e.target.value);
  $('#sealHpR', card).oninput = e => syncSeal(limit - +e.target.value);
  $('#sealHpN', card).onchange = e => syncSeal(limit - +e.target.value);
  syncSeal(s.sealAtk);
  // 스펙 패널이 값을 바꾸면 이 모달의 스탯·스킬 설명도 따라가야 한다.
  // 모달을 다시 열 때마다 붙으므로 이전 리스너는 openModal 진입 시 떼어 낸다.
  document.removeEventListener('specchange', _onSpecChange);
  _onSpecChange = ev => {
    if (ev.detail.idx !== i || $('#modal').hidden) return;
    syncSeal(s.sealAtk);
    renderSkills(detail, s);
  };
  document.addEventListener('specchange', _onSpecChange);
  $('#usePlan', card).onchange = e => {
    s.usePlan = e.target.checked;
    $('#plannerWrap', card).hidden = !s.usePlan;
    if (s.usePlan) { if (!s.plan) s.plan = defaultPlan(c); renderPlanner(s, c); }
    s.rotation = s.usePlan ? s.plan.join('') : '';
  };
  const pdefBtn = $('.plan-fill [data-pdef]', card);
  const u3Btn = $('.plan-fill [data-u3]', card);
  const syncPdef = () => {   // 현재 plan이 '패시브 방어'/'3턴궁' 배치와 정확히 일치하면 버튼 활성 표시
    const n = (s.plan?.length || 30) / (c.actionsPerTurn || 1);
    if (pdefBtn)
      pdefBtn.classList.toggle('on', !!(s.usePlan && s.plan && s.plan.join('') === passiveDefendPlan(c, n).join('')));
    if (u3Btn)
      u3Btn.classList.toggle('on', !!(s.usePlan && isUlt3Plan(s.plan, c)));
  };
  $$('.plan-fill button[data-fill]', card).forEach(b => b.onclick = () => {
    // 3턴궁 ON이면 궁턴 유지하고 나머지만 채움 / 아니면 fillPlan(마타야=순수 채움).
    s.plan = isUlt3Plan(s.plan, c) ? ult3Plan(c, 30, b.dataset.fill) : fillPlan(c, b.dataset.fill, 30);
    s.rotation = s.plan.join(''); renderPlanner(s, c); syncPdef();
  });
  if (pdefBtn) pdefBtn.onclick = () => {
    const target = passiveDefendPlan(c, 30);
    const isOn = s.plan && s.plan.join('') === target.join('');
    s.plan = isOn ? fillPlan(c, '평', 30) : target;   // 켜져 있으면 모두 평타로 복원, 아니면 패시브 방어 적용
    s.rotation = s.plan.join(''); renderPlanner(s, c); syncPdef();
  };
  if (u3Btn) u3Btn.onclick = () => {
    const isOn = isUlt3Plan(s.plan, c);
    s.plan = isOn ? fillPlan(c, '평', 30) : ult3Plan(c, 30);   // 해제 시 기본(마타야=순수 평타/투명인간=2턴궁)
    s.rotation = s.plan.join(''); renderPlanner(s, c); syncPdef();
  };
  const ukBtn = $('.plan-fill [data-ukafter]', card);   // 욱영: 인접 아군 필살 타이밍 토글(불리언)
  if (ukBtn) ukBtn.onclick = () => {
    s.allyUltAfter = !s.allyUltAfter;
    ukBtn.classList.toggle('on', s.allyUltAfter);
  };
  if (s.usePlan) { if (!s.plan) s.plan = defaultPlan(c); renderPlanner(s, c); }
  syncPdef();

  const detail = await API.char(s.id);
  renderSkills(detail, s);
}

// ── per-turn action planner (apt = actions per turn; 이태호 = 2) ──
function fillPlan(meta, action, n = 30) {
  const apt = meta.actionsPerTurn || 1;
  const plan = Array(n * apt).fill(action);
  // 일반(apt=1): 궁극기 최소 턴은 유지 (전부 평타/방어 + 궁 cadence).
  // 홀드필살 캐릭(마타야 cd1): 매턴 궁이 아니라 순수 평타/방어 — 필살은 3턴궁 토글이나 수동으로 배치.
  if (apt === 1 && !HOLD_ULT_IDS.has(meta.id)) {
    for (let t = ffat(meta); t <= n; t += fcd(meta)) plan[t - 1] = '궁';
  }
  return plan;                              // 이태호(apt>1): 순수 평타/방어, 자동 궁 없음
}
function defaultPlan(meta, n = 30) {
  // 제토(singleUlt): 전투당 1회 필살 — 기본은 램프를 위해 전부 평타, 필살은 '마지막 턴'에만 1회.
  if (meta.singleUlt) {
    const apt = meta.actionsPerTurn || 1;
    const p = Array(n * apt).fill('평');
    p[(n - 1) * apt] = '궁';
    return p;
  }
  const plan = fillPlan(meta, '평', n);
  // 이태호(apt>1): 첫 행동을 궁으로 → 일지어천 진입 후 평타가 내기혼신 쌓아 데미지 (AUTO와 동일 사이클)
  if ((meta.actionsPerTurn || 1) > 1 && ffat(meta) <= 1) plan[0] = '궁';
  return plan;
}
// 턴 수를 늘렸을 때 계획을 n턴 길이로 확장한다(줄이지는 않는다 — 사용자가 편집한 뒷부분 보존).
// 새로 생기는 턴은 기본 궁 주기를 이어받는다. 예전처럼 '평'으로만 채우면 그 뒤로 궁이 영영
// 안 나가는데, 엔진은 계획이 소진되면 마지막 토큰을 무한 반복하므로 "플래너를 열었는지"에 따라
// 결과가 갈렸다(리카노 10턴 계획을 30턴으로: 모달 열면 궁 0회, 안 열면 6회).
function padPlan(plan, meta, n) {
  const apt = meta.actionsPerTurn || 1, want = n * apt;
  if (!plan || plan.length >= want) return plan;
  const base = defaultPlan(meta, n);        // 평 + 궁(firstFatal, +fatalCd…)
  while (plan.length < want) plan.push(base[plan.length] || '평');
  return plan;                              // 이후 normalizePlan이 CD 정합성을 다시 맞춘다
}
// 투명인간용: 3턴궁 사이클(4·7·10·13…) + 나머지 평타. 기본은 cd2(3·5·7…)라 궁 시점 네온 표식
// 스냅샷이 4에 묶여 도장 AoE(≧5)가 안 터진다. 평타를 3번 넣어 5를 만들고 3턴 주기로 운용하는 옵션.
function ult3Plan(meta, n = 30, action = '평') {
  const apt = meta.actionsPerTurn || 1;
  const plan = Array(n * apt).fill(action);
  if (apt === 1) for (let t = 4; t <= n; t += 3) plan[t - 1] = '궁';
  return plan;
}
// plan의 '궁' 위치가 3턴궁 사이클(4·7·10…)과 정확히 일치하는가 — 채움 액션(평/방)과 무관.
// (3턴궁 토글 ON 상태에서 '모두 방어'를 눌러도 여전히 3턴궁으로 인식하게 하려는 것)
function isUlt3Plan(plan, meta) {
  if (!plan || (meta.actionsPerTurn || 1) !== 1) return false;
  const ref = ult3Plan(meta, plan.length);
  for (let i = 0; i < plan.length; i++)
    if ((plan[i] === '궁') !== (ref[i] === '궁')) return false;
  return true;
}
// 파미도용: 모두 평타(+궁 cadence) 위에 '궁 직전 턴'을 방어로 (패시브 활용). cdDefendReduce=0이라 궁 타이밍 불변.
function passiveDefendPlan(meta, n = 30) {
  const plan = fillPlan(meta, '평', n);                          // 평타 + 궁(4·7·10…)
  for (let i = 0; i < plan.length; i++)
    if (plan[i] === '궁' && i - 1 >= 0) plan[i - 1] = '방';      // 궁 직전 턴 → 방어
  return plan;
}
// CD 모델 (defend-aware) — '방어 시 필살 CD 감소'는 캐릭마다 소스가 다르므로 두 갈래로 나뉜다:
//  · 히토하(Hooked/입질, perStack=0): 자신의 평타가 입질을 부여 → 입질 보유 방어 시 CD 1 감소.
//    궁이 입질을 제거하므로 매 사이클 평타가 다시 필요.
//  · 모이루(Pursuit/추격, perStack=1·cap=3): 추격은 '아군 평타'가 준다(자기 평타 포함).
//    방어 시 추격 중첩 수만큼 CD 감소 + 추격 소모. → allyBasics(턴별 아군 평타 수)가 필요.
// 둘을 한 모델로 묶으면(구버전) 모이루가 입질 규칙을 타서 궁 가능 턴이 엔진과 어긋난다.
// 모이루형(스택 기반 CD 감소) 캐릭용: 팀의 '다른' 캐릭들이 각 턴에 평타를 몇 번 치는지 집계.
// 모이루의 추격은 아군 평타에서 오므로, 아군이 궁만 쏘는 턴엔 스택이 안 쌓여 방어해도 CD가 안 준다.
// roster = 팀 슬롯 배열(비면 null), selfIdx = 대상 캐릭의 슬롯 인덱스.
function allyBasicCounts(roster, selfIdx, n) {
  const cnt = Array(n).fill(0);
  (roster || []).forEach((s, i) => {
    if (!s || i === selfIdx) return;
    const m = CHARS[s.id]; if (!m) return;
    const apt = m.actionsPerTurn || 1;
    const p = (s.usePlan && s.plan && s.plan.length) ? s.plan : defaultPlan(m, n);
    for (let t = 0; t < n; t++)
      for (let k = 0; k < apt; k++)
        if (p[t * apt + k] === '평') cnt[t]++;
  });
  return cnt;
}
// ok[i] = 궁 usable on turn i+1, given the plan.
// allyBasics: 스택 기반 캐릭(모이루)일 때 턴별 아군 평타 수 — 없으면 캡(최대 스택) 가정으로 폴백.
function ultAvail(plan, meta, allyBasics) {
  const ok = []; const red = meta.cdDefendReduce || 0;
  const per = meta.cdDefendPerStack || 0, cap = meta.cdDefendStackCap || 0;
  let cd = ffat(meta) - 1, hooked = false, stk = 0, pending = false;
  for (let t = 1; t <= plan.length; t++) {
    ok[t - 1] = cd <= 0;
    // 엔진과 동일: 불발 궁 → 평타로 대체 + 폴백 예약 / 예약 상태의 '평타' 턴에 쿨이 차면 그 턴에 궁 발동.
    // (대체된 평타도 스택을 준다 — 모이루 추격) 폴백으로 CD가 리셋되는 것까지 반영해야
    // enforceCdDefend의 검증이 실제와 맞는다.
    let act = plan[t - 1], fires = false;
    if (act === '궁') {
      if (ok[t - 1]) { fires = true; pending = false; }
      else { act = '평'; pending = true; }
    } else if (act === '평' && pending && ok[t - 1]) {
      fires = true; act = '궁'; pending = false;
    }
    if (per && cap) {
      // 모이루: 아군 평타가 스택을 쌓고(캡), 방어가 스택 수만큼 CD를 깎고 스택을 비운다.
      // 기본 우선순위상 모이루는 아군 뒤에 행동 → 같은 턴 아군 평타가 먼저 반영된다.
      stk = Math.min(cap, stk + (allyBasics ? (allyBasics[t - 1] || 0) : cap));
      if (act === '방') { cd -= per * stk; stk = 0; }
      if (act === '평') stk = Math.min(cap, stk + 1);   // 자기 평타도 스택을 준다
    } else {
      if (act === '방' && red && hooked) cd -= red;     // 히토하: 입질 보유 방어 = CD 가속
      if (act === '평') hooked = true;                  // 평타가 입질 부여
    }
    if (fires) { cd = fcd(meta); hooked = false; }  // 궁 발동(지정/폴백): CD 리셋 + 입질 제거
    cd -= 1;                                          // 턴 종료 자연 감소
  }
  return ok;
}
// drop 궁s that fall on a CD-locked turn. ultAvail과 반드시 같은 CD 모델이어야 표시·재배치가 일치한다.
function normalizePlan(plan, meta, allyBasics) {
  const red = meta.cdDefendReduce || 0;
  const per = meta.cdDefendPerStack || 0, cap = meta.cdDefendStackCap || 0;
  let cd = ffat(meta) - 1, hooked = false, stk = 0, pending = false;
  for (let t = 1; t <= plan.length; t++) {
    const ready = cd <= 0;
    // 엔진(_take_action)과 동일 판정:
    //  · 지정 궁이 쿨 미충족 → 평타로 대체하고 '폴백 예약'(auto_fatal_pending)
    //  · 예약된 상태에서 '평타' 턴에 쿨이 차면 그 턴에 자동으로 궁 발동 (방어 턴엔 폴백 없음)
    // 이걸 안 하면 계획엔 평타인데 엔진은 궁을 쏘는 턴이 생겨 표시가 실제와 어긋난다.
    if (plan[t - 1] === '궁') {
      if (ready) pending = false;
      else { plan[t - 1] = '평'; pending = true; }
    } else if (plan[t - 1] === '평' && pending && ready) {
      plan[t - 1] = '궁'; pending = false;
    }
    const act = plan[t - 1];
    if (per && cap) {                                  // 모이루: 아군 평타 → 추격 → 방어 시 CD 감소
      stk = Math.min(cap, stk + (allyBasics ? (allyBasics[t - 1] || 0) : cap));
      if (act === '방') { cd -= per * stk; stk = 0; }
      if (act === '평') stk = Math.min(cap, stk + 1);
    } else {
      if (act === '방' && red && hooked) cd -= red;
      if (act === '평') hooked = true;
    }
    if (act === '궁') { cd = fcd(meta); hooked = false; }   // ready였던 궁만 남음
    cd -= 1;
  }
}
// 임부언이 궁을 쓰는 턴 집합 — 이태호의 fed 추가행동이 생기는 위치. 임부언 apt=1이라 plan 인덱스=턴-1.
// 임부언이 턴별 계획(usePlan)이면 그 계획의 궁 턴, 아니면 자동 CD 주기(firstFatal+fatalCd).
function imbueonUltTurns(teamArr, turns) {
  const im = (teamArr || []).find(t => t && t.id === IMBUEON_ID);
  if (!im) return new Set();
  const meta = CHARS[IMBUEON_ID] || {};
  const set = new Set();
  if (im.usePlan && im.plan && im.plan.length) {
    const plan = im.plan.slice();
    normalizePlan(plan, meta);                       // CD 미충족으로 못 쓰는 궁 제거 → 실제 궁 턴만
    for (let t = 0; t < turns; t++) if (plan[t] === '궁') set.add(t + 1);
  } else {
    for (let t = ffat(meta) || 1; t <= turns; t += (fcd(meta) || 1)) set.add(t);
  }
  return set;
}
// 이태호(1포지션)+임부언 동반 시 fed 슬롯을 표시할 턴 집합. 그 외엔 null(슬롯 없음).
function taehoFedTurns(slot, teamArr, turns) {
  if (!slot || slot.id !== TAEHO_ID) return null;
  if (!(teamArr && teamArr[0] && teamArr[0].id === TAEHO_ID)) return null;   // 이태호가 1포지션일 때만
  if (!teamArr.some(t => t && t.id === IMBUEON_ID)) return null;
  return imbueonUltTurns(teamArr, turns);
}
// 히토하·모이루 전용: 궁을 놓으면 바로 앞 턴을 방어로 강제하고, 이번 사이클(직전 궁 이후)에
// 평타가 하나도 없으면 입질 부여용 평타를 하나 넣는다 (방어가 CD를 줄이려면 입질이 떠 있어야 함).
// ultTurn(1-based)에 궁이 나가도록 앞 턴들을 방어로 채운다. 필요한 방어 수는 캐릭마다 다르다:
// 히토하는 감소 1/방어라 1개 + 입질용 평타면 되지만, 모이루는 CD 6에 최대 3/방어라 2개가 필요하다.
// 반환: 배치 성공 여부 (false면 그 턴엔 어떤 구성으로도 궁 불가 → 호출부가 안내).
function enforceCdDefend(plan, meta, ultTurn, allyBasics) {
  if (!(meta.cdDefendReduce > 0) || ultTurn < 2) return false;
  const per = meta.cdDefendPerStack || 0, cap = meta.cdDefendStackCap || 0;
  if (per && cap) {
    // 모이루형: 스택은 아군 평타가 주므로 방어만 확보하면 된다. 궁 앞 턴부터 거꾸로 방어를
    // 하나씩 늘려가며 실제 CD 모델(ultAvail)로 검증 → 그 턴에 궁이 나가는 최소 구성을 채택.
    for (let nDef = 1; nDef <= ultTurn - 1; nDef++) {
      const test = plan.slice();
      for (let k = 0; k < nDef; k++) test[ultTurn - 2 - k] = '방';
      test[ultTurn - 1] = '궁';
      if (ultAvail(test, meta, allyBasics)[ultTurn - 1]) {
        for (let k = 0; k < nDef; k++) plan[ultTurn - 2 - k] = '방';
        return true;
      }
    }
    return false;                                 // 아군 평타가 부족해 그 턴엔 불가
  }
  // 히토하형(입질): 궁 직전 턴을 방어로 만들고, 그 방어가 CD를 줄이려면 직전 사이클에 평타(입질)가
  // 있어야 한다. 스택형과 마찬가지로 사본에 적용해 실제 CD 모델로 검증한 뒤에만 반영한다 —
  // 예전엔 무조건 true를 돌려줘서, T2·T3처럼 원천적으로 불가능한 턴에도 "성공" 토스트가 뜨고
  // 정작 normalizePlan이 그 궁을 평타로 되돌려 셀만 조용히 원복됐다.
  const test = plan.slice();
  test[ultTurn - 2] = '방';                       // 앞 턴 강제 방어
  let lastUlt = 0;
  for (let t = 1; t < ultTurn - 1; t++) if (test[t - 1] === '궁') lastUlt = t;
  let hasBasic = false;
  for (let t = lastUlt + 1; t <= ultTurn - 2; t++) if (test[t - 1] === '평') { hasBasic = true; break; }
  if (!hasBasic) for (let t = lastUlt + 1; t <= ultTurn - 2; t++)
    if (test[t - 1] !== '궁') { test[t - 1] = '평'; break; }   // 입질용 평타 1개 확보
  test[ultTurn - 1] = '궁';                       // 호출부가 이미 넣었지만 사본에도 명시
  if (!ultAvail(test, meta, allyBasics)[ultTurn - 1]) return false;
  for (let i = 0; i < plan.length; i++) plan[i] = test[i];
  return true;
}
function reflowUlts(plan, meta, anchor) { // re-place 궁s AFTER `anchor` at the earliest cadence
  let lastUlt = 0;                        // (preserves how many, and any 방어 turns)
  for (let t = 1; t <= anchor; t++) if (plan[t - 1] === '궁') lastUlt = t;
  let count = 0;
  for (let t = anchor + 1; t <= plan.length; t++) if (plan[t - 1] === '궁') { count++; plan[t - 1] = '평'; }
  let next = lastUlt ? lastUlt + fcd(meta) : ffat(meta);
  for (let t = anchor + 1; t <= plan.length && count > 0; t++) {
    if (t < next || plan[t - 1] === '방') continue;
    plan[t - 1] = '궁'; next = t + fcd(meta); count--;
  }
}
function renderPlanner(s, meta) {
  const wrap = $('#planner'); if (!wrap) return;
  const apt = meta.actionsPerTurn || 1;
  const n = +$('#turns').value;
  padPlan(s.plan, meta, n);                               // 턴 수를 늘렸으면 기본 궁 주기로 이어붙임
  const ab = allyBasicCounts(team, team.indexOf(s), n);   // 모이루: 아군 평타 → 추격 → 방어 시 CD 감소
  if (apt === 1) normalizePlan(s.plan, meta, ab);     // CD 검증·게이팅은 단일행동 캐릭만
  const ok = apt === 1 ? ultAvail(s.plan, meta, ab) : null;
  const fedTurns = taehoFedTurns(s, team, n);     // 이태호+임부언: 임부언 궁 턴에 fed 슬롯 추가
  if (fedTurns) s.fedActions = s.fedActions || {};
  const prevFed = wrap._fedShown || new Set();    // 직전에 없던 fed 슬롯 = 새로 생성 → 발광
  const curFed = new Set();
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
    let fedCell = '';
    if (fedTurns && fedTurns.has(t)) {              // 임부언 궁 턴 → 이태호 추가행동(평/궁/방) 한 줄 더
      curFed.add(t);
      const fv = s.fedActions[t] || '평';
      const isNew = !prevFed.has(t);                // 이번에 새로 생긴 슬롯만 발광
      const fb = k => `<button class="a${k} ${fv === k ? 'on' : ''}" data-fedturn="${t}" data-fa="${k}">${k}</button>`;
      fedCell = `<div class="acts fed-slot${isNew ? ' fed-new' : ''}" title="임부언 궁 추가행동">${fb('평')}${fb('궁')}${fb('방')}</div>`;
    }
    return `<div class="pcell${apt > 1 ? ' dbl' : ''}${fedCell ? ' has-fed' : ''}"><div class="tn">${t}</div>${cells}${fedCell}</div>`;
  }).join('');
  wrap._fedShown = curFed;
  wrap.onclick = e => {
    const btn = e.target.closest('button'); if (!btn || btn.disabled) return;
    if (btn.dataset.fedturn !== undefined) {        // 이태호 fed 추가행동 선택(턴별)
      const ft = +btn.dataset.fedturn, fa = btn.dataset.fa;
      if (fa === '평') delete s.fedActions[ft]; else s.fedActions[ft] = fa;   // 평=기본 → 저장 안 함(sparse)
      renderPlanner(s, meta);
      return;
    }
    const idx = +btn.dataset.idx, a = btn.dataset.a;
    s.plan[idx] = a;
    if (apt > 1 && a === '궁') {                        // 궁은 턴당 1회 — 같은 턴 다른 슬롯의 궁은 평으로
      const ti0 = Math.floor(idx / apt);
      for (let a2 = 0; a2 < apt; a2++) { const j = ti0 * apt + a2; if (j !== idx && s.plan[j] === '궁') s.plan[j] = '평'; }
    }
    if (a === '궁' && meta.singleUlt)                   // 제토: 필살은 전투당 1회 — 다른 턴 궁은 모두 평으로
      for (let j = 0; j < s.plan.length; j++) if (j !== idx && s.plan[j] === '궁') s.plan[j] = '평';
    const abM = allyBasicCounts(team, team.indexOf(s), +$('#turns').value);
    if (a === '궁' && meta.cdDefendReduce > 0) {       // 모이루(추격)·히토하(입질): 앞턴 방어 강제 = CD 가속
      if (enforceCdDefend(s.plan, meta, idx + 1, abM))
        toast(`${meta.name}: 필살 CD를 맞추려고 앞 턴을 <b>방어</b>로 자동 배치했어요`);
      else if (meta.cdDefendPerStack)   // 모이루형: 스택이 아군 평타에서 오므로 부족할 수 있다
        toast(`${meta.name}: <b>${idx + 1}턴엔 필살 불가</b> — 아군 평타가 부족해 방어로도 CD를 못 맞춰요`);
      else                              // 히토하형: 방어를 넣어도 그 턴까진 CD가 안 찬다
        toast(`${meta.name}: <b>${idx + 1}턴엔 필살 불가</b> — 방어로 앞당겨도 그 턴까진 CD가 안 차요`);
    }
    else if (apt === 1 && a === '궁') reflowUlts(s.plan, meta, idx + 1);   // 단일행동: 궁 자동 재배치
    if (apt === 1) normalizePlan(s.plan, meta, abM);
    s.rotation = s.plan.join('');
    renderPlanner(s, meta);
  };
}
function renderSkills(detail, slot) {
  const wrap = $('#skills'); if (!wrap) return;
  const rune = specRune(slot);
  wrap.innerHTML = detail.skills.filter(sk => {
    if (sk.slot === 'sigil') return rune;          // 룬 필살기는 도장 해제 시만
    if (sk.slot === 'ultimate') return !rune;      // 도장 해제 시 ultimate→sigil 대체
    return specSlotState(slot, sk.slot) !== 'locked';   // 미해방 패시브는 아예 숨김
  }).map(sk => {
    const lv = specLevel(slot, sk.slot);           // 슬롯마다 제 레벨로 설명을 보여준다
    const e = sk.levels[Math.min(lv - 1, sk.levels.length - 1)] || {};
    const cd = e.cd ? `CD ${e.cd}` : '';
    const ic = skillIconSrc(sk.slot, detail.id);
    const slotEl = ic ? `<img class="slot-ic" src="${ic}" alt="${sk.slotKr}" title="${sk.slotKr}">` : `<span class="slot">${sk.slotKr}</span>`;
    const pin = specSlotState(slot, sk.slot) === 'pinned'
      ? '<span class="sk-pin" title="이 스타에서는 레벨을 올릴 수 없어요">1레벨 고정</span>' : '';
    return `<div class="sk"><div class="sk-h">${slotEl}<span class="skn">${sk.name}${pin}</span>
        <span class="sk-lv">Lv ${lv}</span></div>
      <div class="sk-b">${cd ? `<span class="sk-cd">${cd}</span>` : ''}${(e.kr || '').trim() || '—'}</div></div>`;
  }).join('');
  wrap.onclick = e => { const h = e.target.closest('.sk-h'); if (h) h.parentElement.classList.toggle('open'); };
}
function closeCharModal() { closeSpecPanel(); $('#modal').hidden = true; }
$('#modal').onclick = e => { if (e.target.dataset.close !== undefined) closeCharModal(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') {
  const sub = document.querySelector('.iopop, .swappop, .sealpop, .planpop, .priopop'); if (sub) { sub.remove(); return; }   // 위 팝업부터 닫기
  const ci = document.querySelector('.cmpinfo'); if (ci) { ci.remove(); return; }
  if (specHost) { closeSpecPanel(); return; }                  // 스펙 패널이 열려 있으면 그것부터
  closeCharModal(); $('#histModal').hidden = true; $('#cmpModal').hidden = true; $('#guideModal').hidden = true; $('#patchModal').hidden = true;
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
  // 고급 설정 편집기가 다른 대상(비교군)을 물고 있는 동안 실행하면 메인 팀 + 비교군
  // 타임라인이 섞인 결과가 기록까지 남는다. 키보드로 버튼에 닿을 수 있으므로 막는다.
  if (advScope) return toast('행동 고급 설정을 닫은 뒤 실행해 주세요');
  const picked = team.map((s, i) => s ? { ...s, position: i + 1, priority: s.priority ?? null } : null).filter(Boolean);
  if (picked.length === 0) return;
  // 이태호처럼 매턴 2회 행동·테세 전환 캐릭은 턴별 설정을 권장
  // 턴별 행동 설정을 권하는 캐릭: 다중행동(이태호) + 홀드필살(마타야 — 자동이면 궁쿨1로 매턴 궁이라 파세 램프가 낭비됨)
  const unplanned = picked.find(s => ((CHARS[s.id].actionsPerTurn || 1) > 1 || HOLD_ULT_IDS.has(s.id)) && !s.usePlan);
  if (unplanned) toast(`주의 — ${CHARS[unplanned.id].name}의 턴별 행동을 설정하는 걸 추천드립니다`);
  const hpSchedChar = picked.find(s => CHARS[s.id].hpSchedule);   // 카라트: 적 HP 의존
    if (hpSchedChar && !hp10) toast(`${CHARS[hpSchedChar.id].name} 동반 — 적 HP%가 진행 턴을 4등분해 단계적으로 감소합니다 (앞 1/4 ≥75% → 막 1/4 &lt;25%)`);
  const btn = $('#runBtn'); btn.classList.add('busy'); btn.querySelector('span').innerHTML = '<span class="spin"></span>계산 중…';
  const cfg = {
    // 고급 설정 중에는 캐릭터별 계획·우선순위를 보내지 않는다 (advCfg의 프로브와 동일해야
    // 화면에 보이는 타임라인이 곧 실행 결과가 된다). 전 턴이 지정 상태라 결과는 동일.
    team: picked.map(s => ({ id: s.id, position: s.position, skill: s.skill, rune: s.rune, rotation: advOn ? null : (s.rotation || null), fedActions: s.fedActions || null, allyUltAfter: !!s.allyUltAfter, priority: advOn ? null : s.priority, sealAtk: s.sealOn ? (s.sealAtk ?? 0) : 0, sealHp: s.sealOn ? (s.sealHp ?? 0) : 0,
      ult: ultPayload(s),      // 궁극기 사용 방식(길드 제단 ON · 기본 아니면)
      ...specPayload(s) })),   // 캐릭터 스펙(육성) — 빠지면 화면 표시만 바뀌고 결과는 풀육성이 된다
    turns: +$('#turns').value, dummies: +$('#dummies').dataset.val, enemyHits: $('#enemyHits').dataset.val,
    dummyElement: +$('#dummyElement').dataset.val,
    turnOrders: advOn ? {} : turnOverrides, turnPlans: advOn ? turnPlans : {},
    forceProc, hp10, runs: +$('#runs').value,
    incomingHpPct: incomingOn ? +$('#incoming').value : 0,   // 피격 데미지 모드
    altar: altarPayload(),                 // 길드 제단 설정(OFF면 null) — 엔진이 층 누적·별/달 부호로 풀어 적용
    sync: syncPayload(),                   // 연동(궁 맞추기) 그룹 — 제단과 무관하게 항상
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
  // 편차 밴드: 확률 효과가 전혀 안 터진 바닥값 ~ 전부 터진 천장값. force/평균 무관하게 항상 표시.
  // 확률 효과가 없는 조합은 바닥=천장이라 밴드 폭 0 = "안정적"이 그대로 드러난다.
  const tFloor = m.totalFloor ?? m.total, tCeil = m.totalCeil ?? m.total;
  const dFloor = m.dpsFloor ?? m.dps, dCeil = m.dpsCeil ?? m.dps;
  $('#hTotalRange').textContent = `최소 ${fmtShort(tFloor)} ~ 최대 ${fmtShort(tCeil)}`;
  $('#hDpsRange').textContent = `최소 ${fmtShort(dFloor)} ~ 최대 ${fmtShort(dCeil)}`;
  const bandTip = '확률 효과가 전혀 발동하지 않았을 때(최소) ~ 전부 발동했을 때(최대). 폭이 좁을수록 확률 의존이 적은 안정적인 조합입니다.';
  $('#hTotalRange').title = bandTip; $('#hDpsRange').title = bandTip;
  $$('.hero-num label em').forEach(e => e.style.display = multi ? '' : 'none');
  $('#topMeta').textContent = (multi
    ? `${m.runs}회 · 평균 ${fmtShort(m.total)} · ±${fmtShort(m.totalStd)}`
    : '확률 100% · 결정론')
    + (m.altar ? ` · ${altarT('result', m.altar.star, m.altar.moon)}` : '')   // 걸린 길드 제단(별 n · 달 m)
    + ((m.sync || (m.altar && m.altar.groups)) ? altarT('resultGroups', m.sync || m.altar.groups) : '')   // 연동 그룹 수(구 결과는 altar.groups)
    + (m.turnDamage ? ` · ${m.turnDamage.uniform ? tdmgT('result', m.turnDamage.max) : tdmgT('resultRange', m.turnDamage.min, m.turnDamage.max)}` : '');   // 턴 피해 모드
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
    return `<div class="turn" data-turn="${tn}"><div class="turn-h"><b class="tn-num">${tn}턴</b>
      <span class="sum"><span class="s-val dmg">${fmt(dmg)}<em>딜</em></span>${heal ? `<span class="s-val heal">${fmt(heal)}<em>힐</em></span>` : ''}${bar ? `<span class="s-val bar">${fmt(bar)}<em>베리어</em></span>` : ''}</span>
      <span class="tn-caret">▾</span></div>
      <div class="turn-b">${renderActions(evs)}</div></div>`;
  }).join('');
  $('#log').onclick = e => {
    const sk = e.target.closest('.skchip'); if (sk) { openSkillFromSource(+sk.dataset.sid, sk.dataset.sn); return; }
    const nd = e.target.closest('.ndl.clk'); if (nd) { openSkillFromSource(+nd.dataset.sid, nd.dataset.sn); return; }
    const ch = e.target.closest('.chan'); if (ch) { showSource(ch); return; }
    const bt = e.target.closest('.bar-trace'); if (bt) { jumpToBarrier(+bt.dataset.turn, bt.dataset.act); return; }
    const fa = e.target.closest('.ndl.fatk'); if (fa) { fa.classList.toggle('open'); return; }
    const ah = e.target.closest('.act-h'); if (ah) { ah.parentElement.classList.toggle('open'); return; }
    const th = e.target.closest('.turn-h'); if (th) th.parentElement.classList.toggle('open');
  };
}
// 배리어 "추적": 그 배리어가 생성된 턴/액션 로그를 열고 스크롤·강조
function jumpToBarrier(turn, act) {
  const log = $('#log'); if (!log) return;
  const turnEl = log.querySelector(`.turn[data-turn="${turn}"]`);
  if (!turnEl) return;
  turnEl.classList.add('open');
  let target = turnEl.querySelector('.turn-h');
  if (act) {
    const actEl = turnEl.querySelector(`.act[data-act="${act}"]`);
    if (actEl) { actEl.classList.add('open'); target = actEl; }
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.add('bar-flash');
  setTimeout(() => target.classList.remove('bar-flash'), 1400);
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
      hitg.push(`<div class="act hitgrp" data-act="${aid}">
        <div class="act-h"><span class="atkr">${atkBy}</span><span class="hit-arrow">→</span>
          ${pic}<span class="an">${lines[0].actor}</span><span class="ak ak-hit">피격</span>
          <span class="at">${total ? fmt(total) : '<i>반응 없음</i>'}</span></div>
        <div class="act-b">${hits.map(h => renderHit(h, true)).join('')}${body.map(renderND).join('')}</div></div>`);
      return;
    }
    if (!hits.length && !nd.length) return;
    const pic = id ? `<img class="ai el-${c ? c.elementKey : 'none'}" src="${icon(id)}" alt="">` : '<span class="ai sys">적</span>';
    const kindEl = kind ? `<span class="ak ak-${KCLASS[kind] || ''}">${kind}</span>` : '';
    ally.push(`<div class="act" data-act="${aid}">
      <div class="act-h">${pic}<span class="an">${id ? lines[0].actor : '적의 행동'}</span>${kindEl}
        <span class="at">${total ? fmt(total) : '<i>버프/스택</i>'}</span></div>
      <div class="act-b">${hits.map(h => renderHit(h)).join('')}${nd.map(renderND).join('')}</div></div>`);
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
// 적 피격 → 받은 피해 + 배리어 잔량 게이지(피격 후 남은 배리어 / 피격 전 배리어). HP 손실은 별도.
function renderIncoming(d) {
  const dmg = d.dmg || 0, hp = d.hpLost || 0;
  const pre = d.preBar || 0, remain = d.remainBar || 0, lost = Math.max(0, pre - remain);
  let body;
  if (pre > 0) {   // 배리어 게이지: 골드(남은) ▏ 빨강(소모)
    const pR = remain / pre * 100, pL = lost / pre * 100;
    body = `<div class="in-bar"><span class="in-seg remain" style="width:${pR.toFixed(1)}%"></span><span class="in-seg lost" style="width:${pL.toFixed(1)}%"></span></div>
      <div class="in-brk"><span class="remain">🛡 남은 배리어 ${fmt(remain)} / ${fmt(pre)}</span>${hp > 0 ? `<span class="hp">HP −${fmt(hp)}</span>` : ''}</div>`;
  } else {          // 배리어 없음 → HP로 직격
    body = `<div class="in-brk"><span class="hp">🩸 배리어 없음 · HP −${fmt(hp)}</span></div>`;
  }
  // 감소 채널 배지 — 각각 곱연산으로 들어감: 방어 −50% × 아군 받는뎀 증감 × 공격자 주는뎀 증감
  const pctSign = v => (v < 0 ? '−' : '+') + Math.abs(v) + '%';
  const reds = [];
  if (d.defended) reds.push(`<span class="in-red rd-def" title="방어 상태: 받는 데미지 50% 감소">🛡 방어 −50%</span>`);
  (d.taken || []).forEach(t => reds.push(`<span class="in-red rd-take" title="아군 받는 데미지 감소 — ${t.skill ? esc(t.skill) : '버프'}">🛡 받는뎀 ${pctSign(t.v)}</span>`));
  (d.takenP || []).forEach(t => reds.push(`<span class="in-red rd-take" title="아군 ${t.el || ''}속성 받는 데미지 감소 — ${t.skill ? esc(t.skill) : ''}">🛡 ${t.el || ''}받는뎀 ${pctSign(t.v)}</span>`));
  (d.dealt || []).forEach(t => reds.push(`<span class="in-red rd-deal" title="공격자 주는 데미지 감소 — ${t.skill ? esc(t.skill) : '디버프'}">🗡 주는뎀 ${pctSign(t.v)}</span>`));
  const cut = reds.length ? ` <s class="in-raw">${fmt(d.raw)}</s>${reds.join('')}` : '';
  return `<div class="ndl indmg">
    <div class="in-top"><span class="in-lbl">받은 피해</span><b class="in-dmg">${fmt(dmg)}</b>${cut}</div>
    ${body}</div>`;
}
function renderND(l) {
  if (l.detail && l.detail.kind === 'incoming') return renderIncoming(l.detail);
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
    const eff = (d.eff || []).length ? ' × ' + chan(d.effLabel || '효과', d.eff) : '';
    const recv = d.healRecv ? ` × <span class="chan-static">받는회복 +${d.healRecv}%</span>` : '';
    // 수령자측 배리어 증폭(다라완 파4) — 클릭 시 출처 스킬로 이어짐
    const brc = (d.barRecvComp || []).length ? ' × ' + chan('받는배리어', d.barRecvComp) : '';
    return `<div class="ndl ${cls} fatk">
      <div class="ndl-h">${text}<span class="ndl-caret">▾</span></div>
      <div class="ndl-calc"><b>${fmt(d.final)}</b> = ${inner} × ${pctEl}${eff}${recv}${brc}</div></div>`;
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
// 배리어 1개가 "어떻게 생성됐는지" 계산식 (base × 계수%) — renderNd 배리어 분해 재사용
function barrierCalcHtml(d) {
  let inner;
  if ((d.baseLabel || 'ATK') === 'ATK') {
    inner = fmt(d.base);
    const bc = chan('기초ATK', d.baseAtk || []), ac = chan('ATK', d.atk || []);
    if (bc) inner += ' × ' + bc;
    if (ac) inner += ' × ' + ac;
    if (sumv(d.flat || [])) inner += ' + ' + chan('고정', d.flat, '');
    inner = '(' + inner + ')';
  } else { inner = `${fmt(d.baseTotal)} ${d.baseLabel}`; }   // 최대HP 기반(파도 위의 서퍼 등)
  const pctEl = d.skillId
    ? `<span class="skchip" data-sid="${d.skillId}" data-sn="${(d.skillName || '').replace(/"/g, '&quot;')}">${d.skillPct}% 계수</span>`
    : `<span class="sk">${d.skillPct}% 계수</span>`;
  const eff = (d.eff || []).length ? ' × ' + chan(d.effLabel || '발동효과', d.eff) : '';
  // 수령자측 배리어 증폭 (오렘 파1·다라완 파4) — 클릭 시 출처 스킬로 이어짐
  const brc = (d.barRecvComp || []).length ? ' × ' + chan('받는배리어', d.barRecvComp) : '';
  return `<b>${fmt(d.final)}</b> = ${inner} × ${pctEl}${eff}${brc}`;
}
// 배리어 비례 딜의 "총 배리어 → 출처별 구성 → 각 배리어 생성식" 재귀 드릴다운(꼬리에 꼬리)
function barrierCompHtml(total, comp) {
  // 실제 배리어 인스턴스 각각(합산·재계산 X). 각 인스턴스 = 그 아군 ATK로 개별 계산된 저장값.
  const rows = comp.map(c => {
    const reduced = c.orig && Math.abs(c.orig - c.v) > 1;
    const trace = (c.turn != null)
      ? `<button class="bar-trace" data-turn="${c.turn}" data-act="${c.actId != null ? c.actId : ''}" title="이 배리어가 생성된 로그로 이동">${c.turn}턴 ↗</button>`
      : '';
    return `<div class="ndl fatk">
      <div class="ndl-h"><span class="bc-src">${esc(c.src)}</span> <b style="color:var(--text2)">${fmt(c.v)}</b>${reduced ? ` <em class="dep">(피격 전 ${fmt(c.orig)})</em>` : ''}${trace}<span class="ndl-caret">▾</span></div>
      <div class="ndl-calc">${barrierCalcHtml(c.detail)}</div></div>`;
  }).join('');
  return `<div class="ndl fatk bar-comp">
    <div class="ndl-h">🛡 배리어 ${fmt(total)} 구성 <em>(${comp.length}개 — 각 배리어 생성식·추적)</em><span class="ndl-caret">▾</span></div>
    <div class="ndl-calc">${rows}</div></div>`;
}
function renderHit(l, counter) {   // counter=true → 피격에 대한 반격 딜(대상은 때린 적이 아니라 d.target)
  const d = l.detail;
  const baseLabel = d.baseLabel || 'ATK';
  const isBar = !!(d.barrierComp && d.barrierComp.length);
  let inner;
  if (isBar) {
    // 피격으로 배리어가 소모됐으면 "기존 배리어 A − B(소모)" — 아니면 그냥 총 배리어
    inner = (d.barrierPre != null)
      ? `<span class="bar-dep">기존 배리어 ${fmt(d.barrierPre)} <span class="dep">− ${fmt(d.barrierConsumed)}</span></span>`
      : `${fmt(d.atkTotal)} 배리어`;   // 총 배리어(구성은 아래 드릴다운)
  } else {
    inner = fmt(d.base);
    const bc = chan('기초ATK', d.baseAtk), ac = chan('ATK', d.atk);
    if (bc) inner += ' × ' + bc;
    if (ac) inner += ' × ' + ac;
    if (sumv(d.flat)) inner += ' + ' + chan('고정', d.flat, '');
  }
  const sk = d.skillId
    ? `<span class="skchip" data-sid="${d.skillId}" data-sn="${(d.skillName || '').replace(/"/g, '&quot;')}">스킬 ${d.skillPct}% 계수</span>`
    : `<span class="sk">스킬 ${d.skillPct}% 계수</span>`;
  const dealt = d.dealt.length ? ' × ' + chan('주는딜', d.dealt) : '';
  const eff = d.eff.length ? ' × ' + chan(d.effLabel, d.eff) : '';
  const effEx = (d.effEx || []).length ? ' × ' + chan('필살기효과', d.effEx) : '';   // 필살기 안 발동딜(배리어 반격)
  // 받뎀증 = 일반 × 속성 (별개 곱연산 채널이라 따로 표시). 구버전(d.taken)은 합쳐서 표시.
  const tg = (d.takenG || []).length ? ' × ' + chan('받는딜', d.takenG) : '';
  const tp = (d.takenP || []).length ? ' × ' + chan('속성 받는딜', d.takenP) : '';
  const takenOld = (d.taken || []).length ? ' × ' + chan('받는딜', d.taken) : '';
  // 수면 추가 피해 — 수면 대상 첫 직접피격 1회(피격 시 각성). 탐랑 룬필살.
  const slp = d.sleepBonus ? ` × <span class="chan-static" title="수면 대상 추가 피해(첫 피격 시 각성)">💤 수면 +${d.sleepBonus}%</span>` : '';
  // 지속(도트) 전용 채널 — DoT 틱에만 표시
  const dd = (d.dotDealt || []).length ? ' × ' + chan('지속딜 증가', d.dotDealt) : '';
  const dt = (d.dotTaken || []).length ? ' × ' + chan('받는 지속딜', d.dotTaken) : '';
  // 속성 상성 배율 (1.0 아닐 때만): 상성 ×1.5(초록) / 역상성 ×0.75(빨강)
  const em = d.elemMult;
  const elem = (em && em !== 1)
    ? ` × <span class="elemx ${em > 1 ? 'adv' : 'dis'}">${em > 1 ? '상성' : '역상성'} ×${em}</span>` : '';
  // 전체공격/반격은 hit마다 대상이 다르므로 대상을 명시(안 그러면 같은 피격 그룹 안에서 전부 같은 적처럼 보임)
  const tgt = d.target ? `<span class="hit-tgt">→ ${esc(d.target)}</span>` : '';
  const ctr = counter ? `<span class="hit-ctr" title="피격에 대한 반격 — 이 딜은 때린 적이 아니라 → 뒤 표기된 대상에게 들어갑니다">🗡 반격</span>` : '';
  return `<div class="hit${counter ? ' counter' : ''}"><div class="hit-top">${ctr}<b class="num">${fmt(d.final)}</b>${tgt}<span class="hm">${baseLabel} ${fmt(d.atkTotal)}</span></div>
    <div class="formula">(${inner}) × ${sk}${dealt}${eff}${effEx}${tg}${tp}${takenOld}${slp}${dd}${dt}${elem}</div>
    ${isBar ? barrierCompHtml(d.atkTotal, d.barrierComp) : ''}</div>`;
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
  closeSpecPanel();          // 스킬 상세로 카드 내용이 바뀌므로 편집 패널은 닫는다
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

// ───────────── 패치 히스토리 ─────────────
// patch-notes.json(큐레이션) → 세로 타임라인 렌더 · 카테고리 필터 · 아코디언 · 미확인 점.
// 텍스트는 {kr,en,zh,zhs,ja} 5개 언어. 없는 언어는 kr 로 폴백한다.
// 본문은 i18n-skip(오버레이 번역 제외) — 이 모듈이 woofia_lang 을 직접 읽어 렌더한다.
(function initPatchHistory() {
  const btn = document.getElementById('patchBtn');
  const modal = document.getElementById('patchModal');
  if (!btn || !modal) return;
  const body = document.getElementById('patchBody');
  const filters = document.getElementById('patchFilters');
  const dot = btn.querySelector('.pf-dot');
  const SEEN_KEY = 'woofia_patch_seen';
  // 카테고리·'전체' 라벨은 렌더러가 직접 다국어 처리 (칩 컨테이너는 i18n-skip)
  const CATS = {
    new:     { kr: '신규',        en: 'New',     zh: '新增', zhs: '新增', ja: '新規' },
    balance: { kr: '개선·밸런스', en: 'Balance', zh: '調整', zhs: '调整', ja: '調整' },
    fix:     { kr: '버그 수정',   en: 'Bug Fix', zh: '修正', zhs: '修正', ja: '修正' },
    qol:     { kr: '편의',        en: 'QoL',     zh: '體驗', zhs: '体验', ja: '利便性' },
  };
  const ALL = { kr: '전체', en: 'All', zh: '全部', zhs: '全部', ja: 'すべて' };
  const L = () => localStorage.getItem('woofia_lang') || 'kr';
  const tx = o => (o && (o[L()] || o.kr)) || '';       // 다국어 필드 → 현재 언어, 없으면 kr
  let releases = [], curFilter = 'all';

  fetch('patch-notes.json', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      releases = (d && Array.isArray(d.releases)) ? d.releases : [];
      const latest = releases[0] && releases[0].version;
      if (latest && localStorage.getItem(SEEN_KEY) !== latest) dot.hidden = false;   // 마지막 본 버전과 다르면 점
      renderFilters();
    })
    .catch(() => {});

  function badge(cat) { return `<span class="pr-badge cat-${cat}">${esc(tx(CATS[cat]) || cat)}</span>`; }

  // 항목에 특정 캐릭터가 언급되면(5명 미만) 그 프로필 아이콘을 인라인으로. 공통/대규모 변경은 chars 생략.
  // 다국어 캐릭터 이름은 data/chars.json 에만 있다 (/api/chars 는 한국어 name 뿐) — i18n.js 와 같은 소스
  const NAME_FIELD = { kr: 'name_kr', en: 'name_en', zh: 'name_cn', zhs: 'name_sc', ja: 'name_ja' };
  let charNames = {};    // id -> chars.json 원본 메타
  fetch('data/chars.json', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : null))
    .then(j => {
      if (!j) return;
      (Array.isArray(j) ? j : Object.values(j)).forEach(c => { if (c && c.id != null) charNames[c.id] = c; });
    })
    .catch(() => {});
  const nameOf = id => {
    const c = charNames[id];
    if (c) return c[NAME_FIELD[L()]] || c.name_kr || '';
    const f = (typeof CHARS !== 'undefined' && CHARS[id]) || null;    // 폴백: 한국어 이름
    return f ? (f.name || '') : '';
  };
  function faces(ids) {
    if (!Array.isArray(ids) || !ids.length) return '';
    return `<span class="pi-chars">` + ids.map(id =>
      `<img class="pi-face" src="icons/${id}.png" alt="" title="${esc(nameOf(id))}" onerror="this.style.display='none'">`).join('') + `</span>`;
  }

  function renderFilters() {
    const chips = [['all', tx(ALL)]].concat(Object.keys(CATS).map(c => [c, tx(CATS[c])]));
    filters.innerHTML = chips.map(([c, label]) =>
      `<button class="pf-chip${c === curFilter ? ' on' : ''}" data-cat="${c}">` +
      `${c === 'all' ? '' : `<span class="pf-cdot dot-${c}"></span>`}${esc(label)}</button>`).join('');
    filters.querySelectorAll('.pf-chip').forEach(b => {
      b.onclick = () => { curFilter = b.dataset.cat; renderFilters(); render(); };
    });
  }

  function render() {
    if (!releases.length) { body.innerHTML = `<div class="patch-empty">패치 내역을 불러오지 못했어요.</div>`; return; }
    const html = releases.map((rel, i) => {
      const items = (rel.items || []).filter(it => curFilter === 'all' || it.cat === curFilter);
      if (!items.length) return '';                              // 필터에 걸리는 항목 없으면 릴리스 숨김
      const tags = [...new Set((rel.items || []).map(it => it.cat))];
      // 1.x = 메이저(캐릭터 추가) · 1.x.x = 마이너 패치 — 시각적으로 확실히 구분
      const isMajor = /^\d+\.\d+$/.test(String(rel.version));
      // 전체 보기: 메이저는 펼침, 마이너는 접힘(최신 릴리스가 마이너면 그것만 펼침).
      // 분류 필터를 걸면 걸러진 결과를 바로 보여주려고 전부 펼친다.
      const collapsed = (curFilter === 'all' && !isMajor && i > 0) ? ' collapsed' : '';
      const hasHero = rel.char != null || rel.charImg != null;
      const faceSrc = rel.charImg || (rel.char != null ? `icons/${rel.char}.png` : '');
      const hero = hasHero ? `<div class="pr-hero">` +
          `<img class="pr-face" src="${esc(faceSrc)}" alt="" onerror="this.style.display='none'">` +
          (rel.skill && rel.char != null ? `<img class="pr-rune" src="icons/skills/Rune${rel.char}.png" alt="" onerror="this.style.display='none'">` : '') +
          // 이름은 캐릭터 데이터(5개 언어)에서 우선 가져오고, 없으면 JSON 의 charName
          ((rel.char != null && nameOf(rel.char)) || (rel.charName ? tx(rel.charName) : '')
            ? `<span class="pr-cname">${esc((rel.char != null && nameOf(rel.char)) || tx(rel.charName))}</span>` : '') +
        `</div>` : '';
      // details: 펼쳤을 때 함께 보이는 구체 수치 (게임 데이터에서 확인한 값)
      const detailsHtml = ds => (Array.isArray(ds) && ds.length)
        ? `<div class="pi-details">` + ds.map(x => `<div class="pi-d">${esc(tx(x))}</div>`).join('') + `</div>` : '';
      const itemsHtml = items.map(it =>
        `<div class="pr-item"><span class="pi-tag dot-${it.cat}"></span>` +
        `<span class="pi-text">${faces(it.chars)}${esc(tx(it.text))}${detailsHtml(it.details)}</span></div>`).join('');
      return `<div class="pr${isMajor ? ' major' : ' minor'}${i === 0 ? ' latest' : ''}${hasHero ? ' has-hero' : ''}${collapsed}">` +
        `<div class="pr-head">` +
          `<span class="pr-ver">v${esc(rel.version)}</span>` +
          `<span class="pr-date">${esc(rel.date)}</span>` +
          `<span class="pr-badges">${tags.map(badge).join('')}</span>` +
          `<span class="pr-caret">▼</span>` +
          (rel.title ? `<span class="pr-title">${esc(tx(rel.title))}</span>` : '') +
        `</div>` +
        `<div class="pr-body">${hero}<div class="pr-items">${itemsHtml}</div></div>` +
      `</div>`;
    }).join('');
    body.innerHTML = html || `<div class="patch-empty">해당 분류의 패치가 없어요.</div>`;
    body.querySelectorAll('.pr-head').forEach(h => {
      h.onclick = () => h.parentElement.classList.toggle('collapsed');
    });
  }

  btn.onclick = () => {
    renderFilters();                       // 칩 라벨도 현재 언어로 (열 때마다 갱신)
    render(); body.scrollTop = 0; modal.hidden = false;
    if (releases[0]) { localStorage.setItem(SEEN_KEY, releases[0].version); dot.hidden = true; }   // 봤으니 점 제거
  };
  modal.onclick = e => { if (e.target.dataset.pclose !== undefined) modal.hidden = true; };
})();
