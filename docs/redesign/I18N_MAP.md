# i18n 대응표 (v1 한국어 원문 키 → v2 ID 키)

생성: `python tools/redesign/i18n_migrate.py` — 손으로 고치지 말 것(재생성 시 덮어씀). 문구를 바꾸려면 `tools/redesign/i18n_mockup_keys.py`(목업 확정 문구) 또는 도구 안 `OVERRIDES`/`PHRASES`를 고친다.

## 요약

| 항목 | 수 |
|---|---|
| 키 총수 (kr) | 1602 |
| 미번역 (en) — 값이 `[미번역] ` + kr | 0 |
| 미번역 (zh) — 값이 `[미번역] ` + kr | 0 |
| 미번역 (ja) — 값이 `[미번역] ` + kr | 0 |
| 용어·문구 교체가 일어난 키 (해요체·이모지만 바뀐 것 제외) | 496 |
| 출처 미확인 EXACT(v1 동적 생성 또는 미사용, 영역 `misc`) | 11 |
| 해요체 자동 변환 실패 토큰 | 0 |

## 키 규칙

- `영역.요소.의미`. 영역: `top` `jump` `team` `grow` `plan`(행동 계획·필살기 사용 방식 `plan.ult.*`·연동 `plan.sync.*`) `adv`(v1 행동 고급 설정) `manual`(완전 수동) `planner`(동료 창 턴별 계획) `cond` `tdmg` `altar` `result` `log` `compare` `records` `guide` `patch` `feedback` `boot` `app`(공통 토스트) `element` `role` `frag`(엔진·로그 부분치환) `misc`.
- 요소: `title` `label` `hint`(설명 문장) `help`(? 도움말, 구 라벨 괄호 설명) `msg`(토스트·상태) `status`(진행 중…) `fmt`(자리표시자 `{0}`/`{name}`) `tip`(title 속성) `ph`(placeholder) `aria` `alt` `cell.abbr`(1~2자 셀 약칭).
- 의미 부분은 영문 번역에서 자동 생성(불용어 제거 4단어 camelCase). 목업 문구는 사람이 붙인 고정 키.
- `guide.*`와 `*.html` 값에는 `<b> <code> <em> <br>` 인라인 태그가 들어 있다 — `i18n.tHtml(key, vars)`로 넣는다(변수만 이스케이프).
- `frag.*`는 엔진·파이썬이 만드는 한국어 조각의 번역. 원문은 `dashboard_v2/i18n/engine_src.json`(백엔드 미변경).

## 해요체 변환 실패 토큰(수동 확인 필요)

없음

## 명령형(~세요) → 평서 안내문 자동 변환 목록 (문맥 확인 권장)

바꾸세요, 쓰세요, 켜세요

## 대응표

