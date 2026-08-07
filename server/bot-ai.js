import { factionOf, formations, roleSkills, skills } from "./game-config.js";

const ATTACKS = new Set(["upper-attack", "lower-attack"]);
const SCANS = new Set(["ally-scan", "advanced-scan", "enemy-scan"]);
const CHECKS = new Set(["ally-check", "enemy-check"]);

function memoryOf(actor) {
  actor.aiMemory ??= { knowledge: {}, sharedWith: {}, lastPublicAt: 0, recentLines: [] };
  return actor.aiMemory;
}

function ready(room, actor, skillId) {
  const skill = skills[skillId];
  return Boolean(skill && actor.mana >= skill.cost && (actor.cooldowns[skillId] ?? 0) <= room.now() && !(skill.once && actor.usedOnce[skillId]));
}

function pick(room, values) {
  return values.length ? values[Math.floor(room.random() * values.length)] : null;
}

function remember(actor, target, { role = null, faction = null, confidence = 1, source, excludedRole = null }) {
  const memory = memoryOf(actor);
  const known = memory.knowledge[target.id] ?? { excluded: [] };
  if (role) { known.role = role; known.faction = factionOf(role); known.confidence = confidence; }
  else if (faction) { known.faction = faction; known.confidence = Math.max(known.confidence ?? 0, confidence); }
  if (excludedRole && !known.excluded.includes(excludedRole)) known.excluded.push(excludedRole);
  known.source = source; memory.knowledge[target.id] = known;
}

function knownAllies(room, actor) {
  return room.players.filter((target) => target.alive && target.id !== actor.id && memoryOf(actor).knowledge[target.id]?.faction === factionOf(actor.role) && (memoryOf(actor).knowledge[target.id]?.confidence ?? 0) >= .8);
}

function knownEnemies(room, actor) {
  return room.players.filter((target) => target.alive && target.id !== actor.id && memoryOf(actor).knowledge[target.id]?.faction && memoryOf(actor).knowledge[target.id].faction !== factionOf(actor.role) && (memoryOf(actor).knowledge[target.id]?.confidence ?? 0) >= .8);
}

function whisperIntroduction(room, actor, target) {
  const known = memoryOf(actor).knowledge[target.id];
  const source = known?.source ?? "조사";
  const line = `${source}(으)로 당신이 ${known?.role ?? "아군"}인 걸 확인했습니다. 저는 ${actor.role}입니다. 같이 움직이죠.`;
  room.chat(actor.id, { text: `-${target.id} ${line}` });
  memoryOf(actor).sharedWith[target.id] = true;
}

function tryAlliance(room, actor) {
  if (!ready(room, actor, "ally-add")) return false;
  const target = knownAllies(room, actor).find((candidate) => !actor.alliances.has(candidate.id));
  if (!target) return false;
  room.act(actor.id, { skillId: "ally-add", targetId: target.id });
  whisperIntroduction(room, actor, target); return true;
}

function tryShare(room, actor) {
  const target = knownAllies(room, actor).find((candidate) => actor.alliances.has(candidate.id) && !memoryOf(actor).sharedWith[candidate.id]);
  if (!target) return false;
  whisperIntroduction(room, actor, target); return true;
}

function tryKnownAttack(room, actor) {
  const skillId = (roleSkills[actor.role] ?? []).find((id) => ATTACKS.has(id) && ready(room, actor, id));
  if (!skillId) return false;
  const target = pick(room, knownEnemies(room, actor).filter((candidate) => memoryOf(actor).knowledge[candidate.id]?.role));
  if (!target) return false;
  room.act(actor.id, { skillId, targetId: target.id, role: memoryOf(actor).knowledge[target.id].role }); return true;
}

function tryRoleCheck(room, actor) {
  const available = roleSkills[actor.role] ?? [];
  const skillId = available.find((id) => ["boss-check", "detective-check"].includes(id) && ready(room, actor, id));
  if (!skillId) return false;
  const expected = skillId === "boss-check" ? "마피아대부" : "사립탐정";
  const candidates = room.players.filter((target) => target.alive && target.id !== actor.id && !memoryOf(actor).knowledge[target.id]?.excluded?.includes(expected) && memoryOf(actor).knowledge[target.id]?.role !== expected);
  const target = pick(room, candidates); if (!target) return false;
  room.act(actor.id, { skillId, targetId: target.id });
  if (target.role === expected) remember(actor, target, { role: expected, source: skillId === "boss-check" ? "보스 확인" : "탐정 확인" });
  else remember(actor, target, { source: "직업 확인", excludedRole: expected });
  return true;
}

