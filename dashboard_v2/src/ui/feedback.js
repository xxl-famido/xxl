// 피드백 — 시트에서 메시지 1개를 보낸다. 전송 설정은 v1(feedback.v1.js)과 동일(Google Apps Script, no-cors).
import { h, button, openSheet, toast } from './components.js';

const CFG = {
  mode: 'gas',
  endpoint: 'https://script.google.com/macros/s/AKfycbwqZWaJYsbInEo6_mO5-umoW3GbW99mq8GdZXs_623l2hNmCmkrLV68TX4GS0yvWKzO/exec',
  token: 'woofia-fb-1',
};
const MAX_MSG = 2000;

async function submit(message, hp, lang) {
  const meta = { lang, ua: navigator.userAgent, at: new Date().toISOString(), token: CFG.token, hp: hp || '', ui: 'v2' };
  message = message.slice(0, MAX_MSG);
  if (CFG.endpoint && CFG.mode === 'gas') {
    await fetch(CFG.endpoint, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ message, ...meta }) });
  } else {
    const box = JSON.parse(localStorage.getItem('woofia_feedback') || '[]');
    box.push({ message, ...meta }); localStorage.setItem('woofia_feedback', JSON.stringify(box));
  }
}

export function install(ctx) {
  const { t, i18n } = ctx;
  ctx.openFeedback = () => {
    const ta = h('textarea', { class: 'fb-text', rows: 6, maxlength: MAX_MSG, placeholder: t('feedback.ph'), 'aria-label': t('feedback.title') });
    const hp = h('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', style: { position: 'absolute', left: '-9999px' }, 'aria-hidden': 'true' });   // 봇 함정
    const send = button({ tier: 'primary', label: t('feedback.send') });
    const sheet = openSheet({ title: t('feedback.title'), body: h('div', { class: 'fb' }, ta, hp), foot: send, ariaLabel: t('common.close') });
    send.addEventListener('click', async () => {
      const msg = ta.value.trim();
      if (!msg) { toast(t('feedback.empty')); ta.focus(); return; }
      send.disabled = true; send.querySelector('span').textContent = t('feedback.sending');
      try { await submit(msg, hp.value, i18n.lang); sheet.close(); toast(t('feedback.ok')); }
      catch { send.disabled = false; send.querySelector('span').textContent = t('feedback.send'); toast(t('feedback.err')); }
    });
  };
}
