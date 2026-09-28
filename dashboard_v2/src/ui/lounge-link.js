// 메인 → XXL 라운지 연결(인계서 docs/community/HANDOFF_MAIN.md §2-2~2-4).
// 라운지는 빌드에서 빠질 수 있다(build_site_v2.sh 가 서버 주소가 없으면 lounge.html 을 제외) —
// 부팅 때 HEAD 한 번으로 있는지 보고, 없으면 라운지로 가는 버튼을 모두 숨긴다.
export const LOUNGE_PAGE = 'lounge.html';

let availP = null;
/** lounge.html 이 있으면 true. 결과는 한 번만 받아 모든 호출부가 공유한다(네트워크 오류 = 없음). */
export function loungeAvailable() {
  if (!availP) {
    // 로컬 개발 서버(server_v2.py)는 HEAD 를 모른다(501 — 콘솔 오류가 남는다) → 로컬은 처음부터 GET.
    // 그 밖에 HEAD 를 거절하는 서버도 GET 으로 한 번 더 본다. GitHub Pages 는 HEAD 를 받는다.
    const local = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    availP = fetch(LOUNGE_PAGE, { method: local ? 'GET' : 'HEAD', cache: 'no-cache' })
      .then((r) => ((r.status === 405 || r.status === 501) ? fetch(LOUNGE_PAGE, { cache: 'no-cache' }).then((g) => g.ok) : r.ok))
      .catch(() => false);
  }
  return availP;
}

/** el 을 우선 숨겨 두고, 라운지가 있으면 보인다. */
export function showWhenLounge(el) {
  if (!el) return el;
  el.hidden = true;
  loungeAvailable().then((ok) => { el.hidden = !ok; });
  return el;
}

/** 라운지 주소(인계서 형식 그대로). */
export const loungeHref = Object.freeze({
  home: () => LOUNGE_PAGE,
  teamNew: (code) => `${LOUNGE_PAGE}#/team/new?code=${encodeURIComponent(String(code || ''))}`,
  char: (id) => `${LOUNGE_PAGE}#/c/${encodeURIComponent(String(id))}`,
});
