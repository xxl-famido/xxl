// 새 배포 감지 — version.json 을 주기적으로 확인해, 불러온 뒤 새로 배포됐거나(또는 옛 캐시를 쓰는 중이면)
// 화면 아래에 고정 알림을 띄운다. 누르면 캐시를 우회해 다시 불러온다. 로컬(version.json 없음)은 조용히 무시.
import { h, icon } from './components.js';

const BUILD_VERSION = '__BUILD_VERSION__';          // 빌드(build_site_v2.sh)가 배포 버전으로 치환
const NOT_BUILT = '__BUILD' + '_VERSION__';          // 치환 여부 판별용(치환 대상과 겹치지 않게 분리)
const INTERVAL = 5 * 60 * 1000;

export function install(ctx) {
  const { t } = ctx;
  let loaded = null, busy = false, shown = false;

  async function hardReload(el) {
    el.classList.add('busy');
    el.querySelector('span').textContent = t('update.reloading');
    try {
      if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
      await Promise.all([location.href, 'index.html', 'app.css', 'motion.css', 'tokens.css', 'src/main.js', 'sim-worker.js']
        .map(u => fetch(u, { cache: 'reload' }).catch(() => {})));
    } catch { /* 우회 실패해도 다시 불러오기는 진행 */ }
    location.reload();
  }

  function notify(stale) {
    if (shown) return; shown = true;
    const el = h('button', { type: 'button', class: 'up-toast', onClick: () => hardReload(el) },
      icon('rotate-ccw'), h('span', {}, t(stale ? 'update.stale' : 'update.new')));
    document.body.append(el);
  }

  const check = () => {
    if (busy || shown) return; busy = true;
    fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(v => {
        const cur = v && v.updated;
        if (!cur) return;
        if (loaded === null) {
          loaded = cur;
          if (BUILD_VERSION !== NOT_BUILT && BUILD_VERSION !== cur) notify(true);
        } else if (cur !== loaded) notify(false);
      })
      .catch(() => {})
      .finally(() => { busy = false; });
  };
  check();
  setInterval(check, INTERVAL);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}
