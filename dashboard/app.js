'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = n => Math.round(n).toLocaleString('ko-KR');
const icon = id => `icons/${id}.png`;

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
const EL_ORDER = ['fire', 'water', 'wood', 'light', 'dark'];
const EL_KR = { fire: '불', water: '물', wood: '나무', light: '빛', dark: '어둠', none: '무' };

let CHARS = {};                       // id -> meta
let team = [null, null, null, null, null];   // slot -> {id, skill, rune, rotation}
let filter = 'all';
let lastResult = null;

// ── 기록(캐시) 시스템 ──
const HKEY = 'woofia_history';
let simHistory = [];
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
function saveRecord(snap, data) {
  const names = data.team.map(t => (CHARS[t.id] || t).name).join('·');
  const label = `${names} · ${data.meta.turns}턴 · ${fmtShort(data.meta.total)}`;
  // 결과(data)는 저장하지 않는다 — 전투로그 포함 시 1건이 ~750KB라 localStorage(~5MB)가 금방 초과돼
  // setItem이 조용히 실패(새 기록 미저장)했음. 설정(snap)만 저장하고, 복원 시 재실행(시드 고정 = 동일 결과).
  simHistory.unshift({ id: Date.now(), label, snap });
  if (simHistory.length > 40) simHistory.length = 40;
  persistHistory();
  renderHistory(simHistory[0].id);
}
function renderHistory(selId) {
  const sel = $('#history'); if (!sel) return;
  sel.innerHTML = simHistory.length
    ? simHistory.map(r => `<option value="${r.id}"${r.id === selId ? ' selected' : ''}>${r.label}</option>`).join('')
    : '<option value="">— 기록 없음 —</option>';
}
function setSeg(id, val) {
  const seg = $('#' + id); if (!seg) return;
  seg.dataset.val = val;
  seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v == val));
}
function restoreRecord(rec) {
  const s = rec.snap;
  team = s.team.map(x => x ? JSON.parse(JSON.stringify(x)) : null);
  turnOverrides = JSON.parse(JSON.stringify(s.turnOverrides || {}));
  selTurns = new Set();
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
  list.innerHTML = simHistory.length ? simHistory.map(r => {
    const d = new Date(r.id).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<label class="hist-item"><input type="checkbox" data-id="${r.id}">
      <span class="hi-label">${r.label}</span><span class="hi-date">${d}</span>
      <button class="hi-del" data-del="${r.id}" title="이 기록 삭제">✕</button></label>`;
  }).join('') : '<div class="hist-empty">저장된 기록이 없습니다</div>';
  updateHselCount();
}
function selectedHistIds() { return new Set([...$$('#histList input:checked')].map(c => +c.dataset.id)); }
function updateHselCount() {
  const n = selectedHistIds().size;
  $('#hselCount').textContent = `${n}개 선택 / 전체 ${simHistory.length}`;
  $('#hDelSel').disabled = $('#hDelOther').disabled = !n;
}
function afterHistChange() { persistHistory(); renderHistList(); renderHistory(simHistory[0]?.id); }
function bindHistory() {
  $('#history').onchange = e => { const r = simHistory.find(x => x.id == e.target.value); if (r) restoreRecord(r); };
  $('#histManage').onclick = () => { renderHistList(); $('#histModal').hidden = false; };
  $('#histModal').onclick = e => { if (e.target.dataset.hclose !== undefined) $('#histModal').hidden = true; };
  $('#hAll').onclick = () => { $$('#histList input').forEach(c => c.checked = true); updateHselCount(); };
  $('#hNone').onclick = () => { $$('#histList input').forEach(c => c.checked = false); updateHselCount(); };
  $('#histList').onchange = updateHselCount;
  $('#histList').onclick = e => {
    const b = e.target.closest('.hi-del'); if (!b) return;
    e.preventDefault();
    simHistory = simHistory.filter(r => r.id != b.dataset.del); afterHistChange();
  };
  $('#hDelSel').onclick = () => {
    const ids = selectedHistIds(); if (!ids.size) return;
    if (!confirm(`선택한 ${ids.size}개 기록을 삭제할까요?`)) return;
    simHistory = simHistory.filter(r => !ids.has(r.id)); afterHistChange();
  };
  $('#hDelOther').onclick = () => {
    const ids = selectedHistIds(); if (!ids.size) return;
    if (!confirm(`선택한 ${ids.size}개만 남기고 나머지 ${simHistory.length - ids.size}개를 삭제할까요?`)) return;
    simHistory = simHistory.filter(r => ids.has(r.id)); afterHistChange();
  };
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
(async function init() {
  if (!USE_PY) document.getElementById('boot')?.remove();   // 로컬(fetch)은 즉시 로딩
  const list = await API.chars();
  list.forEach(c => CHARS[c.id] = c);
  loadHistory();
  bindSettings();
  bindHistory();
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
    const t = +b.dataset.t; selTurns.has(t) ? selTurns.delete(t) : selTurns.add(t);   // 토글
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
          <span class="plan-fill"><button data-fill="평">모두 평타</button><button data-fill="방">모두 방어</button></span>
        </div>
        <div class="planner" id="planner"></div>
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
  $$('.plan-fill button', card).forEach(b => b.onclick = () => {
    s.plan = fillPlan(c, b.dataset.fill, 30); s.rotation = s.plan.join(''); renderPlanner(s, c);
  });
  if (s.usePlan) { if (!s.plan) s.plan = defaultPlan(c); renderPlanner(s, c); }

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
document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('#modal').hidden = true; $('#histModal').hidden = true; } });

function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.onclick = () => t.classList.remove('show'); document.body.appendChild(t); }
  t.innerHTML = `<span class="ti">⚠</span>${msg}`; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 5000);
}

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
    team: picked.map(s => ({ id: s.id, position: s.position, skill: s.skill, rune: s.rune, rotation: s.rotation || null, priority: s.priority, sealAtk: s.sealOn ? (s.sealAtk ?? 0) : 0, sealHp: s.sealOn ? (s.sealHp ?? 0) : 0 })),
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
