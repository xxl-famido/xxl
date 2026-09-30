# core/ — v2 상태·계산·저장 계층

DOM·전역 없음(ES 모듈). `localStorage`·`fetch`·`Worker` 는 주입 가능(`createStore({ storage, api })`, `createApi({ fetch, Worker, port })`).
테스트: `cd dashboard_v2 && node --test tests/*.test.js` (package.json `npm test`). v1 원본(`legacy/app.v1.js` = `dashboard/app.js` 와 동일)을
Node `vm` 에 올려 같은 입력의 결과를 비교한다(`tests/helpers/v1.js`, JSDOM 불필요).

의존 방향: `format` ← `spec` ← `plan` ← `payload` ← `codec` ← `store`, `api` 는 독립.

## 모듈별 export와 v1 대응

### format.js
| export | v1 |
|---|---|
| `fmt`, `fmtShort`, `esc`, `makeLabel(team, turns, total, chars)` | L4, L109-113, L75, L132-135 |
| `ROLE_RANK`, `SPECIAL`, `PASSIVE_DEF_ID`, `ULT3_IDS`, `HOLD_ULT_IDS`, `TAEHO_ID`, `UK_ID`, `IMBUEON_ID`, `EL_ORDER`, `EL_KR` | L48-62 |
| `basePriority(slot, pos, chars)` | L1528 |
| `ROLE_KEY`, `role(kr)`, `DUMMY_EL` | 신규 — 파이썬 한국어 역할/더미 속성 번호 → i18n 키 조각 |

### spec.js (추가 파일 — 스탯 공식은 grow·payload·codec 이 함께 써서 분리)
| export | v1 |
|---|---|
| `SPEC`(+개별 `scaleAtkHp`, `slotState`, `normalize` …) | `legacy/spec.v1.js` 전체 |
| `SPEC_SLOTS`, `SPEC_FULL`, `SPEC_NEED`, `SPEC_NEED_LV`, `specOf`, `specOn`, `specInv`, `specEvo`, `specRune`, `specSlotState`, `specLevel`, `specAtkHp(s, chars)`, `specPayload` | L3698-3783 |
| `promoteLegacySpec` | L306-319 |

### plan.js
| export | v1 |
|---|---|
| `makeEnv({chars, altar})`, `ENV0`, `cdPlusOf`, `altarProcCdActive`, `ALTAR_CD_PROC(_IDS)`, `ALTAR_FLOORS`, `fcd`, `ffat`, `cdProcSources`, `cdAssistSrc` | L1666-1684, L3221-3224 (전역 altarOn/altarCfg → `env`) |
| `ULT_MODES`, `ultOf`, `ultIsDefault`, `setUlt` | L3205-3216 |
| `ultModeOf(slot)` → `'auto'|'strict'|'asap'`, `setUltMode(slot, mode)` | v2.1 3택(§9) ↔ v1 `ult.mode`. 옛 `'manual'` 은 `'auto'` 로 읽힘, 남은 `usePlan/plan` 은 지운다 |
| `SYNC_MAX_GROUPS`, `SYNC_BASES`, `syncOtherDefault`, `syncOtherOf`, `normalizeSyncGroups`, `syncPayloadOf`, `syncGroupOf(groups, pos)`, `migrateSnapSync` | L3230-3322 |
| `editSyncGroup`, `syncOps.{setAnchor,toggleMember,setOrder,setBase,setOther,setMiss,removeGroup}` | L3306-3314 + initAltar 핸들러 L3636-3674 |
| `applySyncPreset(groups, roster, 'uk')` | L2370-2395 |
| `detachSync`, `attachSync`, `swapSyncPositions` | L1441-1477, L692 |
| `teamOrder`, `autoSelOverrides` | L1529-1533, L2708-2715 |
| `fillPlan`, `defaultPlan`, `padPlan`, `ult3Plan`, `isUlt3Plan`, `passiveDefendPlan`, `allyBasicCounts`, `ultAvail`, `normalizePlan`, `earlyUltPlan`, `canEarlyUlt`, `imbueonUltTurns`, `taehoFedTurns`, `enforceCdDefend`, `reflowUlts`, `reflowFromFirst`, `isPristinePlan` | L4164-4429 (모두 마지막 인자 `env`) |
| `planView(slot, i, team, n, env)`, `planClick(slot, i, team, n, idx, a, env)` | renderPlanner 계산부·onclick L4430-4515 |
| `PRESETS`, `TOGGLE_PRESETS`, `presetAvailable`, `presetTarget`, `presetIsOn`, `presetLen`, `fillTarget`, **`allUltPlan`(신규 '모두 필살기')** | openModal 프리셋 L4096-4147 |
| `teamFingerprint`, `reconcileTurn`, `reconcileAll`(잠긴 턴용 순수 보조) · `missingActors(locked, team, turns, chars)`, `turnClean`, `whyBad`, `turnBad(locked, probe, t)`, `plansFromProbe`, `turnSeqFromProbe` | L1689, L1747-1860, L1926-1938, L2007-2035 |
| **§9** `PIN_ACTS`, `lineTurns`, `pinCount`, `pinsRowOf`, `withPinsRow`, `sortPins`, `sortLocked`, `lockedWithin`, `isFullyLocked`, `pinFillKind`, `assistFirstUlt`, `assistPulls`, `lineFromPins`, `pinsFromPlan`, `effectiveTeam`, `adoptLegacyPlans`, `presetPinsRow` | 신규 — 핀·잠긴 턴 모델과 구체화(아래 §v2.1) |
| **§9** `ALTAR_MOON_IDS`, `quickCdAltar()`, `isQuickCdAltar(altar)` | 신규 — 쿨감 제단 스위치 |
| `COND_DEFAULTS`, `deriveOrder`, `deriveOrderSlots`, `summary.{order,exceptions,sync,cond,tdmg,altar}`, `isDefault.*`(`pins`·`locked` 포함, `manual` 삭제), `lockState`(항상 잠그지 않음 + 잠긴 턴 목록 `turns`) | 신규(목업 아코디언) |

