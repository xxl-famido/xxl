UI 모듈이 새로 만든 문구 키는 여기 `<module>.kr.json`(flat: key → 한국어)에 둔다. en/ja/zh 는 병합 시 `[미번역] ` 접두어로 자동 생성.
병합: `python tools/redesign/i18n_migrate.py` 가 parts/ 를 읽어 kr/en/ja/zh.json 에 합친다(마지막 단계에서 F 담당이 실행).
개발 중에는 core/i18n.js 가 `i18n/parts/*.kr.json` 도 함께 로드한다(main.js 참고).
