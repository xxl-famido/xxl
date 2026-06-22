/**
 * 피드백 수신용 Google Apps Script 웹 앱.
 * feedback.js 가 POST(JSON: {message, contact, lang, ua, at, token, hp})로 보내면 시트에 한 행씩 추가.
 *
 * 보안 대응:
 *  - 수식 인젝션 차단: = + - @ 로 시작하는 셀은 ' 를 앞에 붙여 텍스트 고정
 *  - 허니팟(hp): 값이 있으면 봇으로 보고 무시
 *  - 토큰: feedback.js 와 동일해야 기록 (클라 노출이라 과속방지턱 수준)
 *  - 길이 제한 + 분당 레이트리밋(전역)
 *
 * 배포:
 *  1) 구글 스프레드시트 새로 만들기
 *  2) 확장 프로그램 → Apps Script → 이 코드 붙여넣고 저장
 *  3) 배포 → 새 배포 → 유형 "웹 앱", 실행: 나, 액세스: "모든 사용자"
 *  4) 권한 승인 후 웹 앱 URL(.../exec) 복사 → feedback.js CFG.endpoint 에 입력
 *  5) (선택) 아래 TOKEN 을 바꾸면 feedback.js CFG.token 도 같은 값으로
 */
var TOKEN = 'woofia-fb-1';        // feedback.js CFG.token 과 일치해야 함
var MAX_LEN = 4000;               // 내용 최대 길이
var RATE_PER_MIN = 20;            // 전역 분당 최대 기록 수

function safe(v) {
  // CSV/수식 인젝션 방지 + 길이 제한
  var s = String(v == null ? '' : v).slice(0, MAX_LEN);
  if (/^[=+\-@]/.test(s)) s = "'" + s;   // 수식으로 해석되지 않게
  return s;
}

function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) data = JSON.parse(e.postData.contents);

    if (data.hp) return ContentService.createTextOutput('ok');           // 허니팟 → 봇, 조용히 무시
    if (TOKEN && data.token !== TOKEN) return ContentService.createTextOutput('ok');  // 토큰 불일치
    var msg = String(data.message || '').trim();
    if (!msg) return ContentService.createTextOutput('empty');

    // 전역 분당 레이트리밋
    var props = PropertiesService.getScriptProperties();
    var now = Date.now();
    var win = Number(props.getProperty('win') || 0);
    var cnt = Number(props.getProperty('cnt') || 0);
    if (now - win > 60000) { win = now; cnt = 0; }
    if (cnt >= RATE_PER_MIN) return ContentService.createTextOutput('rate');
    props.setProperty('win', String(win));
    props.setProperty('cnt', String(cnt + 1));

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('feedback') || ss.insertSheet('feedback');
    if (sh.getLastRow() === 0) sh.appendRow(['시각', '언어', '내용', 'UA']);
    sh.appendRow([new Date(), safe(data.lang), safe(msg), safe(data.ua)]);
    return ContentService.createTextOutput('ok');
  } catch (err) {
    return ContentService.createTextOutput('err: ' + err);
  }
}

function doGet() {
  return ContentService.createTextOutput('feedback endpoint OK');
}
