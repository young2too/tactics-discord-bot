import type { Faction, Player, Skill } from "./types";

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
  announce: { id: "announce", key: "Q", name: "공표", icon: "📋", cost: 0, target: false, needsRole: true, tone: "gold", cooldown: 90 },
  "ally-check": { id: "ally-check", key: "W", name: "아군 확인", icon: "◉", cost: 5, target: true, needsRole: false, tone: "blue", cooldown: 10 },
  "enemy-check": { id: "enemy-check", key: "W", name: "적군 확인", icon: "◉", cost: 5, target: true, needsRole: false, tone: "blue", cooldown: 10 },
  "ally-scan": { id: "ally-scan", key: "E", name: "아군 스캔", icon: "⌁", cost: 15, target: true, needsRole: true, tone: "blue", cooldown: 10 },
  "enemy-scan": { id: "enemy-scan", key: "E", name: "적군 스캔", icon: "⌁", cost: 20, target: true, needsRole: true, tone: "blue", cooldown: 10 },
  "upper-attack": { id: "upper-attack", key: "R", name: "상급 공격", icon: "︻╦╤─", cost: 40, target: true, needsRole: true, tone: "red", cooldown: 10 },
  "lower-attack": { id: "lower-attack", key: "R", name: "하급 공격", icon: "⌐╦", cost: 30, target: true, needsRole: true, tone: "red", cooldown: 10 },
  "boss-check": { id: "boss-check", key: "W", name: "보스 확인", icon: "♛", cost: 10, target: true, needsRole: false, tone: "red", cooldown: 10 },
  "detective-check": { id: "detective-check", key: "W", name: "탐정 확인", icon: "⌕", cost: 10, target: true, needsRole: false, tone: "blue", cooldown: 10 },
  support: { id: "support", key: "W", name: "지원", icon: "+", cost: 20, target: true, needsRole: false, tone: "blue", cooldown: 10 },
  leadership: { id: "leadership", key: "W", name: "리더쉽", icon: "⚑", cost: 50, target: false, needsRole: true, tone: "gold", cooldown: 10 },
  successor: { id: "successor", key: "E", name: "후계자 지정", icon: "♚", cost: 0, target: true, needsRole: false, tone: "gold", cooldown: 10 },
  "snipe-command": { id: "snipe-command", key: "R", name: "저격명령", icon: "▄︻デ══━一", cost: 0, target: true, needsRole: false, tone: "gold", cooldown: 10 },
  arrest: { id: "arrest", key: "R", name: "검거", icon: "⚖", cost: 0, target: true, needsRole: false, tone: "blue", cooldown: 10 },
  snipe: { id: "snipe", key: "R", name: "저격", icon: "⌾", cost: 0, target: true, needsRole: false, tone: "red", cooldown: 10 },
  revenge: { id: "revenge", key: "R", name: "복수귀", icon: "☠", cost: 150, target: true, needsRole: false, tone: "red", cooldown: 10 },
  deception: { id: "deception", key: "W", name: "기만", icon: "◈", cost: 0, target: false, needsRole: false, tone: "gold", cooldown: 0 },
  proclamation: { id: "proclamation", key: "E", name: "공문", icon: "✉", cost: 20, target: false, needsRole: false, needsText: true, tone: "blue", cooldown: 10 },
  "ally-add": { id: "ally-add", key: "A", name: "동맹 추가", icon: "🤝", cost: 0, target: true, needsRole: false, tone: "gold", cooldown: 5 },
  "ally-remove": { id: "ally-remove", key: "S", name: "동맹 파기", icon: "🤝", cost: 0, target: true, needsRole: false, tone: "red", cooldown: 5 },
};

export const roleSkillIds: Record<string, string[]> = {
  마피아대부: ["leadership", "lower-attack", "successor", "snipe-command"], 히트맨: ["enemy-scan", "snipe"], 마피아일원: ["upper-attack"],
  마피아후계자: ["ally-scan", "boss-check"], 스파이: ["deception"], 경찰반장: ["ally-check", "leadership", "arrest"],
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
  9: ["마피아대부", "히트맨", "마피아일원", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "공무원"],
  10: ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "공무원"],
  11: ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "남자연인", "여자연인"],
  12: ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "스파이", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "남자연인", "여자연인"],
  13: ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "스파이", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "남자연인", "여자연인", "공무원"],
};

export const botNames = ["윤서", "민준", "하린", "도윤", "서아", "지호", "예린", "현우", "수빈", "건우", "채원", "시우"];
export const portraitRoles = ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "스파이", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "남자연인", "여자연인", "공무원"];
export const MANA_MAX = 200;
export const MANA_TICK = 20;
export const MANA_INTERVAL_SECONDS = 3 * 60;
export const ATTACKER_ROLES = new Set(["마피아대부", "히트맨", "마피아일원", "자경단원", "순찰경찰"]);
