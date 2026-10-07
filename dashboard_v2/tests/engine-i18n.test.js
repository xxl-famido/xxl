/**
 * 엔진 문구 사전(engine_src.json + 언어별 frag.*) 계약: 하쿠이(10444) 필살 줄의 조각이 en/ja/zh 에서 한글 없이 옮겨진다.
 * 'CD 변동 면역'·'(CD 변동 면역으로 무효)' 는 임부언·하쿠이 필살과 제단 CD 변동이 면역에 막힐 때 나온다(번역은 가이드 gd.imm.* 용어와 같게).
 * 줄 앞의 행동 표기(필살·발동)는 로그 카드가 따로 그리므로 여기서는 '→' 뒤 본문만 본다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createI18n } from '../src/core/i18n.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', f), 'utf8'));
const dicts = { kr: rd('kr.json'), en: rd('en.json'), ja: rd('ja.json'), zh: rd('zh.json'), engine: rd('engine_src.json') };
const LINES = [
  '자신 CD 변동 면역(5턴)',
  '자신 필살 CD -1 (CD 변동 면역으로 무효)',
  '자신 제외 아군 필살 CD -1',
  '자신 위용 +1중첩',
];
const HANGUL = /[가-힣]/;

for (const lang of ['en', 'ja', 'zh']) {
  test(`하쿠이 필살 줄 조각 → ${lang} 한글 잔여 없음`, async () => {
    const i18n = createI18n({ lang, dicts, storage: null, dev: false });
    await i18n.ready;
    for (const s of LINES) {
      const out = i18n.translateEngine(s);
      assert.ok(!HANGUL.test(out), `${lang}: '${s}' → '${out}'`);
    }
  });
}

test('가이드(gd.imm.li3)가 인용한 로그 문구 = 엔진 문구 번역(언어마다)', () => {
  for (const lang of ['kr', 'en', 'ja', 'zh']) {
    const quote = dicts[lang]['frag.cdImmuneVoid'];
    assert.ok(quote && dicts[lang]['gd.imm.li3'].includes(quote), `${lang}: '${quote}' 가 가이드 문장에 없음`);
  }
});

test('kr 은 면역 조각을 원문 그대로 둔다(다른 용어 교체 — 필살 CD → 필살기 CD — 만 적용)', async () => {
  const i18n = createI18n({ lang: 'kr', dicts, storage: null, dev: false });
  await i18n.ready;
  assert.equal(i18n.translateEngine(LINES[0]), LINES[0]);
  assert.ok(i18n.translateEngine(LINES[1]).endsWith('(CD 변동 면역으로 무효)'));
});
