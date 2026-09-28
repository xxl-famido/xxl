/**
 * lounge/thread.js — 의견 스레드(동료 게시판·티어표·팀 공유 공용).
 *
 * - 댓글 → 답글 2단계. 답글의 답글은 같은 답글 목록에 '@익명의 ○○'를 붙여 잇는다.
 * - 좋아요 수는 보이고 싫어요 수는 안 보인다. 추천순은 (좋아요 − 싫어요) 높은 순 → 점수 낮은 글은 아래로.
 * - 4자리 비밀번호: 수정·삭제·이어 쓰기. 이어 쓰기를 확인하면 이 탭이 열려 있는 동안 그 스레드에서 같은 이름으로 쓴다.
 */
import * as api from './api.js';
import { flip } from '../motion/index.js';
import { spamReason, OPERATOR } from './shared.js';
import { t, locale, tagLabel, spamText } from './i18n.js';
import { cooldownButton, isCooling, writeError, reveal, h, icon, avatar, anonName, ago, buildChip, toast, askPin, askConfirm, menuButton, votes, clampText, emptyState, skeleton, seg, pinField, reducedMotion } from './ui.js';

const { POST_TAGS } = api;   // 태그 목록은 서버와 공용(shared.js)
const AS_KEY = 'woofia_lounge_as';

const asMap = () => { try { return JSON.parse(sessionStorage.getItem(AS_KEY) || '{}'); } catch { return {}; } };
const getAs = (key) => asMap()[key] || null;
function setAs(key, v) { const m = asMap(); if (v) m[key] = v; else delete m[key]; sessionStorage.setItem(AS_KEY, JSON.stringify(m)); }

let seq = 0;

/**
 * @param {{key:string, owner?:{anon:number, anonNo:number}, withTags?:boolean, title?:string, onCount?:(n:number)=>void}} opt
 */