### payload.js
| export | v1 |
|---|---|
| `planRotation`, `fedPayload`, `slotPayload(s, pos, roster, turns, adv, env)` | L3744-3773 |
| `ultPayload`, `altarPayload(altar)`, `tdmgPayload(tdmg, turns)`, `tdmgPerClean`, `tdmgClamp`, `syncPayloadOf`, `specPayload` | L3210, L3363-3371, L2888-2920, L3265 |
| `buildCfg(state, {mode:'rules'|'probe'|'run', plansOverride})` | run() L4626-4638 / advCfg() L1707-1738 + §9(핀 → 동료별 줄, 잠긴 턴 → turnPlans) |
| `buildCompareCfg(side, snap, common, {chars, altar, tdmg, mainTurns})` | cfgFromTeam() L654-669 |

### codec.js
| export | v1 |
|---|---|
| `compressCode`, `decompressCode(code, chars)`, `encodeShare`, `decodeShare` | L500-525 |
| `packRecords`, `unpackRecords(arr, v2, chars)`, `packSnap`, `unpackSnap`, `packSnapV2`, `unpackSnapV2`(꼬리 13·14 = §9 pins·locked), `packSlot`, `unpackSlot` | L375-475 |
| `encPins/decPins`(§9 — 타임라인과 같은 1글자 압축), `encTP/decTP`, `encPlan/decPlan`, `encFed/decFed`, `encSpec/decSpec`, `encUlt/decUlt`, `encAltar/decAltar`, `encTdmg/decTdmg`, `encGroups/decGroups`, `trimDef`, `usesNewFeatures`, `looseEq`, `bytesToB64url`, `b64urlToBytes`, `deflate`, `inflate`, `CID0` | 같은 이름의 `_enc*/_dec*` 등 L299-497, L3217-3220, L3277-3294, L3388-3408 |

