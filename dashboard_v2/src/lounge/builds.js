/**
 * lounge/builds.js — 라운지 게임 빌드 기록. **생성 파일**: `python tools/redesign/gen_lounge_chars.py --new <ID> --build <MMDD>` 가 아래 한 줄을 고쳐 쓴다.
 *  - builds: 오래된 → 최신 순. 마지막 = 현재 라이브 빌드(글에 도장으로 찍히고, 평균 티어 '이번 버전'의 기준).
 *  - since : 라운지 첫 빌드 뒤에 들어온 동료 → 처음 들어온 빌드(티어표에 들어가면 그 티어표 빌드가 이 값으로 올라간다).
 * 손으로 고칠 때도 한 줄 JSON 형식을 지킬 것(생성기가 이 줄을 JSON 으로 읽는다). 규칙은 shared.js.
 */
export const BUILD_DATA = {"builds":["0922","0924","1006"],"since":{"10301":"0924","10306":"0924","10444":"1006"}};