function allowedScanRoles(room, actor, skillId) {
  let roles = formations[room.totalPlayers];
  if (skillId === "ally-scan") roles = roles.filter((role) => factionOf(role) === factionOf(actor.role));
  if (skillId === "advanced-scan") roles = roles.filter((role) => role !== "경찰반장");
  if (skillId === "enemy-scan") roles = roles.filter((role) => factionOf(role) !== factionOf(actor.role) && role !== "마피아대부" && role !== "경찰반장");
  return roles;
}

function tryScan(room, actor) {
  const skillId = (roleSkills[actor.role] ?? []).find((id) => SCANS.has(id) && ready(room, actor, id));
  if (!skillId) return false;
  const candidates = room.players.filter((target) => target.alive && target.id !== actor.id && !memoryOf(actor).knowledge[target.id]?.role);
  const target = pick(room, candidates); if (!target) return false;
  const roles = allowedScanRoles(room, actor, skillId);
  const publicGuess = roles.includes(target.announced) ? target.announced : null;
  const excluded = memoryOf(actor).knowledge[target.id]?.excluded ?? [];
  const guessedRole = publicGuess ?? pick(room, roles.filter((role) => !excluded.includes(role)));
  if (!guessedRole) return false;
  room.act(actor.id, { skillId, targetId: target.id, role: guessedRole });
  if (target.role === guessedRole) remember(actor, target, { role: guessedRole, source: skillId === "advanced-scan" ? "상급 스캔" : "스캔" });
  else remember(actor, target, { source: "스캔", excludedRole: guessedRole });
  return true;
}

function tryClaimCheck(room, actor) {
  const skillId = (roleSkills[actor.role] ?? []).find((id) => CHECKS.has(id) && ready(room, actor, id));
  if (!skillId) return false;
  const mine = factionOf(actor.role);
  const candidates = room.players.filter((target) => target.alive && target.id !== actor.id && target.announced !== "미공표" && (skillId === "ally-check") === (factionOf(target.announced) === mine));
  const target = pick(room, candidates); if (!target) return false;
  room.act(actor.id, { skillId, targetId: target.id });
  if (actor.verdict?.success) remember(actor, target, { faction: factionOf(target.announced), confidence: .8, source: "공표 확인" });
  return true;
}

function publicLine(room, actor) {
  const unannounced = room.players.filter((player) => player.alive && player.announced === "미공표");
  if (unannounced.length) return `${unannounced.map((player) => `${player.id}번`).slice(0, 3).join(", ")} 아직 미공표네. 먼저 공표해줘.`;
  const bossClaims = room.players.filter((player) => player.alive && player.id !== actor.id && player.announced === "마피아대부");
  if (bossClaims.length) { const target = pick(room, bossClaims); return `${target.id}번이 대부 이름 걸었는데 확인 가능한 사람 있어? 리더십 쓰려는 거 아냐?`; }
  const suspects = factionOf(actor.role) === "mafia"
    ? room.players.filter((player) => player.alive && player.id !== actor.id && factionOf(player.announced) === "citizen")
    : knownEnemies(room, actor);
  if (suspects.length) { const target = pick(room, suspects); return pick(room, [`${target.id}번 공표 한번 확인해봐야 할 것 같은데.`, `지금 한 명만 몰아가지 말고 ${target.id}번도 같이 보자.`, `${target.id}번 조사 가능한 사람 있어? 공표가 좀 걸려.`]); }
  const claimed = pick(room, room.players.filter((player) => player.alive && player.id !== actor.id));
  return claimed ? pick(room, [`${claimed.id}번 공표 근거 있는 사람?`, `탐정 계열 있으면 ${claimed.id}번 한번 봐줘.`, `지금 정보 너무 없는데 확인 결과 있는 사람 공유해봐.`]) : null;
}

function tryPublicChat(room, actor) {
  const memory = memoryOf(actor); const now = room.now();
  if (now - memory.lastPublicAt < 12_000 || room.random() > .38) return false;
  const line = publicLine(room, actor); if (!line || memory.recentLines.includes(line)) return false;
  room.chat(actor.id, { text: line, channel: "public" });
  memory.lastPublicAt = now; memory.recentLines = [...memory.recentLines.slice(-3), line]; return true;
}

export function runStrategicBot(room) {
  const bots = room.players.filter((player) => player.alive && player.aiControlled); if (!bots.length) return;
  const actor = pick(room, bots); memoryOf(actor);
  try {
    if (actor.announced === "미공표") {
      const roles = formations[room.totalPlayers]; const claim = room.random() < .68 ? actor.role : pick(room, roles);
      room.act(actor.id, { skillId: "announce", role: claim }); return;
    }
    if (tryShare(room, actor) || tryAlliance(room, actor) || tryKnownAttack(room, actor)) return;
    if (tryRoleCheck(room, actor) || tryScan(room, actor) || tryClaimCheck(room, actor)) return;
    tryPublicChat(room, actor);
  } catch { /* Invalid or stale tactical choices are safely skipped. */ }
}