### store.js
`createStore({ storage?, api?, chars?, now? })` →
- `get()`, `set(patch, {silent})`, `subscribe(selector, fn)` (참조 비교 — 모든 조작이 바뀐 가지를 새 객체로 바꾼다), `onNotice(fn)`
- `snapshot()`, `applySnap(s)` (L114-131, L174-202), `saveDraft()`, `loadDraft()` (L203-217), `init({chars})` (init L1342-1377: 초안 → 최근 기록 → 기본 편성)
- `records.{list, save(snap, data), restore(id) → {rec, undo}, revert(undo), remove(ids), removeExcept(ids), pin, lock, rename, importJson, importText, exportJson, exportCode, sort, search}` (L69-202, L255-290, L526-593)
- `team.{add(id, i?), remove(i), pick(id), setPickTarget(i), swap(a, b), setSpec(i, spec), update(i, fn|patch), setDefault(), bench()}` — **i 는 0-based 자리 index** (L1398-1440). 빼기/넣기/교체 때 핀 줄·잠긴 턴 항목도 따라간다.
- `cond.{set, reset}`, `altar.{setOn, setFloor, toggle, apply, quickCd(on) → prev, isQuickCd(), restore(prev)}`, `tdmg.{set, setTurn, clearTurns, apply}`, `sync.{set, op(name,…), preset, groupOf}`
- `plan.{order, setOrder(positions), move(k, dir), resetOrder, setException(turns, order), clearException, resetExceptions, resetAll, setUltMode(i, mode), setUlt(i, patch), ultAll(kind) → undo, setFed(i, turn, a), setAllyUltAfter(i, on), presetLen}` — i 는 0-based
- **§9** `plan.{setAssist(pos, on), setKeepDef(pos, on), assistAll(on) → undo}` — **pos 는 1-based**(핀과 같은 좌표)
- **§9** `pins.{set(turn, pos, act|null), cycle(turn, pos), get(turn, pos), row(pos), line(pos), ultAllowed(turn, pos), count(), clearTurn(turn), clearRow(pos), clearAll(), presetAvailable(pos, name), applyPreset(pos, name) → token|null, revert(token), undo() → label, canUndo(), lockTurn(turn, seq), unlockTurn(turn), unlockAll(), lockAllFromProbe(probe?)}` — turn·pos 1-based
- **§9** `materialize() → {turnPlans, rotations}`, `effectiveTeam()`, `probe({mode}) → probe`(mode 'probe' 면 state.probe 보관), `pinsIgnored(probe)`, `prepareRun() → {cfg, warnings}`, `setResult(data, {save})`, `buildCfg({mode:'rules'|'probe'|'run', plansOverride})`, `env()`, `setLang(lang)`
- 보조 export: `KEYS`, `HISTORY_MAX`, `DEFAULT_TEAM`, `TDMG_DEFAULTS`, `altarDefaults`, `newSlot`, `normalizeAltarFloors`, `altarFromSnap`, `tdmgFromSnap`, `afterTeamChange(team, overrides, pins, locked, removed)`

state 모양은 ARCHITECTURE §2 + 다음 보충: `altar = { on, floors:{1:{on, off:{id:true}}} }`(woofia_altar 저장 형식 그대로),
`tdmg = { on, pct, adv, per, hits }`(woofia_tdmg), **§9** `pins = { [turn]: { [pos]: '궁'|'방'|'평' } }`, `locked = { [turn]: [{p, a}] }`, `probe`(마지막 미리보기 결과),
`ui` 에 `pickTarget`, `histSort`, `histSearch` 추가. (`manual` 은 삭제)

### api.js
`createApi({ mode?, port?, fetch?, base?, Worker?, workerUrl? })` → `{ mode, ready, onProgress(fn), chars, char, simulate, probe, dispose }` (L11-39).
`onProgress` 값: `{ stage: 'runtime'|'engine'|'ready'|'fatal', msg, ratio, error? }` — 워커는 비율을 주지 않아 단계 순서로 추정(0.1 → 0.6 → 1).

## 요약 키 (i18n 사전에 필요 — `summary.*` 반환 `{ key, vars }`)
`plan.sum.order{ids,names,positions,modes,custom,pins,locked}` · `plan.sum.order.manual{n}`(1..turns 전부 잠김) · `plan.sum.order.empty` ·
`plan.sum.exceptions{n,turns}` · `plan.sum.exceptions.none` · `plan.sum.sync{n,anchors,members}` · `plan.sum.sync.none` ·
`cond.sum{turns,runs,dummies,enemyHits,dummyElement,hp10,incoming}` · `cond.sum.forced{…}` ·
`cond.tdmg.sum{pct,min,max,hits}` · `cond.tdmg.sum.range{…}` · `cond.tdmg.sum.off` · `cond.altar.sum{floors,off,cdPlus,procIds}` · `cond.altar.sum.off`

