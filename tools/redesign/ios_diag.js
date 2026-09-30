// 실기기(아이폰) 진단용 — 로컬 테스트 빌드(_site_v2)의 index.html 에만 주입한다(배포·커밋 대상 아님: tools/redesign/ios_diag_build.sh).
// 주소에 ?diag 가 있으면: 오류 수집 → 부팅 뒤 「고급 설정」 창을 자동으로 열고 → 창 안 요소의 크기·보임 상태·맨 위 요소를 화면에 표로 보여 준다.
// ?fix=all 이면 후보 수정(스크롤 본문 -webkit-overflow-scrolling 해제 · 본문 합성 레이어 · 애니메이션 끝 강제 재배치)을 먼저 적용한다.
(function () {
  var q = new URLSearchParams(location.search);
  if (!q.has('diag')) return;
  var errs = [];
  window.addEventListener('error', function (e) { errs.push('ERR ' + (e.message || e) + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('REJ ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)); });
  var ce = console.error;
  console.error = function () { try { errs.push('CE ' + [].map.call(arguments, function (a) { return (a && (a.stack || a.message)) || String(a); }).join(' ').slice(0, 300)); } catch (x) {} return ce.apply(console, arguments); };
  // fix 변형: noanim = 창 등장 애니메이션 끔 · fill = 애니메이션이 끝나면 창에 남는 transform 제거 ·
  //          scroll = 스크롤 본문 -webkit-overflow-scrolling 해제 + 합성 레이어 + 끝나면 강제 재배치 · all = 셋 다
  var fix = q.get('fix') || '';
  var css = '';
  if (fix === 'noanim' || fix === 'all') css += '.sheet{animation:none!important}';
  if (fix === 'scroll' || fix === 'all') css += '.sheet-body{-webkit-overflow-scrolling:auto!important;transform:translateZ(0)}';
  if (css) { var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }
  if (fix === 'fill' || fix === 'scroll') {
    document.addEventListener('animationend', function (e) {
      var s = e.target; if (!s.classList || !s.classList.contains('sheet')) return;
      if (fix === 'fill') { s.style.animation = 'none'; return; }
      var b = s.querySelector('.sheet-body'); if (!b) return;
      void b.offsetHeight; b.style.overflow = 'hidden'; void b.offsetHeight; b.style.overflow = '';
    }, true);
  }
  function r(el) {
    if (!el) return 'null';
    var b = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return Math.round(b.x) + ',' + Math.round(b.y) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height) + ' d=' + cs.display + ' v=' + cs.visibility + ' o=' + cs.opacity + ' t=' + (cs.transform === 'none' ? '-' : 'Y') + ' ov=' + cs.overflowY;
  }
  function top(x, y) { var el = document.elementFromPoint(x, y); if (!el) return 'null'; return el.tagName.toLowerCase() + '.' + String(el.className).split(' ').slice(0, 3).join('.') + (el.closest('.sheet') ? ' [in sheet]' : ' [OUTSIDE]'); }
  function report(tag) {
    var sh = document.querySelector('.sheet.deep-sheet') || document.querySelector('.sheet');
    var lines = ['[' + tag + '] fix=' + (fix || '-') + ' ' + navigator.userAgent.replace(/.*(iPhone OS [\d_]+).*(Version\/[\d.]+).*/, '$1 $2'),
      'vp ' + innerWidth + 'x' + innerHeight + ' vv ' + (window.visualViewport ? Math.round(visualViewport.width) + 'x' + Math.round(visualViewport.height) : '-') + ' dpr ' + devicePixelRatio];
    if (!sh) { lines.push('sheet 없음'); } else {
      var body = sh.querySelector('.sheet-body'), adv = sh.querySelector('.deep');
      lines.push('sheet ' + r(sh) + ' anim=' + (sh.getAnimations ? sh.getAnimations().map(function (a) { return a.playState; }).join('/') : '?'));
      lines.push('head ' + r(sh.querySelector('.sheet-head')));
      lines.push('body ' + r(body) + (body ? ' scroll ' + body.scrollTop + '/' + body.scrollHeight + '/' + body.clientHeight : ''));
      lines.push('adv ' + r(adv) + ' kids=' + (adv ? adv.children.length : '-') + ' html=' + (adv ? adv.innerHTML.length : 0));
      lines.push('switch ' + r(sh.querySelector('.deep-switch')));
      lines.push('work ' + r(sh.querySelector('.deep-work')));
      lines.push('plan ' + r(sh.querySelector('.deep-plan')) + ' li=' + sh.querySelectorAll('.deep-plan .prio > li').length);
      lines.push('fail ' + (sh.querySelector('.deep-fail') ? sh.querySelector('.deep-fail').textContent.slice(0, 200) : '-'));
      if (body) {
        var bb = body.getBoundingClientRect(), cx = bb.x + bb.width / 2;
        lines.push('top@body+40 ' + top(cx, bb.y + 40));
        lines.push('top@body+50% ' + top(cx, bb.y + bb.height / 2));
      }
    }
    lines.push('errors ' + errs.length);
    errs.slice(0, 6).forEach(function (e) { lines.push('  ' + e.slice(0, 220)); });
    return lines.join('\n');
  }
  function show(text) {
    var old = document.getElementById('ios-diag'); if (old) old.remove();
    var box = document.createElement('div'); box.id = 'ios-diag';
    box.setAttribute('style', 'position:fixed;left:6px;right:6px;top:env(safe-area-inset-top,0);z-index:2147483647;background:#fff;color:#000;font:11px/1.35 ui-monospace,Menlo,monospace;padding:8px;border:2px solid #d00;border-radius:8px;white-space:pre-wrap;word-break:break-all;max-height:60vh;overflow:auto');
    box.textContent = text;
    var bar = document.createElement('div'); bar.setAttribute('style', 'margin-top:6px;display:flex;gap:6px');
    [['다시 측정', function () { show(report('re')); }], ['스크롤 조금', function () { var b = document.querySelector('.sheet-body'); if (b) b.scrollTop += 60; setTimeout(function () { show(report('after-scroll')); }, 400); }], ['숨기기', function () { box.remove(); }]].forEach(function (x) {
      var bt = document.createElement('button'); bt.textContent = x[0]; bt.setAttribute('style', 'font:12px sans-serif;padding:6px 10px'); bt.onclick = x[1]; bar.appendChild(bt);
    });
    box.appendChild(bar); document.body.appendChild(box);
  }
  function run() {
    var w = window.__woofia;
    if (!w || !w.store || !w.store.get().ui || !w.store.get().ui.booted) { setTimeout(run, 300); return; }
    setTimeout(function () {
      var b = document.querySelector('#app-plan .deep-enter');
      if (!b) { show(report('no-enter-button')); return; }
      b.click();
      setTimeout(function () { show(report('2.5s')); }, 2500);
    }, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
