// 모바일 하단 고정 실행 바 — 마지막 결과(만/억) + 「시뮬레이션 실행」. 실행은 cond.js 가 등록한 ctx.run 과 같은 흐름.
// 데스크톱에서는 app.css 가 숨긴다(.runbar display:none, 900px 이하에서만 표시).
import { fmtShort } from '../core/format.js';

export async function mount(host, ctx) {
  const { store, t, i18n, components: C } = ctx;
  const { h } = C;
  C.ensureStyle('css/results.css');
  let off = [];

  function build() {
    off.forEach(f => f && f()); off = [];
    const val = h('b', {}, '—');
    const last = h('span', { class: 'runbar-last' }, val, h('small', {}, t('runbar.last')));
    const prog = h('i', { class: 'prog', 'aria-hidden': 'true' });
    const label = h('span', {}, t('cond.run'));
    const btn = h('button', { type: 'button', class: 'btn btn-primary btn-lg btn-run', onClick: () => ctx.run?.() }, prog, C.icon('play'), label);
    host.replaceChildren(last, btn);

    const paint = () => {
      const d = store.get().result;
      const m = d && d.meta;
      const v = m ? (m.runs > 1 ? (m.totalMid ?? m.total) : m.total) : null;
      val.textContent = v == null ? '—' : fmtShort(v);
      last.hidden = v == null;
    };
    const onRun = st => {
      btn.classList.toggle('running', !!st.running);
      if (st.running) { btn.setAttribute('aria-busy', 'true'); prog.style.setProperty('--p', `${(st.p * 100).toFixed(1)}%`); label.textContent = t('cond.run.progress', { n: st.n, total: st.total }); }
      else { btn.removeAttribute('aria-busy'); prog.style.setProperty('--p', '0%'); label.textContent = t('cond.run'); }
    };
    off.push(store.subscribe(s => s.result, paint));
    // cond.js 가 먼저 마운트되지만, 없더라도 버튼은 동작하도록 느슨하게 연결
    if (ctx.onRun) off.push(ctx.onRun(onRun));
    paint();
  }

  build();
  i18n.onChange?.(build);
}
