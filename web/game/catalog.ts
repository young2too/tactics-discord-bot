import type { Faction, Player, Skill, SkillTooltip } from "./types";

export const initialPlayers: Player[] = [
  { id: 1, name: "윤서", announced: "경찰반장", role: "마피아대부", faction: "mafia", alive: true },
  { id: 2, name: "민준", announced: "사립탐정", role: "사립탐정", faction: "citizen", alive: true },
  { id: 3, name: "하린", announced: "순찰경찰", role: "순찰경찰", faction: "citizen", alive: true },
  { id: 4, name: "도윤", announced: "마피아일원", role: "자경단원", faction: "citizen", alive: true },
  { id: 5, name: "서아", announced: "경찰반장", role: "경찰반장", faction: "citizen", alive: true },
  { id: 6, name: "지호", announced: "탐정조수", role: "히트맨", faction: "mafia", alive: true },
  { id: 7, name: "나", announced: "마피아일원", role: "마피아일원", faction: "mafia", alive: true, isMe: true },
  { id: 8, name: "예린", announced: "탐정조수", role: "탐정조수", faction: "citizen", alive: false },
];

export const skillCatalog: Record<string, Skill> = {
  announce: { id: "announce", key: "Q", name: "공표", icon: "📋", cost: 0, target: false, needsRole: true, tone: "gold", cooldown: 40 },
  "ally-check": { id: "ally-check", key: "W", name: "아군 확인", icon: "◉", cost: 5, target: true, needsRole: false, tone: "blue", cooldown: 10 },
  "enemy-check": { id: "enemy-check", key: "W", name: "적군 확인", icon: "◉", cost: 10, target: true, needsRole: false, tone: "blue", cooldown: 10 },
  "ally-scan": { id: "ally-scan", key: "E", name: "아군 스캔", icon: "⌁", cost: 15, target: true, needsRole: true, tone: "blue", cooldown: 10 },
  "advanced-scan": { id: "advanced-scan", key: "E", name: "상급 스캔", icon: "⌁", cost: 15, target: true, needsRole: true, tone: "gold", cooldown: 10 },
  "enemy-scan": { id: "enemy-scan", key: "E", name: "적군 스캔", icon: "⌁", cost: 20, target: true, needsRole: true, tone: "blue", cooldown: 10 },
  "upper-attack": { id: "upper-attack", key: "R", name: "상급 공격", icon: "︻╦╤─", cost: 40, target: true, needsRole: true, tone: "red", cooldown: 10 },
  "lower-attack": { id: "lower-attack", key: "R", name: "하급 공격", icon: "⌐╦", cost: 30, target: true, needsRole: true, tone: "red", cooldown: 10 },
  "boss-check": { id: "boss-check", key: "W", name: "보스 확인", icon: "♛", cost: 10, target: true, needsRole: false, tone: "red", cooldown: 10 },
  "detective-check": { id: "detective-check", key: "W", name: "탐정 확인", icon: "⌕", cost: 10, target: true, needsRole: false, tone: "blue", cooldown: 10 },
  support: { id: "support", key: "W", name: "지원", icon: "+", cost: 20, target: true, needsRole: false, tone: "blue", cooldown: 10 },
  leadership: { id: "leadership", key: "W", name: "리더쉽", icon: "⚑", cost: 40, target: false, needsRole: true, tone: "gold", cooldown: 10 },
  successor: { id: "successor", key: "E", name: "후계자 지정", icon: "♚", cost: 0, target: true, needsRole: false, tone: "gold", cooldown: 10 },
  "snipe-command": { id: "snipe-command", key: "R", name: "저격명령", icon: "▄︻デ══━一", cost: 0, target: true, needsRole: false, tone: "gold", cooldown: 10 },
  arrest: { id: "arrest", key: "R", name: "검거", icon: "⚖", cost: 0, target: true, needsRole: false, tone: "blue", cooldown: 10 },
  snipe: { id: "snipe", key: "R", name: "저격", icon: "⌾", cost: 0, target: true, needsRole: false, tone: "red", cooldown: 10 },
  revenge: { id: "revenge", key: "R", name: "복수귀", icon: "☠", cost: 150, target: true, needsRole: false, tone: "red", cooldown: 10 },
  deception: { id: "deception", key: "W", name: "기만", icon: "◈", cost: 0, target: false, needsRole: false, tone: "gold", cooldown: 0 },
  betrayal: { id: "betrayal", key: "E", name: "배신", icon: "🗡", cost: 10, target: true, needsRole: false, tone: "red", cooldown: 10 },
  proclamation: { id: "proclamation", key: "E", name: "공문", icon: "✉", cost: 0, target: false, needsRole: false, needsText: true, tone: "blue", cooldown: 5 },
  "ally-add": { id: "ally-add", key: "A", name: "동맹 추가", icon: "🤝", cost: 0, target: true, needsRole: false, tone: "gold", cooldown: 5 },
  "ally-remove": { id: "ally-remove", key: "S", name: "동맹 파기", icon: "🤝", cost: 0, target: true, needsRole: false, tone: "red", cooldown: 5 },
};