export function threadView(opt) {
  const state = { sort: 'best', tag: null, replyOpen: null };
  const root = h('section', { class: 'lg-thread', 'aria-label': opt.title || t('thread.title') });
  const countEl = h('span', { class: 'lg-count' });
  const list = h('div', { class: 'lg-posts' });
  const tagBar = opt.withTags ? h('div', { class: 'lg-tagbar', role: 'group', 'aria-label': t('thread.tagFilter.aria') }) : null;

  const head = h('div', { class: 'lg-thread-head' },
    h('h2', {}, opt.title || t('thread.title'), ' ', countEl),
    seg(t('sort.aria'), [{ value: 'best', label: t('sort.best') }, { value: 'new', label: t('sort.new') }], state.sort, (v) => { state.sort = v; load(null, true); }));

  if (tagBar) {
    const all = h('button', { class: 'lg-tag', 'aria-pressed': 'true' }, t('common.all'));
    const btns = [all, ...POST_TAGS.map((tg) => h('button', { class: 'lg-tag', 'aria-pressed': 'false', 'data-tag': tg }, tagLabel(tg)))];
    btns.forEach((b) => b.addEventListener('click', () => {
      state.tag = b.dataset.tag || null;
      btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      load(null, true);
    }));
    tagBar.append(...btns);
  }

  root.append(...[composer({ key: opt.key, withTags: opt.withTags, placeholder: opt.placeholder, onPosted: (p) => load(p.id) }), head, tagBar, list].filter(Boolean));

  /**
   * reorder=true(정렬·태그 전환)면 기존 블록을 id 로 재사용해 새 순서로 미끄러뜨린다(FLIP) — 점수 낮은 글이 아래로 가라앉는 게 눈에 보인다.
   * 첫 로드는 스켈레톤 → 위에서부터 차례로 등장.
   */
  async function load(flashId, reorder = false) {
    const first = !list.querySelector('.lg-post-block');
    if (first) list.replaceChildren(skeleton(5));
    let posts;
    try { posts = await api.thread(opt.key, state.sort); } catch (e) { list.replaceChildren(emptyState(t('thread.loadFail'), null)); return; }
    // 고정 글은 태그 필터와 무관하게 항상 보인다(맨 위 고정 보장)
    const visible = posts.filter((p) => p.pinned || !state.tag || (p.tags || []).includes(state.tag));
    const n = posts.reduce((s, p) => s + (p.deleted ? 0 : 1) + p.replies.filter((r) => !r.deleted).length, 0);
    countEl.textContent = String(n);
    opt.onCount?.(n);
    if (!visible.length) {
      list.replaceChildren(emptyState(state.tag ? t('thread.emptyTag', { tag: tagLabel(state.tag) }) : t('thread.empty')));
      return;
    }
    const old = new Map([...list.querySelectorAll(':scope > .lg-post-block')].map((b) => [b.dataset.key, b]));
    const build = () => list.replaceChildren(...visible.map((p) => (reorder && old.get(p.id)) || postBlock(p)));
    if (reorder && !first) await flip(list, build);
    else { build(); if (first) reveal(list.querySelectorAll(':scope > .lg-post-block, .lg-replies > .lg-post')); }
    if (flashId) {
      const el = list.querySelector(`[data-id="${flashId}"]`);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
        if (!reducedMotion()) el.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0, 0, 0, 1)' });
        el.classList.add('lg-new');
        setTimeout(() => el.classList.remove('lg-new'), 1600);
      }
    }
  }

  function isOwner(p) { return opt.owner && p.anon === opt.owner.anon && p.anonNo === opt.owner.anonNo; }
  function isMe(p) { if (p.op) return false; const a = getAs(opt.key); return a && a.anon === p.anon && a.anonNo === p.anonNo; }

  function postBlock(p) {
    const wrap = h('article', { class: `lg-post-block${p.pinned ? ' is-pinned' : ''}`, 'data-key': p.id, 'aria-label': p.pinned ? t('post.pinned.aria') : null });
    wrap.append(postItem(p, p));
    const replies = h('div', { class: 'lg-replies' }, p.replies.map((r) => postItem(r, p, true)));
    if (p.replies.length || state.replyOpen === p.id) wrap.append(replies);
    return wrap;

    function postItem(x, top, isReply = false) {
      const nameRow = h('div', { class: 'lg-post-name' },
        h('b', { class: x.op ? 'lg-op-name' : '' }, anonName(x.anon, x.anonNo, x.op)),
        !isReply && x.pinned && h('span', { class: 'lg-chip lg-chip-pin' }, icon('pin'), t('chip.pinned')),
        isOwner(x) && h('span', { class: 'lg-chip lg-chip-accent' }, t('chip.author')),
        isMe(x) && h('span', { class: 'lg-chip' }, t('chip.me')),
        h('span', { class: 'lg-post-meta' }, h('time', { datetime: new Date(x.at).toISOString(), title: new Date(x.at).toLocaleString(locale()) }, ago(x.at)), x.edited && ' · ' + t('chip.edited')),
        buildChip(x.build));
      if (x.deleted) {
        return h('div', { class: `lg-post ${isReply ? 'is-reply' : ''}`, 'data-id': x.id },
          h('div', { class: 'lg-av lg-av-gone', style: { width: isReply ? '24px' : '32px', height: isReply ? '24px' : '32px' } }),
          h('div', { class: 'lg-post-main' }, h('p', { class: 'lg-body lg-deleted' }, t('post.deleted'))));
      }
      const bodyText = x.body;
      const mention = x.replyTo ? h('span', { class: 'lg-mention' }, '@' + anonName(x.replyTo, 1, x.replyTo === OPERATOR.anon) + ' ') : null;
      const [bodyEl, more] = clampText(bodyText, 6);
      if (mention) bodyEl.prepend(mention);
      const tags = (x.tags || []).length ? h('div', { class: 'lg-post-tags' }, x.tags.map((tg) => h('span', { class: 'lg-chip' }, tagLabel(tg)))) : null;
      const main = h('div', { class: 'lg-post-main' }, nameRow, tags, bodyEl, more);
      const actions = h('div', { class: 'lg-actions' },
        votes('post:' + x.id, x),
        h('button', { class: 'lg-act', onclick: () => openReply(top, isReply ? x : null) }, icon('corner-down-right'), isReply || !top.replies.length ? t('post.reply') : t('post.replyN', { n: top.replies.filter((r) => !r.deleted).length })),
        menuButton(t('common.more'), [
          !x.op && { label: t('post.continueAs'), icon: 'key-round', run: () => continueAs(x) },
          !isReply && api.isOperator() && { label: x.pinned ? t('post.unpin') : t('post.pin'), icon: 'pin', run: () => togglePin(x) },   // 운영자에게만 보임
          (!x.pinned || api.isOperator()) && { label: t('common.edit'), icon: 'pencil', run: () => startEdit(x, main, bodyEl, more) },
          (!x.pinned || api.isOperator()) && { label: t('common.delete'), icon: 'trash-2', danger: true, run: () => del(x) },
          'sep',
          { label: t('common.report'), icon: 'flag', run: () => doReport(x) },
        ]));
      main.append(actions);
      return h('div', { class: `lg-post ${isReply ? 'is-reply' : ''}`, 'data-id': x.id }, avatar(x.anon, isReply ? 24 : 32), main);
    }

    function openReply(top, target) {
      state.replyOpen = top.id;
      if (!wrap.contains(replies)) wrap.append(replies);
      replies.querySelector('.lg-composer')?.remove();
      const c = composer({ key: opt.key, parent: top.id, replyTo: target ? target.anon : null, compact: true,
        placeholder: target ? t('post.replyTo.ph', { name: anonName(target.anon, target.anonNo, target.op) }) : t('post.reply.ph'),
        onPosted: (np) => { state.replyOpen = null; load(np.id); }, onCancel: () => { c.remove(); state.replyOpen = null; } });
      replies.append(c);
      c.querySelector('textarea').focus();
    }
  }

  async function continueAs(x) {
    const r = await askPin({ title: t('post.continueAs'), desc: t('post.continueAs.desc', { name: anonName(x.anon, x.anonNo) }),
      check: async (pin) => { const who = await api.verifyPin(x.id, pin); return { ...who, postId: x.id, pin }; } });
    if (!r) return;
    setAs(opt.key, r);
    toast(t('post.continueAs.done', { name: anonName(r.anon, r.anonNo) }));
    root.querySelector('.lg-composer')?.dispatchEvent(new Event('lg-as'));
    load();
  }

  async function startEdit(x, main, bodyEl, more) {
    const pin = await askPin({ title: t('post.edit.title'), desc: t('pin.askWritten'), check: async (p) => { await api.verifyPin(x.id, p); return p; } });
    if (!pin) return;
    const ta = h('textarea', { class: 'lg-textarea', rows: 4, maxlength: api.LIMITS.post }, x.body);
    const box = h('div', { class: 'lg-edit' }, ta, h('div', { class: 'lg-edit-foot' },
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => load() }, t('common.cancel')),
      h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
        const why = spamReason(ta.value);
        if (why) { toast(spamText(why)); return; }
        try { await api.editPost(x.id, pin, ta.value); toast(t('toast.edited')); load(x.id); } catch (e) { toast(e.message); }
      } }, t('common.save'))));
    bodyEl.replaceWith(box); more.remove();
    main.querySelector('.lg-actions')?.remove();
    ta.focus();
  }

  async function del(x) {
    const ok = await askPin({ title: t('post.delete.title'), desc: t('post.delete.desc'), confirm: t('common.delete'), danger: true,
      check: async (pin) => { await api.deleteItem(x.id, pin); return true; } });
    if (ok) { toast(t('toast.deleted')); load(); }
  }

  async function togglePin(x) {
    // 고정 표시(테두리)까지 반영되게 새로 그린다
    try { await api.pinPost(x.id, !x.pinned); toast(x.pinned ? t('toast.unpinned') : t('toast.pinned')); load(x.id); } catch (e) { toast(e.message); }
  }

  async function doReport(x) {
    const ok = await askConfirm({ title: t('common.report'), desc: t('report.post.desc'), confirm: t('common.report') });
    if (!ok) return;
    toast((await api.report('post:' + x.id)) ? t('toast.reported') : t('toast.reportedAlready'));
  }

  load();
  return root;
}

