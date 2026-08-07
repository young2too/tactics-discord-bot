import { skillCatalog, skillTooltips } from "./catalog";
import type { Faction } from "./types";

export const guideSections = [
  { id: "start", title: "처음 시작하기", summary: "공표하고, 대화하고, 상대의 정체를 추적하세요.", items: [
    ["게임의 목표", "시민은 마피아대부를 제거하거나 올바르게 검거해야 합니다. 마피아는 경찰반장을 제거하거나 검거를 실패하게 만들어야 합니다."],
    ["공표", "자신이 주장할 직업을 공개합니다. 진명 공표는 마나 10, 가명 공표는 마나 5를 얻으며 공표 쿨타임은 40초입니다."],
    ["마나", "스킬 사용 자원입니다. 공표와 3분마다 발생하는 마나 보급으로 회복합니다."],
    ["행동 순서", "스킬 선택 → 게임판의 대상 선택 → 필요한 경우 직업 선택 순서로 사용합니다."],
    ["채팅", "일반 입력은 공개 채팅, ‘-3 내용’은 3번에게 보내는 귓말, 동맹 채널은 현재 동맹끼리만 보입니다."],
    ["사망", "처치 방식과 관계없이 사망자의 실제 직업은 모두에게 공개되며 이후 행동과 대상 지정이 불가능합니다."],
  ]},
  { id: "victory", title: "승리 조건", summary: "리더의 생존과 남아 있는 역전 수단이 핵심입니다.", items: [
    ["마피아 즉시 승리", "경찰반장이 사망하거나 검거가 실패하면 즉시 마피아가 승리합니다."],
    ["시민 즉시 승리", "검거로 마피아대부를 잡고 살아 있는 지정 후계자가 없거나, 대부가 사망하고 살아 있는 지정 후계자가 없으면 시민이 승리합니다."],
    ["후계자", "대부가 올바른 마피아후계자를 지정했다면 대부 사망 뒤에도 마피아 진영의 게임이 계속됩니다."],
    ["처치 수단 소진", "일반 공격뿐 아니라 사용 가능한 검거·저격·복수귀와 성공 가능한 저격명령 연계까지 모두 소진되어 역전이 불가능할 때만 게임을 끝냅니다."],
  ]},
  { id: "information", title: "공개 정보 원칙", summary: "행동은 보이지만 판정 결과는 대체로 비공개입니다.", items: [
    ["공표", "대상과 공표명은 전체 공개됩니다. 획득 마나는 본인만 확인합니다."],
    ["확인·스캔", "조사당한 대상과 돋보기 효과는 전체 공개됩니다. 성공 여부와 판정 결과는 시전자만 압니다."],
    ["공격", "공격 시도와 사망은 공개됩니다. 직업 추측 결과와 실패 상세는 공격자에게 표시됩니다."],
    ["저격명령", "명령의 성공·실패는 전체 공개되지만 누구에게 명령했는지는 비공개입니다."],
    ["지원", "공무원이 누구에게 마나를 지원했는지는 전체 공개됩니다."],
    ["사망", "사망 여부, 처치 방식, 사망자의 실제 직업이 모두 공개됩니다."],
  ]},
] as const;

export const roleGuide: { name: string; faction: Faction; summary: string; skills: string[] }[] = [
  { name: "마피아대부", faction: "mafia", summary: "마피아의 리더. 지휘와 공격, 승계를 관리합니다.", skills: ["leadership", "lower-attack", "successor", "snipe-command"] },
  { name: "히트맨", faction: "mafia", summary: "적을 스캔하고 대부의 명령으로 결정적인 저격을 합니다.", skills: ["enemy-scan", "snipe"] },
  { name: "마피아일원", faction: "mafia", summary: "패널티 없는 상급공격을 사용하는 공격수입니다.", skills: ["upper-attack"] },
  { name: "마피아후계자", faction: "mafia", summary: "대부의 뒤를 잇고 양 진영의 정체를 폭넓게 추적합니다.", skills: ["advanced-scan", "boss-check"] },
  { name: "스파이", faction: "mafia", summary: "시민 공표로 아군 확인을 속이는 잠입자입니다.", skills: ["deception"] },
  { name: "경찰반장", faction: "citizen", summary: "시민의 리더. 검거의 성공과 실패가 즉시 승패를 결정합니다.", skills: ["ally-check", "leadership", "arrest"] },
  { name: "자경단원", faction: "citizen", summary: "패널티 없는 상급공격을 사용하는 시민 공격수입니다.", skills: ["upper-attack"] },
  { name: "사립탐정", faction: "citizen", summary: "적군의 실제 직업을 추적하는 조사관입니다.", skills: ["enemy-scan"] },
  { name: "순찰경찰", faction: "citizen", summary: "경찰반장을 보호하며 위험한 하급공격을 사용합니다.", skills: ["ally-check", "lower-attack"] },
  { name: "탐정조수", faction: "citizen", summary: "탐정을 찾고 적군 공표의 진위를 확인합니다.", skills: ["detective-check", "enemy-check"] },
  { name: "남자연인", faction: "citizen", summary: "연인의 죽음 뒤 복수귀로 한 명을 즉사시킬 수 있습니다.", skills: ["ally-check", "revenge"] },
  { name: "여자연인", faction: "citizen", summary: "연인의 죽음 뒤 복수귀로 한 명을 즉사시킬 수 있습니다.", skills: ["enemy-check", "revenge"] },
  { name: "공무원", faction: "citizen", summary: "마나를 지원하고 공개 공문을 발송합니다.", skills: ["support", "proclamation"] },
];

export const skillGuide = Object.values(skillCatalog).map((skill) => ({ ...skill, ...skillTooltips[skill.id] }));

export const trainingTracks = [
  { id: "leaders", title: "지휘관 훈련", roles: "마피아대부 · 경찰반장", steps: ["진명 공표로 리더십 조건 충족", "리더십으로 생존 직업 탐색", "후계자·저격명령 또는 검거의 위험 확인"] },
  { id: "investigators", title: "조사관 훈련", roles: "히트맨 · 사립탐정 · 후계자 · 탐정조수", steps: ["확인과 스캔의 차이 파악", "대상 선택 후 직업 추측", "상대 리더를 스캔할 수 없는 제한 확인"] },
  { id: "attackers", title: "공격수 훈련", roles: "마피아일원 · 자경단원 · 순찰경찰", steps: ["스킬 선택 후 대상 지정", "직업을 추측하여 공격", "하급공격 2회 실패 자멸 규칙 확인"] },
  { id: "specialists", title: "특수 능력 훈련", roles: "스파이 · 연인 · 공무원", steps: ["기만의 패시브 판정 확인", "연인 사망 후 복수귀 활성화", "마나 지원과 공문의 공개 범위 확인"] },
] as const;
