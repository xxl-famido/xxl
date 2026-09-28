// 기록 관리 시트 + 공유 코드. mount 없음 — 상단바 메뉴·기록 select·편성 패널이 open()/shareCurrent() 를 부른다.
// 저장 형식·코덱은 core(store.records / codec) 그대로. 여기서는 목록 UI 와 파일·클립보드만 다룬다.
import { encodeShare } from '../core/codec.js';
import { fmtShort, makeLabel } from '../core/format.js';
import { shortName } from './grow.js';

const SORTS = [
  { value: 'date', key: 'records.label.newest' },
  { value: 'date-asc', key: 'records.label.oldest' },
  { value: 'name', key: 'records.label.name' },
  { value: 'dmg', key: 'records.label.totalDmg' },
];

/** 기록 표시 이름: 사용자가 붙인 이름 → 현재 언어 동료 이름으로 다시 만든 라벨 → 저장된 라벨. */
export function recordLabel(rec, ctx) {
  if (rec.name) return rec.name;
  const team = (rec.snap && rec.snap.team) || [];
  const names = team.filter(Boolean).map((s) => shortName(ctx.i18n.nameOf(s.id))).join('·');
  if (!names) return rec.label || String(rec.id);
  return ctx.t('top.history.option', { team: names, turns: rec.snap.turns ?? 30, total: fmtShort(rec.total || 0) });
}

