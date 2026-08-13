import { factionOf, formations, roleSkills } from "../game-config.js";

const INVESTIGATORS = new Set(["사립탐정", "탐정조수"]);
const ATTACKERS = new Set(["마피아대부", "마피아일원", "자경단원", "순찰경찰"]);

const MODES = {
  사립탐정: ["public", "hidden"], 자경단원: ["public", "hidden"], 공무원: ["public", "open-support"],
  히트맨: ["public-bait", "hidden"], 스파이: ["citizen-infiltration", "mafia-cover"],
};

function investigationResolved(room, actor) {
  const deadRoles = new Set(room.players.filter((player) => !player.alive).map((player) => player.role));
  const targets = formations[room.totalPlayers].filter((role) => factionOf(role) === "mafia" && (actor.role !== "사립탐정" || role !== "마피아대부"));
  const knownRoles = new Set(Object.values(actor.aiMemory?.knowledge ?? {}).filter((known) => (known.confidence ?? 0) >= .8).map((known) => known.role));
  return targets.every((role) => deadRoles.has(role) || knownRoles.has(role));
}

export function ensureDoctrine(room, actor) {
  actor.aiMemory ??= {};
  if (actor.aiMemory.doctrine) return actor.aiMemory.doctrine;
  const modes = MODES[actor.role] ?? ["standard"];
  const index = Math.floor(room.random() * modes.length);
  actor.aiMemory.doctrine = {
    mode: modes[index], initialMode: modes[index],
    aggression: .35 + room.random() * .55,
    exposure: .2 + room.random() * .6,
    investigation: .45 + room.random() * .5,
    switchedAt: null,
  };
  return actor.aiMemory.doctrine;
}

export function updateDoctrineMode(room, actor) {
  const doctrine = ensureDoctrine(room, actor); const memory = actor.aiMemory;
  const allies = room.players.filter((player) => player.alive && actor.alliances.has(player.id));
  if (actor.role === "사립탐정" && doctrine.mode === "hidden") {
    const assistantAlive = formations[room.totalPlayers].includes("탐정조수") && !room.players.some((player) => !player.alive && player.role === "탐정조수");
    const exhausted = investigationResolved(room, actor);
    if (!assistantAlive || exhausted) { doctrine.mode = "public"; doctrine.switchedAt = room.now(); }
  }
  if (["남자연인", "여자연인"].includes(actor.role) && allies.some((ally) => !["남자연인", "여자연인"].includes(memory.knowledge?.[ally.id]?.role))) doctrine.mode = "networked";
  return doctrine;
}