export const skillTooltips: Record<string, SkillTooltip> = {
  announce: { description: "선택한 직업 이름을 모두에게 공표합니다. 진명은 마나 10, 가명은 마나 5를 얻습니다.", warning: "공표한 이름은 확인 계열 스킬의 판정 대상이 됩니다." },
  "ally-check": { description: "아군 진영의 이름을 공표한 대상이 진명을 말했는지 확인합니다.", condition: "아군 진영 이름을 공표한 생존자만 지정할 수 있습니다.", warning: "시민으로 위장한 스파이에게 속을 수 있습니다." },
  "enemy-check": { description: "적군 진영의 이름을 공표한 대상이 진명을 말했는지 확인합니다.", condition: "적군 진영 이름을 공표한 생존자만 지정할 수 있습니다." },
  "ally-scan": { description: "대상과 아군 직업 하나를 지목하여 실제 직업이 맞는지 판정합니다.", condition: "생존자 선택 후 현재 포메이션의 아군 직업을 지정합니다." },
  "advanced-scan": { description: "아군과 적군을 가리지 않고 대상의 실제 직업을 추측하여 판정합니다.", condition: "생존자 선택 후 현재 포메이션의 생존 직업을 지정합니다.", warning: "적 진영 리더인 경찰반장은 스캔 목록에서 제외됩니다." },
  "enemy-scan": { description: "대상과 적군 직업 하나를 지목하여 실제 직업이 맞는지 판정합니다.", condition: "생존자 선택 후 현재 포메이션의 적군 직업을 지정합니다.", warning: "히트맨은 경찰반장, 사립탐정은 마피아대부를 지목할 수 없습니다." },
  "upper-attack": { description: "대상의 실제 직업을 정확히 지목하면 처치합니다. 실패해도 별도 패널티는 없습니다.", condition: "생존자 선택 후 적군 직업을 지정합니다. 마나 비용은 10인 이하 40, 11인 이상 30입니다." },
  "lower-attack": { description: "대상의 실제 직업을 정확히 지목하면 처치합니다.", condition: "생존자 선택 후 적군 직업을 지정합니다.", warning: "누적 2회 실패하면 자멸합니다. 순찰경찰 생존 중에는 경찰반장을 지목할 수 없습니다." },
  "boss-check": { description: "선택한 대상이 마피아대부인지 확인합니다." },
  "detective-check": { description: "선택한 대상이 사립탐정인지 확인합니다." },
  support: { description: "선택한 생존자에게 마나 30을 즉시 제공합니다.", warning: "누구에게 지원했는지는 전장 기록에 공개됩니다." },
  leadership: { description: "직업 하나를 지목하여 해당 직업인 생존자를 한 번 찾아냅니다.", condition: "자신의 실제 직업을 공표한 뒤 사용할 수 있습니다.", warning: "게임당 1회만 사용할 수 있습니다." },
  successor: { description: "선택한 대상이 마피아후계자라면 대부 사망 뒤 승계할 후계자로 지정합니다.", warning: "성공 여부와 관계없이 게임당 1회입니다." },
  "snipe-command": { description: "선택한 대상이 히트맨이면 그 히트맨의 저격을 활성화합니다.", warning: "성공·실패는 전체 공개되지만 대상은 비공개입니다. 게임당 1회입니다." },
  arrest: { description: "선택한 대상이 마피아대부면 시민이 즉시 승리합니다.", warning: "대부가 아니면 즉시 마피아가 승리합니다. 게임당 1회입니다." },
  snipe: { description: "선택한 생존자를 직업 판정 없이 즉시 처치합니다.", condition: "마피아대부가 올바른 히트맨에게 저격명령을 내려야 활성화됩니다.", warning: "게임당 1회입니다." },
  revenge: { description: "선택한 생존자를 직업 판정 없이 즉시 처치합니다.", condition: "자신의 연인이 사망한 뒤에만 사용할 수 있습니다.", warning: "게임당 1회입니다." },
  deception: { description: "시민 직업을 공표하면 시민의 아군 확인에서 진명으로 보이는 지속 효과입니다.", condition: "별도로 발동할 필요가 없는 패시브입니다." },
  betrayal: { description: "맞동맹 상태인 생존자 한 명을 직업 추측 없이 즉시 처치합니다.", condition: "서로 동맹을 보낸 맞동맹만 지정할 수 있습니다.", warning: "피해자의 실제 직업은 사망과 함께 공개되지만 시전자의 정체는 공개되지 않습니다." },
  proclamation: { description: "발신자의 번호와 닉네임을 숨긴 공문을 모든 플레이어의 공개 채팅과 전장에 전달합니다.", condition: "마나를 소모하지 않으며 재사용 대기시간은 5초입니다." },
  "ally-add": { description: "선택한 플레이어에게 동맹을 보내 내 동맹 채팅과 조사 정보를 수신하게 합니다.", condition: "내가 아직 동맹을 보내지 않은 생존자에게 사용할 수 있습니다. 상대도 보내면 맞동맹이 되어 양방향으로 공유합니다." },
  "ally-remove": { description: "선택한 플레이어와 동맹을 끊고 적대관계로 돌아갑니다.", condition: "현재 동맹인 생존자만 지정할 수 있습니다." },
};