## 알림 키 (`onNotice` → `{ key, vars }`)
`records.storageFull` · `team.imbueonP1` · `sync.anchorRemoved` · `sync.presetFull` · `cond.forceLockedByAltar` /
prepareRun warnings: `run.recommendPlan{id}`(핀 없는 이태호·마타야) · `run.hpSchedule{id}` · `run.manualMissing{names}`(잠긴 턴에 빠진 동료) ·
**§9** `run.pinIgnored{pos, id, turns}`(엔진이 따르지 않은 핀 — 쿨 미충족·맞추기·준비되면 바로 등) · `manual.probeFailed{message}`(점검 프로브 실패).
삭제: `plan.autoDefend` · `plan.ultImpossibleStack` · `plan.ultImpossibleCd`(v1 플래너 칸 클릭 알림 — 핀은 `pins.ultAllowed` 로 미리 막는다) · `manual.added/removed/extraBeforeUlt`.

## v1과 의도적으로 다른 점
1. **API 포트**: fetch 경로는 **8778**(server_v2.py). v1은 8777.
2. **스냅샷의 dummies/dummyElement/enemyHits 는 문자열** — v1이 `dataset.val`(항상 문자열)을 저장하던 것과 바이트까지 맞추려고 v2도 문자열로 낸다. state.cond 안에서는 dummies·dummyElement 가 숫자, enemyHits 가 문자열.
3. **적 공격 대상 수 기본값 '5'**(v1 index.html 초기값). 코덱의 트림 기본값 'all' 과 다른 건 v1 그대로.
4. **applySnap 이 턴·반복 수를 1~30 / 1~200 으로 자르고 결측을 기본값으로** 채운다(v1은 range 입력이 같은 일을 했고, 결측이면 "undefined" 가 들어갈 수 있었다). 손상된 스냅샷(`team` 없음)은 무시.
5. **applySnap 이 미리보기 프로브(`state.probe`)를 비운다.**
6. **행동 계획 = 규칙 + 핀 + 잠긴 턴**(§9, 아래 §v2.1) — 완전 수동 모드·직접 계획 없음. v1 코드·기록은 핀·잠긴 턴으로 읽힌다.
7. **새 프리셋 '모두 필살기'(`allUlt`)**: 단일 행동은 전 턴 '궁'을 CD 모델로 정리(확률 감소 가정 반영) — 일반 동료는 기본 주기와 같고 마타야(1쿨)는 2턴부터 매 턴, 이태호는 매 턴 첫 행동. 제토는 대상 아님.
8. **필살기 방식 3택**(§9): asap > strict > auto. v1 usePlan+strict 는 strict 로 보이고 계획은 핀.
9. **team.swap(a, b)** 은 메인 편성에 새로 생긴 조작(v1은 비교 화면에만 있던 cmpSwapSlots 규칙을 적용: 예외 턴·잠긴 턴·핀·연동 포지션이 동료를 따라감, 임부언 1번 금지).
10. **team.add 는 이미 편성된 동료를 거부**(`reason:'dup'`) — v1은 pick 토글이 막아 주던 것을 조작 단위에서 방어.
11. **plan.resetOrder 는 우선순위만** 초기화(v1 '전부 기본값으로'는 특정 턴 순서도 지웠다 → `plan.resetAll()` 이 그 동작).
12. **fmt(NaN)** 은 '0'(v1은 'NaN').
13. **기록 id 충돌 방지**: 같은 ms 에 저장하면 +1.
14. **buildCompareCfg 의 턴 피해는 메인 턴 수(`mainTurns`) 기준으로 턴별 값을 거른다** — v1 버그성 동작(비교 턴 수가 아니라 #turns)을 그대로 재현. 필요하면 E가 `mainTurns` 를 비교 턴 수로 넘기면 된다.
15. 토스트·confirm·되돌리기 버튼은 없음 — `onNotice`/반환값(undo 토큰·함수)으로 UI가 처리.
16. **일부 턴만 채워진 v1 완전 수동 타임라인**은 그 턴만 잠기고 나머지 턴은 규칙(우선순위·예외 턴·동료별 줄 포함)으로 돈다 — v1은 실행 직전 프로브로 빈 턴을 채우고 우선순위를 버렸다. v1 이 저장한 기록은 실행 후 전 턴이 채워져 있어 대부분 v1 과 같은 페이로드(전 턴 잠김 = v1 완전 수동 모양).

## v2.1 핀·잠긴 턴 (ARCHITECTURE §9 구현, 2026-09-28)

### 상태 · 스냅샷
- `state.pins = { [turn]: { [pos]: '궁'|'방'|'평' } }` — 턴당 2회 행동(이태호)은 행동 수만큼의 문자열(`'궁평'`). 턴 1..30(줄 길이 전체), 자리 1..5.
- `state.locked = { [turn]: [{p, a}] }` — 턴 전체를 직접 짠 턴(옛 완전 수동 `turnPlans`). `manual.on`·`usePlan` 개념은 없다(항상 규칙 + 핀 + 잠긴 턴).
- `snapshot()` 은 v1 모양 그대로 + `pins`·`locked`(비면 **생략** → 핀·잠금이 없으면 v1 과 바이트 동일). `advOn`/`turnPlans` 는 항상 `false`/`{}`(쓰지 않고 읽기만). `locked` 는 현재 턴 수 안만(v1 turnPlans 규칙), `pins` 는 30턴 전체.
- 공유 코드 `'$'` 꼬리 13번 = `encPins(pins)`, 14번 = `encTP(locked)`. 비면 trimDef 로 잘려 예전과 바이트 동일. v1 디코더는 모르는 꼬리를 무시하고 연다(핀은 잃음). 초안의 `touched` 는 모양 유지용(= 잠긴 턴 목록).

### 읽기 호환(applySnap · 기록 · 초안 · 코드 — `adoptLegacyPlans`)
| v1 | v2.1 |
|---|---|
| `usePlan + plan` (직접 계획) | 그 동료의 핀: 궁·방 칸 전부 + 규칙 채움과 다른 평 칸(최소 핀). 결과가 비면 1턴 칸 하나를 남긴다(= 줄을 보낸다는 사실 보존). 슬롯에서 usePlan/plan 삭제, rotation '' |
| `advOn=true + turnPlans` (완전 수동) | 그 턴들을 `locked` 로(정보 손실 없음) |
| `advOn=false` 로 남아 있던 `turnPlans` | 버림(v1 에서도 엔진에 안 보내던 값) |
| `ult.mode strict/asap/fixed`, `keepDef`, `assist` | 그대로(방식 select · 동료별 성공 가정·방어 턴 유지로 드러남) |

### 구체화(엔진 입력) — §9 원안과 다른 점(의도적)
§9 원안은 "핀이 있는 턴을 규칙 프로브의 그 턴 순서로 굳혀 turnPlans 에 넣는다"였다. 구현은 **핀 → 그 동료의 줄(rotation), 잠긴 턴만 → turnPlans** 이다.
- 이유 1(계약): 같은 과업의 수용 조건 — v1 직접 계획 코드(레오전·마타야·사용자 코드 파미도)의 run cfg 가 v1 과 **동일**하고 rotation 이 유지돼야 한다 — 은 핀을 turnPlans 로 굳히면 만족할 수 없다(v1 cfg 는 turnPlans `{}` + rotation). 줄 방식은 v1 코드 7종 + 워크스루 코드 + 피드백 3사례 + 사용자 코드 전부에서 cfg 가 바이트까지 같다(tests/pins.test.js (b)(c)(e)).
- 이유 2(엔진 의미): turnPlans 는 그 턴의 **팀 전체** 행동을 확률 100%·1회 프로브 결과로 굳히고(실행 50회의 확률 행동·추가 행동이 매번 같아짐), 필살기 방식·맞추기·쿨 미충족 폴백을 끈다. 줄은 그 동료의 자연 행동 토큰만 정하고 나머지 규칙은 엔진이 매 반복 계산한다.
- 규칙 채움(`pinFillKind`): 단일 행동 동료는 **방식과 관계없이**(자동·정해진 턴만·준비되면 바로, 마타야 포함) 마지막 필살기(핀 포함)에서 기본 주기 뒤(준비 턴이 방어 핀이면 다음 칸) / 이태호·제토 = defaultPlan. 핀도 잠금도 없는 동료는 줄을 보내지 않는다(= 엔진 기본 규칙).
  - 2026-09-28 변경(ADV_AUDIT 모순 1·2): 전에는 마타야 = defaultPlan(필살기 없음), 정해진 턴만·준비되면 바로 = '평'이라 칸 하나만 고정해도 그 줄의 기본 턴 필살기가 사라졌다(마타야 1턴 방어 고정 2397.8만 → 2154.9만, 정해진 턴만 + 7턴 고정 = 7턴만). 지금은 "고정하지 않은 칸 = 그 방식이 만들었을 행동". `pinsFromPlan` 이 같은 채움으로 최소 핀을 찍어 v1 직접 계획 코드의 rotation·run cfg 는 그대로(계약 테스트 240개 무변경, 공유 코드 A~E cfg 동일).
- **성공 가정(2026-09-28, FEEDBACK_CASES #27 · ADV_REVIEW §1)**: 자동·정해진 턴만 + 성공 가정 + 확률 CD 감소 제단이면 규칙 채움의 첫 필살기가 당겨진다(`assistFirstUlt` — v1 earlyUltPlan 과 같은 규칙, CD 3턴 → 3·6·9·12, CD 2턴 → 2턴부터). 핀이 없어도 당겨지면 줄을 보낸다(`effectiveTeam` — 엔진 harness 는 줄이 있을 때만 가정을 쓰므로 엔진 변경 없이 구현). 임부언 fed carry(1번 자리)는 핀 없는 당기기에서 제외. **의도적 v1 차이**: v1 코드의 '자동 + 성공 가정 + 쿨감 제단' 동료는 v2 run cfg 에 당겨진 줄이 생긴다(v1 에선 효과 없는 체크) — 계약 테스트는 기대값에 `tests/helpers/samples.js withAssistPull` 로 그 차이만 반영.
- 전 턴(1..turns)이 잠기면 v1 완전 수동과 같은 페이로드(rotation·priority null, turnOrders {}).
- `store.materialize()` → `{ turnPlans(잠긴 턴), rotations({pos: 줄}) }` — 프로브가 필요 없다(인자는 호환용으로 받고 무시). `buildCfg({mode})`: `'rules'` = 핀·잠금 없이(프로브 조건), `'probe'` = 규칙+핀+잠금(확률 100%·1회), `'run'` = 실제 조건.
- `prepareRun()`: cfg 는 프로브 없이 만든다. api 가 있고 핀이 있으면 `'probe'` 프로브 1회로 **엔진이 따르지 않은 핀**을 `run.pinIgnored` 로 알린다(원안의 '규칙 프로브 → materialize' 2단계는 불필요해져 이 점검으로 바뀜). 실제 엔진(8778) 확인: 하니엘 4턴 방어 핀 → 4턴 방어·5·8턴 필살기.
- 알려진 한계: 규칙 채움은 계획 모델(v1 플래너와 같은 쿨 주기)이라, 임부언 fed carry 로 쿨이 당겨지는 캐리·방어로 쿨이 줄어드는 동료(히토하·모이루)에 핀을 찍으면 핀 없는 칸이 엔진 기본 규칙과 조금 다를 수 있다 — 미리보기가 프로브로 그리므로 결과는 화면에 보인다.

### 프리셋 → 핀 묶음
`pins.applyPreset(pos, name)`: 기존 `presetTarget`(모두 필살기·3턴마다·첫 필살기 당기기·필살기 직전 방어) / `reflowFromFirst`(간격 맞추기 — 지금 줄 기준)로 계획을 만든 뒤 `pinsFromPlan` 으로 최소 핀만 찍어 **그 동료의 핀 줄을 교체**한다(보통 공격은 규칙 채움과 같으면 찍지 않음 — 3턴마다처럼 규칙이 끼워 넣을 궁 자리만 평 핀). 결과 줄은 v1 프리셋 계획과 같다(tests/plan.test.js). 'early' 는 그 동료의 성공 가정이 켜져 있어야 한다(꺼져 있으면 null — 2026-09-28 사용자 결정: 성공 가정은 사용자만 켜고 끈다. 전에는 프리셋이 스스로 켜고 notice `plan.assistOnByEarly` 를 냈다).

### 삭제·대체된 API
| 삭제 | 대체 |
|---|---|
| `store.manual.{setOn, refresh, fill, commit, reorder, resetTurns, resetAll, undo, canUndo, paste, findCompatible, importLegacy, keepTeam, missing}` | `pins.lockTurn` · `unlockTurn` · `unlockAll` · `lockAllFromProbe` · `pins.undo/canUndo/revert` · `store.probe()` · `plansFromProbe`/`turnSeqFromProbe`(턴 편집 시트 초기값) · 시험 프로브는 `buildCfg({mode:'probe', plansOverride})` + `turnClean`/`whyBad` |
| `store.plan.{setUsePlan, cell, fill, preset, presetOn}` | `pins.set/cycle/clearRow` · `pins.applyPreset` · `pins.presetAvailable` |
| `setUltMode(slot, 'manual')` · `ultModeOf → 'manual'` | 3택(auto/strict/asap) |
| `buildCfg({useLegacy})` | `buildCfg({mode:'rules'})` 또는 `plansOverride: {}` |
| plan.js `materialize(manual, …)`, `needsFill`, `manualSeq`, `sigChanged`, `manualConflicts` | 불필요(잠긴 턴은 편성 변경 시 afterTeamChange 가 정리) |
| state `manual` | state `pins` · `locked` · `probe` |
| `afterTeamChange(team, ov, manual, removed) → {overrides, manual}` | `afterTeamChange(team, ov, pins, locked, removed) → {overrides, pins, locked}` |

`src/ui/{plan,manual,plan-helpers,compare,guide,records}.js` 는 아직 옛 API(`state.manual`·`store.manual`·`usePlan`)를 참조한다 — §9 UI 재작성 담당이 교체.

## 미이식(다른 담당 · 후속)
- 비교군 스코프 편집(v1 openAdvFor/advLeaveScope·cmp* 상태): plan.js 함수는 순수라 재사용 가능하지만, 비교군용 행동 계획(옛 `manual`, 이제 pins/locked) 관리는 ui/compare(E) 몫.
- advClip/advSelSet/advGrid/advCell 같은 편집기 UI 상태, 키보드 조작 — ui/manual(D).
- 예외 턴 편집기의 선택 턴(selTurns) — `autoSelOverrides` 만 제공.

## core 이관 제안 (ui/plan-helpers.js — D 담당, 순수 함수)
ui/plan · ui/manual 이 쓰는 계산 중 core 에 없던 것. DOM 없음 → `core/plan.js` 로 옮겨도 된다(sortable 만 DOM이라 제외).
- `autoUltTurns(meta, n, env)` — '자동' 옵션 라벨의 기본 필살기 턴("4·7·10"), defaultPlan 기반
- `groupExceptions(overrides, maxTurn)` — 같은 순서의 예외 턴 묶음 [{turns, order}]
- `actsOf(probe, t, pos)` · `cellClass(acts, apt)` · `cellSource(state, probe, pos, t)` — 미리보기 칸 분류·출처 1차 근사(manual > 예외 턴 > 맞추기 멤버의 기준 동료 필살기 턴 > ①)
- `actSegs(acts, apt)` · `actsLabel(t, acts, apt)` · `segsKey(segs)` — 한 턴 여러 행동 칸의 조각(실행 순서, 턴당 행동 수를 넘는 행동 = 추가 행동)과 설명 문구. 턴당 행동 수는 `store.env().chars`(도장 잠금해제 반영 — `makeEnv({ team })`)에서 읽는다
- `syncActionOf(m)` · `replaceSyncMember(groups, gi, from, to)` · `syncUsedExcept(groups, gi)` — 맞추기 문장형 편집기용(syncOps 에 `replaceMember` 로 넣는 것도 가능)
- `shortName(full)` · `turnsText(turns)` — 표기(ui/grow.js shortName 과 중복 → format.js 로 합치기 권장)
- 비교군 스코프: `createScopeStore(base, init)` / `scopeSession(...)`(ui/plan-helpers.js) — `createStore` 를 메모리 저장소로 한 번 더 만들어 패널·편집기를 재사용한다(woofia_* 저장 안 함). core 에 `createStore({ storage: memory })` 스코프 팩토리로 두는 것도 가능
