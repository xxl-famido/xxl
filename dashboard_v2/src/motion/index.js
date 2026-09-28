// 모션 유틸 — Web Animations API. 모든 길이·이징은 tokens.css 변수에서 읽는다(디자인 원칙 8).
// reduced-motion 이면 이동을 빼고 페이드만 남긴다. 장식용 반복 모션은 여기 두지 않는다.

const css = (name, fallback) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};
const ms = v => (v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000);

export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const dur = key => ms(css(`--dur-${key}`, '200ms'));           // instant | fast | base | slow
export const ease = key => css(`--ease-${key}`, 'cubic-bezier(0.2,0,0,1)');   // standard | enter | exit

/** 요소 하나를 페이드+살짝 위로. 등장/퇴장 공용. */
export function fade(el, { out = false, y = 8 } = {}) {
  const from = { opacity: 0, transform: reduced() ? 'none' : `translateY(${y}px)` };
  const to = { opacity: 1, transform: 'none' };
  return el.animate(out ? [to, from] : [from, to], { duration: dur(out ? 'base' : 'slow'), easing: ease(out ? 'exit' : 'enter'), fill: 'both' }).finished;
}

/** FLIP: 같은 컨테이너 안에서 순서가 바뀐 요소들을 이전 위치 → 새 위치로 미끄러뜨린다. */
export function flip(container, mutate, { duration = dur('base') } = {}) {
  const items = [...container.children];
  const before = new Map(items.map(el => [el, el.getBoundingClientRect()]));
  mutate();
  if (reduced()) return Promise.resolve();
  const anims = [];
  for (const el of container.children) {
    const b = before.get(el); if (!b) { anims.push(fade(el)); continue; }
    const a = el.getBoundingClientRect();
    const dx = b.left - a.left, dy = b.top - a.top;
    if (!dx && !dy) continue;
    anims.push(el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration, easing: ease('standard') }).finished);
  }
  return Promise.all(anims);
}

/** 로스터 타일 이미지가 슬롯으로 날아가 안착. from/to 는 DOM 요소. */
export async function flyTo(fromEl, toEl, imgSrc) {
  if (reduced() || !fromEl || !toEl) return;
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
  const ghost = document.createElement('img');
  ghost.src = imgSrc; ghost.className = 'fly'; ghost.alt = '';
  Object.assign(ghost.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
  document.body.appendChild(ghost);
  await ghost.animate([
    { transform: 'none', opacity: 1 },
    { transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${b.width / a.width})`, opacity: 1, offset: .85 },
    { transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${b.width / a.width})`, opacity: 0 },
  ], { duration: dur('slow'), easing: ease('enter'), fill: 'forwards' }).finished;
  ghost.remove();
  toEl.closest('.slot')?.classList.add('landed');
  setTimeout(() => toEl.closest('.slot')?.classList.remove('landed'), dur('slow') + 50);
}

/** 숫자 롤업 0 → value. 표시 형식은 fmt 콜백. */
export function rollup(el, value, fmt, { duration = 700 } = {}) {
  if (reduced() || !Number.isFinite(value)) { el.textContent = fmt(value); return Promise.resolve(); }
  const t0 = performance.now();
  return new Promise(res => {
    const step = now => {
      const p = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - p, 4);            // expo-ish out
      el.textContent = fmt(value * e);
      if (p < 1) requestAnimationFrame(step); else { el.textContent = fmt(value); res(); }
    };
    requestAnimationFrame(step);
  });
}

/** 패널 스태거 진입: 자식들에 --i 를 매기고 .enter 를 잠깐 붙인다. */
export function stagger(els, { base = 0 } = {}) {
  els.forEach((el, i) => { el.style.setProperty('--i', String(base + i)); el.classList.add('enter'); });
  const total = dur('slow') + (base + els.length) * 40;
  setTimeout(() => els.forEach(el => { el.classList.remove('enter'); el.style.removeProperty('--i'); }), total + 50);
  return new Promise(r => setTimeout(r, total));
}

/** 결과 공개 오케스트레이션(§6). parts: { num, value, fmt, strip, contrib, band } */
export async function revealResult({ num, value, fmt, strip, contrib, band, bandPct }) {
  if (strip) { [...strip.children].forEach((el, i) => el.style.setProperty('--i', String(i))); strip.classList.add('reveal'); }
  if (contrib) { [...contrib.querySelectorAll('li')].forEach((el, i) => el.style.setProperty('--i', String(i))); contrib.classList.add('reveal'); }
  if (band) requestAnimationFrame(() => { band.style.left = `${bandPct}%`; });
  if (num) await rollup(num, value, fmt);
  setTimeout(() => { strip?.classList.remove('reveal'); contrib?.classList.remove('reveal'); }, 1600);
}

/** 아코디언 details 열고 닫기(높이 전환). */
export function accordion(details) {
  details.addEventListener('toggle', () => {
    if (reduced()) return;
    if (details.open) { details.classList.add('opening'); setTimeout(() => details.classList.remove('opening'), dur('base')); }
  });
}

/** 테마 전환 시 색 크로스페이드. */
export function themeFade(apply) {
  const html = document.documentElement;
  html.classList.add('theming'); apply();
  setTimeout(() => html.classList.remove('theming'), dur('base') + 20);
}

/** 미리보기 칸 갱신: 바뀐 칸만 하이라이트. prev/next 는 클래스 문자열 배열. */
export function flashChanged(cells, prev, next) {
  cells.forEach((el, i) => { if (prev[i] !== next[i]) { el.classList.remove('changed'); void el.offsetWidth; el.classList.add('changed'); } });
}