export const roleSkillIds: Record<string, string[]> = {
  마피아대부: ["leadership", "lower-attack", "successor", "snipe-command"], 히트맨: ["enemy-scan", "snipe"], 마피아일원: ["ally-check", "upper-attack"],
  마피아후계자: ["advanced-scan", "boss-check"], 스파이: ["deception", "betrayal"], 경찰반장: ["ally-check", "leadership", "arrest"],
  자경단원: ["upper-attack"], 사립탐정: ["enemy-scan"], 순찰경찰: ["ally-check", "lower-attack"],
  탐정조수: ["detective-check", "enemy-check"], 남자연인: ["ally-check", "revenge"], 여자연인: ["enemy-check", "revenge"], 공무원: ["support", "proclamation"],
};

export const allRoles: { name: string; faction: Faction }[] = [
  { name: "마피아대부", faction: "mafia" }, { name: "히트맨", faction: "mafia" }, { name: "마피아일원", faction: "mafia" },
  { name: "마피아후계자", faction: "mafia" }, { name: "스파이", faction: "mafia" }, { name: "경찰반장", faction: "citizen" },
  { name: "자경단원", faction: "citizen" }, { name: "사립탐정", faction: "citizen" }, { name: "순찰경찰", faction: "citizen" },
  { name: "탐정조수", faction: "citizen" }, { name: "남자연인", faction: "citizen" }, { name: "여자연인", faction: "citizen" },
  { name: "공무원", faction: "citizen" },
];

export const formations: Record<number, string[]> = {
  8: ["마피아대부", "히트맨", "마피아일원", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수"],
  9: ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수"],
  10: ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "공무원"],
  11: ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "스파이", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "공무원"],
  12: ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "스파이", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "남자연인", "여자연인"],
  13: ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "스파이", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "남자연인", "여자연인", "공무원"],
};

export const skillCost = (skill: Skill, totalPlayers: number) => skill.id === "upper-attack" && totalPlayers >= 11 ? 30 : skill.cost;

export const botNames = ["윤서", "민준", "하린", "도윤", "서아", "지호", "예린", "현우", "수빈", "건우", "채원", "시우"];
export const portraitRoles = ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "스파이", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "남자연인", "여자연인", "공무원"];
export const MANA_MAX = 200;
export const MANA_TICK = 20;
export const MANA_INTERVAL_SECONDS = 90;
export const ATTACKER_ROLES = new Set(["마피아대부", "히트맨", "마피아일원", "스파이", "자경단원", "순찰경찰"]);