/**
 * 작성 칸. 이어 쓰기 중이면 비밀번호 칸 대신 '익명의 ○○(으)로 작성 중'을 보이고, 새 글도 같은 비밀번호로 저장한다.
 */
function composer({ key, parent = null, replyTo = null, withTags = false, compact = false, placeholder, onPosted, onCancel }) {
  const id = 'cmp' + (++seq);
  const ta = h('textarea', { class: 'lg-textarea', id: id + '-t', rows: compact ? 2 : 3, maxlength: api.LIMITS.post, placeholder: placeholder || t('composer.ph'), 'aria-label': t('composer.aria') });
  const counter = h('span', { class: 'lg-counter' }, `0 / ${api.LIMITS.post}`);
  const chosen = new Set();
  const tagRow = withTags && !parent ? h('div', { class: 'lg-tagpick', role: 'group', 'aria-label': t('composer.tags.aria') },
    POST_TAGS.map((tg) => {
      const b = h('button', { type: 'button', class: 'lg-tag', 'aria-pressed': 'false' }, tagLabel(tg));
      b.addEventListener('click', () => {
        if (chosen.has(tg)) chosen.delete(tg); else if (chosen.size < 2) chosen.add(tg); else { toast(t('composer.tags.max')); return; }
        b.setAttribute('aria-pressed', String(chosen.has(tg)));
      });
      return b;
    })) : null;
  const who = h('div', { class: 'lg-who' });
  const pinBox = h('div', { class: 'lg-pinbox' });
  const submit = cooldownButton(h('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, parent ? t('composer.submitReply') : t('composer.submit')));
  const form = h('form', { class: `lg-composer ${compact ? 'is-compact' : ''}` },
    ta, tagRow,
    h('div', { class: 'lg-composer-foot' }, who, h('div', { class: 'lg-composer-right' }, counter, pinBox,
      onCancel && h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: onCancel }, t('common.cancel')), submit)));

  function paintWho() {
    const as = getAs(key);
    if (api.isOperator()) {
      who.replaceChildren(avatar(OPERATOR.anon, 20), h('span', {}, t('composer.writingAsOp', { name: anonName(OPERATOR.anon, 1, true) })));
      if (!pinBox.firstChild) pinBox.replaceChildren(pinField(id + '-p'));
    } else if (as) {
      who.replaceChildren(avatar(as.anon, 20), h('span', {}, t('composer.writingAs', { name: anonName(as.anon, as.anonNo) })),
        h('button', { type: 'button', class: 'lg-link', onclick: () => { setAs(key, null); paintWho(); } }, t('composer.newName')));
      pinBox.replaceChildren();
    } else {
      who.replaceChildren(h('span', { class: 'lg-hint' }, t('composer.anonHint')));
      pinBox.replaceChildren(pinField(id + '-p'));
    }
  }
  paintWho();
  form.addEventListener('lg-as', paintWho);
  ta.addEventListener('input', () => { counter.textContent = `${ta.value.length} / ${api.LIMITS.post}`; });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const op = api.isOperator();
    const as = op ? null : getAs(key);
    const pin = as ? as.pin : form.querySelector('.lg-pin')?.value;
    if (!ta.value.trim()) { toast(t('composer.empty')); ta.focus(); return; }
    const why = spamReason(ta.value);
    if (why) { toast(spamText(why)); ta.focus(); return; }
    if (!api.isPin(pin)) { toast(t('pin.setNeed')); form.querySelector('.lg-pin')?.focus(); return; }
    submit.disabled = true;
    try {
      const p = await api.createPost({ thread: key, parent, replyTo, body: ta.value, tags: [...chosen], pin, asPostId: as?.postId, asPin: as?.pin });
      if (!as && !op) { setAs(key, { anon: p.anon, anonNo: p.anonNo, postId: p.id, pin }); paintWho(); }
      ta.value = ''; counter.textContent = `0 / ${api.LIMITS.post}`;
      onPosted?.(p);
    } catch (ex) { writeError(ex); } finally { if (!isCooling(submit)) submit.disabled = false; }
  });
  return form;
}
