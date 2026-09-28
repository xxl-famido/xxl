// 결과 — 헤드라인(중앙값)·확률 범위·턴별 데미지 스트립·동료별 데미지·전투 로그(ui/log.js). ARCHITECTURE §6 결과 공개 · §7 E.
// 수치 기준(COPY_AUDIT F-1/F-2/F-5, sim_api.py):
//   헤드라인 = meta.totalMid(중앙값), 밴드 = meta.totalFloor~totalCeil(확률 효과 전부 미발동~전부 발동),
//   확률 편차 = (천장−바닥)/2/중앙값, 턴별 막대·동료별 = 반복 평균, 로그 = 총 데미지가 '평균'에 가장 가까운 1회.
// 필살기 사용 턴 강조는 로그 표본에서 그 턴에 동료의 필살기 행동이 있었는지로 판정한다.
import { shortName } from '../core/format.js';
import { fmt, fmtShort, role as roleKey, DUMMY_EL } from '../core/format.js';
import { createLog, groupTurns } from './log.js';
import { encodeShare } from '../core/codec.js';
import { loungeHref, showWhenLounge } from './lounge-link.js';

export async function mount(host, ctx) {
  const { store, t, i18n, components: C, motion } = ctx;
  const { h } = C;
  C.ensureStyle('css/results.css');
  let current = null;
  let refs = {};

  const nameOf = id => shortName(i18n.nameOf ? i18n.nameOf(id) : String(id));
  const tr = s => (i18n.translateEngine ? i18n.translateEngine(s) : String(s ?? ''));
  const roleText = kr => { const k = roleKey(kr); return k ? t(`role.${k}`) : tr(kr); };

  // ── 머리 ──
  function whenText(d) {
    const m = d.meta, c = d.cond || {};
    const cur = store.get().cond;
    const dummies = c.dummies ?? +cur.dummies, el = c.dummyElement ?? +cur.dummyElement;
    const forced = c.forceProc ?? (m.runs === 1 && !!cur.forceProc);
    const elKey = +el ? DUMMY_EL[+el] : 'none';
    const elLabel = +el ? t(`element.${elKey}`) : t('element.none.long');
    const altar = m.altar ? t('result.altar.on', { star: m.altar.star, moon: m.altar.moon }) : t('result.altar.off');
    // 속성 이름만 속성색 노드로 끼운다 — 자리표시 문자로 번역문을 나눈 뒤 사이에 넣는다(언어별 어순 유지)
    const MARK = '';
    const [pre, ...rest] = t(forced ? 'result.when.forced' : 'result.when', { turns: m.turns, runs: m.runs, n: dummies, element: MARK, altar }).split(MARK);
    const main = rest.length ? [pre, C.elTag(elKey, elLabel), rest.join(elLabel)] : [pre];
    const strip = s => String(s).replace(/^\s*·\s*/, '');
    const extra = [];
    if (c.incoming) extra.push(t('cond.sum.incoming', { n: c.incoming }));
    if (c.hp10) extra.push(t('cond.sum.hp10'));
    if (m.sync || (m.altar && m.altar.groups)) extra.push(strip(t('altar.result.groups', [m.sync || m.altar.groups])));
    if (m.cdAssist && m.cdAssist.uses > 0) extra.push(strip(t('altar.result.assist', [+(+m.cdAssist.uses).toFixed(1), Math.round(m.cdAssist.prob * 1000) / 10])));
    if (m.turnDamage) extra.push(m.turnDamage.uniform ? t('tdmg.result', [m.turnDamage.max]) : t('tdmg.result.range', [m.turnDamage.min, m.turnDamage.max]));
    return { main, extra: extra.join(' · ') };
  }

  // ── 렌더 ──
  function render(d, { animate }) {
    current = d;
    if (!d || !d.meta) { host.hidden = true; host.replaceChildren(); return; }
    host.hidden = false;
    const m = d.meta, multi = m.runs > 1;
    const total = multi ? (m.totalMid ?? m.total) : m.total;
    const dps = multi ? (m.dpsMid ?? m.dps) : m.dps;
    const floor = m.totalFloor ?? m.total, ceil = m.totalCeil ?? m.total;
    const spread = total ? (ceil - floor) / 2 / total * 100 : 0;
    const bandPct = ceil > floor ? Math.max(0, Math.min(100, (total - floor) / (ceil - floor) * 100)) : 50;
    const turns = groupTurns(d.log);
    const w = whenText(d);

    // 머리
    const exportBtn = C.button({ tier: 'ghost', size: 'sm', iconName: 'download', label: t('result.export'), onClick: openExport });
    exportBtn.disabled = !store.get().activeRecId;
    const head = h('div', { class: 'result-head' },
      h('h2', { id: 'result-h' }, t('result.title')),
      h('span', { class: 'result-when' }, w.main, w.extra && h('small', {}, ` · ${w.extra}`)),
      h('div', { class: 'panel-tools' }, exportBtn, loungeShareBtn()));

    // 헤드라인
    const num = h('p', { class: 'hero-num' }, animate ? '0' : fmt(total));
    const bandPt = h('span', { class: 'band-pt', style: { left: animate ? '0%' : `${bandPct}%` } });
    const bandHelp = h('button', { type: 'button', class: 'help', 'aria-label': t('result.band.help.aria') }, '?');
    C.tooltip(bandHelp, t('result.band.help'));
    const spreadHelp = h('button', { type: 'button', class: 'help', 'aria-label': t('result.stat.spread.help.aria') }, '?');
    C.tooltip(spreadHelp, t('result.stat.spread.help'));
    const hero = h('div', { class: 'hero' },
      h('div', { class: 'hero-main' },
        h('div', { class: 'hero-row' }, num, h('span', { class: 'hero-short' }, fmtShort(total))),
        h('p', { class: 'hero-label' }, multi ? t('result.headline.median', { runs: m.runs }) : t('result.headline.forced'))),
      h('div', { class: 'hero-band', role: 'img', 'aria-label': t('result.band.aria', { min: fmt(floor), max: fmt(ceil) }) },
        h('span', { class: 'band-min' }, fmtShort(floor)),
        h('span', { class: 'band-track' }, h('span', { class: 'band-fill' }), bandPt),
        h('span', { class: 'band-max' }, fmtShort(ceil)),
        h('span', { class: 'band-cap' }, t('result.band.caption'), bandHelp)),
      h('dl', { class: 'hero-side' },
        h('div', {}, h('dt', {}, t('result.stat.perTurn')), h('dd', {}, fmt(dps))),
        h('div', {}, h('dt', {}, t('result.stat.spread'), spreadHelp), h('dd', {}, `±${spread.toFixed(1)}%`))));

    // 턴별 스트립
    const chart = d.chart || [];
    const n = chart.length || m.turns;
    const cmax = Math.max(1, ...chart.map(c => c.total || 0));
    const idByName = Object.fromEntries((d.team || []).map(x => [x.name, x.id]));
    const ultTurns = chart.filter(c => (turns.get(c.turn) || {}).ult).map(c => c.turn);
    const tip = h('div', { class: 'strip-tip', role: 'tooltip', hidden: true });
    const strip = h('div', { class: 'turn-strip', style: { gridTemplateColumns: `repeat(${n}, 1fr)` }, role: 'group',
      'aria-label': t('result.strip.aria', { turns: n, list: ultTurns.join('·') || '-' }) });
    let tapped = null;
    chart.forEach(c => {
      const ult = ultTurns.includes(c.turn);
      const hPct = Math.max(1.5, (c.total || 0) / cmax * 100);
      const b = h('button', { type: 'button', class: 'tb', dataset: { turn: c.turn },
        'aria-label': `${t('tdmg.turn', [c.turn])} ${fmt(c.total)}${ult ? ` · ${t('result.strip.legend.ult')}` : ''}` },
        h('i', { class: ult ? 'ult' : '', style: `--h:${hPct}%` }));
      const show = () => showTip(tip, strip, b, c, ult, idByName);
      b.addEventListener('mouseenter', show); b.addEventListener('focus', show);
      b.addEventListener('mouseleave', () => { tip.hidden = true; });
      b.addEventListener('blur', () => { tip.hidden = true; });
      b.addEventListener('pointerdown', e => { b._touch = e.pointerType === 'touch'; });
      b.addEventListener('click', () => {
        if (b._touch && tapped !== b) { tapped = b; show(); return; }      // 터치: 첫 탭 = 툴팁, 두 번째 탭 = 로그로
        tapped = null; tip.hidden = true; jumpToTurn(c.turn);
      });
      strip.append(b);
    });
    const axis = h('div', { class: 'turn-axis', style: { gridTemplateColumns: `repeat(${n}, 1fr)` } },
      ...ticks(n).map(k => h('span', { style: { gridColumn: String(k) } }, String(k))));
    const fig = h('figure', { class: 'turns' },
      h('figcaption', {}, t('result.strip.title'), h('small', { class: 'cap-note' }, t('result.avg.note', { runs: m.runs })),
        h('span', { class: 'legend' }, h('i', { class: 'lg-ult' }), t('result.strip.legend.ult'))),
      h('div', { class: 'strip-wrap' }, strip, tip), axis);

    // 동료별
    const per = d.perChar || [];
    const pmax = Math.max(1, ...per.map(c => c.damage || 0));
    const contrib = h('div', { class: 'contrib' },
      h('h3', {}, t('result.char.title'), h('small', { class: 'cap-note' }, t('result.avg.note', { runs: m.runs }))),
      h('ol', {}, ...per.map(c => {
        const wPct = (c.damage || 0) / pmax * 100;
        const sub = [c.healing ? t('result.char.heal', { v: fmtShort(c.healing) }) : '', c.barrier ? t('result.char.barrier', { v: fmtShort(c.barrier) }) : ''].filter(Boolean).join(' · ');
        return h('li', {},
          h('img', { src: `icons/${c.id}.png`, alt: '', loading: 'lazy' }),
          h('span', { class: 'c-name' }, nameOf(c.id), h('small', {}, roleText(c.role)), sub && h('small', { class: 'c-sub' }, sub)),
          h('span', { class: 'c-bar' }, h('i', { style: `--w:${animate ? 0 : wPct}%`, dataset: { w: wPct } })),
          h('span', { class: 'c-val' }, fmt(c.damage)),
          h('span', { class: 'c-pct' }, `${c.share}%`));
      })));

    // 로그(턴 목록 + 상세 패널, ui/log.js)
    const log = createLog(ctx, d);

    host.replaceChildren(head, hero, fig, contrib, log.el);
    refs = { log, strip };

    if (animate) {
      void bandPt.getBoundingClientRect();                 // 시작 위치를 한 번 그려야 left 전환이 재생된다
      requestAnimationFrame(() => contrib.querySelectorAll('.c-bar i').forEach(i => i.style.setProperty('--w', `${i.dataset.w}%`)));
      motion.revealResult({ num, value: total, fmt, strip, contrib, band: bandPt, bandPct });
    }
  }

  function ticks(n) {
    const out = [1];
    for (let k = 5; k <= n; k += 5) out.push(k);
    if (n > 1 && n - out[out.length - 1] >= 2) out.push(n);
    return out;
  }

  function showTip(tip, strip, btn, c, ult, idByName) {
    const rows = Object.entries(c.byActor || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
    tip.replaceChildren(
      h('div', { class: 'st-h' }, h('b', {}, t('tdmg.turn', [c.turn])), h('span', {}, fmt(c.total))),
      ult && h('div', { class: 'st-ult' }, t('result.strip.legend.ult')),
      ...rows.map(([nm, v]) => h('div', { class: 'st-r' }, h('span', {}, idByName[nm] ? nameOf(idByName[nm]) : tr(nm)), h('span', {}, fmt(v)))),
      !rows.length && h('div', { class: 'st-r' }, t('result.msg.noDamage')),
      h('div', { class: 'st-hint' }, t('result.strip.tipHint')));
    tip.hidden = false;
    const sr = strip.getBoundingClientRect(), br = btn.getBoundingClientRect();
    const x = br.left - sr.left + br.width / 2;
    tip.style.left = `${Math.max(0, Math.min(sr.width - tip.offsetWidth, x - tip.offsetWidth / 2))}px`;
  }

  function jumpToTurn(turn) {
    const log = refs.log; if (!log) return;
    const target = log.open(turn);
    if (target) target.scrollIntoView({ behavior: motion.reduced() ? 'auto' : 'smooth', block: 'start' });
  }

  // ── XXL 라운지 팀 공유에 올리기(인계서 §2-3) ──
  // 기록 내보내기 뒤에 둔다(activeRecId 구독이 머리의 첫 .btn = 내보내기를 켜고 끈다). lounge.html 이 없으면 숨김.
  function loungeShareBtn() {
    return showWhenLounge(C.button({ tier: 'ghost', size: 'sm', iconName: 'upload', label: t('result.share.lounge'),
      title: t('result.share.lounge.tip'), 'data-lounge-share': '', onClick: shareToLounge }));
  }
  // 공유 코드: 화면 편성이 활성 기록과 같으면 그 기록 그대로(이름·총합 보존), 아니면 지금 편성 + 지금 결과 총합으로 만든다.
  async function shareToLounge() {
    const st = store.get();
    const snap = store.snapshot();
    let code = '';
    try {
      const rec = st.activeRecId ? st.records.find((r) => r.id === st.activeRecId) : null;
      if (rec && JSON.stringify(rec.snap) === JSON.stringify(snap)) code = await store.records.exportCode([rec.id]);
      if (!code) {
        const m = (current && current.meta) || {};
        const total = Math.round(+(m.runs > 1 ? (m.totalMid ?? m.total) : m.total) || 0);
        code = await encodeShare([{ id: Date.now(), total, snap }]);
      }
    } catch { code = ''; }
    if (!code) { C.toast(t('result.share.lounge.fail')); return; }
    location.href = loungeHref.teamNew(code);
  }

  // ── 기록 내보내기 ──
  async function openExport() {
    const id = store.get().activeRecId;
    if (!id) return;
    const json = store.records.exportJson([id]);
    let code = '';
    try { code = await store.records.exportCode([id]); } catch { code = ''; }
    const area = h('textarea', { class: 'io-code', readonly: true, rows: 4, 'aria-label': t('records.label.shareCode') }, code);
    const body = h('div', { class: 'io-sheet' },
      C.button({ tier: 'secondary', iconName: 'download', label: t('records.label.saveFile'), onClick: () => {
        const blob = new Blob([json], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `woofia_records_${new Date().toISOString().slice(0, 10)}.json` });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        C.toast(t('records.fmt.exported0RecordsFile', [1]));
      } }),
      h('p', { class: 'hint' }, t('records.label.shareCode')),
      area,
      C.button({ tier: 'secondary', iconName: 'copy', label: t('records.label.copyCode'), disabled: !code, onClick: async () => {
        try { await navigator.clipboard.writeText(code); } catch { area.select(); document.execCommand('copy'); }
        C.toast(t('records.msg.codeCopiedOthersCan'));
      } }));
    C.openSheet({ title: t('result.export'), body, ariaLabel: t('common.close') });
  }

  store.subscribe(s => s.result, d => render(d, { animate: !!d }));
  store.subscribe(s => s.activeRecId, () => { const b = host.querySelector('.result-head .btn'); if (b) b.disabled = !store.get().activeRecId; });
  i18n.onChange?.(() => { if (current) render(current, { animate: false }); });
  render(store.get().result, { animate: false });

  // 팀 비교: topbar 가 install 을 부르지 않은 경우를 대비해 한 번 등록(ctx.openCompare 가 없을 때만)
  import('./compare.js').then(mod => { if (!ctx.openCompare) mod.install(ctx); }).catch(err => console.error('[compare]', err));
}
