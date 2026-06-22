/* ───────────────────────────────────────────────────────────────────────────
   feedback.js — 피드백 버튼 + 중앙 카드 (bolt-on, 독립 파일)
   · 좌측 하단 Language 버튼 위에 "피드백" 버튼. 클릭 시 화면 중앙에 작성 카드.
   · 5개 언어 자체 지원(localStorage 'woofia_lang' 읽음). i18n-skip 으로 i18n 간섭 차단.
   · 전송 백엔드는 CFG 만 바꾸면 됨 (Discord webhook / Formspree / GAS / none).
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // ── 전송 설정 ──
  // Google Apps Script 웹 앱 URL 을 endpoint 에 넣으면 활성화. 비우면 로컬 테스트(none).
  const CFG = {
    mode: 'gas',         // 'discord' | 'formspree' | 'gas' | 'none'
    endpoint: 'https://script.google.com/macros/s/AKfycbwqZWaJYsbInEo6_mO5-umoW3GbW99mq8GdZXs_623l2hNmCmkrLV68TX4GS0yvWKzO/exec',
    token: 'woofia-fb-1',// GAS TOKEN 과 일치 (봇 과속방지턱)
  };
  const MAX_MSG = 2000;

  const T = {
    kr: { fab: '💬 피드백', title: '피드백 보내기', ph: '의견·버그·제안을 자유롭게 적어주세요', send: '보내기', sending: '보내는 중…', ok: '감사합니다! 의견이 전송됐어요 🙌', err: '전송 실패 — 잠시 후 다시 시도해주세요', empty: '내용을 입력해주세요' },
    en: { fab: '💬 Feedback', title: 'Send feedback', ph: 'Write your thoughts, bugs, or suggestions freely', send: 'Send', sending: 'Sending…', ok: 'Thanks! Your feedback was sent 🙌', err: 'Send failed — please try again later', empty: 'Please enter a message' },
    zh: { fab: '💬 意見', title: '傳送意見', ph: '自由填寫意見、錯誤或建議', send: '傳送', sending: '傳送中…', ok: '感謝！您的意見已送出 🙌', err: '傳送失敗 — 請稍後再試', empty: '請輸入內容' },
    zhs: { fab: '💬 反馈', title: '发送反馈', ph: '自由填写意见、错误或建议', send: '发送', sending: '发送中…', ok: '感谢！您的反馈已发送 🙌', err: '发送失败 — 请稍后再试', empty: '请输入内容' },
    ja: { fab: '💬 フィードバック', title: 'フィードバック送信', ph: 'ご意見・不具合・ご提案を自由にご記入ください', send: '送信', sending: '送信中…', ok: 'ありがとうございます！送信されました 🙌', err: '送信失敗 — 後ほど再試行してください', empty: '内容を入力してください' },
  };
  const t = () => T[localStorage.getItem('woofia_lang')] || T.kr;

  /* ── 전송 ── */
  async function submit(message, hp) {
    const meta = { lang: localStorage.getItem('woofia_lang') || 'kr', ua: navigator.userAgent, at: new Date().toISOString(), token: CFG.token, hp: hp || '' };
    message = message.slice(0, MAX_MSG);
    if (CFG.endpoint && CFG.mode === 'discord') {
      const content = `**[Feedback · ${meta.lang}]**\n${message}\n\`${meta.ua}\``;
      const r = await fetch(CFG.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content.slice(0, 1900) }) });
      if (!r.ok) throw new Error('discord ' + r.status);
    } else if (CFG.endpoint && CFG.mode === 'formspree') {
      const r = await fetch(CFG.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ message, ...meta }) });
      if (!r.ok) throw new Error('formspree ' + r.status);
    } else if (CFG.endpoint && CFG.mode === 'gas') {
      // Google Apps Script: no-cors 라 응답 확인 불가 → 전송된 것으로 간주 (body=text/plain JSON)
      await fetch(CFG.endpoint, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ message, ...meta }) });
    } else {
      // none: 로컬 테스트 — 콘솔/로컬스토리지에만
      console.log('[feedback]', { message, ...meta });
      const box = JSON.parse(localStorage.getItem('woofia_feedback') || '[]');
      box.push({ message, ...meta });
      localStorage.setItem('woofia_feedback', JSON.stringify(box));
    }
  }

  /* ── UI ── */
  function injectUI() {
    const css = document.createElement('style');
    css.textContent =
      '.fb-fab{position:fixed;right:12px;bottom:40px;z-index:32;font:inherit;font-size:12px;font-weight:700;' +
      'color:#06120b;background:linear-gradient(135deg,#6bd28c,#46b06a);border:none;border-radius:9px;' +
      'padding:8px 13px;cursor:pointer;box-shadow:0 4px 16px rgba(107,210,140,.28);transition:.14s}' +
      '.fb-fab:hover{transform:translateY(-1px);box-shadow:0 6px 22px rgba(107,210,140,.42)}' +
      '.fb-modal{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;padding:20px}' +
      '.fb-modal.open{display:flex}' +
      '.fb-bg{position:absolute;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(2px)}' +
      '.fb-card{position:relative;z-index:1;width:min(460px,94vw);background:#1a1814;border:1px solid #48402f;' +
      'border-radius:16px;padding:22px;box-shadow:0 18px 50px rgba(0,0,0,.55);display:flex;flex-direction:column;gap:12px}' +
      '.fb-head{display:flex;align-items:center;justify-content:space-between}' +
      '.fb-head h3{font-size:16px;color:#f3eede;margin:0}' +
      '.fb-x{font:inherit;font-size:20px;line-height:1;color:#928b7a;background:none;border:none;cursor:pointer;padding:2px 6px}' +
      '.fb-x:hover{color:#f3eede}' +
      '.fb-card textarea{font:inherit;font-size:14px;color:#f3eede;background:#141210;border:1px solid #322d22;border-radius:10px;' +
      'padding:11px 12px;min-height:130px;resize:vertical;outline:none}' +
      '.fb-card textarea:focus{border-color:#caa036}' +
      '.fb-card input{font:inherit;font-size:13px;color:#f3eede;background:#141210;border:1px solid #322d22;border-radius:9px;padding:9px 11px;outline:none}' +
      '.fb-card input:focus{border-color:#caa036}' +
      '.fb-send{font:inherit;font-size:14px;font-weight:700;color:#1a1408;background:linear-gradient(135deg,#e8b84b,#caa036);' +
      'border:none;border-radius:10px;padding:11px 0;cursor:pointer;transition:.14s}' +
      '.fb-send:hover{box-shadow:0 4px 16px rgba(232,184,75,.34)}.fb-send:disabled{opacity:.55;cursor:default}' +
      '.fb-msg{font-size:12.5px;min-height:16px;color:#928b7a}.fb-msg.ok{color:#74e0a0}.fb-msg.err{color:#ff7a6b}' +
      '.fb-hp{position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none}';
    document.head.appendChild(css);

    const fab = document.createElement('button');
    fab.className = 'fb-fab i18n-skip';

    const modal = document.createElement('div');
    modal.className = 'fb-modal i18n-skip';
    modal.innerHTML =
      '<div class="fb-bg" data-fclose></div>' +
      '<div class="fb-card">' +
      '<div class="fb-head"><h3></h3><button class="fb-x" data-fclose>×</button></div>' +
      '<textarea id="fbText" maxlength="2000"></textarea>' +
      '<input class="fb-hp" id="fbHp" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<button class="fb-send" id="fbSend"></button>' +
      '<div class="fb-msg" id="fbMsg"></div>' +
      '</div>';

    document.body.appendChild(modal);
    document.body.appendChild(fab);

    function render() {
      const L = t();
      fab.textContent = L.fab;
      modal.querySelector('.fb-head h3').textContent = L.title;
      modal.querySelector('#fbText').placeholder = L.ph;
      modal.querySelector('#fbSend').textContent = L.send;
    }
    function open() { render(); modal.querySelector('#fbMsg').textContent = ''; modal.querySelector('#fbMsg').className = 'fb-msg'; modal.classList.add('open'); modal.querySelector('#fbText').focus(); }
    function close() { modal.classList.remove('open'); }

    fab.addEventListener('click', open);
    modal.addEventListener('click', e => { if (e.target.dataset.fclose !== undefined) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

    modal.querySelector('#fbSend').addEventListener('click', async () => {
      const L = t();
      const text = modal.querySelector('#fbText').value.trim();
      const hp = modal.querySelector('#fbHp').value;
      const msgEl = modal.querySelector('#fbMsg');
      const sendBtn = modal.querySelector('#fbSend');
      if (!text) { msgEl.className = 'fb-msg err'; msgEl.textContent = L.empty; return; }
      sendBtn.disabled = true; msgEl.className = 'fb-msg'; msgEl.textContent = L.sending;
      try {
        await submit(text, hp);
        msgEl.className = 'fb-msg ok'; msgEl.textContent = L.ok;
        modal.querySelector('#fbText').value = '';
        setTimeout(close, 1400);
      } catch (e) {
        msgEl.className = 'fb-msg err'; msgEl.textContent = L.err;
      } finally { sendBtn.disabled = false; }
    });

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectUI);
  else injectUI();
})();
