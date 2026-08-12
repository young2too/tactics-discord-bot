export const formations = {
  8: ["마피아대부", "히트맨", "마피아일원", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수"],
  9: ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수"],
  10: ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "공무원"],
  11: ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "스파이", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "공무원"],
  12: ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "스파이", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "남자연인", "여자연인"],
  13: ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "스파이", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "남자연인", "여자연인", "공무원"],
};

export const botNames = ["AI 준서", "AI 민지", "AI 하림", "AI 태윤", "AI 서아", "AI 지훈", "AI 예린", "AI 현우", "AI 하빈", "AI 건우", "AI 채원", "AI 시우"];
export const factionOf = (role) => ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "스파이"].includes(role) ? "mafia" : "citizen";
export const roleSkills = {
  마피아대부: ["leadership", "lower-attack", "successor", "snipe-command"], 히트맨: ["enemy-scan", "snipe"], 마피아일원: ["ally-check", "upper-attack"],
  마피아후계자: ["advanced-scan", "boss-check"], 스파이: ["deception", "betrayal"], 경찰반장: ["ally-check", "leadership", "arrest"],
  자경단원: ["upper-attack"], 사립탐정: ["enemy-scan"], 순찰경찰: ["ally-check", "lower-attack"],
  탐정조수: ["detective-check", "enemy-check"], 남자연인: ["ally-check", "revenge"], 여자연인: ["enemy-check", "revenge"], 공무원: ["support", "proclamation"],
};
export const skills = {
  announce: { cost: 0, cooldown: 40, role: true }, "ally-check": { cost: 5, cooldown: 10, target: true },
  "enemy-check": { cost: 10, cooldown: 10, target: true }, "ally-scan": { cost: 15, cooldown: 10, target: true, role: true }, "advanced-scan": { cost: 15, cooldown: 10, target: true, role: true },
  "enemy-scan": { cost: 20, cooldown: 10, target: true, role: true }, "upper-attack": { cost: 40, cooldown: 10, target: true, role: true },
  "lower-attack": { cost: 30, cooldown: 10, target: true, role: true }, "boss-check": { cost: 10, cooldown: 10, target: true },
  "detective-check": { cost: 10, cooldown: 10, target: true }, support: { cost: 20, cooldown: 10, target: true },
  leadership: { cost: 40, cooldown: 10, role: true, once: true }, successor: { cost: 0, cooldown: 10, target: true, once: true },
  arrest: { cost: 0, cooldown: 10, target: true, once: true }, "snipe-command": { cost: 0, cooldown: 10, target: true, once: true }, snipe: { cost: 0, cooldown: 10, target: true, once: true },
  revenge: { cost: 150, cooldown: 10, target: true, once: true }, deception: { cost: 0, cooldown: 0 }, betrayal: { cost: 10, cooldown: 10, target: true },
  proclamation: { cost: 0, cooldown: 5, text: true }, "ally-add": { cost: 0, cooldown: 5, target: true },
  "ally-remove": { cost: 0, cooldown: 5, target: true },
};
export const attackerRoles = new Set(["마피아대부", "히트맨", "마피아일원", "스파이", "자경단원", "순찰경찰"]);
export const MANA_MAX = 200;
export const MANA_TICK = 20;
export const MANA_INTERVAL = 90_000;

export function skillCost(skillId, totalPlayers) {
  if (skillId === "upper-attack" && totalPlayers >= 11) return 30;
  return skills[skillId]?.cost ?? 0;
}

export function shuffle(values, random = Math.random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}