| 출처 | 구 한국어 | 새 키 | 사유 |
|---|---|---|---|
| mockup | 기록 | `top.history.label` | 목업 확정 문구 |
| mockup | 지난 시뮬레이션 기록 | `top.history.aria` | COPY_AUDIT §5-1 |
| mockup | — 기록 없음 — | `top.history.empty` | C-1 장식 제거 |
| mockup |  | `top.history.option` | 목업 기록 option |
| mockup |  | `top.nav.aria` | 목업 확정 문구 |
| mockup | 조합 비교 | `top.compare` | A-14 |
| mockup | 📖 가이드 | `top.guide` | 목업 확정 문구 |
| mockup |  | `top.menu.aria` | COPY_AUDIT §5-1 (더 보기 메뉴→메뉴) |
| mockup |  | `top.theme.light` | 목업 확정 문구 |
| mockup |  | `top.theme.dark` | 목업 확정 문구 |
| mockup |  | `top.theme.toggle` | 목업 확정 문구 |
| mockup |  | `top.lang.aria` | 목업 확정 문구 |
| mockup | 📜 패치 히스토리 | `top.patch` | C-1 이모지 제거 |
| mockup | 💬 피드백 | `top.feedback` | 목업 확정 문구 |
| mockup |  | `top.oldVersion` | 목업 확정 문구 |
| mockup |  | `jump.aria` | 목업 확정 문구 |
| mockup | 편성 | `jump.team` | 목업 확정 문구 |
| mockup | 행동 | `jump.plan` | 목업 확정 문구 |
| mockup |  | `jump.cond` | 목업 확정 문구 |
| mockup | 결과 | `jump.result` | 목업 확정 문구 |
| mockup | 팀 편성 | `team.title` | 목업 확정 문구 |
| mockup | 공유 코드 | `team.share` | B (동사+명사) |
| mockup |  | `team.slots.aria` | 목업 확정 문구 |
| mockup |  | `team.slot.aria` | 목업 확정 문구 |
| mockup |  | `team.slot.remove.aria` | COPY_AUDIT §5-1 (빼기→편성 해제) |
| mockup |  | `team.slot.empty.aria` | 목업 확정 문구 |
| mockup | 캐릭터 추가 | `team.slot.empty.label` | A-13 |
| mockup |  | `team.slot.chip.star` | 목업 확정 문구 |
| mockup |  | `team.slot.chip.level` | 목업 확정 문구 |
| mockup |  | `team.slot.chip.noSigil` | COPY_AUDIT §5-2 (스킬 10 · 문양 대체) |
| mockup |  | `team.slot.chip.compat` | COPY_AUDIT §5-2 |
| mockup |  | `team.slot.chip.skill` | COPY_AUDIT §5-2 |
| mockup |  | `team.slot.chip.seal` | COPY_AUDIT §5-2 |
| mockup |  | `team.slot.chip.more` | 목업 확정 문구 |
| mockup |  | `team.allMax` | COPY_AUDIT §5-2 ③ |
| mockup | 동료 | `team.roster.title` | B-31 |
| mockup |  | `team.roster.count` | C-12 |
| mockup | 이름 검색 | `team.roster.search.ph` | 목업 확정 문구 |
| mockup |  | `team.roster.search.aria` | A-13 |
| mockup |  | `team.roster.aria` | A-13 |
| mockup | 속성 | `team.filter.element.aria` | 목업 확정 문구 |
| mockup |  | `team.filter.role.aria` | A-23 |
| mockup | 전체 | `team.filter.all` | 목업 확정 문구 |
| mockup |  | `team.tile.placed.aria` | 목업 확정 문구 |
| mockup | 없음 | `element.none` | A-24 |
| mockup |  | `element.none.long` | A-24 |
| mockup | 불 | `element.fire` | 목업 확정 문구 |
| mockup | 물 | `element.water` | 목업 확정 문구 |
| mockup | 풀 | `element.wood` | A-9 |
| mockup | 빛 | `element.light` | 목업 확정 문구 |
| mockup | 어둠 | `element.dark` | 목업 확정 문구 |
| mockup | 전사 | `role.warrior` | 목업 확정 문구 |
| mockup | 수호 | `role.guard` | 목업 확정 문구 |
| mockup | 치유 | `role.healer` | A-8 |
| mockup | 보조 | `role.support` | 목업 확정 문구 |
| mockup | 방해 | `role.disrupt` | 목업 확정 문구 |
| mockup | 행동 계획 | `plan.title` | 목업 확정 문구 |
| mockup | 초기화 | `plan.reset` | 목업 확정 문구 |
| mockup |  | `plan.step1.title` | 목업 확정 문구 |
| mockup |  | `plan.step1.ultMode.aria` | 목업 확정 문구 |
| mockup | 자동 | `plan.ult.mode.auto` | 목업 확정 문구 |
| mockup |  | `plan.ult.mode.autoTurns` | 목업 확정 문구 |
| mockup | 정해진 턴만 | `plan.ult.mode.strict` | 목업 확정 문구 |
| mockup | 준비되면 바로 | `plan.ult.mode.asap` | 목업 확정 문구 |
| mockup |  | `plan.ult.mode.manual` | 목업 확정 문구 |
| mockup |  | `plan.ult.mode.hint.html` | 목업 확정 문구 |
| mockup | 위로 | `plan.order.up.aria` | 목업 확정 문구 |
| mockup | 아래로 | `plan.order.down.aria` | 목업 확정 문구 |
| mockup |  | `plan.turn.label` | 목업 확정 문구 |
| mockup |  | `plan.turn.hint` | 목업 확정 문구 |
| mockup |  | `plan.turn.preset.allUlt` | 목업 확정 문구 |
| mockup |  | `plan.turn.preset.every3` | 목업 확정 문구 |
| mockup | 첫 궁 당기기 | `plan.turn.preset.earlyUlt` | A-1 (목업 확정 표기) |
| mockup | 패시브 방어 | `plan.turn.preset.defBefore` | B-16 |
| mockup | 궁 간격 맞추기 | `plan.turn.preset.realign` | B-10 |
| mockup |  | `plan.turn.cells.aria` | 목업 확정 문구 |
| mockup |  | `plan.turn.cell.aria` | 목업 확정 문구 |
| mockup |  | `plan.turn.cdHint` | 목업 확정 문구 |
| mockup |  | `plan.link.chip` | 목업 확정 문구 |
| mockup |  | `plan.step2.title` | 목업 확정 문구 |
| mockup | 없음 | `plan.step2.none` | 목업 확정 문구 |
| mockup |  | `plan.step2.hint` | 목업 확정 문구 |
| mockup |  | `plan.step2.add` | 목업 확정 문구 |
| mockup |  | `plan.step3.title` | 목업 확정 문구 |
| mockup |  | `plan.step3.count` | 목업 확정 문구 |
| mockup |  | `plan.sync.anchor.aria` | B-8 |
| mockup |  | `plan.sync.text.onUlt` | 목업 확정 문구 |
| mockup |  | `plan.sync.member.aria` | 목업 확정 문구 |
| mockup |  | `plan.sync.text.topic` | 목업 확정 문구 |
| mockup | 행동 | `plan.sync.action.aria` | 목업 확정 문구 |
| mockup |  | `plan.sync.action.bonus` | 목업 확정 문구 |
| mockup |  | `plan.sync.action.before` | 목업 확정 문구 |
| mockup |  | `plan.sync.action.after` | 목업 확정 문구 |
| mockup |  | `plan.sync.action.defBonus` | B-15 |
| mockup |  | `plan.sync.text.otherwise` | 목업 확정 문구 |
| mockup |  | `plan.sync.other.aria` | 목업 확정 문구 |
| mockup |  | `plan.sync.other.own` | 목업 확정 문구 |
| mockup |  | `plan.sync.other.hold` | 목업 확정 문구 |
| mockup |  | `plan.sync.remove.aria` | 목업 확정 문구 |
| mockup |  | `plan.sync.add` | 목업 확정 문구 |
| mockup |  | `plan.preview.title` | 목업 확정 문구 |
| mockup | 필살기 | `plan.preview.legend.ult` | 목업 확정 문구 |
| mockup | 방어 | `plan.preview.legend.def` | 목업 확정 문구 |
| mockup | 보통공격 | `plan.preview.legend.atk` | 목업 확정 문구 |
| mockup | 추가 행동 | `plan.preview.legend.extra` | 목업 확정 문구 |
| mockup |  | `plan.preview.aria` | 목업 확정 문구 |
| mockup |  | `plan.preview.hint` | 목업 확정 문구 |
| mockup |  | `plan.manual.open` | 목업 확정 문구 |
| mockup |  | `plan.manual.hint` | 목업 확정 문구 |
| mockup | 평 | `plan.cell.abbr.atk` | 용어 규칙 2 (1~2자 셀 약칭 허용) |
| mockup | 궁 | `plan.cell.abbr.ult` | 용어 규칙 2 |
| mockup | 방 | `plan.cell.abbr.def` | 용어 규칙 2 |
| mockup |  | `cond.title` | 목업 확정 문구 |
| mockup | 전부 기본값으로 | `cond.reset` | B (동사+명사) |
| mockup |  | `cond.runs.title` | 목업 확정 문구 |
| mockup |  | `cond.runs.sum.runs` | 목업 확정 문구 |
| mockup |  | `cond.runs.sum.turns` | 목업 확정 문구 |
| mockup | 반복 횟수 | `cond.runs.label` | 목업 확정 문구 |
| mockup |  | `cond.runs.help.aria` | 목업 확정 문구 |
| mockup |  | `cond.runs.help` | C-2 (라벨 괄호 설명 → 도움말) |
| mockup | 진행 턴 수 | `cond.turns.label` | COPY_AUDIT §5-1 |
| mockup | 적 | `cond.enemy.title` | 목업 확정 문구 |
| mockup |  | `cond.enemy.sum.count` | 목업 확정 문구 |
| mockup | 더미 속성 | `cond.enemy.element.label` | A (더미→적) |
| mockup |  | `cond.enemy.element.help.aria` | 목업 확정 문구 |
| mockup |  | `cond.enemy.element.help` | C-2 · A-22 |
| mockup | 적 더미 수 | `cond.enemy.count.label` | 목업 확정 문구 |
| mockup |  | `cond.incoming.title` | 목업 확정 문구 |
| mockup |  | `cond.incoming.sum.hits` | 목업 확정 문구 |
| mockup |  | `cond.incoming.sum.all` | 목업 확정 문구 |
| mockup | 아군 피격 횟수 | `cond.incoming.hits.label` | B-1 |
| mockup |  | `cond.incoming.hits.help.aria` | 목업 확정 문구 |
| mockup |  | `cond.incoming.hits.help` | C-2 |
| mockup | 전체 | `cond.incoming.hits.all` | 목업 확정 문구 |
| mockup | 피격 데미지 | `cond.incoming.dmg.label` | B-2 |
| mockup | 기본값 | `cond.incoming.dmg.reset` | 목업 확정 문구 |
| mockup |  | `cond.incoming.dmg.aria` | 목업 확정 문구 |
| mockup |  | `cond.incoming.dmg.help` | C-2 · A-19 |
| mockup |  | `cond.unit.hpPct` | 목업 확정 문구 |
| mockup | 🩸 턴 피해 | `cond.tdmg.label` | 용어집 §2 |
| mockup |  | `cond.tdmg.aria` | 목업 확정 문구 |
| mockup | 길드 제단 설정 | `cond.altar.title` | A-11 |
| mockup |  | `cond.altar.sum.off` | 목업 확정 문구 |
| mockup |  | `cond.altar.sum.on` | A-12 |
| mockup |  | `cond.altar.use` | 목업 확정 문구 |
| mockup |  | `cond.altar.hint` | A-12 |
| mockup | 확률 100% 모드 | `cond.proc.label` | B-5 |
| mockup | 체력 10% 모드 | `cond.hp10.label` | B-24 |
| mockup | 시뮬레이션 실행 | `cond.run` | 목업 확정 문구 |
| mockup |  | `cond.run.meta` | C-10 |
| mockup | 결과 | `result.title` | 목업 확정 문구 |
| mockup |  | `result.when` | C-11 |
| mockup |  | `result.altar.off` | 목업 확정 문구 |
| mockup |  | `result.altar.on` | 목업 확정 문구 |
| mockup |  | `result.export` | B (동사+명사) |
| mockup |  | `result.headline.median` | F-1 |
| mockup |  | `result.band.aria` | F-2 |
| mockup |  | `result.band.caption` | F-2 |
| mockup |  | `result.stat.perTurn` | A (라이브 dpsMid) |
| mockup |  | `result.stat.spread` | C-9 대체 |
| mockup | 턴별 데미지 | `result.strip.title` | 목업 확정 문구 |
| mockup |  | `result.strip.legend.ult` | 목업 확정 문구 |
| mockup |  | `result.strip.aria` | 목업 확정 문구 |
| mockup |  | `result.char.title` | A·B (기여→데미지) |
| mockup |  | `result.log.title` | B |
| mockup |  | `result.log.note` | F-5 |
| mockup | 턴 | `result.log.col.turn` | 목업 확정 문구 |
| mockup | 행동 | `result.log.col.action` | 목업 확정 문구 |
| mockup | 데미지 | `result.log.col.damage` | 목업 확정 문구 |
| mockup |  | `result.empty` | C-5 (실행 전에는 비워 둠) |
| mockup |  | `log.action.basic` | 목업 확정 문구 |
| mockup |  | `log.action.ult` | 목업 확정 문구 |
| mockup |  | `log.action.defend` | 목업 확정 문구 |
| mockup |  | `log.action.extra` | 목업 확정 문구 |
| mockup |  | `runbar.last` | C-13 |
| mockup | 시뮬레이터 엔진 로딩 중… | `boot.title` | 목업 확정 문구 |
| mockup |  | `boot.stage.runtime` | 목업 확정 문구 |
| mockup |  | `boot.stage.engine` | 목업 확정 문구 |
| mockup |  | `boot.stage.chars` | 목업 확정 문구 |
| mockup | 최초 1회만 (~10초), 이후엔 캐시되어 빨라요 | `boot.hint` | B-39 |
| mockup |  | `mock.title` | 목업 확정 문구 |
| mockup |  | `mock.accent.aria` | 목업 확정 문구 |
| app.v1.js ADV_T.tabTime | 턴별 타임라인 | `adv.tab.time` | 변경 없음 |
| app.v1.js ADV_T.tabSync | 연동 (궁 맞추기) | `adv.tab.sync` | A-1/B-8 (연동 (궁 맞추기)→필살기 연동) |
| app.v1.js ADV_T.timeOn | 타임라인이 켜져 있어요 — 켜져 있는 동안엔 타임라인이 궁 시점을 정하고, 이 탭의 설정은 쉽니다. | `adv.time.on` | A-1 (궁→필살기); B 해요체→평서 |
| app.v1.js ADV_T.ultHint | 필살기를 언제 쓸지 캐릭터마다 정합니다. 기본은 ‘정해진 턴’ — 계획한 턴에 쓰고, 그 턴에 준비가 안 됐으면 준비되는 즉시 씁니다. | `plan.ult.hint` | A-13 (캐릭터→동료) |
| app.v1.js ADV_T.cdProcWarn | 확률로 필살기 쿨이 줄어드는 효과(길드 제단)가 켜져 있어요. 실제 확률대로 보려면 ‘준비되면 바로’를, 정해 둔 턴(예: 3·6·9·12턴)에 궁을 쓰는 흐름을 보려면 ‘확률 쿨 감소 성공 가정’을 켜세요. | `adv.cd.proc.warn` | B-13 (확률 쿨 감소 성공 가정→확률 CD 감소 항상 성공); A-11/A-12 (길드 제단→방탈출 제단); A-1 (궁→필살기); A-15 (쿨→쿨타임); B 해요체→평서 |
| app.v1.js ADV_T.undo | 되돌리기 | `adv.undo` | 변경 없음 |
| app.v1.js ADV_T.syncCleared | 연동 그룹을 해제했어요 | `plan.sync.cleared` | 해요체→개조식(COPY_AUDIT §3 예시) |
| app.v1.js ADV_T.syncPresetDone | 연동 프리셋을 적용했어요 | `plan.sync.preset.done` | 해요체→개조식 |
| app.v1.js ADV_T.cdAssistAll | 모두 성공 가정 켜기 | `adv.cd.assist.all` | 변경 없음 |
| app.v1.js ADV_T.cdAssistDone | 확률 쿨 감소 성공 가정을 모두 켰어요 (‘준비되면 바로’ 캐릭터 제외) | `adv.cd.assist.done` | B-13 (확률 쿨 감소 성공 가정→확률 CD 감소 항상 성공); A-13 (캐릭터→동료); B 해요체→평서 |
| app.v1.js ADV_T.cdProcAll | 모두 ‘준비되면 바로’로 | `adv.cd.proc.all` | 변경 없음 |
| app.v1.js ADV_T.cdProcDone | 궁극기 사용 방식을 모두 ‘준비되면 바로’로 바꿨어요 (연동 멤버 제외) | `adv.cd.proc.done` | A-1 (궁극기 사용 방식→필살기 사용 방식); B-8 (멤버→따라가는 동료); B 해요체→평서 |
| app.v1.js ADV_T.ultMember | 연동 그룹 {0} 멤버 — {1}의 궁 턴에 맞춰요 (연동 탭에서 변경) | `plan.ult.member` | A-1 (궁→필살기); B-8 (멤버→따라가는 동료); B 해요체→평서 |
| app.v1.js ADV_T.ultMemberOwn | 연동 그룹 {0} 멤버 — {1}의 궁 턴엔 연동대로, 다른 턴엔 아래 방식대로 씁니다 | `plan.ult.member.own` | A-1 (궁→필살기); B-8 (멤버→따라가는 동료) |
| app.v1.js ADV_T.otherLbl | 앵커가 궁을 안 쓰는 턴 | `adv.other.lbl` | A-1 (궁→필살기); B-8 (앵커→기준 동료) |
| app.v1.js ADV_T.otherOwn | 내 사용 방식대로 | `adv.other.own` | B-9 (내 사용 방식대로→개별 설정 따름) |
| app.v1.js ADV_T.otherHold | 궁 아끼기 | `adv.other.hold` | B-9 (궁 아끼기→필살기 보류) |
| app.v1.js ADV_T.flowOther | 그 밖의 턴: | `adv.flow.other` | 변경 없음 |
| app.v1.js ADV_T.ultSyncShort | 연동 그룹 {0} 멤버 · 앵커 {1} | `plan.ult.sync.short` | B-8 (앵커→기준 동료); B-8 (멤버→따라가는 동료) |
| app.v1.js ADV_T.openUlt | 행동 고급 설정에서 변경 | `adv.open.ult` | 변경 없음 |
| app.v1.js ADV_T.syncHint | 한 캐릭터(앵커)가 필살기를 쓰는 턴에 다른 캐릭터(멤버)의 행동을 맞춥니다. 최대 3그룹, 한 캐릭터는 한 그룹에만 들어갈 수 있어요. | `plan.sync.hint` | A-13 (캐릭터→동료); B-8 (앵커→기준 동료); B-8 (멤버→따라가는 동료); B 해요체→평서 |
| app.v1.js ADV_T.members | 멤버 | `adv.members` | B-8 (멤버→따라가는 동료) |
| app.v1.js ADV_T.memberAct | 앵커 궁 턴에 | `adv.member.act` | A-1 (궁→필살기); B-8 (앵커→기준 동료) |
| app.v1.js ADV_T.actUlt | 같이 궁 | `adv.act.ult` | A-1 (궁→필살기) |
| app.v1.js ADV_T.actDef | 방어 → 받은 추가 행동에서 궁 | `adv.act.def` | A-1 (궁→필살기) |
| app.v1.js ADV_T.actBasic | 평타 → 받은 추가 행동에서 궁 | `adv.act.basic` | A-1 (궁→필살기); A-2 (평타→보통 공격) |
| app.v1.js ADV_T.orderLbl | 행동 순서 | `adv.order.lbl` | 변경 없음 |
| app.v1.js ADV_T.orderFixed | 앵커 앞 — 추가 행동은 이미 행동을 마친 아군에게만 들어가서, 앵커보다 먼저 행동해야 해요 | `adv.order.fixed` | B-8 (앵커→기준 동료); B 해요체→평서 |
| app.v1.js ADV_T.noGrant | {0}의 필살기는 추가 행동을 주지 않아요 — 보류한 궁은 ‘미준비면’ 규칙대로 나갑니다 (대기 = 다음 앵커 궁 턴까지 아낌). | `adv.no.grant` | A-1 (궁→필살기); B-8 (앵커→기준 동료); B 해요체→평서 |
| app.v1.js ADV_T.flow | {0}이(가) 궁을 쓰는 턴: | `adv.flow` | A-1 (궁→필살기) |
| app.v1.js ADV_T.stepUlt | 궁 | `adv.step.ult` | 용어 규칙 2 (셀 약칭) |
| app.v1.js ADV_T.stepDef | 방어 | `adv.step.def` | 변경 없음 |
| app.v1.js ADV_T.stepBasic | 평타 | `adv.step.basic` | A-2 (평타→보통 공격) |
| app.v1.js ADV_T.stepBonus | 궁 (받은 추가 행동) | `adv.step.bonus` | A-1 (궁→필살기) |
| app.v1.js ADV_T.presetUk | {0} 연동 자동 설정 | `adv.preset.uk` | 변경 없음 |
| app.v1.js ADV_T.presetUkDesc | 인접 아군이 평타 → {0} 궁 → 받은 추가 행동에서 궁. 원하는 멤버는 ‘방어 →’로 바꾸세요. | `adv.preset.uk.desc` | A-1 (궁→필살기); A-2 (평타→보통 공격); B-8 (멤버→따라가는 동료); B 해요체→평서 |
| app.v1.js ADV_T.presetDone | 연동 그룹을 만들었어요 — 멤버별 행동을 아래에서 조정할 수 있어요 | `adv.preset.done` | B-8 (멤버→따라가는 동료); B 해요체→평서 |
| app.v1.js ADV_T.presetFull | 빈 그룹이 없어요 — 그룹을 하나 비운 뒤 다시 눌러 주세요 | `adv.preset.full` | 해요체→개조식 |
| app.v1.js ADV_T.conflict | 타임라인이 켜져 있는 동안 적용되지 않는 설정: {0}. 반영하려면 ‘기존 설정 불러오기’를 누르세요. | `adv.conflict` | B-35 |
| app.v1.js ADV_T.conflictOv | 특정 턴만 다르게({0}턴) | `adv.conflict.ov` | B-19 (특정 턴만 다르게→일부 턴 순서 변경) |
| app.v1.js ADV_T.conflictPlan | 캐릭터별 턴 계획({0}) | `adv.conflict.plan` | A-13 (캐릭터→동료) |
| app.v1.js ADV_T.orderTitle | 필살기를 쓸지 정하는 순서 | `adv.order.title` | 변경 없음 |
| app.v1.js ADV_T.order1 | 턴별 타임라인을 켜면 모든 턴이 타임라인대로 움직이고, 이 탭과 연동 탭은 쉽니다. | `adv.order1` | 변경 없음 |
| app.v1.js ADV_T.order2 | 연동 그룹의 멤버는 앵커가 필살기를 쓰는 턴에 연동 설정대로 행동합니다. 그 밖의 턴은 멤버마다 ‘궁 아끼기’ 또는 ‘내 사용 방식대로’를 따릅니다. | `adv.order2` | B-9 (내 사용 방식대로→개별 설정 따름); B-9 (궁 아끼기→필살기 보류); B-8 (앵커→기준 동료); B-8 (멤버→따라가는 동료) |
| app.v1.js ADV_T.order3 | 그 밖의 캐릭터(와 ‘내 사용 방식대로’ 멤버)는 아래에서 고른 방식을 따릅니다. ‘정해진 턴’의 계획은 캐릭터 창의 턴별 행동 계획이며, 꺼져 있으면 자동 계획입니다. | `adv.order3` | B-9 (내 사용 방식대로→개별 설정 따름); A-13 (캐릭터→동료); B-8 (멤버→따라가는 동료) |
| app.v1.js ADV_T.order4 | 동료가 준 추가 행동은 평타로 씁니다. 연동에서 ‘받은 추가 행동에서 궁’을 고른 멤버와, 동료의 필살기로 쿨이 되돌아온 캐릭터는 그 추가 행동에서 필살기를 씁니다. 같은 턴에 쿨을 되돌려 주는 캐릭터와 그 대상이 함께 추가 행동을 받으면, 대상의 필살기가 준비돼 있을 때 대상이 먼저 행동합니다. | `adv.order4` | A-1 (궁→필살기); A-2 (평타→보통 공격); A-13 (캐릭터→동료); A-15 (쿨→쿨타임); B-8 (멤버→따라가는 동료) |
| app.v1.js TDMG_T.title | 턴 피해 설정 | `tdmg.title` | 용어집 §2 |
| app.v1.js TDMG_T.sub | 매 턴 아군 전체가 피해를 받습니다 | `tdmg.sub` | 변경 없음 |
| app.v1.js TDMG_T.use | 사용 | `tdmg.use` | 변경 없음 |
| app.v1.js TDMG_T.close | 닫기 | `tdmg.close` | 변경 없음 |
| app.v1.js TDMG_T.pct | 매 턴 피해 (최대HP의 %) | `tdmg.pct` | 표기 규칙 1 (최대HP→최대 HP); 용어집 §2 (매 턴 피해→턴마다 받는 데미지) |
| app.v1.js TDMG_T.targets | 피해 대상 (아군 수) | `tdmg.targets` | U9 (피해 대상→데미지 대상) |
| app.v1.js TDMG_T.targetsSub | 전체보다 적으면 현재 HP%가 높은 아군부터 맞습니다 (동률은 랜덤) | `tdmg.targets.sub` | 변경 없음 |
| app.v1.js TDMG_T.targetAll | 전체 | `tdmg.target.all` | 변경 없음 |
| app.v1.js TDMG_T.adv | 고급 · 턴별로 다르게 | `tdmg.adv` | B-20 |
| app.v1.js TDMG_T.advSub | 켜면 아래 칸에 턴마다 피해 %를 따로 정할 수 있어요 (비우면 위 값) | `tdmg.adv.sub` | B 해요체→평서 |
| app.v1.js TDMG_T.turn | {0}턴 | `tdmg.turn` | 변경 없음 |
| app.v1.js TDMG_T.reset | 턴별 값 비우기 | `tdmg.reset` | 변경 없음 |
| app.v1.js TDMG_T.hint | 적 페이즈가 끝날 때 아군 전체가 최대HP의 지정 %만큼 피해를 받습니다. 배리어가 먼저 흡수하고, 방어한 턴은 50%만 받으며, 받는 데미지 증감이 적용돼요. 반격은 발동하지 않고, HP가 0이 되면 전투불능이 되어 이탈합니다(일부 힐러의 부활로 복귀 가능). | `tdmg.hint` | 표기 규칙 1 (최대HP→최대 HP); A-19 (전투불능이 되어 이탈→사망); A-17 (힐러→치료 포지션); B 해요체→평서 |
| app.v1.js TDMG_T.note | 아군 피격 설정·길드 제단 설정과 함께 켤 수 있어요 (패널은 한 번에 하나만 보여요). 무명처럼 자기 HP에 반응하는 캐릭터를 시험할 때 쓰세요. | `tdmg.note` | A-11/A-12 (길드 제단 설정→방탈출 제단); A-13 (캐릭터→동료); B 해요체→평서 |
| app.v1.js TDMG_T.result | 턴 피해 {0}% | `tdmg.result` | 용어집 §2 (턴 피해→턴 데미지) |
| app.v1.js TDMG_T.resultRange | 턴 피해 {0}~{1}% | `tdmg.result.range` | 용어집 §2 (턴 피해→턴 데미지) |
| app.v1.js TDMG_T.toastOn | 턴 피해 설정 ON | `tdmg.toast.on` | 용어집 §2/개조식 |
| app.v1.js TDMG_T.toastOnSub | · 매 턴 아군 전체가 최대HP의 {0}% 피해 | `tdmg.toast.on.sub` | 표기 규칙 1 (최대HP→최대 HP) |
| app.v1.js TDMG_T.toastOff | 턴 피해 설정 OFF | `tdmg.toast.off` | 용어집 §2/개조식 |
| app.v1.js ALTAR_T.title | 길드 제단 설정 | `altar.title` | A-11/A-12 |
| app.v1.js ALTAR_T.sub | 길드전 방탈출 · 층별 제단 효과 | `altar.sub` | A-11 (길드전 삭제) |
| app.v1.js ALTAR_T.use | 사용 | `altar.use` | 변경 없음 |
| app.v1.js ALTAR_T.close | 닫기 | `altar.close` | 변경 없음 |
| app.v1.js ALTAR_T.active | 활성화 | `altar.active` | A-12 (활성화→점등) |
| app.v1.js ALTAR_T.floor | {0}층 | `altar.floor` | 변경 없음 |
| app.v1.js ALTAR_T.energy | 에너지 | `altar.energy` | 변경 없음 |
| app.v1.js ALTAR_T.count | 별 {0} · 달 {1} | `altar.count` | 변경 없음 |
| app.v1.js ALTAR_T.star | 별 제단 | `altar.star` | A-12 |
| app.v1.js ALTAR_T.moon | 달 제단 | `altar.moon` | A-12 |
| app.v1.js ALTAR_T.starSub | 활성화시 제단 효과가 비활성화됩니다 | `altar.star.sub` | A-12/F-4 재작성(의미 변경) |
| app.v1.js ALTAR_T.moonSub | 활성화시 제단 효과가 활성화됩니다 | `altar.moon.sub` | A-12/F-4 재작성(의미 변경) |
| app.v1.js ALTAR_T.hint | 제단을 눌러 활성화 여부를 바꿉니다. 별 제단과 달 제단은 활성화의 의미가 서로 반대입니다. | `altar.hint` | A-12/F-4 재작성(의미 변경) |
| app.v1.js ALTAR_T.floorRule | 층은 1층부터 순서대로만 켤 수 있습니다 — 위층을 켜면 아래층도 함께 켜집니다. | `altar.floor.rule` | A-12 (켜다→점등) |
| app.v1.js ALTAR_T.note | 보스 ATK · 보스 주는 데미지 · 아군 받는 데미지 별 제단은 피격 데미지 모드를 켰을 때만 결과에 반영돼요. 같은 효과가 여러 층에 있으면 전부 더해집니다. | `altar.note` | B-2 (피격 데미지 모드→적 공격 데미지); A-12 (별 제단→별의 제단); B 해요체→평서 |
| app.v1.js ALTAR_T.result | 제단 별 {0} · 달 {1} | `altar.result` | 변경 없음 |
| app.v1.js ALTAR_T.resultGroups |  · 연동 {0}그룹 | `altar.result.groups` | 변경 없음 |
| app.v1.js ALTAR_T.ultTitle | 궁극기 사용 방식 | `plan.ult.title` | A-1 (궁극기 사용 방식→필살기 사용 방식) |
| app.v1.js ALTAR_T.ultSub | 필살기를 언제 쓸지 | `plan.ult.sub` | 변경 없음 |
| app.v1.js ALTAR_T.ult_fixed | 정해진 턴 | `plan.ult.fixed` | 변경 없음 |
| app.v1.js ALTAR_T.ult_fixedTip | 계획한 턴에 궁을 씁니다. 그 턴에 준비가 안 됐으면 준비되는 즉시 씁니다. | `plan.ult.fixed.tip` | A-1 (궁→필살기) |
| app.v1.js ALTAR_T.ult_strict | 정해진 턴만 | `plan.ult.strict` | 변경 없음 |
| app.v1.js ALTAR_T.ult_strictTip | 계획한 턴에만 궁을 씁니다. 준비가 안 됐으면 건너뛰고 다음 계획 턴을 기다립니다. | `plan.ult.strict.tip` | A-1 (궁→필살기) |
| app.v1.js ALTAR_T.ult_asap | 준비되면 바로 | `plan.ult.asap` | 변경 없음 |
| app.v1.js ALTAR_T.ult_asapTip | 궁이 준비되는 행동마다 바로 씁니다. 계획의 궁 자리는 무시합니다. | `plan.ult.asap.tip` | A-1 (궁→필살기) |
| app.v1.js ALTAR_T.ultKeepDef | 계획의 방어 턴은 방어 유지 | `plan.ult.keep.def` | 변경 없음 |
| app.v1.js ALTAR_T.ultAssist | 확률 쿨 감소 성공 가정 | `plan.ult.assist` | B-13 (확률 쿨 감소 성공 가정→확률 CD 감소 항상 성공) |
| app.v1.js ALTAR_T.ultAssistShort | 확률 쿨 감소 성공 가정 | `plan.ult.assist.short` | B-13 (확률 쿨 감소 성공 가정→확률 CD 감소 항상 성공) |
| app.v1.js ALTAR_T.ultAssistTip | 확률로 쿨이 줄어드는 효과를 굴리지 않고, 계획·연동으로 정한 궁 턴에 필요한 만큼만 터진 것으로 계산합니다. 원래 쿨로는 안 되는 턴(예: 3쿨 캐릭터의 3턴)에도 궁을 계획할 수 있어요. 결과 머리말에 그대로 나올 확률이 함께 표시됩니다. | `plan.ult.assist.tip` | B-14 (그대로 나올 확률→이 흐름의 재현 확률); A-15 ((\d+)쿨→CD \1턴); A-1 (궁→필살기); A-13 (캐릭터→동료); A-15 (쿨→쿨타임); B 해요체→평서 |
| app.v1.js ALTAR_T.ultAssistAsap | ‘준비되면 바로’는 실제 확률대로 계산해요 — 이 옵션은 ‘정해진 턴’·‘정해진 턴만’에 적용됩니다 | `plan.ult.assist.asap` | B 해요체→평서 |
| app.v1.js ALTAR_T.resultAssist |  · 확률 쿨 감소 가정 {0}회 (그대로 나올 확률 {1}%) | `altar.result.assist` | B-13 (확률 쿨 감소 가정→확률 CD 감소 가정); B-14 (그대로 나올 확률→이 흐름의 재현 확률) |
| app.v1.js ALTAR_T.ultLocked | 행동 고급 설정이 켜져 있어요 — 타임라인이 궁 시점을 정합니다 | `plan.ult.locked` | A-1 (궁→필살기); B 해요체→평서 |
| app.v1.js ALTAR_T.ultSyncInfo | 연동 그룹 {0} · {1}이(가) 궁을 쓰는 턴에 {2} 같이 씁니다 (행동 고급 설정 › 연동에서 변경) | `plan.ult.sync.info` | A-1 (궁→필살기) |
| app.v1.js ALTAR_T.ultAnchorInfo | 연동 그룹 {0}의 앵커예요 — 멤버들이 이 캐릭터의 궁 턴에 맞춥니다 | `plan.ult.anchor.info` | B-8/해요체 |
| app.v1.js ALTAR_T.syncTitle | 궁극기 맞추기 | `plan.sync.title` | A-1/B-8 |
| app.v1.js ALTAR_T.syncSub | 앵커가 궁을 쓰는 턴에 멤버도 같이 씁니다 · 최대 3그룹, 한 캐릭터는 한 그룹에만 · 우선순위 2순위 (1순위 = 행동 고급 설정에서 편집한 턴, 그 턴은 맞추기 미적용) | `plan.sync.sub` | A-1 (궁→필살기); A-13 (캐릭터→동료); B-8 (앵커→기준 동료); B-8 (멤버→따라가는 동료) |
| app.v1.js ALTAR_T.syncGroup | 그룹 {0} 앵커 | `plan.sync.group` | B-8 (앵커→기준 동료) |
| app.v1.js ALTAR_T.syncAnchor | 앵커 | `plan.sync.anchor` | B-8 (앵커→기준 동료) |
| app.v1.js ALTAR_T.syncNone | — 없음 — | `plan.sync.none` | 변경 없음 |
| app.v1.js ALTAR_T.syncEmpty | 빈 자리 | `plan.sync.empty` | 변경 없음 |
| app.v1.js ALTAR_T.syncBefore | 앵커 앞 | `plan.sync.before` | B-8 (앵커→기준 동료) |
| app.v1.js ALTAR_T.syncAfter | 앵커 뒤 | `plan.sync.after` | B-8 (앵커→기준 동료) |
| app.v1.js ALTAR_T.syncOrderTip | 그 턴에 앵커 앞에 행동할지 뒤에 행동할지 (눌러서 전환) | `plan.sync.order.tip` | B-8 (앵커→기준 동료) |
| app.v1.js ALTAR_T.syncMiss | 앵커 궁 턴에 미준비면 | `plan.sync.miss` | A-1 (궁→필살기); B-8 (앵커→기준 동료) |
| app.v1.js ALTAR_T.syncMissWait | 다음까지 대기 | `plan.sync.miss.wait` | 변경 없음 |
| app.v1.js ALTAR_T.syncMissAsap | 준비되면 바로 | `plan.sync.miss.asap` | 변경 없음 |
| app.v1.js ALTAR_T.lock | 길드 제단 설정이 켜져 있어요 — 확률 100% 모드는 함께 쓸 수 없어요 | `altar.lock` | A-11/B-5/해요체 |
| app.v1.js ALTAR_T.toastOn | 길드 제단 설정 ON | `altar.toast.on` | A-11/개조식 |
| app.v1.js ALTAR_T.toastOnSub | · 확률 100% 모드는 함께 쓸 수 없어요 | `altar.toast.on.sub` | B-5/해요체 |
| app.v1.js ALTAR_T.toastOff | 길드 제단 설정 OFF | `altar.toast.off` | A-11/개조식 |
| app.v1.js ALTAR_T.loading | 제단 데이터를 불러오는 중… | `altar.loading` | 변경 없음 |
| app.v1.js ALTAR_T.loadFail | 제단 데이터를 불러오지 못했어요 (altars.json) | `altar.load.fail` | 오류 문형 '무엇이 — 왜' |
| feedback.v1.js T.fab | 💬 피드백 | `feedback.fab` | C-1 이모지 제거 |
| feedback.v1.js T.title | 피드백 보내기 | `feedback.title` | 변경 없음 |
| feedback.v1.js T.ph | 의견·버그·제안을 자유롭게 적어주세요 | `feedback.ph` | B-41 |
| feedback.v1.js T.send | 보내기 | `feedback.send` | 변경 없음 |
| feedback.v1.js T.sending | 보내는 중… | `feedback.sending` | 변경 없음 |
| feedback.v1.js T.ok | 감사합니다! 의견이 전송됐어요 🙌 | `feedback.ok` | B-41 |
| feedback.v1.js T.err | 전송 실패 — 잠시 후 다시 시도해주세요 | `feedback.err` | 해요체→개조식 |
| feedback.v1.js T.empty | 내용을 입력해주세요 | `feedback.empty` | COPY_AUDIT §3 (~주세요→명사형) |
| index.html:6 | XXL WOOFIA · 전투 시뮬레이터 | `boot.label.xxlWoofiaBattleSimulator` | 변경 없음 |
| index.html:16 | 시뮬레이터 엔진 로딩 중… | `boot.title` | 중복 병합 |
| index.html:17 | 시작하는 중… | `boot.status.starting` | 변경 없음 |
| index.html:18 | 최초 1회만 (~10초), 이후엔 캐시되어 빨라요 | `boot.hint` | B-39; 중복 병합 |
| index.html:25 | 전투 시뮬레이터 | `top.label.battleSimulator` | 변경 없음 |
| index.html:28 | 기록 | `top.history.label` | 중복 병합 |
| index.html:29 | 지난 시뮬레이션 기록 | `top.tip.pastSimulations` | 변경 없음 |
| index.html:29 | — 기록 없음 — | `top.label.noHistory` | 변경 없음 |
| index.html:30 | 기록 관리 (선택 삭제) | `top.tip.manageHistoryDeleteSelected` | 변경 없음 |
| index.html:31 | 새 버전 | `top.tip.xfb0734` | 변경 없음 |
| index.html:31 | 새 버전 | `top.tip.xfb0734` | 중복 병합 |
| index.html:33 | 타겟 더미 · 결정론 시뮬 | `(삭제)` | C-5 삭제 (타겟 더미 · 결정론 시뮬→삭제) |
| index.html:40 | 팀 편성 | `team.title` | 중복 병합 |
| index.html:40 | 로스터에서 캐릭터를 골라 슬롯에 배치 · 아이콘을 눌러 스펙/스킬 조정 | `team.label.pickCompanionsRosterInto` | B-31 (로스터→동료 목록); A-13 (캐릭터→동료); B-32 (스펙→육성) |
| index.html:44 | 캐릭터 로스터 | `team.roster.aria` | B-31 (캐릭터 로스터→동료 목록); 중복 병합 |
| index.html:50 | 전투 설정 | `cond.label.battleSettings` | 변경 없음 |
| index.html:53 | 모든 확률형 발동·버프(흑구백구 활성화, 50% 발동 등)를 100%로 강제 | `cond.tip.forceAllChanceBased` | 변경 없음 |
| index.html:53 | 🎲 확률 100% | `cond.proc.label` | C-1 이모지·장식 제거; U 확률 모드 (확률 100%→확률 효과 항상 발동); 중복 병합 |
| index.html:54 | 더미 체력을 10%로 고정 (카라트 등 저HP 게이트 전부 발동) | `cond.tip.lockDummyHp10` | A-21 (더미 체력→적 HP); B-25 (저HP 게이트→저HP 조건 효과) |
| index.html:54 | ❤️ 체력 10% | `cond.hp10.label` | C-1 이모지·장식 제거; A-21 (^체력 10%$→적 HP 10% 고정); 중복 병합 |
| index.html:55 | 매 턴 아군 전체가 최대HP의 일정 %를 피해로 받게 합니다 (무명 등 자기 HP 반응 캐릭터 검증용) | `cond.tip.everyTurnWholeTeam` | 표기 규칙 1 (최대HP→최대 HP); A-13 (캐릭터→동료) |
| index.html:55 | 🩸 턴 피해 | `cond.label.turnDmg` | C-1 이모지·장식 제거; 용어집 §2 (턴 피해→턴 데미지) |
| index.html:57 | 길드전 방탈출의 별·달 제단 효과를 전투에 적용할지 설정합니다 | `cond.tip.chooseWhichStarMoon` | A-11 (길드전 방탈출→길드 방탈출); A-12 (별·달 제단→별의 제단·달의 제단) |
| index.html:57 | 길드 제단 설정 | `cond.altar.title` | A-11/A-12 (길드 제단 설정→방탈출 제단); 중복 병합 |
| index.html:61 | 반복 횟수 | `cond.runs.label` | 중복 병합 |
| index.html:61 | (평균 — 많을수록 정확·느림) | `cond.help.averageMoreMoreAccurate` | C-2 라벨 괄호 설명 분리 → .help |
| index.html:65 | 진행 턴 수 | `cond.label.turns` | 변경 없음 |
| index.html:68 | 더미 속성 | `cond.label.dummyElement` | 변경 없음 |
| index.html:68 | (상성 ×1.5 / 역상성 ×0.75 / 무속성·무관 영향 없음) | `cond.help.advantage15Disadvantage` | A-22 (상성 ×1.5 / 역상성 ×0.75→유리 ×1.5 / 불리 ×0.75); A-24 ((?<![가-힣])무속성→속성 없음); C-2 라벨 괄호 설명 분리 → .help |
| index.html:70 | 무 | `element.none` | A-24 (무→없음); 중복 병합 |
| index.html:70 | 불 | `element.fire` | 중복 병합 |
| index.html:70 | 물 | `element.water` | 중복 병합 |
| index.html:70 | 풀 | `element.wood` | A-9 (풀→나무); 중복 병합 |
| index.html:70 | 빛 | `element.light` | 중복 병합 |
| index.html:70 | 어둠 | `element.dark` | 중복 병합 |
| index.html:73 | 적 더미 수 | `cond.label.enemyDummies` | 변경 없음 |
| index.html:78 | 아군 피격 횟수 | `cond.incoming.hits.label` | B-1 (아군 피격 횟수→적 공격 대상 수); 중복 병합 |
| index.html:78 | (N=랜덤 N명 개별 타격 / 전체=아군 전체 1회 동시 피격) | `cond.help.nNRandomAllies` | B-3 (1회 동시 피격→1회 동시에 공격받음); C-2 라벨 괄호 설명 분리 → .help |
| index.html:80 | 전체 | `team.filter.all` | 중복 병합 |
| index.html:83 | 피격 데미지 | `cond.incoming.dmg.label` | B-2 (피격 데미지→적 공격 데미지); 중복 병합 |
| index.html:83 | (더미가 아군 피격 시 아군 최대HP의 %만큼 데미지 · 배리어가 먼저 흡수 · HP 0이면 전투불능·이탈) | `cond.help.whenDummyHitsAlly` | 표기 규칙 1 (최대HP→최대 HP); A-19 (전투불능·이탈→사망); C-2 라벨 괄호 설명 분리 → .help |
| index.html:85 | 켜면 더미의 아군 피격이 아군 최대HP의 지정%만큼 데미지를 줍니다. 배리어가 먼저 소모되고, HP가 0이 되면 전투불능이 되어 이탈합니다(일부 힐러의 부활로 복귀 가능) — 배리어 탱커·힐러의 실전 성능 검증용 | `cond.tip.whenDummyHittingAlly` | 표기 규칙 1 (최대HP→최대 HP); A-19 (전투불능이 되어 이탈→사망); A-17 (힐러→치료 포지션) |
| index.html:85 | 💥 끔 | `cond.label.off` | C-1 이모지·장식 제거 |
| index.html:91 | 행동 우선순위 | `plan.label.actionPriority` | 변경 없음 |
| index.html:91 | (드래그로 순서 변경) | `plan.help.dragReorder` | C-2 라벨 괄호 설명 분리 → .help |
| index.html:92 | 행동 고급 설정 | `plan.label.advancedActionSetup` | 변경 없음 |
| index.html:94 | 고급 설정이 켜져 있어요 — 순서는 고급 설정에서 정합니다 | `plan.msg.advancedActionSetupOrder` | 해요체→개조식 |
| index.html:97 | 특정 턴만 다르게 | `plan.label.perTurnOverride` | B-19 (특정 턴만 다르게→일부 턴 순서 변경) |
| index.html:97 | (턴 여러 개 토글 선택 → 한 번에 순서 편집) | `plan.help.toggleMultipleTurnsEdit` | C-2 라벨 괄호 설명 분리 → .help |
| index.html:101 | 전부 기본값으로 | `plan.label.resetAll` | 변경 없음 |
| index.html:104 | 시뮬레이션 실행 | `cond.run` | 중복 병합 |
| index.html:108 | 길드 제단 설정 | `cond.altar.title` | A-11/A-12 (길드 제단 설정→방탈출 제단); 중복 병합 |
| index.html:110 | 턴 피해 설정 | `cond.tdmg.label` | 용어집 §2 (턴 피해 설정→턴마다 받는 데미지); 중복 병합 |
| index.html:115 | 총 데미지 | `result.label.totalDamage` | 변경 없음 |
| index.html:115 | 중앙값 | `result.label.median` | 변경 없음 |
| index.html:116 | DPS / 턴 | `result.label.dpsTurn` | 변경 없음 |
| index.html:116 | 중앙값 | `result.label.median` | 중복 병합 |
| index.html:117 | 턴 | `result.log.col.turn` | 중복 병합 |
| index.html:123 | 턴별 데미지 | `result.strip.title` | 중복 병합 |
| index.html:128 | 상세 전투 로그 | `result.label.detailedBattleLog` | 변경 없음 |
| index.html:150 | 기록 관리 | `records.label.manageHistory` | 변경 없음 |
| index.html:152 | 이름 검색… | `records.ph.searchName` | 변경 없음 |
| index.html:154 | 최신순 | `records.label.newest` | 변경 없음 |
| index.html:155 | 오래된순 | `records.label.oldest` | 변경 없음 |
| index.html:156 | 이름순 | `records.label.name` | 변경 없음 |
| index.html:157 | 총딜순 | `records.label.totalDmg` | A-16 (총딜순→총 데미지순) |
| index.html:161 | 모두 선택 | `records.label.selectAll` | 변경 없음 |
| index.html:162 | 모두 해제 | `records.label.clearAll` | 변경 없음 |
| index.html:163 | 내보내기 | `records.label.export` | 변경 없음 |
| index.html:164 | 가져오기 | `records.label.import` | 변경 없음 |
| index.html:166 | 0개 선택 | `records.label.zeroSelected` | 변경 없음 |
| index.html:170 | 선택 삭제 | `records.label.deleteSelected` | 변경 없음 |
| index.html:171 | 선택 제외 삭제 | `records.label.deleteUnselected` | 변경 없음 |
| index.html:176 | 저장된 두 기록의 조합을 캐릭터별로 비교 | `top.tip.compareTwoSavedTeams` | A-13 (캐릭터→동료); A-14 (조합→팀) |
| index.html:176 | ⚔️ 조합 비교하기 | `top.compare` | C-1 이모지·장식 제거; A-14 (조합 비교하기→팀 비교); 중복 병합 |
| index.html:177 | 시뮬레이터 기능 안내 | `top.tip.simulatorFeatureGuide` | 변경 없음 |
| index.html:177 | 📖 가이드 | `top.guide` | C-1 이모지·장식 제거; 중복 병합 |
| index.html:178 | 시뮬레이터 업데이트 내역 | `top.tip.simulatorUpdateHistory` | 변경 없음 |
| index.html:178 | 📜 패치 히스토리 | `top.patch` | C-1 이모지·장식 제거; 중복 병합 |
| index.html:185 | 📜 패치 히스토리 | `top.patch` | C-1 이모지·장식 제거; 중복 병합 |
| index.html:195 | 📖 시뮬레이터 가이드 | `guide.label.simulatorGuide` | C-1 이모지·장식 제거 |
| index.html:405 | 조합 비교 | `top.compare` | A-14 (조합→팀); 중복 병합 |
| index.html:414 | 공통 전투 설정 | `compare.label.commonBattleSettings` | 변경 없음 |
| index.html:414 | 두 조합에 함께 적용 | `compare.label.appliedBothTeams` | A-14 (조합→팀) |
| index.html:415 | 진행 턴 수 | `cond.label.turns` | 중복 병합 |
| index.html:418 | 🎲 확률 100% | `cond.proc.label` | C-1 이모지·장식 제거; U 확률 모드 (확률 100%→확률 효과 항상 발동); 중복 병합 |
| index.html:419 | ❤️ 체력 10% | `cond.hp10.label` | C-1 이모지·장식 제거; A-21 (^체력 10%$→적 HP 10% 고정); 중복 병합 |
| index.html:421 | 더미 속성 | `cond.label.dummyElement` | 중복 병합 |
| index.html:423 | 무 | `element.none` | A-24 (무→없음); 중복 병합 |
| index.html:423 | 불 | `element.fire` | 중복 병합 |
| index.html:423 | 물 | `element.water` | 중복 병합 |
| index.html:423 | 풀 | `element.wood` | A-9 (풀→나무); 중복 병합 |
| index.html:423 | 빛 | `element.light` | 중복 병합 |
| index.html:423 | 어둠 | `element.dark` | 중복 병합 |
| index.html:425 | 적 더미 수 | `cond.label.enemyDummies` | 중복 병합 |
| index.html:429 | 아군 피격 횟수 | `cond.incoming.hits.label` | B-1 (아군 피격 횟수→적 공격 대상 수); 중복 병합 |
| index.html:431 | 전체 | `team.filter.all` | 중복 병합 |
| index.html:433 | 피격 데미지 | `cond.incoming.dmg.label` | B-2 (피격 데미지→적 공격 데미지); 중복 병합 |
| index.html:435 | 켜면 더미의 아군 피격이 아군 최대HP의 지정%만큼 데미지를 줍니다. 배리어가 먼저 소모되고, HP가 0이 되면 전투불능이 되어 이탈합니다(일부 힐러의 부활로 복귀 가능) — 배리어 탱커·힐러의 실전 성능 검증용 | `cond.tip.whenDummyHittingAlly` | 표기 규칙 1 (최대HP→최대 HP); A-19 (전투불능이 되어 이탈→사망); A-17 (힐러→치료 포지션); 중복 병합 |
| index.html:435 | 💥 끔 | `cond.label.off` | C-1 이모지·장식 제거; 중복 병합 |
| index.html:438 | 비교하기 | `compare.label.compare` | 변경 없음 |
| index.html:198 | XXL WOOFIA는 5인 파티의 시너지가 핵심인 게임이지만, 다섯 캐릭터를 한 번에 조합해 결과를 확인할 수 있는 도구가 없었습니다. 캐릭터  | `guide.section.intro.intro` | C-3 (1문장으로) |
| index.html:201 | 팀 편성 | `guide.section.team.title` | 변경 없음 |
| index.html:202 | 캐릭터 로스터에서 5인 파티를 구성합니다. 아이콘 우상단의 X 또는 로스터에서 다시 눌러 캐릭터를 제외할 수 있습니다. | `guide.section.team.body` | B-31 (캐릭터 로스터→동료 목록); B-31 (로스터→동료 목록); A-13 (캐릭터→동료); A-14 (파티→팀) |
| index.html:205 | 캐릭터 설정 | `guide.section.char.title` | A-13 (캐릭터→동료) |
| index.html:206 | 각 캐릭터를 선택하면 상세 패널이 열립니다. | `guide.section.char.body` | A-13 (캐릭터→동료) |
| index.html:208 | 도장 강화 on/off 및 공격력·체력 배분 조절 | `guide.section.char.item` | A-5 (도장 강화→도장 제련); A-21 (공격력·체력→ATK·HP) |
| index.html:209 | 캐릭터 스펙 설정 — 오른쪽 패널에서 스타 · 진화 단계 · 레벨 · 육성도와 스킬별 레벨을 각각 지정합니다. 끄면 풀육성(Lv60 · 스타5  | `guide.section.char.item2` | B-32 (캐릭터 스펙 설정→육성 설정); A-7 (풀육성→최대 육성); A-4 (도장 해제→도장 잠금해제); A-6 (육성도→적합도) |
| index.html:210 | 보유 스킬 목록 및 스킬 상세 효과 확인 | `guide.section.char.item3` | 변경 없음 |
| index.html:214 | 캐릭터 스펙 설정 | `guide.section.grow.title` | B-32 (캐릭터 스펙 설정→육성 설정) |
| index.html:215 | 캐릭터 상세 패널의 도장 강화 위 오른쪽에 있는 ‘◈ 캐릭터 스펙 설정’ 버튼을 누르면 카드 옆으로 창이 열립니다. 스타 · 진화 단계 · 레벨 | `guide.section.grow.body` | C-1 이모지·장식 제거; B-32 (캐릭터 스펙 설정→육성 설정); A-5 (도장 강화→도장 제련); A-6 (육성도→적합도); A-13 (캐릭터→동료) |
| index.html:218 | 우측 상단 ‘사용’이 꺼져 있는 동안에는 지금까지처럼 풀육성(Lv60 · 스타5 · 육성도5 · 전 스킬 10 · 도장 해제) 기준으로 계산합니 | `guide.section.grow.body2` | A-7 (풀육성→최대 육성); A-4 (도장 해제→도장 잠금해제); A-6 (육성도→적합도) |
| index.html:221 | 지금 설정으로 계산한 공격력과 체력이 즉시 표시되고, 슬라이더를 끄는 동안 숫자가 따라 움직입니다. 오른쪽의 ‘풀육성 대비 %’로 만렙과 얼마나 | `guide.section.grow.body3` | B-33 (풀육성 대비→최대 육성 대비); 속어 (만렙→최대 레벨); A-5 (도장 강화→도장 제련); A-21 (공격력→ATK); A-21 (체력→HP) |
| index.html:224 | 슬라이더를 움직이면 별이 켜집니다. 아래 스킬 해금을 결정하는 핵심 값이라, 내리면 잠기는 스킬이 스킬 레벨 목록에서 함께 바뀝니다. | `guide.section.grow.body4` | 변경 없음 |
| index.html:227 | 스타 안에서의 단계입니다. 상한이 스타에 따라 달라지고(스타0은 4, 스타4는 24), 스타5는 더 밟을 단계가 없어 비활성됩니다. 단계 중간에 | `guide.section.grow.body5` | 변경 없음 |
| index.html:230 | 레벨은 1~60이며 스탯에 가장 크게 영향을 줍니다. | `guide.section.grow.body6` | 변경 없음 |
| index.html:233 | 육성도는 0~5이고 슬라이더에 따라 하트가 켜집니다. 육성도 보정이 없는 희귀도에서는 비활성됩니다. | `guide.section.grow.body7` | A-6 (육성도→적합도) |
| index.html:236 | 평타 · 필살기 · 패시브를 각각 1~10으로 정합니다. 스킬 이름과 아이콘이 함께 표시됩니다. 필살기 바로 아래 ‘도장 해제’ 스위치를 켜면  | `guide.section.grow.body8` | A-4 (도장 해제→도장 잠금해제); A-2 (평타→보통 공격) |
| index.html:239 | 패시브도 하나씩 따로 조절합니다. 스타가 낮아 잠긴 스킬은 ‘스타 N 해금’으로 표시되어 아예 발동하지 않고, 해방됐지만 아직 레벨을 못 올리는 | `guide.section.grow.body9` | A-27 ((^\|‘)스타 (\d+\|N) 해금($\|’)→\1\2스타 도달 시 오픈\3); A-27 ((^\|‘)스타 (\d+\|N)부터($\|’)→\1\2스타부터 레벨업\3) |
| index.html:241 | 스타는 스킬 해금을 결정합니다. 스타 2에서 패시브 2의 레벨업이 열리고, 스타 3에서 패시브 3과 도장이, 스타 4·5에서 패시브 4·5가 차 | `guide.section.grow.note` | A-2 (평타→보통 공격) |
| index.html:242 | 스펙을 켠 캐릭터는 편성 슬롯 왼쪽 아래에 별 배지가 붙어, 풀육성이 아닌 캐릭터를 한눈에 구분할 수 있습니다. 비교 창에서는 캐릭터를 누른 뒤 | `guide.section.grow.note2` | C-1 이모지·장식 제거; B-30 (비교군→비교 팀); A-7 (풀육성→최대 육성); A-6 (육성도→적합도); A-13 (캐릭터→동료); B-32 (스펙→육성) |
| index.html:244 | 턴별 행동 계획 | `guide.section.turnPlan.title` | 변경 없음 |
| index.html:245 | 턴마다 캐릭터의 행동(평타 · 궁 · 방어)을 직접 지정할 수 있습니다. 끄면 자동으로 처리되며, 2회 행동 캐릭터 등 특수 케이스는 전용 설정 | `guide.section.turnPlan.body` | A-2 (평타 · 궁 · 방어→보통 공격 · 필살기 · 방어); A-13 (캐릭터→동료) |
| index.html:247 | 칸을 누르면 그 칸만 바뀝니다. 아무것도 손대지 않은 기본 계획에서 궁을 누를 때만 이후 궁이 쿨 주기에 맞춰 함께 옮겨지고, 필요하면 ‘궁 간 | `guide.section.turnPlan.note` | B-10 (궁 간격 맞추기→필살기 턴 재배치); B-11 (첫 궁 당기기→첫 필살기 앞당기기); B-16 (패시브 방어→필살기 전 턴 방어); A-1 (궁→필살기); A-15 (쿨→쿨타임) |
| index.html:249 | 전투 설정 | `guide.section.cond.title` | 변경 없음 |
| index.html:251 | 확률 100% 모드 — 모든 확률형 버프·공격을 무조건 발동시켜 계산 | `guide.section.cond.item` | U 확률 모드 (확률 100% 모드→확률 효과 항상 발동) |
| index.html:252 | 체력 10% 모드 — 딸피 구간 데미지 검증용 고정 체력 옵션 | `guide.section.cond.item2` | B-24 (중복 제거) |
| index.html:253 | 반복 횟수 — 평균·최소·최대값 산출 (값이 클수록 정확하지만 느림) | `guide.section.cond.item3` | F-1/F-2 (평균·최소·최대 → 중앙값) |
| index.html:254 | 진행 턴 수 조절 | `guide.section.cond.item4` | 변경 없음 |
| index.html:255 | 더미 속성 — 무·불·물·풀·빛·어둠 선택으로 상성(×1.5)·역상성(×0.75) 상황 확인 (무속성·무관 속성은 영향 없음) | `guide.section.cond.item5` | A-22 (상성(×1.5)·역상성(×0.75)→유리 속성(×1.5)·불리 속성(×0.75)); A-9/A-24 (무·불·물·풀·빛·어둠→없음·불·물·나무·빛·어둠); A-24 ((?<![가-힣])무속성→속성 없음) |
| index.html:256 | 적 더미 수 지정 | `guide.section.cond.item6` | 변경 없음 |
| index.html:257 | 아군 피격 횟수 — 0(아군을 타격하지 않음), 1~5(적 N명이 개별 타격), 전체(아군 전체 1회 동시 피격). 반격 횟수 등 결과가 달라집 | `guide.section.cond.item7` | B-1 (아군 피격 횟수→적 공격 대상 수); B-3 (1회 동시 피격→1회 동시에 공격받음) |
| index.html:261 | 행동 우선순위 | `guide.section.order.title` | 변경 없음 |
| index.html:262 | 같은 턴에 누가 먼저 움직이느냐에 따라 버프·연계 결과가 달라지므로, 행동 순서를 직접 지정할 수 있습니다. | `guide.section.order.body` | 변경 없음 |
| index.html:264 | 기본적으로 파티의 행동 순서는 매 턴 동일하게 적용되며, 목록을 드래그해 순서를 바꿉니다. | `guide.section.order.item` | A-14 (파티→팀) |
| index.html:265 | 특정 턴만 다르게 — 순서를 바꾸고 싶은 턴을 여러 개 토글로 선택한 뒤 한 번에 편집하면, 선택한 턴들에만 다른 순서가 일괄 적용됩니다. (예 | `guide.section.order.item2` | B-19 (특정 턴만 다르게→일부 턴 순서 변경) |
| index.html:266 | 전부 기본값으로 버튼으로 지정한 순서를 한 번에 초기화할 수 있습니다. | `guide.section.order.item3` | 변경 없음 |
| index.html:270 | 행동 고급 설정 | `guide.section.adv.title` | 변경 없음 |
| index.html:271 | 행동 우선순위 옆의 ‘행동 고급 설정’ 버튼을 누르면 열립니다. 탭이 세 개입니다 — 턴별 타임라인(턴마다 누가 · 어떤 순서로 · 무엇을 할지 | `guide.section.adv.body` | A-1 (궁극기 사용 방식→필살기 사용 방식); A-13 (캐릭터→동료) |
| index.html:274 | 턴별 타임라인 탭 우측 상단의 ‘사용’을 켜야 적용됩니다. 켜는 순간 행동 우선순위 · 특정 턴만 다르게 · 캐릭터별 턴별 행동 계획이 모두 이 | `guide.section.adv.body2` | B-19 (특정 턴만 다르게→일부 턴 순서 변경); A-13 (캐릭터→동료) |
| index.html:278 | 복사 · 붙여넣기 — 지금 턴의 편성을 통째로 복사해 다른 턴에 넣습니다. 넣을 수 없는 턴에는 거부됩니다. | `guide.section.adv.item` | 변경 없음 |
| index.html:279 | 호환 턴 전부 체크 — 클립보드를 그대로 넣을 수 있는 턴을 찾아 선택만 해 줍니다. 실제 적용은 붙여넣기를 눌러야 일어나므로 어디에 들어갈지  | `guide.section.adv.item2` | B-18 (호환 턴 전부 체크→붙여넣을 수 있는 턴 모두 선택) |
| index.html:280 | 되돌리기 — 직전 변경을 하나씩 취소합니다. 순서 이동(▲▼)도 기록됩니다. | `guide.section.adv.item3` | C-1 이모지·장식 제거 |
| index.html:281 | 전체 보기 — 전 턴을 한눈에 보는 표를 펼칩니다. | `guide.section.adv.item4` | 변경 없음 |
| index.html:285 | 복사하면 클립보드 줄이 나타나 몇 턴 · 몇 행동을 담고 있는지 알려줍니다. ‘비우기’로 지웁니다. | `guide.section.adv.body3` | 변경 없음 |
| index.html:288 | 편집할 턴을 고릅니다. 기본값과 달라진 턴은 우상단에 점이 붙습니다. 위 그림에서는 4·7·10·13·16·19·22·25·28턴이 선택되어 테 | `guide.section.adv.body4` | 변경 없음 |
| index.html:291 | 선택한 턴 목록이 그대로 표시되고, ‘선택 해제’로 비웁니다. | `guide.section.adv.body5` | 변경 없음 |
| index.html:294 | ‘전체 보기’를 누르면 전 턴이 표로 펼쳐집니다. 점 색은 평타 · 필살 · 방어를 뜻하고, 한 칸에 점이 여러 개면 그 턴에 여러 번 행동한다 | `guide.section.adv.body6` | A-2 (평타→보통 공격); A-13 (캐릭터→동료) |
| index.html:297 | 지금 편집 중인 턴과 그 턴의 총 행동 수입니다. ‘이 턴 기본값으로’는 이 턴만 되돌립니다. | `guide.section.adv.body7` | 변경 없음 |
| index.html:300 | 왼쪽 번호가 실행 순서입니다. 각 줄에서 평 · 궁 · 방을 골라 행동을 바꾸고, ▲▼로 순서를 옮기며, ✕로 그 행동을 뺍니다. 지금 선택된  | `guide.section.adv.body8` | C-1 이모지·장식 제거; A-2 (평 · 궁 · 방→보통 공격 · 필살기 · 방어) |
| index.html:303 | ‘추가’ 배지가 붙은 줄은 앞선 필살기가 만들어 준 행동입니다. 같은 캐릭터가 한 턴에 여러 번 나올 수 있습니다. 위 그림 10번 줄의 궁처럼 | `guide.section.adv.body9` | A-1 (궁→필살기); A-13 (캐릭터→동료) |
| index.html:306 | 캐릭터 칩을 눌러 그 턴에 행동을 더합니다. 행동 예산이 없는 캐릭터는 칩이 나타나지 않습니다. | `guide.section.adv.body10` | B-22 (행동 예산→남은 행동 횟수); B-34 (캐릭터 칩→동료 버튼); A-13 (캐릭터→동료) |
| index.html:310 | 선택 턴 기본값으로 — 위에서 선택한 턴들을 한 번에 되돌립니다. | `guide.section.adv.item5` | 변경 없음 |
| index.html:311 | 전체 턴 기본값으로 — 전 턴을 기본 세팅으로 되돌립니다. | `guide.section.adv.item6` | 변경 없음 |
| index.html:312 | 기존 설정 불러오기 — 지금까지 쓰던 행동 계획 · 우선순위 · 특정 턴 순서를 그대로 타임라인으로 가져옵니다. 캐릭터별 사이클을 손보는 출발점 | `guide.section.adv.item7` | A-13 (캐릭터→동료) |
| index.html:315 | 행동 예산은 시뮬레이터가 계산합니다. 요청한 행동이 예산을 넘으면 그 행동은 실행되지 않고, 쿨타임이 안 찬 필살기는 평타로 나갑니다. 목록에  | `guide.section.adv.note` | B-22 (행동 예산→남은 행동 횟수); A-2 (평타→보통 공격) |
| index.html:316 | 비교 창에서도 행동 우선순위 팝업 안의 같은 버튼으로 비교군별 타임라인을 따로 짤 수 있습니다. 비교군에 이 설정이 켜져 있으면 그 캐릭터의 행 | `guide.section.adv.note2` | B-30 (비교군→비교 팀); A-13 (캐릭터→동료) |
| index.html:318 | 길드 제단 · 턴 피해 | `guide.group.altarTdmg.title` | A-11/A-12 (길드 제단→방탈출 제단); 용어집 §2 (턴 피해→턴 데미지) |
| index.html:319 | 전투 설정 머리말의 버튼으로 길드전 방탈출의 제단 효과와 매 턴 피해를 전투에 얹어 검증할 수 있습니다. 둘 다 같은 자리(오른쪽 패널)에 열리 | `guide.section.altarTdmg.body` | A-11 (길드전 방탈출→길드 방탈출); 용어집 §2 (매 턴 피해→턴마다 받는 데미지) |
| index.html:322 | 길드 제단 설정 | `guide.section.altar.title` | A-11/A-12 (길드 제단 설정→방탈출 제단) |
| index.html:323 | ‘길드 제단 설정’을 누르면 층별 제단 효과 목록이 열립니다. 우측 상단 사용을 켜야 전투에 반영됩니다. | `guide.section.altar.body` | A-11/A-12 (길드 제단 설정→방탈출 제단); A-12 (별 제단→별의 제단) |
| index.html:325 | 별 제단은 켤수록 불리해지는 페널티(받는 치료 감소·필살기 최대 CD 증가 등), 달 제단은 켤수록 유리해지는 축복입니다 — 같은 ‘활성화’라도 | `guide.section.altar.item` | A-12/F-4 재작성(가이드·패널 설명 충돌 해소, 의미 변경) |
| index.html:326 | 층은 1층부터 순서대로만 켤 수 있고, 위층을 켜면 아래층도 함께 켜집니다. 각 효과는 개별로 껐다 켤 수 있습니다. | `guide.section.altar.item2` | A-12 (켜다→점등) |
| index.html:330 | 궁극기 사용 방식 | `guide.section.ultMode.title` | A-1 (궁극기 사용 방식→필살기 사용 방식) |
| index.html:331 | 행동 고급 설정의 두 번째 탭입니다. 계획한 턴에 맞춰 쓸지(정해진 턴), 그 턴에만 쓸지(정해진 턴만), 준비되는 대로 바로 쓸지(준비되면 바 | `guide.section.ultMode.body` | A-13 (캐릭터→동료) |
| index.html:332 | 길드 제단의 ‘행동 시 · 필살 시 확률로 CD 감소’ 효과가 걸려 있으면 탭 위에 안내가 뜨고, 캐릭터마다 ‘확률 쿨 감소 성공 가정’ 스위치 | `guide.section.ultMode.note` | B-13 (확률 쿨 감소 성공 가정→확률 CD 감소 항상 성공); B-14 (그대로 나올 확률→이 흐름의 재현 확률); B-11 (첫 궁 당기기→첫 필살기 앞당기기); A-11/A-12 (길드 제단→방탈출 제단); A-15 ((\d+)쿨→CD \1턴); A-1 (궁→필살기); A-13 (캐릭터→동료); A-15 (쿨→쿨타임); B 해요체→평서 |
| index.html:335 | 연동 (궁 맞추기) | `guide.section.sync.title` | A-1/B-8 (연동 (궁 맞추기)→필살기 연동) |
| index.html:336 | 행동 고급 설정의 세 번째 탭입니다. 그룹의 앵커가 궁을 쓰는 턴에 멤버가 무엇을 할지 정합니다(최대 3그룹, 한 캐릭터는 한 그룹에만). | `guide.section.sync.body` | A-1 (궁→필살기); A-13 (캐릭터→동료); B-8 (앵커→기준 동료); B-8 (멤버→따라가는 동료) |
| index.html:338 | 같이 궁 — 앵커 바로 앞 또는 뒤에서 함께 궁을 씁니다. | `guide.section.sync.item` | A-1 (궁→필살기); B-8 (앵커→기준 동료) |
| index.html:339 | 방어 → 받은 추가 행동에서 궁 / 평타 → 받은 추가 행동에서 궁 — 앵커 궁 턴에는 방어(또는 평타)를 하고, 앵커의 필살기가 만들어 준 추 | `guide.section.sync.item2` | A-1 (궁→필살기); A-2 (평타→보통 공격); B-8 (앵커→기준 동료); B-8 (멤버→따라가는 동료) |
| index.html:340 | 앵커가 궁을 안 쓰는 턴에는 멤버마다 궁 아끼기 또는 내 사용 방식대로를 고릅니다. ‘받은 추가 행동에서 궁’ 멤버는 기본이 내 사용 방식대로라 | `guide.section.sync.item3` | B-9 (내 사용 방식대로→개별 설정 따름); B-9 (궁 아끼기→필살기 보류); A-1 (궁→필살기); B-8 (앵커→기준 동료); B-8 (멤버→따라가는 동료) |
| index.html:341 | 필살기로 동료의 쿨을 되돌려 주는 캐릭터와 그 대상이 같은 턴에 함께 추가 행동을 받으면, 대상의 필살기가 준비돼 있을 때 대상이 먼저 행동합니 | `guide.section.sync.item4` | A-13 (캐릭터→동료); A-15 (쿨→쿨타임) |
| index.html:342 | 욱영이 편성에 있으면 연동 자동 설정 버튼이 인접 아군을 한 번에 묶어 줍니다. | `guide.section.sync.item5` | 변경 없음 |
| index.html:344 | 타임라인이 켜져 있으면 타임라인이 우선이라 이 두 탭은 쉽니다. 타임라인 탭에는 ‘특정 턴만 다르게’ · ‘캐릭터별 턴 계획’이 남아 있을 때  | `guide.section.sync.note` | B-19 (특정 턴만 다르게→일부 턴 순서 변경); A-13 (캐릭터→동료) |
| index.html:347 | 턴 피해 설정 | `guide.section.tdmg.title` | 용어집 §2 (턴 피해 설정→턴마다 받는 데미지) |
| index.html:348 | 매 턴 아군 전체가 최대 HP의 일정 %만큼 피해를 받게 합니다. 자기 HP에 반응하는 캐릭터(무명 등)와 힐러·부활의 가치를 확인할 때 씁니다 | `guide.section.tdmg.body` | A-17 (힐러→치료 포지션); A-13 (캐릭터→동료) |
| index.html:350 | 적 페이즈가 끝날 때 적용되며, 배리어가 먼저 흡수하고 방어한 턴은 절반만 받습니다. 받는 데미지 증감도 반영됩니다. | `guide.section.tdmg.item` | 변경 없음 |
| index.html:351 | HP가 0이 되면 전투불능이 되어 이탈합니다 — 이후 행동·타격·버프에서 빠집니다(딜이 끊깁니다). 피격 데미지 설정도 동일합니다. 그래서 힐러 | `guide.section.tdmg.item2` | B-2 (피격 데미지→적 공격 데미지); A-19 (전투불능이 되어 이탈→사망); A-17 (힐러→치료 포지션); A-16 (딜→데미지) |
| index.html:352 | 부활 — 기리안의 도장(룬)은 필살기 발동 시 일정 확률로 사망한 아군 한 명을 최대 HP 25%로 되살립니다. 확률형이라 확률 밴드(바닥~천장 | `guide.section.tdmg.item3` | A-3 (도장(룬)→도장); 용어집 §2 (확률 밴드(바닥~천장)→확률 범위) |
| index.html:353 | 피해 대상 (아군 수) — 매 턴 피해를 받는 아군 수를 1~5인 중에 고릅니다(기본 전체). 전체보다 적게 두면 현재 HP%가 높은 아군부터  | `guide.section.tdmg.item4` | 용어집 §2 (매 턴 피해→턴마다 받는 데미지); U9 (피해 대상→데미지 대상); A-17 (힐→치료) |
| index.html:354 | 고급 · 턴별로 다르게를 켜면 턴마다 피해 %를 따로 지정할 수 있습니다. 비운 칸은 위의 기본값을 씁니다. | `guide.section.tdmg.item5` | B-20 (고급 · 턴별로 다르게→턴마다 값 지정) |
| index.html:358 | 시뮬레이션 결과 | `guide.group.result.title` | 변경 없음 |
| index.html:360 | 통계 · 랭킹 | `guide.section.stats.title` | 변경 없음 |
| index.html:361 | 총 데미지·DPS·턴 수와 함께 캐릭터별 기여도를 막대 랭킹으로 표시합니다. 각 수치는 중앙값·최소값·최대값을 함께 제공합니다. | `guide.section.stats.body` | F-2 (최소~최대 → 확률 범위, 사실 정정) |
| index.html:364 | 턴별 데미지 차트 | `guide.section.chart.title` | 변경 없음 |
| index.html:365 | 턴별 데미지를 누적 막대로 표시하며, 그래프에 마우스를 올리면 해당 턴의 캐릭터별 수치가 나타납니다. | `guide.section.chart.body` | A-13 (캐릭터→동료) |
| index.html:368 | 데미지 추적 | `guide.section.trace.title` | 변경 없음 |
| index.html:369 | 데미지의 출처를 끝까지 추적합니다. | `guide.section.trace.body` | 변경 없음 |
| index.html:371 | 데미지 출처(스킬·반격·패시브) 명시 및 스킬 정보 연동 | `guide.section.trace.item` | 변경 없음 |
| index.html:372 | 데미지 계산식 분해 (기초 ATK · 계수 · 고정값 · 상성 등) | `guide.section.trace.item2` | A-22 (상성→유리 속성) |
| index.html:373 | 버프 계수의 출처별 누적 내역까지 추적 | `guide.section.trace.item3` | 변경 없음 |
| index.html:377 | 조합 비교하기 | `guide.group.compare.title` | A-14 (조합 비교하기→팀 비교) |
| index.html:378 | 서로 다른 두 조합(또는 동일 조합의 변형)을 나란히 두고 턴별 누적 데미지를 비교합니다. | `guide.section.compare.body` | A-14 (조합→팀) |
| index.html:380 | 사이트 우측 하단(이 가이드 버튼 위)의 ⚔️ 조합 비교하기 버튼을 누르면 비교 창이 열립니다. | `guide.section.compare.item` | C-1 이모지·장식 제거; A-14 (조합 비교하기→팀 비교) |
| index.html:381 | 비교군 선택 — 기존 기록을 불러오거나, 추가 버튼으로 캐릭터를 하나씩 구성 | `guide.section.compare.item2` | B-30 (비교군→비교 팀); A-13 (캐릭터→동료) |
| index.html:382 | 턴 설정 — 비교군 중 가장 적은 턴에 맞춰 자동 정렬되며, 직접 수정 가능 | `guide.section.compare.item3` | B-30 (비교군→비교 팀) |
| index.html:383 | 캐릭터별 설정 — 교체 대상 선택, 도장 강화, 턴별 행동, 행동 우선순위를 비교군마다 따로 지정 | `guide.section.compare.item4` | B-30 (비교군→비교 팀); A-5 (도장 강화→도장 제련); A-13 (캐릭터→동료) |
| index.html:384 | 그래프 — 두 조합의 누적 데미지 곡선을 함께 표시하고, 마우스를 올리면 턴별 차이(수치·%)를 보여줍니다. | `guide.section.compare.item5` | A-14 (조합→팀) |
| index.html:389 | 기록 시스템 | `guide.group.records.title` | 변경 없음 |
| index.html:390 | 시뮬레이션 결과는 자동으로 기록되며, 이름 검색·정렬로 다시 찾아볼 수 있습니다. 기록 항목의 점 3개 메뉴에서 이름 변경 · 상단 고정 · 잠 | `guide.section.records.body` | 변경 없음 |
| index.html:391 | 페이지를 새로고침하거나 다시 열면 마지막으로 작업하던 설정이 그대로 돌아옵니다. 기록을 불러오면 그 기록의 편성과 조건으로 바뀌며, 알림의 ‘되 | `guide.section.records.note` | A-1 (궁극기 사용 방식→필살기 사용 방식); A-13 (캐릭터→동료); B-32 (스펙→육성) |
| index.html:392 | 내보내기 / 가져오기 — 선택한 기록(복수 선택 가능)을 파일로 저장하거나 공유 코드로 복사할 수 있으며, 받은 코드를 가져오기에 붙여넣으면 그 | `guide.section.records.body2` | 변경 없음 |
| index.html:395 | ⚠️ 모든 캐릭터의 검증이 완료된 것은 아니며, 일부 캐릭터의 패시브 처리에 오류가 있을 수 있습니다. 오류나 개선점을 발견하면 피드백 부탁드립 | `guide.section.records.note2` | C-1 이모지·장식 제거; A-13 (캐릭터→동료) |
| index.html:199 (guide/overview.png) | 전체 화면 | `guide.fig.overview` | 변경 없음 |
| index.html:203 (guide/team.png) | 팀 편성 | `guide.fig.team` | 변경 없음 |
| index.html:212 (guide/character.png) | 캐릭터 설정 | `guide.fig.character` | A-13 (캐릭터→동료) |
| index.html:212 (guide/skill.png) | 스킬 상세 | `guide.fig.skill` | 변경 없음 |
| index.html:217 (guide/cs-head.png) | 스펙 패널 머리말 | `guide.fig.csHead` | B-32 (스펙→육성) |
| index.html:220 (guide/cs-stats.png) | 공격력·체력 표시 | `guide.fig.csStats` | A-21 (공격력·체력→ATK·HP) |
| index.html:223 (guide/cs-star.png) | 스타 | `guide.fig.csStar` | 변경 없음 |
| index.html:226 (guide/cs-pevo.png) | 진화 단계 | `guide.fig.csPevo` | 변경 없음 |
| index.html:229 (guide/cs-level.png) | 레벨 | `guide.fig.csLevel` | 변경 없음 |
| index.html:232 (guide/cs-bond.png) | 육성도 | `guide.fig.csBond` | A-6 (육성도→적합도) |
| index.html:235 (guide/cs-skills.png) | 스킬 레벨 · 도장 해제 | `guide.fig.csSkills` | A-4 (도장 해제→도장 잠금해제) |
| index.html:238 (guide/cs-passives.png) | 패시브 레벨 | `guide.fig.csPassives` | 변경 없음 |
| index.html:246 (guide/turn-plan.png) | 턴별 행동 계획 | `guide.fig.turnPlan` | 변경 없음 |
| index.html:259 (guide/dummy-element.png) | 더미 속성 | `guide.fig.dummyElement` | 변경 없음 |
| index.html:259 (guide/ally-hits.png) | 아군 피격 횟수 | `guide.fig.allyHits` | B-1 (아군 피격 횟수→적 공격 대상 수) |
| index.html:268 (guide/turn-priority.png) | 특정 턴만 다르게 | `guide.fig.turnPriority` | B-19 (특정 턴만 다르게→일부 턴 순서 변경) |
| index.html:273 (guide/adv-head.png) | 고급 설정 머리말 | `guide.fig.advHead` | 변경 없음 |
| index.html:276 (guide/adv-tools.png) | 편집 도구 | `guide.fig.advTools` | 변경 없음 |
| index.html:284 (guide/adv-clip.png) | 클립보드 | `guide.fig.advClip` | 변경 없음 |
| index.html:287 (guide/adv-rail.png) | 턴 버튼 | `guide.fig.advRail` | 변경 없음 |
| index.html:290 (guide/adv-sel.png) | 선택 상태 | `guide.fig.advSel` | 변경 없음 |
| index.html:293 (guide/adv-grid.png) | 전체 보기 | `guide.fig.advGrid` | 변경 없음 |
| index.html:296 (guide/adv-turnhead.png) | 턴 머리말 | `guide.fig.advTurnhead` | 변경 없음 |
| index.html:299 (guide/adv-rows.png) | 행동 목록 | `guide.fig.advRows` | 변경 없음 |
| index.html:302 (guide/adv-extra.png) | 추가 행동 | `guide.fig.advExtra` | 변경 없음 |
| index.html:305 (guide/adv-add.png) | 행동 추가 | `guide.fig.advAdd` | 변경 없음 |
| index.html:308 (guide/adv-foot.png) | 기본값 · 불러오기 | `guide.fig.advFoot` | 변경 없음 |
| index.html:320 (guide/altar-btn.png) | 제단 · 턴 피해 버튼 | `guide.fig.altarBtn` | 용어집 §2 (턴 피해→턴 데미지) |
| index.html:328 (guide/altar-panel.png) | 길드 제단 설정 패널 | `guide.fig.altarPanel` | A-11/A-12 (길드 제단 설정→방탈출 제단) |
| index.html:333 (guide/altar-ult.png) | 궁극기 사용 방식 | `guide.fig.altarUlt` | A-1 (궁극기 사용 방식→필살기 사용 방식) |
| index.html:345 (guide/altar-sync.png) | 연동 그룹 | `guide.fig.altarSync` | 변경 없음 |
| index.html:356 (guide/tdmg-panel.png) | 턴 피해 설정 | `guide.fig.tdmgPanel` | 용어집 §2 (턴 피해 설정→턴마다 받는 데미지) |
| index.html:356 (guide/tdmg-adv.png) | 턴별 피해 % | `guide.fig.tdmgAdv` | A-25 (턴별 피해→턴별 데미지) |
| index.html:362 (guide/result-ranking.png) | 결과 랭킹 | `guide.fig.resultRanking` | 변경 없음 |
| index.html:366 (guide/result-chart.png) | 턴별 차트 | `guide.fig.resultChart` | 변경 없음 |
| index.html:375 (guide/damage-trace.png) | 데미지 추적 | `guide.fig.damageTrace` | 변경 없음 |
| index.html:375 (guide/buff-trace.png) | 버프 계수 추적 | `guide.fig.buffTrace` | 변경 없음 |
| index.html:386 (guide/compare.png) | 조합 비교 | `guide.fig.compare` | A-14 (조합→팀) |
| index.html:387 (guide/compare-setup.png) | 비교군 캐릭터 설정 | `guide.fig.compareSetup` | B-30 (비교군→비교 팀); A-13 (캐릭터→동료) |
| index.html:387 (guide/compare-chart.png) | 비교 차트 | `guide.fig.compareChart` | 변경 없음 |
| index.html:393 (guide/records.png) | 기록 관리 | `guide.fig.records` | 변경 없음 |
| index.html:393 (guide/export.png) | 내보내기 / 공유 코드 | `guide.fig.export` | 변경 없음 |
| app.v1.js:3899 | 끄면 풀육성(Lv60 · 스타5 · 육성도5 · 전 스킬 10 · 도장 해제) 기준으로 계산합니다. | `grow.hint.whenOffEverythingCalculated` | A-7 (풀육성→최대 육성); A-4 (도장 해제→도장 잠금해제); A-6 (육성도→적합도) |
| app.v1.js:2228 | 이 시점엔 필살기를 쓸 수 없어요 — 쿨타임 | `manual.msg.exSkillNotReady` | B-37 |
| index.html:215 | ◈ 캐릭터 스펙 설정 | `(가이드 블록에 흡수)` | 가이드 블록 단위 키로 대체 |
| app.v1.js:796 | ◈ 스펙 | `compare.label.spec` | C-1 이모지·장식 제거; B-32 (스펙→육성) |
| app.v1.js:943 | 끄면 | `compare.label.whenOff` | 변경 없음 |
| app.v1.js:310 | 풀육성 | `records.label.fullyInvested` | A-7 (풀육성→최대 육성) |
| app.v1.js:3904 | 풀육성 대비 | `grow.label.vsFullyInvested` | B-33 (풀육성 대비→최대 육성 대비) |
| app.v1.js:308 | 도장 해제 | `records.label.unlockSigil` | A-4 (도장 해제→도장 잠금해제) |
| app.v1.js:4530 | 1레벨 고정 | `grow.label.lockedLv1` | 변경 없음 |
| app.v1.js:58 | 추가 | `records.label.extra` | 변경 없음 |
| app.v1.js:549 | 복사 | `records.label.copy` | 변경 없음 |
| app.v1.js:570 | 붙여넣기 | `records.label.paste` | 변경 없음 |
| app.v1.js:2147 | 비우기 | `manual.label.clear` | 변경 없음 |
| app.v1.js:2158 | 이 턴 기본값으로 | `manual.label.resetTurn` | 변경 없음 |
| app.v1.js:3908 | / 5 · 아래 스킬 해금을 결정합니다 | `grow.hint.5DecidesWhichSkills` | 변경 없음 |
| app.v1.js:3919 | ★5는 더 밟을 단계가 없어요 | `grow.msg.star5HasNo` | B 해요체→평서 |
| app.v1.js:3882 | 도장 필살기로 나갑니다 | `grow.hint.sigilExSkillUsed` | 변경 없음 |
| app.v1.js:3882 | 일반 필살기로 나갑니다 | `grow.hint.normalExSkillUsed` | 변경 없음 |
| app.v1.js:3883 | 스타 3부터 해제할 수 있어요 | `grow.label.unlockableStar3` | A-4/A-27 (G-UI 14205) |
| app.v1.js:4530 | 이 스타에서는 레벨을 올릴 수 없어요 | `grow.msg.cannotLeveledStar` | B 해요체→평서 |
| app.v1.js:3899 | (Lv60 · 스타5 · 육성도5 · 전 스킬 10 · 도장 해제) 기준으로 계산합니다. | `grow.hint.lv60Star5Compatibility` | A-4 (도장 해제→도장 잠금해제); A-6 (육성도→적합도) |
| app.v1.js:2462 | 턴마다 누가 · 어떤 순서로 · 무엇을 할지 직접 정합니다 | `adv.hint.setWhoActsWhat` | 변경 없음 |
| app.v1.js:2472 | 켜면 행동 우선순위 · 특정 턴만 다르게 · 캐릭터별 턴별 행동 계획이 모두 이 화면으로 대체됩니다. 같은 캐릭터가 한 턴에 여러 번 행동할 수 있고, ‘추가’ 표시는 앞선 필살기가 만들어 준 행동입니다. | `adv.hint.whenActionPriorityPer` | B-19 (특정 턴만 다르게→일부 턴 순서 변경); A-13 (캐릭터→동료) |
| app.v1.js:2480 | 클립보드를 그대로 넣을 수 있는 턴을 찾아 선택합니다 — 적용은 붙여넣기 | `adv.msg.findsSelectsTurnsClipboard` | 변경 없음 |
| app.v1.js:2245 | 이 턴엔 더 행동할 수 없어요 — 추가 행동은 임부언·욱영의 필살기가 만들어 줍니다 | `manual.msg.noActionBudgetLeft` | B-36 |
| app.v1.js:2500 | 캐릭터별 턴 계획 · 행동 우선순위 · 특정 턴 순서로 돌린 결과를 타임라인으로 가져옵니다 | `adv.hint.importsResultPerCompanion` | A-13 (캐릭터→동료) |
| 출처 미확인(v1 동적 생성 또는 사용 안 함) | 행동 우선순위 옆의 ‘행동 고급 설정’ 버튼을 누르면 열립니다. 턴마다 누가 · 어떤 순서로 · 무엇을 할지 전부 직접 정하는 화면입니다. | `misc.hint.opensAdvancedActionSetup` | 변경 없음 |
| app.v1.js:27 | 엔진 로드 실패 | `records.msg.engineLoadFailed` | 변경 없음 |
| app.v1.js:4055 | 스킬 로딩… | `grow.status.loadingSkills` | 변경 없음 |
| app.v1.js:4618 | 계산 중… | `result.status.computing` | 변경 없음 |
| app.v1.js:1216 | 두 조합 재실행 중… | `compare.status.reRunningBothTeams` | A-14 (조합→팀) |
| index.html:33 | 타겟 더미 · 결정론 시뮬 | `(삭제)` | C-5 삭제 (타겟 더미 · 결정론 시뮬→삭제) |
| app.v1.js:599 | 개발 모드 · 로컬 | `records.label.devModeLocal` | 변경 없음 |
| app.v1.js:595 | 마지막 업데이트 | `records.label.lastUpdated` | 변경 없음 |
| app.v1.js:4566 | 🔄 새 버전이 배포됐어요 — | `app.label.newVersionWasDeployed` | B-40 |
| app.v1.js:4560 | 눌러서 새로고침 | `app.label.clickRefresh` | 변경 없음 |
| app.v1.js:910 | 캐릭터 교체 | `compare.label.swapCompanion` | A-13 (캐릭터→동료) |
| app.v1.js:881 | 캐릭터 추가 | `team.slot.empty.label` | A-13 (캐릭터→동료); 중복 병합 |
| app.v1.js:4789 | 받은 피해 | `log.label.damageTaken` | B-4 (받은 피해→받은 데미지) |
| app.v1.js:196 | 💥 켬 | `records.label.on` | C-1 이모지·장식 제거 |
| app.v1.js:2836 | 피격 데미지 모드 OFF | `cond.label.incomingDamageModeOff` | B-2 (피격 데미지 모드→적 공격 데미지) |
| app.v1.js:773 | ⇅ 행동 우선순위 | `plan.label.actionPriority` | C-1 이모지·장식 제거; 중복 병합 |
| app.v1.js:1109 | (드래그·▲▼) | `compare.help.drag` | C-1 이모지·장식 제거; C-2 라벨 괄호 설명 분리 → .help |
| app.v1.js:1111 | (턴 선택 후 순서 변경) | `compare.help.selectTurnsThenReorder` | C-2 라벨 괄호 설명 분리 → .help |
| app.v1.js:4043 | 턴별 행동 직접 계획 | `grow.label.manualPerTurnPlan` | 변경 없음 |
| app.v1.js:943 | 행동 직접 지정 | `compare.label.manualActions` | 변경 없음 |
| app.v1.js:943 | (끄면 자동) | `compare.help.offAuto` | C-2 라벨 괄호 설명 분리 → .help |
| app.v1.js:1005 | 모두 평타 | `compare.label.all` | A-2 (평타→보통 공격) |
| app.v1.js:1005 | 모두 방어 | `compare.label.allD` | 변경 없음 |
| app.v1.js:50 | 패시브 방어 | `records.label.passiveDef` | B-16 (패시브 방어→필살기 전 턴 방어) |
| app.v1.js:1450 | 연동 그룹의 앵커가 빠져 그 그룹을 해제했어요 — 같은 캐릭터를 다시 넣으면 복원됩니다 | `team.msg.syncGroupLeadLeft` | A-13 (캐릭터→동료); B-8 (앵커→기준 동료); B 해요체→평서 |
| app.v1.js:4050 | 궁 간격 맞추기 | `grow.label.reSpaceEx` | B-10 (궁 간격 맞추기→필살기 턴 재배치) |
| app.v1.js:4050 | 첫 궁은 그대로 두고, 이후 궁을 쿨이 차는 턴마다 다시 놓아요 (궁 개수·방어 턴 유지) | `grow.msg.keepsFirstExSkill` | A-1 (궁→필살기); A-15 (쿨→쿨타임); B 해요체→평서 |
| app.v1.js:1005 | 아군 필살 나중 | `compare.label.allyExLater` | B-17 (아군 필살 나중→인접 동료 필살기를 욱영 뒤로) |
| app.v1.js:4044 | ON: 인접 아군이 욱영 궁 '후' 회복 행동으로 필살(욱영 버프 받고 궁). OFF(기본): 인접 아군이 먼저 필살, 회복 행동은 평타(도장 +45% 평타뎀 수령) | `grow.hint.adjacentAlliesUseTheir` | A-16 (평타뎀→보통 공격 데미지); A-26 (회복 행동→추가 행동); A-1 (궁→필살기); A-2 (평타→보통 공격) |
| app.v1.js:1005 | ON: 인접 아군이 욱영 궁 '후' 회복 행동으로 필살(욱영 버프 받고 궁). OFF(기본): 인접 아군 먼저 필살, 회복은 평타(+45% 평타뎀) | `compare.hint.adjacentAlliesUseTheir` | A-16 (평타뎀→보통 공격 데미지); A-26 (회복 행동→추가 행동); A-1 (궁→필살기); A-2 (평타→보통 공격) |
| app.v1.js:167 | 기록을 불러왔어요 | `records.msg.recordLoaded` | B 해요체→평서 |
| app.v1.js:107 | 기록 저장 공간이 가득 찼어요 — 오래된 기록을 정리해 주세요 | `records.msg.recordStorageFullPlease` | 오류 문형 '무엇이 — 왜' |
| app.v1.js:1005 | 첫 궁 당기기 | `compare.label.earliestFirstEx` | B-11 (첫 궁 당기기→첫 필살기 앞당기기) |
| app.v1.js:4322 | 확률 쿨 감소로 첫 궁을 가장 이른 턴에 두고, 이후는 원래 쿨 주기로 채웁니다 (확률 쿨 감소 성공 가정이 함께 켜집니다) · 다시 누르면 기본으로 | `planner.hint.putsFirstExSkill` | B-13 (확률 쿨 감소 성공 가정→확률 CD 감소 항상 성공); B-13 (확률 쿨 감소→확률 CD 감소); A-1 (궁→필살기); A-15 (쿨→쿨타임) |
| app.v1.js:4412 | 확률 쿨 감소가 필요한 턴 (성공 가정) | `planner.label.needsChanceCooldownCut` | B-13 (확률 쿨 감소→확률 CD 감소) |
| app.v1.js:4413 | 궁극기 사용 방식에서 ‘확률 쿨 감소 성공 가정’을 켜면 이 턴에 궁을 쓸 수 있어요 | `planner.msg.turnAssumeChanceCooldown` | A-1 (궁극기 사용 방식→필살기 사용 방식); B-13 (확률 쿨 감소 성공 가정→확률 CD 감소 항상 성공); A-1 (궁→필살기); B 해요체→평서 |
| app.v1.js:1047 | 확률 쿨 감소 성공 가정을 켰어요 | `compare.msg.turnedAssumeChanceCooldown` | B-13 (확률 쿨 감소 성공 가정→확률 CD 감소 항상 성공); B 해요체→평서 |
| app.v1.js:379 | 궁극기 | `plan.preview.legend.ult` | A-1 (궁극기→필살기); 중복 병합 |
| 출처 미확인(v1 동적 생성 또는 사용 안 함) | 임부언의 추가행동으로 얻은 행동 | `misc.label.actionBossRenGrant` | A-26 (추가행동→추가 행동) |
| app.v1.js:1002 | 궁은 턴당 1회 | `compare.label.exSkillOncePer` | A-1 (궁→필살기) |
| app.v1.js:1002 | · 궁은 턴당 1회 (궁궁 불가) · 임부언 추가행동은 평타 | `compare.label.exSkillOncePer2` | B-12 ( (궁궁 불가)→삭제); A-26 (추가행동→추가 행동); A-1 (궁→필살기); A-2 (평타→보통 공격) |
| app.v1.js:4048 | (궁궁 불가, 궁평/평궁만) · 임부언 추가행동은 평타 | `grow.label.noExExOnly` | B-12 ((궁궁 불가, 궁평/평궁만)→(한 턴에 필살기 1회)); A-26 (추가행동→추가 행동); A-2 (평타→보통 공격) |
| app.v1.js:1003 | · 궁은 CD 안 찬 턴 비활성 | `compare.label.exSkillDisabledWhen` | A-1 (궁→필살기) |
| app.v1.js:1151 | 같은 순서로 일괄 적용 | `compare.label.applySameOrderAll` | 변경 없음 |
| app.v1.js:1185 | 턴별 누적 딜 | `compare.label.cumulativeDmgPerTurn` | A-16 (누적 딜→누적 데미지) |
| app.v1.js:4699 | 데미지 없음 | `result.msg.noDamage` | 변경 없음 |
| 출처 미확인(v1 동적 생성 또는 사용 안 함) | · 로그는 평균에 가까운 1회 표본 | `misc.label.logOneSampleNear` | B-7 (로그는 평균에 가까운 1회 표본→로그: 총 데미지가 평균에 가장 가까운 1회) |
| app.v1.js:1191 | 막대 위에 마우스를 올려 턴별 차이 보기 | `compare.label.hoverBarSeePer` | 변경 없음 |
| app.v1.js:4954 | 스킬을 누르면 설명이 열려요 | `log.label.clickSkillOpenDescription` | B 해요체→평서 |
| app.v1.js:860 | : 체력 | `compare.label.hp` | A-21 (체력→HP) |
| app.v1.js:476 | · 행동 | `records.label.action` | 변경 없음 |
| app.v1.js:1003 | · 첫 사용 | `compare.label.firstUse` | 변경 없음 |
| app.v1.js:1238 | 비교 실패 — | `compare.label.comparisonFailed` | 변경 없음 |
| app.v1.js:1212 | 비교할 대상을 골라주세요 | `compare.label.pleasePickSomethingCompare` | COPY_AUDIT §3 예시 |
| app.v1.js:892 | 비교군이 가득 찼어요 (최대 5) | `compare.msg.comparisonGroupFullMax` | B-30 (비교군→비교 팀); B 해요체→평서 |
| app.v1.js:1213 | 서로 다른 두 기록을 골라주세요 | `compare.label.pleasePickTwoDifferent` | COPY_AUDIT §3 (~주세요→명사형) |
| app.v1.js:1244 | ＋ 비교군 A (빈 편성) | `compare.label.groupEmpty` | B-30 (비교군→비교 팀) |
| app.v1.js:1245 | ＋ 비교군 B (빈 편성) | `compare.label.groupBEmpty` | B-30 (비교군→비교 팀) |
| app.v1.js:151 | — 불러올 기록 선택 — | `records.label.selectRecord` | 변경 없음 |
| app.v1.js:742 | ＋ 추가 | `compare.label.add` | 변경 없음 |
| app.v1.js:572 | 코드로 가져오기 | `records.label.importCode` | 변경 없음 |
| app.v1.js:547 | 또는 코드로 공유 | `records.label.shareCode` | 변경 없음 |
| app.v1.js:570 | 또는 코드 붙여넣기 | `records.label.pasteCode` | 변경 없음 |
| app.v1.js:546 | 📁 파일로 저장 | `records.label.saveFile` | C-1 이모지·장식 제거 |
| app.v1.js:569 | 📁 파일 선택 | `records.label.chooseFile` | C-1 이모지·장식 제거 |
| app.v1.js:549 | 📋 코드 복사 | `records.label.copyCode` | C-1 이모지·장식 제거 |
| app.v1.js:276 | ✏️ 이름 변경 | `records.label.rename` | C-1 이모지·장식 제거 |
| app.v1.js:279 | 🗑️ 삭제 | `records.label.delete` | C-1 이모지·장식 제거 |
| app.v1.js:277 | 📌 상단 고정 | `records.label.pinTop` | C-1 이모지·장식 제거 |
| app.v1.js:277 | 📌 고정 해제 | `records.label.unpin` | C-1 이모지·장식 제거 |
| app.v1.js:278 | 🔒 잠금 | `records.label.lock` | C-1 이모지·장식 제거 |
| app.v1.js:278 | 🔓 잠금 해제 | `records.label.unlock` | C-1 이모지·장식 제거 |
| app.v1.js:227 | 저장된 기록이 없습니다 | `records.hint.noSavedRecords` | 변경 없음 |
| app.v1.js:227 | 검색 결과 없음 | `records.msg.noMatchingRecords` | 변경 없음 |
| app.v1.js:540 | 내보낼 기록을 먼저 선택하세요 | `records.label.selectRecordsExportFirst` | COPY_AUDIT §3 (~세요→명사형) |
| app.v1.js:258 | 삭제할 기록이 없어요 (잠긴 기록은 제외돼요) | `records.msg.noRecordsDeleteLocked` | COPY_AUDIT §3 예시 |
| app.v1.js:258 | 삭제할 기록이 없어요 | `records.msg.noRecordsDelete` | B 해요체→평서 |
| app.v1.js:560 | 코드를 복사했어요 — 상대가 가져오기에 붙여넣으면 돼요 | `records.msg.codeCopiedOthersCan` | B-38 |
| app.v1.js:571 | 공유받은 코드를 여기에 붙여넣으세요 | `records.label.pasteSharedCodeHere` | COPY_AUDIT §3 (~세요→명사형) |
| app.v1.js:576 | 코드를 붙여넣어 주세요 | `records.label.pleasePasteCode` | COPY_AUDIT §3 예시 |
| app.v1.js:589 | 가져오기 실패 — 올바른 기록 파일이 아니에요 | `records.msg.importFailedNotValid` | 오류 문형 |
| app.v1.js:578 | 가져오기 실패 — 올바른 코드가 아니에요 | `records.msg.importFailedNotValid2` | COPY_AUDIT 톤 기준 예시 |
| app.v1.js:527 | 가져오기 실패 — 형식이 올바르지 않아요 | `records.msg.importFailedInvalidFormat` | 오류 문형 |
| app.v1.js:286 | 새 이름 (비우면 기본 이름) | `records.label.newNameBlankDefault` | 변경 없음 |
| 출처 미확인(v1 동적 생성 또는 사용 안 함) | 도장(룬) 해제 | `records.label.unlockSigil` | A-3/A-4 (도장(룬) 해제→도장 잠금해제); 중복 병합 |
| app.v1.js:842 | · 도장 강화 | `compare.label.sigilBoost` | A-5 (도장 강화→도장 제련) |
| app.v1.js:843 | (공격력+체력) | `compare.help.atkHp` | A-21 (공격력→ATK); A-21 (체력→HP); C-2 라벨 괄호 설명 분리 → .help |
| app.v1.js:800 | 공격력 | `compare.label.atk` | A-21 (공격력→ATK) |
| app.v1.js:800 | 기본 공격력 | `compare.label.baseAtk` | A-21 (기본 공격력→기초 ATK) |
| app.v1.js:801 | 최대 체력 | `compare.label.maxHp` | A-21 (최대 체력→최대 HP) |
| app.v1.js:308 | 스킬 레벨 | `records.label.skillLevel` | 변경 없음 |
| app.v1.js:744 | 눌러서 도장·행동·교체 | `compare.label.tapEditSigilAction` | B-23 (눌러서 도장·행동·교체→도장·행동·교체 설정) |
| app.v1.js:2824 | 확률 100% 모드 ON | `cond.label.alwaysProc` | U 확률 모드 (확률 100% 모드→확률 효과 항상 발동) |
| app.v1.js:2824 | 확률 100% 모드 OFF | `cond.label.alwaysProcOff` | U 확률 모드 (확률 100% 모드→확률 효과 항상 발동) |
| app.v1.js:2824 | · 모든 확률형 스킬 100% 강제 | `cond.label.forcesAllChanceBased` | U 확률 모드 (모든 확률형 스킬 100% 강제→확률 효과 항상 발동) |
| app.v1.js:2828 | 체력 10% 모드 ON | `cond.label.10HpMode` | A-21 (체력 10% 모드→적 HP 10% 고정) |
| app.v1.js:2828 | 체력 10% 모드 OFF | `cond.label.10HpModeOff` | A-21 (체력 10% 모드→적 HP 10% 고정) |
| app.v1.js:2828 | · 더미 체력 10% 고정 (카라트 등 저HP 게이트 발동) | `cond.label.dummyHpLocked10` | A-21 (더미 체력→적 HP); B-25 (저HP 게이트→저HP 조건 효과) |
| app.v1.js:4668 | 확률 100% · 결정론 | `cond.proc.label` | B-5 (확률 100% · 결정론→확률 효과 항상 발동); 중복 병합 |
| app.v1.js:4663 | 확률 효과가 전혀 발동하지 않았을 때(최소) ~ 전부 발동했을 때(최대). 폭이 좁을수록 확률 의존이 적은 안정적인 조합입니다. | `result.hint.minimumNoProbabilityEffects` | A-14 (조합→팀) |
| app.v1.js:4617 | 동반 — 적 HP%가 진행 턴을 4등분해 단계적으로 감소합니다 (앞 1/4 ≥75% → 막 1/4 &lt;25%) | `result.hint.companionEnemyHpSteps` | B-26 (동반 — 적 HP%가 진행 턴을 4등분해 단계적으로 감소합니다→적 HP 단계 감소 — 턴을 4구간으로 나눠 75%→50%→25% 이하로 적용합니다) |
| 출처 미확인(v1 동적 생성 또는 사용 안 함) | 필살 시전 (직접딜 없음 → 버프/발동) | `misc.label.exSkillCastNo` | B-28 (필살 시전 (직접딜 없음 → 버프/발동)→필살기 사용 (직접 데미지 없음)) |
| app.v1.js:732 | 높은 쪽 | `compare.label.higher` | 변경 없음 |
| app.v1.js:435 | 매 턴 | `records.label.everyTurn` | 변경 없음 |
| app.v1.js:4673 | 행동 순서: | `result.label.actionOrder` | 변경 없음 |
| app.v1.js:1151 | 행동 순서 — | `compare.label.actionOrder` | 변경 없음 |
| app.v1.js:1109 | 행동 순서 | `adv.order.lbl` | 중복 병합 |
| app.v1.js:49 | 행동 | `jump.plan` | 중복 병합 |
| app.v1.js:179 | 교체 | `records.label.swap` | 변경 없음 |
| app.v1.js:796 | ⇄ 교체 | `records.label.swap` | C-1 이모지·장식 제거; 중복 병합 |
| app.v1.js:1151 | 기본 따름 | `cond.incoming.dmg.reset` | B-21 (기본 따름→기본값); 중복 병합 |
| app.v1.js:53 | 기본 | `records.label.default` | 변경 없음 |
| app.v1.js:56 | 자동 | `plan.ult.mode.auto` | 중복 병합 |
| app.v1.js:678 | 수동 | `compare.label.manual` | 변경 없음 |
| app.v1.js:641 | 위로 | `compare.label.up` | 변경 없음 |
| app.v1.js:2232 | 아래로 | `manual.label.down` | 변경 없음 |
| app.v1.js:7 | 동일 | `records.label.same` | 변경 없음 |
| app.v1.js:764 | 변경됨 | `compare.msg.changed` | 변경 없음 |
| app.v1.js:764 | 변경됨 — | `compare.label.changed` | 변경 없음 |
| app.v1.js:259 | 선택한 | `records.label.selected` | 변경 없음 |
| app.v1.js:58 | 선택 | `records.label.select` | 변경 없음 |
| app.v1.js:258 | 제외 | `records.label.exclude` | 변경 없음 |
| app.v1.js:1238 | 오류 | `compare.label.error` | 변경 없음 |
| app.v1.js:721 | 단독 | `compare.label.solo` | 변경 없음 |
| app.v1.js:2848 | 동시 | `cond.label.simultaneous` | 변경 없음 |
| app.v1.js:843 | 한계 | `compare.label.limit` | 변경 없음 |
| app.v1.js:226 | 관리 | `records.label.manage` | 변경 없음 |
| app.v1.js:84 | 고정 | `records.label.pinned` | 변경 없음 |
| app.v1.js:84 | 상단고정 | `records.label.pinned2` | 변경 없음 |
| app.v1.js:1566 | 효과 | `adv.label.effect` | 변경 없음 |
| app.v1.js:1678 | 출처 | `manual.label.source` | 변경 없음 |
| app.v1.js:801 | 체력 | `compare.label.hp2` | A-21 (체력→HP) |
| app.v1.js:54 | 필살 | `plan.cell.abbr.ult` | 중복 병합 |
| app.v1.js:1003 | 필살 CD | `compare.label.exSkillCd` | A-15 (필살 CD→필살기 CD) |
| app.v1.js:192 | 피격 | `records.label.hit` | 변경 없음 |
| app.v1.js:50 | 방어 | `plan.preview.legend.def` | 중복 병합 |
| app.v1.js:40 | 스킬 | `records.label.skill` | 변경 없음 |
| app.v1.js:4767 | 반응 없음 | `log.msg.noReaction` | 변경 없음 |
| app.v1.js:4776 | 버프/스택 | `log.label.buffStack` | A-18 (버프/스택→버프/중첩) |
| app.v1.js:4759 | 적의 공격 | `log.label.enemyAttack` | 변경 없음 |
| app.v1.js:4775 | 적의 행동 | `log.label.enemyAction` | 변경 없음 |
| app.v1.js:4751 | 보통공격 | `plan.preview.legend.atk` | A-2 (보통공격→보통 공격); 중복 병합 |
| app.v1.js:4920 | 주는딜 | `log.label.damageDealt` | A-16 (주는딜→주는 데미지) |
| app.v1.js:4924 | 받는딜 | `cond.incoming.title` | A-16 (받는딜→받는 데미지); 중복 병합 |
| app.v1.js:4931 | 받는 지속딜 | `log.label.dotTaken` | A-16 (받는 지속딜→받는 지속형 데미지) |
| app.v1.js:4925 | 속성 받는딜 | `log.label.elementalDamageTaken` | A-16 (속성 받는딜→속성 받는 데미지) |
| app.v1.js:4751 | 지속딜 | `log.label.dot` | A-16 (지속딜→지속형 데미지) |
| app.v1.js:4930 | 지속딜 증가 | `log.label.dotIncrease` | A-16 (지속딜→지속형 데미지) |
| app.v1.js:4821 | 기초ATK | `compare.label.baseAtk` | 표기 규칙 1 (기초ATK→기초 ATK); 중복 병합 |
| app.v1.js:4824 | 기초ATK +0% | `log.label.baseAtk0` | 표기 규칙 1 (기초ATK→기초 ATK) |
| app.v1.js:4830 | 자기 기초ATK의 | `log.label.ownBaseAtk` | 표기 규칙 1 (기초ATK→기초 ATK) |
| app.v1.js:4848 | 받는회복 + | `log.label.healingReceived` | A-17 (받는회복→받는 치료) |
| app.v1.js:4807 | 디버프 | `log.label.debuff` | 변경 없음 |
| app.v1.js:1005 | 버프 | `compare.label.buff` | 변경 없음 |
| app.v1.js:4718 | 베리어 | `log.label.barrier` | A-10 (베리어→배리어) |
| app.v1.js:2866 | 힐 | `role.healer` | A-17 (힐→치료); 중복 병합 |
| app.v1.js:54 | 필살기 | `plan.preview.legend.ult` | 중복 병합 |
| app.v1.js:40 | 평타 | `plan.preview.legend.atk` | A-2 (평타→보통 공격); 중복 병합 |
| app.v1.js:4520 | 룬 필살기 | `grow.label.sigilExSkill` | A-3 (룬 필살기→도장 필살기) |
| app.v1.js:50 | 패시브 | `records.label.passive` | 변경 없음 |
| app.v1.js:299 | 평궁방 | `plan.cell.abbr.legend` | 용어 규칙 2 (셀 약칭) |
| app.v1.js:40 | 평 | `plan.cell.abbr.atk` | 용어 규칙 2 (셀 약칭); 목업 키에 병합 |
| app.v1.js:40 | 궁 | `plan.cell.abbr.ult` | 용어 규칙 2 (셀 약칭); 목업 키에 병합 |
| app.v1.js:48 | 방 | `plan.cell.abbr.def` | 용어 규칙 2 (셀 약칭); 목업 키에 병합 |
| app.v1.js:732 | 딜 | `result.log.col.damage` | A-16 (딜→데미지); 중복 병합 |
| app.v1.js:11 | 적 | `cond.enemy.title` | 중복 병합 |
| app.v1.js:2828 | 더미 | `cond.label.dummy` | 변경 없음 |
| app.v1.js:48 | 전사 | `role.warrior` | 중복 병합 |
| app.v1.js:48 | 수호 | `role.guard` | 중복 병합 |
| app.v1.js:48 | 치유 | `role.healer` | A-8 (치유→치료); 중복 병합 |
| app.v1.js:48 | 보조 | `role.support` | 중복 병합 |
| app.v1.js:48 | 방해 | `role.disrupt` | 중복 병합 |
| app.v1.js:62 | 나무 | `element.wood` | 중복 병합 |
| app.v1.js:610 | 무속성 | `element.none.long` | A-24 ((?<![가-힣])무속성→속성 없음); 중복 병합 |
| 출처 미확인(v1 동적 생성 또는 사용 안 함) | 나무속성 | `misc.label.woodElement` | 변경 없음 |
| 출처 미확인(v1 동적 생성 또는 사용 안 함) | 물속성 | `misc.label.waterElement` | 변경 없음 |
| 출처 미확인(v1 동적 생성 또는 사용 안 함) | 불속성 | `misc.label.fireElement` | 변경 없음 |
| 출처 미확인(v1 동적 생성 또는 사용 안 함) | 빛속성 | `misc.label.lightElement` | 변경 없음 |
| 출처 미확인(v1 동적 생성 또는 사용 안 함) | 어둠속성 | `misc.label.darkElement` | 변경 없음 |
| app.v1.js:4932 | 상성 | `log.label.advantage` | A-22 (상성→유리 속성) |
| app.v1.js:4932 | 역상성 | `log.label.disadvantage` | A-22 (역상성→불리 속성) |
| 출처 미확인(v1 동적 생성 또는 사용 안 함) | 중앙값) | `misc.label.median` | 변경 없음 |
| app.v1.js:4615 | 주의 — | `result.label.note` | 변경 없음 |
| app.v1.js:775 | 높은 쪽 ◀▶ · | `compare.label.higher` | C-1 이모지·장식 제거; 중복 병합 |
| app.v1.js:1191 | A 총 | `compare.label.total` | 변경 없음 |
| app.v1.js:1191 | B 총 | `compare.label.bTotal` | 변경 없음 |
| app.v1.js:4645 | 시뮬 오류: | `result.label.simError` | 변경 없음 |
| i18n.v1.js PAT (app.v1.js:4621) | 행동 고급 설정: 직접 편집한 턴에 {0}의 행동이 없어요 — 그 턴엔 행동하지 않습니다 | `result.fmt.advancedActionSetupEdited` | B 해요체→평서 |
| i18n.v1.js PAT (app.v1.js:1779) | 추가 행동 {0}개를 뒤에 넣었어요 — 순서는 끌어서 바꿀 수 있어요 | `manual.fmt.added0ExtraAction` | B 해요체→평서 |
| i18n.v1.js PAT (app.v1.js:1413) | 추가 행동이 줄어 실행할 수 없는 행동 {0}개를 뺐어요 | `team.fmt.extraActionsDecreasedRemoved` | B 해요체→평서 |
| i18n.v1.js PAT (app.v1.js:744) | {0} {1}턴 — 눌러서 행동 변경 | `compare.fmt.01ClickChange` | 변경 없음 |
| i18n.v1.js PAT (app.v1.js:320) | 캐릭터 스펙 설정 사용 중 — 스타 {0} · Lv{1} · 육성도 {2} | `records.fmt.companionSpecUseStar` | COPY_AUDIT §5-2 ⑤ |
| i18n.v1.js PAT (app.v1.js:560) | {0}턴 {1}행동을 복사했어요 | `records.fmt.copied01Actions` | B 해요체→평서 |
| i18n.v1.js PAT (app.v1.js:49) | {0}턴 · {1}행동 | `records.fmt.01Actions` | 변경 없음 |
| i18n.v1.js PAT (app.v1.js:120) | {0}행동 · 기본값 | `records.fmt.0ActionsDefault` | 변경 없음 |
| i18n.v1.js PAT (app.v1.js:49) | {0}행동 | `records.fmt.0Actions` | 변경 없음 |
| i18n.v1.js PAT (app.v1.js:843) | 한계 {0} (공격력+체력) | `compare.fmt.cap0AtkHp` | A-5 (한계 →제련 한도 ); A-21 ((공격력+체력)→(ATK+HP)) |
| i18n.v1.js PAT (app.v1.js:1561) | 이 시점엔 필살기를 쓸 수 없어요 — 쿨타임 {0}턴 | `adv.fmt.exSkillNotReady` | B-37 (게임 문구 G-UI 26002 기반) |
| i18n.v1.js PAT (app.v1.js:1508) | 스타 {0} 해금 | `team.fmt.star0` | 변경 없음 |
| i18n.v1.js PAT (app.v1.js:1508) | 스타 {0}부터 | `team.fmt.star02` | 변경 없음 |
| i18n.v1.js PAT (app.v1.js:1114) | {0}턴 기본값으로 | `compare.fmt.reset0Turn` | 변경 없음 |
| i18n.v1.js PAT (app.v1.js:60) | {0}에게 피격 | `records.fmt.0Hit` | B-3 |
| i18n.v1.js PAT (app.v1.js:259) | {0}개를 삭제할까요? | `records.fmt.delete0Record` | COPY_AUDIT §3 확인창 |
| i18n.v1.js PAT (app.v1.js:259) | {0}개를 삭제할까요? (잠긴 기록 제외) | `records.fmt.delete0RecordLocked` | COPY_AUDIT §3 확인창 |
| i18n.v1.js PAT (app.v1.js:58) | {0}개 선택 / 전체 {1} | `records.fmt.0Selected1Total` | 변경 없음 |
| i18n.v1.js PAT (app.v1.js:58) | {0}개 선택 | `records.fmt.0Selected` | 변경 없음 |
| i18n.v1.js PAT (app.v1.js:49) | {0}회 행동 | `records.fmt.0ActionsTurn` | 변경 없음 |
| i18n.v1.js PAT (app.v1.js:556) | {0}개를 파일로 내보냈어요 | `records.fmt.exported0RecordsFile` | COPY_AUDIT §3 예시 |
| i18n.v1.js PAT (app.v1.js:534) | {0}개 기록을 가져왔어요 (중복 제외) | `records.fmt.imported0RecordsDuplicates` | COPY_AUDIT 톤 기준 예시 |
| i18n.v1.js SUB | 발동 → | `frag.trigger` | 변경 없음 |
| i18n.v1.js SUB | 베리어 → | `frag.barrier` | A-10 (베리어→배리어) |
| i18n.v1.js SUB | 지속힐 → | `frag.hot` | A-17 (지속힐→지속형 치료) |
| i18n.v1.js SUB | 지속딜 → | `frag.dot` | A-16 (지속딜→지속형 데미지) |
| i18n.v1.js SUB | 힐 → | `frag.heal` | A-17 (힐→치료) |
| i18n.v1.js SUB | 추가 행동 + | `frag.extraAction` | 변경 없음 |
| i18n.v1.js SUB | 공격연계 부여 | `frag.grantAttackLink` | 변경 없음 |
| i18n.v1.js SUB | 필살 CD | `frag.exSkillCd` | A-15 (필살 CD→필살기 CD) |
| i18n.v1.js SUB | 받는회복 + | `frag.healingReceived` | A-17 (받는회복→받는 치료) |
| i18n.v1.js SUB | 확률 쿨 감소 성공 가정 | `frag.chanceCdCutAssumed` | B-13 (확률 쿨 감소 성공 가정→확률 CD 감소 항상 성공) |
| i18n.v1.js SUB | 발동 스킬 효과 | `frag.triggeredSkillEffect` | 변경 없음 |
| i18n.v1.js SUB | 기초ATK | `frag.baseAtk` | 표기 규칙 1 (기초ATK→기초 ATK) |
| i18n.v1.js SUB | 고정ATK | `frag.flatAtk` | 표기 규칙 1 (고정ATK→고정 ATK) |
| i18n.v1.js SUB | 발동효과 | `frag.triggeredSkillEffect2` | A-20 (발동효과→발동 스킬 효과) |
| i18n.v1.js SUB | EX효과 | `frag.exSkillEffect` | A-20 (EX효과→필살기 효과) |
| i18n.v1.js SUB | 받는 지속딜 | `frag.dotTaken` | A-16 (받는 지속딜→받는 지속형 데미지) |
| i18n.v1.js SUB | 속성 받는딜 | `frag.elementalDamageTaken` | A-16 (속성 받는딜→속성 받는 데미지) |
| i18n.v1.js SUB | 받는배리어 | `frag.barrierReceived` | A-16 (받는배리어→받는 배리어) |
| i18n.v1.js SUB | 필살기 받는딜 | `frag.exSkillDamageTaken` | A-16 (필살기 받는딜→필살기로 받는 데미지) |
| i18n.v1.js SUB | 주는딜 | `frag.damageDealt` | A-16 (주는딜→주는 데미지) |
| i18n.v1.js SUB | 받는딜 | `frag.damageTaken` | A-16 (받는딜→받는 데미지) |
| i18n.v1.js SUB | 지속딜 | `frag.dot2` | A-16 (지속딜→지속형 데미지) |
| i18n.v1.js SUB | 출처별 | `frag.source` | 변경 없음 |
| i18n.v1.js SUB | 계산식 | `frag.formula` | 변경 없음 |
| i18n.v1.js SUB | 고정값 | `frag.flatValue` | 변경 없음 |
| i18n.v1.js SUB | 보통공격 | `frag.normalAttack` | A-2 (보통공격→보통 공격) |
| i18n.v1.js SUB | 평타 | `frag.basicAttack` | A-2 (평타→보통 공격) |
| i18n.v1.js SUB | 필살기 | `frag.exSkill` | 변경 없음 |
| i18n.v1.js SUB | 룬 필살기 | `frag.sigilExSkill` | A-3 (룬 필살기→도장 필살기) |
| i18n.v1.js SUB | 디버프 | `frag.debuff` | 변경 없음 |
| i18n.v1.js SUB | 베리어 | `frag.barrier2` | A-10 (베리어→배리어) |
| i18n.v1.js SUB | 지속힐 | `frag.hot2` | A-17 (지속힐→지속형 치료) |
| i18n.v1.js SUB | 남은 배리어 | `frag.barrierLeft` | 변경 없음 |
| i18n.v1.js SUB | 배리어 없음 | `frag.noBarrier` | 변경 없음 |
| i18n.v1.js SUB | 방어 −50% | `frag.defended50` | 변경 없음 |
| i18n.v1.js SUB | 방어 상태 전환 | `frag.enterDefense` | 변경 없음 |
| i18n.v1.js SUB | 피격 데미지 모드 | `frag.incomingDamageMode` | B-2 (피격 데미지 모드→적 공격 데미지) |
| i18n.v1.js SUB | 중독 | `frag.poisoned` | 변경 없음 |
| i18n.v1.js SUB | 수면 | `frag.sleep` | 변경 없음 |
| i18n.v1.js SUB | 마비 | `frag.paralyze` | 변경 없음 |
| i18n.v1.js SUB | 기절 | `frag.stun` | 변경 없음 |
| i18n.v1.js SUB | 동결 | `frag.freeze` | 변경 없음 |
| i18n.v1.js SUB | 동료 | `frag.companion` | 변경 없음 |
| i18n.v1.js SUB | 아군 전체 | `frag.allAllies` | 변경 없음 |
| i18n.v1.js SUB | 적 전체 | `frag.allEnemies` | 변경 없음 |
| i18n.v1.js SUB | 아군 전사 | `frag.fighterAllies` | 변경 없음 |
| i18n.v1.js SUB | 아군 수호 | `frag.tankAllies` | 변경 없음 |
| i18n.v1.js SUB | 아군 치유 | `frag.healerAllies` | A-8 (치유→치료) |
| i18n.v1.js SUB | 아군 보조 | `frag.supportAllies` | 변경 없음 |
| i18n.v1.js SUB | 아군 방해 | `frag.vandalAllies` | 변경 없음 |
| i18n.v1.js SUB | 최저HP 아군 | `frag.lowestHpAlly` | 변경 없음 |
| i18n.v1.js SUB | 최고HP 아군 | `frag.highestHpAlly` | 변경 없음 |
| i18n.v1.js SUB | 자신 | `frag.self` | 변경 없음 |
| i18n.v1.js SUB | 아군 | `frag.ally` | 변경 없음 |
| i18n.v1.js SUB | (대상 행동 전 — 회복 무효) | `frag.beforeTargetActsNo` | 변경 없음 |
| i18n.v1.js SUB | 회복 무효 | `frag.noHeal` | 변경 없음 |
| i18n.v1.js SUB | 제거 | `frag.remove` | 변경 없음 |
| i18n.v1.js SUB | 미파싱: | `frag.unparsed` | B-29 (미파싱:→미지원 효과:) |
| i18n.v1.js SUB | 미모델링 | `frag.unmodeled` | B-29 (미모델링→계산 미반영) |
| i18n.v1.js SUB | 전체공격 | `frag.aoe` | 변경 없음 |
| i18n.v1.js SUB | 더미 | `frag.dummy` | 변경 없음 |
| i18n.v1.js SUB | 추가행동 | `frag.extraAction2` | A-26 (추가행동→추가 행동) |
| i18n.v1.js SUB | 자동 | `frag.auto` | 변경 없음 |
| i18n.v1.js SUB | 수동 | `frag.manual` | 변경 없음 |
| i18n.v1.js SUB | 행동 순서: | `frag.actionOrder` | 변경 없음 |
| i18n.v1.js SUB | 순서 | `frag.order` | 변경 없음 |
| i18n.v1.js SUB | 행동 | `frag.action` | 변경 없음 |
| i18n.v1.js SUB | 보유 적 | `frag.holderEnemy` | 변경 없음 |
| i18n.v1.js SUB | 보유 | `frag.holding` | 변경 없음 |
| i18n.v1.js SUB | 전사형 | `frag.fighter` | 변경 없음 |
| i18n.v1.js SUB | 수호형 | `frag.tank` | 변경 없음 |
| i18n.v1.js SUB | 치유형 | `frag.healer` | A-8 (치유형→치료형) |
| i18n.v1.js SUB | 보조형 | `frag.support` | 변경 없음 |
| i18n.v1.js SUB | 방해형 | `frag.vandal` | 변경 없음 |
| i18n.v1.js SUB | 기초최대HP | `frag.baseMaxHp` | 표기 규칙 1 (기초최대HP→기초 최대 HP) |
| i18n.v1.js SUB | 최대HP | `frag.maxHp` | 표기 규칙 1 (최대HP→최대 HP) |
| i18n.v1.js SUB | 평타뎀 | `frag.basicAttackDmg` | A-16 (평타뎀→보통 공격 데미지) |
| i18n.v1.js SUB | 지속딜 증가 | `frag.dotIncrease` | A-16 (지속딜→지속형 데미지) |
| i18n.v1.js SUB | 마도 집중 | `frag.arcaneFocus` | 변경 없음 |
| i18n.v1.js SUB | 전의 | `frag.battleSpirit` | 변경 없음 |
| i18n.v1.js SUB | 흑구 | `frag.blackey` | 변경 없음 |
| i18n.v1.js SUB | 백구 | `frag.whitey` | 변경 없음 |
| i18n.v1.js SUB | 추말 | `frag.afterglow` | 변경 없음 |
| i18n.v1.js SUB | 서인 | `frag.divineSigil` | 변경 없음 |
| i18n.v1.js SUB | 열화질보 | `frag.blazingStride` | 변경 없음 |
| i18n.v1.js SUB | 호혈표지 | `frag.bloodthirstMark` | 변경 없음 |
| i18n.v1.js SUB | 각흔 | `frag.chiselMarks` | 변경 없음 |
| i18n.v1.js SUB | 전술 호령 | `frag.commandCallout` | 변경 없음 |
| i18n.v1.js SUB | 할인 쿠폰 | `frag.discountCoupon` | 변경 없음 |
| i18n.v1.js SUB | 용의 분노 | `frag.dragonIre` | 변경 없음 |
| i18n.v1.js SUB | 용족의 위압 | `frag.dragonforce` | 변경 없음 |
| i18n.v1.js SUB | 체력응축 | `frag.energyCharge` | 변경 없음 |
| i18n.v1.js SUB | 오봉만상 | `frag.fivePeakMyriad` | 변경 없음 |
| i18n.v1.js SUB | 파도 체이싱 | `frag.wavetime` | 변경 없음 |
| i18n.v1.js SUB | 란의 기운 | `frag.galeBreath` | 변경 없음 |
| i18n.v1.js SUB | 화약 | `frag.gunpowder` | 변경 없음 |
| i18n.v1.js SUB | 네온 표식 | `frag.neonMark` | 변경 없음 |
| i18n.v1.js SUB | 합위 | `frag.encirclement` | 변경 없음 |
| i18n.v1.js SUB | 근육 활동 | `frag.loosenedUp` | 변경 없음 |
| i18n.v1.js SUB | 마비 면역 | `frag.paralysisImmunity` | 변경 없음 |
| i18n.v1.js SUB | 센 불에 볶기·약한 불에 끓이기·비법 향신료 | `frag.stirFrySlowCook` | 변경 없음 |
| i18n.v1.js SUB | 센 불에 볶기 | `frag.stirFry` | 변경 없음 |
| i18n.v1.js SUB | 약한 불에 끓이기 | `frag.slowCook` | 변경 없음 |
| i18n.v1.js SUB | 비법 향신료 | `frag.secretSpices` | 변경 없음 |
| i18n.v1.js SUB | 지옥의 사냥개 | `frag.hellhound` | 변경 없음 |
| i18n.v1.js SUB | 성노 | `frag.holyWrath` | 변경 없음 |
| i18n.v1.js SUB | 입질 | `frag.hooked` | 변경 없음 |
| i18n.v1.js SUB | 심판 | `frag.judgment` | 변경 없음 |
| i18n.v1.js SUB | 월지호비 | `frag.lunarPounce` | 변경 없음 |
| i18n.v1.js SUB | 추격 | `frag.pursuit` | 변경 없음 |
| i18n.v1.js SUB | 내기혼신·호 | `frag.qiSurgeTiger` | 변경 없음 |
| i18n.v1.js SUB | 주는 데미지 감소 | `frag.reducedDamageOutput` | 변경 없음 |
| i18n.v1.js SUB | 일지어천 | `frag.solarFlight` | 변경 없음 |
| i18n.v1.js SUB | 물보라의 축복 | `frag.splashingBlessing` | 변경 없음 |
| i18n.v1.js SUB | 전술 판독 | `frag.strategicInsight` | 변경 없음 |
| i18n.v1.js SUB | 해일의 송곳니 | `frag.tidefang` | 변경 없음 |
| i18n.v1.js SUB | 상어 수탄 | `frag.waterBullet` | 변경 없음 |
| i18n.v1.js SUB | 무속성 | `frag.nonElemental` | A-24 ((?<![가-힣])무속성→속성 없음) |
| i18n.v1.js SUB | 나무속성 | `frag.woodElement` | 변경 없음 |
| i18n.v1.js SUB | 물속성 | `frag.waterElement` | 변경 없음 |
| i18n.v1.js SUB | 불속성 | `frag.fireElement` | 변경 없음 |
| i18n.v1.js SUB | 빛속성 | `frag.lightElement` | 변경 없음 |
| i18n.v1.js SUB | 어둠속성 | `frag.darkElement` | 변경 없음 |
| i18n.v1.js SUB | 무관 | `frag.neutral` | 변경 없음 |
| i18n.v1.js SUB | 누적 | `frag.accumulated` | 변경 없음 |
| i18n.v1.js SUB | 내역 | `frag.history` | 변경 없음 |
| i18n.v1.js SUB | 추적 | `frag.tracing` | 변경 없음 |
| i18n.v1.js SUB | 명시 | `frag.shown` | 변경 없음 |
| i18n.v1.js SUB | 연동 | `frag.linked` | 변경 없음 |
| i18n.v1.js SUB | 역상성 | `frag.disadvantage` | A-22 (역상성→불리 속성) |
| i18n.v1.js SUB | 상성 | `frag.advantage` | A-22 (상성→유리 속성) |
| i18n.v1.js SUB | 반격 | `frag.counter` | 변경 없음 |
| i18n.v1.js SUB | 조롱 | `frag.taunt` | 변경 없음 |
| i18n.v1.js SUB | 전환 | `frag.convert` | 변경 없음 |
| i18n.v1.js SUB | 중첩 | `frag.stack` | 변경 없음 |
| i18n.v1.js SUB | 스택 | `frag.stack2` | A-18 (스택→중첩) |
| i18n.v1.js SUB | 데미지 | `frag.damage` | 변경 없음 |
| i18n.v1.js SUB | 계수 | `frag.coef` | 변경 없음 |
| i18n.v1.js SUB | 발동 | `frag.trigger2` | 변경 없음 |
| i18n.v1.js SUB | 효과 | `frag.effect` | 변경 없음 |
| i18n.v1.js SUB | 출처 | `frag.source2` | 변경 없음 |
| i18n.v1.js SUB | 스킬 | `frag.skill` | 변경 없음 |
| i18n.v1.js SUB | 패시브 | `frag.passive` | 변경 없음 |
| i18n.v1.js SUB | 버프 | `frag.buff` | 변경 없음 |
| i18n.v1.js SUB | 고정 | `frag.flat` | 변경 없음 |
| i18n.v1.js SUB | 최대값 | `frag.max` | 변경 없음 |
| i18n.v1.js SUB | 최소값 | `frag.min` | 변경 없음 |
| i18n.v1.js SUB | 평균 | `frag.average` | 변경 없음 |
| i18n.v1.js SUB | 없음 | `frag.none` | 변경 없음 |
| i18n.v1.js SUB | 단독 | `frag.solo` | 변경 없음 |
| i18n.v1.js SUB | A 총 | `frag.total` | 변경 없음 |
| i18n.v1.js SUB | B 총 | `frag.bTotal` | 변경 없음 |
| i18n.v1.js SUB | 회 행동 | `frag.actionsTurn` | 변경 없음 |
| i18n.v1.js SUB | 회 피격 | `frag.hits` | 변경 없음 |
| i18n.v1.js SUB | 회 · 평균 | `frag.runsAvg` | 변경 없음 |
| i18n.v1.js SUB | /턴 | `frag.perTurn` | 변경 없음 |
| i18n.v1.js SUB | 최소 | `frag.min2` | 변경 없음 |
| i18n.v1.js SUB | 최대 | `frag.max2` | 변경 없음 |
| i18n.v1.js SUB | 도장 강화 | `frag.sigilBoost` | A-5 (도장 강화→도장 제련) |
| i18n.v1.js SUB | 동시 | `frag.simultaneous` | 변경 없음 |
| i18n.v1.js SUB | 로그는 평균에 가까운 1회 표본 | `frag.logOneSampleNear` | B-7 (로그는 평균에 가까운 1회 표본→로그: 총 데미지가 평균에 가장 가까운 1회) |
| i18n.v1.js SUB | : 필살 CD 감소를 위해 바로 앞 턴을 | `frag.cutExSkillCd` | A-15 (필살 CD→필살기 CD) |
| i18n.v1.js SUB | 로, 그 앞에 입질용 | `frag.pokeBefore` | 변경 없음 |
| i18n.v1.js SUB | 를 자동 배치했어요 | `frag.wasAutoPlaced` | B 해요체→평서 |
| i18n.v1.js SUB | 를 눌러 결과를 갱신하세요 | `frag.refreshResult` | COPY_AUDIT §3 (~세요→명사형) |
| i18n.v1.js SUB | 의 턴별 행동을 설정하는 걸 추천드립니다 | `frag.perTurnActionsRecommended` | 변경 없음 |
| i18n.v1.js SUB | 은 CD 안 찬 턴엔 비활성 | `frag.disabledTurnsWhereCd` | 변경 없음 |
| i18n.v1.js SUB | 첫 사용 | `frag.firstUse` | 변경 없음 |
| i18n.v1.js SUB | 비교군 | `frag.group` | B-30 (비교군→비교 팀) |
| i18n.v1.js SUB | 속성 | `frag.element` | 변경 없음 |
| i18n.v1.js SUB | · 힐 | `frag.heal2` | A-17 (힐→치료) |
| i18n.v1.js SUB | 방어 | `frag.defend` | 변경 없음 |
| i18n.v1.js SUB | 입질용 | `frag.poke` | 변경 없음 |
| i18n.v1.js SUB | 개 + 잠긴 기록만 남기고 | `frag.keepOnlyLocked` | 변경 없음 |
| i18n.v1.js SUB | 나머지를 삭제할까요 | `frag.deleteRest` | 변경 없음 |
| i18n.v1.js SUB | 개 선택 | `frag.selected` | 변경 없음 |
| i18n.v1.js SUB | 개 턴 | `frag.turns` | 변경 없음 |
| i18n.v1.js SUB | 턴 기준) | `frag.turns2` | 변경 없음 |
| i18n.v1.js SUB | 에게 피격 | `frag.hit` | 변경 없음 |
| i18n.v1.js SUB | 삭제할까요 | `frag.delete` | 변경 없음 |
| i18n.v1.js SUB | 턴 | `frag.turn` | 변경 없음 |
| i18n.v1.js SUB | 딜 | `frag.dmg` | A-16 (딜→데미지) |
| i18n.v1.js REGEX | 아군 (\d+)명 | `frag.re.0Allies` | 변경 없음 |
| i18n.v1.js REGEX | 적 (\d+)명 | `frag.re.0Enemies` | 변경 없음 |
| i18n.v1.js REGEX | ([+-]?\d+)중첩 | `frag.re.0Stacks` | 변경 없음 |
| i18n.v1.js REGEX | 더미(\d+) | `frag.re.dummy0` | 변경 없음 |