export function desiredAnnouncement(room, actor) {
  const doctrine = updateDoctrineMode(room, actor);
  const roles = formations[room.totalPlayers];
  if (actor.role === "마피아대부") {
    const deadRoles = new Set(room.players.filter((player) => !player.alive).map((player) => player.role));
    const enemyCheckAlive = roles.some((role) => !deadRoles.has(role) && (roleSkills[role] ?? []).includes("enemy-check"));
    const knownMafia = room.players.some((player) => player.alive && player.id !== actor.id && actor.alliances.has(player.id) && actor.aiMemory?.knowledge?.[player.id]?.faction === "mafia" && (actor.aiMemory.knowledge[player.id].confidence ?? 0) >= .7);
    const elapsed = room.now() - (room.startedAt ?? room.now());
    const disconnectedDesperation = !knownMafia && elapsed >= 90_000 && (actor.aiMemory?.announcementCount ?? 0) >= 2;
    if (!enemyCheckAlive || disconnectedDesperation) return actor.role;
    const covers = roles.filter((role) => factionOf(role) === "citizen" && role !== actor.announced);
    return covers[Math.floor(room.random() * covers.length)] ?? actor.role;
  }
  if (actor.role === "마피아후계자") {
    const knownMafia = room.players.some((player) => player.alive && player.id !== actor.id && actor.alliances.has(player.id) && actor.aiMemory?.knowledge?.[player.id]?.faction === "mafia" && (actor.aiMemory.knowledge[player.id].confidence ?? 0) >= .7);
    const elapsed = room.now() - (room.startedAt ?? room.now());
    const hasUsedBossCheck = Object.hasOwn(actor.cooldowns, "boss-check");
    const desperate = !knownMafia && hasUsedBossCheck && elapsed >= 120_000 && (actor.aiMemory?.announcementCount ?? 0) >= 3;
    if (desperate) return actor.role;
    const covers = roles.filter((role) => factionOf(role) === "citizen" && role !== actor.announced);
    return covers[Math.floor(room.random() * covers.length)] ?? actor.role;
  }
  if (actor.role === "스파이") {
    const faction = doctrine.mode === "citizen-infiltration" ? "citizen" : "mafia";
    const options = roles.filter((role) => factionOf(role) === faction && role !== actor.announced);
    return options[Math.floor(room.random() * options.length)] ?? actor.role;
  }
  if (["사립탐정", "자경단원", "공무원"].includes(actor.role)) return doctrine.mode === "public" ? actor.role : roles.find((role) => role !== actor.role && role !== actor.announced) ?? actor.role;
  if (actor.role === "히트맨") return doctrine.mode === "public-bait" ? actor.role : roles.find((role) => factionOf(role) === "citizen" && role !== actor.announced) ?? actor.role;
  if (actor.role === "순찰경찰") return roles.find((role) => role !== "순찰경찰" && role !== actor.announced) ?? actor.role;
  if (["남자연인", "여자연인"].includes(actor.role)) {
    const partnerRole = actor.role === "남자연인" ? "여자연인" : "남자연인";
    const partnerId = Number(Object.entries(actor.aiMemory?.knowledge ?? {}).find(([, known]) => known.role === partnerRole)?.[0]);
    return !partnerId || actor.id < partnerId ? actor.role : roles.find((role) => role !== actor.role && role !== actor.announced) ?? actor.role;
  }
  return actor.role;
}

export function scanRolePriorities(actor) {
  if (actor.role === "히트맨") return ["순찰경찰", "탐정조수", "자경단원", "사립탐정", "공무원", "남자연인", "여자연인"];
  if (actor.role === "마피아후계자") {
    const hasBoss = Object.values(actor.aiMemory?.knowledge ?? {}).some((known) => known.role === "마피아대부" && (known.confidence ?? 0) >= .8);
    return hasBoss
      ? ["순찰경찰", "탐정조수", "자경단원", "사립탐정", "공무원", "남자연인", "여자연인", "히트맨", "마피아일원", "스파이"]
      : ["마피아대부", "히트맨", "마피아일원", "스파이", "순찰경찰", "탐정조수", "자경단원", "사립탐정"];
  }
  return factionOf(actor.role) === "citizen"
    ? ["히트맨", "마피아일원", "마피아후계자", "스파이"]
    : ["순찰경찰", "탐정조수", "자경단원", "사립탐정", "공무원", "남자연인", "여자연인"];
}

export function threatPriority(actor, role) {
  const citizen = { 히트맨: 100, 마피아대부: 95, 마피아일원: 85, 마피아후계자: 70, 스파이: 55 };
  const mafia = { 경찰반장: 100, 순찰경찰: 98, 탐정조수: 92, 사립탐정: 90, 자경단원: 88, 남자연인: 60, 여자연인: 60, 공무원: 45 };
  return (factionOf(actor.role) === "citizen" ? citizen : mafia)[role] ?? 0;
}

export function shouldPublishInvestigation(room, actor) {
  if (!INVESTIGATORS.has(actor.role) || factionOf(actor.role) !== "citizen") return false;
  const doctrine = updateDoctrineMode(room, actor);
  const hasCitizenAlliance = room.players.some((player) => player.alive && actor.alliances.has(player.id) && factionOf(actor.aiMemory?.knowledge?.[player.id]?.role ?? player.announced) === "citizen");
  if (hasCitizenAlliance) return false;
  if (actor.role === "탐정조수") return true;
  if (actor.role === "사립탐정" && doctrine.mode === "public") return true;
  return investigationResolved(room, actor);
}

export function isAttacker(role) { return ATTACKERS.has(role); }