const htmlLang = (ctx) => (ctx.i18n.langs.find((l) => l.code === ctx.i18n.lang) || {}).html || 'ko';
const recDate = (rec, ctx) => {
  try { return new Date(+rec.id).toLocaleString(htmlLang(ctx), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };

/** 복사가 막힌 환경(비보안 컨텍스트 등): 코드를 읽기 전용 입력에 담아 시트로 보여 준다. */
function showCodeSheet(ctx, code) {
  const { h } = ctx.components;
  const ta = h('textarea', { class: 'rec-code', readonly: true, rows: 5, 'aria-label': ctx.t('records.share.title') });
  ta.value = code;
  const body = h('div', { class: 'rec-share' }, h('p', { class: 'hint' }, ctx.t('records.share.manual')), ta);
  ctx.components.openSheet({ title: ctx.t('records.share.title'), body, ariaLabel: ctx.t('top.close') });
  setTimeout(() => { ta.focus(); ta.select(); }, 60);
}

/** 지금 화면 상태를 기록 1개짜리 공유 코드로 만들어 복사(v1 기록 코드와 같은 형식 → v1·v2 어디서든 가져오기로 열린다). */
export async function shareCurrent(ctx) {
  const { store, components } = ctx;
  const st = store.get();
  const snap = store.snapshot();
  if (!snap.team.some(Boolean)) return;
  const meta = (st.result && st.result.meta) || {};
  const rec = { id: Date.now(), label: makeLabel(snap.team, snap.turns, meta.total || 0, st.chars), snap, total: meta.total || 0 };
  let code;
  try { code = await encodeShare([rec]); } catch { components.toast(ctx.t('records.share.fail')); return; }
  if (await copyText(code)) components.toast(ctx.t('records.share.copied'));
  else showCodeSheet(ctx, code);
}

/** 기록 불러오기 + 되돌리기 토스트. 상단바 select 와 기록 시트가 함께 쓴다. */
export function restoreRecord(ctx, id) {
  const r = ctx.store.records.restore(id);
  if (!r) return null;
  ctx.components.toast(ctx.t('top.restored'), { action: { label: ctx.t('top.undo'), fn: () => ctx.store.records.revert(r.undo) }, duration: 8000 });
  return r;
}

/** 기록 관리 시트를 연다. */
export function open(ctx) {
  const { store, components, t } = ctx;
  const { h, icon, button, toast, empty, menu } = components;
  components.ensureStyle('css/records.css');
  const selected = new Set();
  let renaming = null;           // 이름 변경 중인 기록 id
  let showImport = false;

  const search = h('input', { type: 'search', placeholder: t('records.ph.searchName'), 'aria-label': t('records.search.aria'), value: store.get().ui.histSearch || '' });
  search.addEventListener('input', () => store.records.search(search.value));
  const sort = h('select', { class: 'rec-sort', 'aria-label': t('records.sort.aria') },
    SORTS.map((o) => h('option', { value: o.value, selected: store.get().ui.histSort === o.value }, t(o.key))));
  sort.addEventListener('change', () => store.records.sort(sort.value));
  const importBtn = button({ tier: 'secondary', size: 'sm', label: t('records.label.import'), iconName: 'upload', 'aria-expanded': 'false', onClick: () => { showImport = !showImport; renderImport(); } });

  const tools = h('div', { class: 'rec-tools' },
    h('label', { class: 'search' }, icon('search'), search), sort, importBtn);
  const importBox = h('div', { class: 'rec-import', hidden: true });
  const selBar = h('div', { class: 'rec-selbar' });
  const list = h('ul', { class: 'rec-list', 'aria-label': t('records.title') });
  const body = h('div', { class: 'rec-sheet' }, tools, importBox, selBar, list);

  // ── 가져오기 ──
  function renderImport() {
    importBtn.setAttribute('aria-expanded', String(showImport));
    importBox.hidden = !showImport;
    if (!showImport) return;
    const ta = h('textarea', { class: 'rec-code', rows: 3, placeholder: t('records.label.pasteSharedCodeHere'), 'aria-label': t('records.import.title') });
    const file = h('input', { type: 'file', accept: '.json,application/json,text/plain', class: 'sr', tabindex: '-1', 'aria-hidden': 'true' });
    const run = async (text) => {
      const v = String(text || '').trim();
      if (!v) { toast(t('records.label.pleasePasteCode')); ta.focus(); return; }
      const r = await store.records.importText(v);
      if (!r.ok) { toast(t('records.msg.importFailedInvalidFormat')); return; }
      toast(r.added ? t('records.fmt.imported0RecordsDuplicates', [r.added]) : t('records.import.empty'));
      if (r.added) { showImport = false; renderImport(); }
    };
    file.addEventListener('change', () => {
      const f = file.files && file.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { run(String(rd.result || '')); file.value = ''; };
      rd.onerror = () => toast(t('records.msg.importFailedNotValid'));
      rd.readAsText(f);
    });
    importBox.replaceChildren(
      h('h3', {}, t('records.import.title')), ta,
      h('div', { class: 'rec-row-btns' },
        button({ tier: 'primary', size: 'sm', label: t('records.import.run'), onClick: () => run(ta.value) }),
        button({ tier: 'secondary', size: 'sm', label: t('records.label.chooseFile'), iconName: 'download', onClick: () => file.click() }),
        file));
    setTimeout(() => ta.focus(), 30);
  }

  // ── 선택 막대: 선택 수 · 모두 선택 · 선택 삭제 · 내보내기 · 잠금 제외 전체 삭제 ──
  function renderSelBar() {
    const all = store.get().records;
    for (const id of [...selected]) if (!all.some((r) => String(r.id) === id)) selected.delete(id);
    const view = store.records.list();
    const n = selected.size;
    const allOn = view.length > 0 && view.every((r) => selected.has(String(r.id)));
    selBar.hidden = !all.length;
    const ids = () => [...selected];
    selBar.replaceChildren(
      h('div', { class: 'rec-selrow' },
        h('span', { class: 'rec-count' }, t('records.fmt.0Selected1Total', [n, all.length])),
        button({ tier: 'ghost', size: 'sm', label: t(allOn ? 'records.label.clearAll' : 'records.label.selectAll'),
          onClick: () => { if (allOn) view.forEach((r) => selected.delete(String(r.id))); else view.forEach((r) => selected.add(String(r.id))); renderAll(); } }),
        h('span', { class: 'rec-sel-gap' }),
        button({ tier: 'ghost', size: 'sm', label: t('records.deleteAll'), onClick: () => removeAllWithUndo() })),
      h('div', { class: 'rec-selrow', role: 'group', 'aria-label': t('records.export.title') },
        button({ tier: 'secondary', size: 'sm', label: t('records.label.copyCode'), iconName: 'copy', disabled: !n, title: n ? null : t('records.label.selectRecordsExportFirst'),
          onClick: async () => { const code = await store.records.exportCode(ids()); if (!code) return; if (await copyText(code)) toast(t('records.fmt.exported0RecordsFile', [n])); else showCodeSheet(ctx, code); } }),
        button({ tier: 'secondary', size: 'sm', label: t('records.label.saveFile'), iconName: 'download', disabled: !n, title: n ? null : t('records.label.selectRecordsExportFirst'),
          onClick: () => { download(`woofia_history_${stamp()}.json`, store.records.exportJson(ids())); toast(t('records.fmt.exported0RecordsFile', [n])); } }),
        h('span', { class: 'rec-sel-gap' }),
        button({ tier: 'danger', size: 'sm', label: t('records.label.deleteSelected'), iconName: 'trash-2', disabled: !n, onClick: () => removeWithUndo(ids()) })));
  }

  // 지우기는 확인 창 대신 되돌리기 토스트(지운 기록을 다시 병합).
  function undoToast(removed) {
    if (!removed.length) { toast(t('records.msg.noRecordsDeleteLocked')); return; }
    toast(t('records.deleted', { n: removed.length }), { duration: 8000, action: { label: t('top.undo'), fn: () => store.records.importJson(removed) } });
  }
  function removeWithUndo(ids) {
    const s = new Set([].concat(ids).map(String));
    const victims = store.get().records.filter((r) => s.has(String(r.id)) && !r.locked).map((r) => JSON.parse(JSON.stringify(r)));
    if (!victims.length && [...s].length) { toast(t('records.locked.noDelete')); return; }
    store.records.remove(ids);
    victims.forEach((r) => selected.delete(String(r.id)));
    undoToast(victims);
  }
  function removeAllWithUndo() {
    const victims = store.get().records.filter((r) => !r.locked).map((r) => JSON.parse(JSON.stringify(r)));
    store.records.removeExcept([]);
    selected.clear();
    undoToast(victims);
  }

  // ── 목록 ──
  function item(rec) {
    const id = String(rec.id);
    const label = recordLabel(rec, ctx);
    const active = store.get().activeRecId === rec.id;
    const check = h('input', { type: 'checkbox', checked: selected.has(id), 'aria-label': t('records.item.select', { name: label }) });
    check.addEventListener('change', () => { if (check.checked) selected.add(id); else selected.delete(id); renderSelBar(); });
    let main;
    if (renaming === id) {
      const inp = h('input', { class: 'rec-rename', type: 'text', value: rec.name || '', placeholder: t('records.label.newNameBlankDefault'), 'aria-label': t('records.item.rename.aria', { name: label }), dataset: { k: `rename-${id}` } });
      const done = (commit) => { if (renaming !== id) return; renaming = null; if (commit) store.records.rename(rec.id, inp.value); else renderList(); };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } });
      inp.addEventListener('blur', () => done(true));
      main = h('div', { class: 'rec-main' }, inp);
      setTimeout(() => { inp.focus(); inp.select(); }, 20);
    } else {
      main = h('div', { class: 'rec-main' },
        h('span', { class: 'rec-name' }, label),
        h('span', { class: 'rec-meta' },
          rec.pinned && h('span', { class: 'rec-badge' }, icon('pin'), t('records.label.pinned')),
          rec.locked && h('span', { class: 'rec-badge' }, icon('lock'), t('records.label.lock')),
          t('records.meta', { date: recDate(rec, ctx), total: fmtShort(rec.total || 0) })));
    }
    const more = button({ tier: 'ghost', iconName: 'ellipsis-vertical', iconOnly: true, label: t('records.item.more', { name: label }), dataset: { k: `more-${id}` } });
    more.addEventListener('click', () => {
      const m = menu(more, [
        { label: t(rec.pinned ? 'records.label.unpin' : 'records.label.pinTop'), iconName: 'pin', onSelect: () => store.records.pin(rec.id) },
        { label: t(rec.locked ? 'records.label.unlock' : 'records.label.lock'), iconName: 'lock', onSelect: () => store.records.lock(rec.id) },
        { label: t('records.label.rename'), iconName: 'settings-2', onSelect: () => { renaming = id; renderList(); } },
        'sep',
        { label: t('records.label.delete'), iconName: 'trash-2', danger: true, onSelect: () => removeWithUndo([rec.id]) },
      ]);
      m.el.classList.add('menu-over');
    });
    const load = button({ tier: active ? 'ghost' : 'secondary', size: 'sm', label: t('records.item.load'), dataset: { k: `load-${id}` },
      onClick: () => { restoreRecord(ctx, rec.id); sheet.close(); } });
    return h('li', { class: `rec-item${active ? ' active' : ''}`, dataset: { id, pinned: rec.pinned ? '1' : null, locked: rec.locked ? '1' : null } },
      h('label', { class: 'rec-check' }, check), main, load, more);
  }
  function renderList() {
    const all = store.get().records;
    const view = store.records.list();
    const focusK = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.k : null;
    const scroller = list.closest('.sheet-body');
    const top = scroller ? scroller.scrollTop : 0;
    if (!all.length) {
      list.replaceChildren(h('li', { class: 'rec-empty' }, empty(t('records.hint.noSavedRecords'),
        button({ tier: 'secondary', size: 'sm', label: t('records.label.import'), iconName: 'upload', onClick: () => { showImport = true; renderImport(); } }))));
    } else if (!view.length) {
      list.replaceChildren(h('li', { class: 'rec-empty' }, empty(t('records.msg.noMatchingRecords'),
        button({ tier: 'ghost', size: 'sm', label: t('team.roster.reset'), onClick: () => { search.value = ''; store.records.search(''); } }))));
    } else list.replaceChildren(...view.map(item));
    if (scroller) scroller.scrollTop = top;
    if (focusK) list.querySelector(`[data-k="${focusK}"]`)?.focus();
  }
  function renderAll() { renderSelBar(); renderList(); }

  const sheet = components.openSheet({ title: t('records.title'), body, size: '', ariaLabel: t('top.close'),
    onClose: () => { unsub(); offLang(); } });
  const unsub = store.subscribe((s) => [s.records.length, s.ui.histSort, s.ui.histSearch, s.activeRecId].join('|') + s.records.map((r) => `${r.id}${r.name || ''}${r.pinned ? 'p' : ''}${r.locked ? 'l' : ''}`).join(','), renderAll);
  const offLang = ctx.i18n.onChange(() => sheet.close());
  renderAll();
  return sheet;
}
