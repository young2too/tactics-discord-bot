import { factionOf, formations, roleSkills, skills } from "./game-config.js";

const ATTACKS = new Set(["upper-attack", "lower-attack"]);
const SCANS = new Set(["ally-scan", "advanced-scan", "enemy-scan"]);
const CHECKS = new Set(["ally-check", "enemy-check"]);

function memoryOf(actor) {
  actor.aiMemory ??= {};
  actor.aiMemory.knowledge ??= {}; actor.aiMemory.sharedWith ??= {}; actor.aiMemory.lastPublicAt ??= 0; actor.aiMemory.recentLines ??= []; actor.aiMemory.inbox ??= []; actor.aiMemory.claims ??= {}; actor.aiMemory.trust ??= {}; actor.aiMemory.reports ??= {};
  return actor.aiMemory;
}

const SKILL_CLAIMS = [
  { words: ["아확", "아군 확인"], id: "ally-check", label: "아군 확인" },
  { words: ["적확", "적군 확인"], id: "enemy-check", label: "적군 확인" },
  { words: ["보스 확인", "보확"], id: "boss-check", label: "보스 확인" },
  { words: ["탐정 확인", "탐확"], id: "detective-check", label: "탐정 확인" },
  { words: ["상급 스캔", "상스"], id: "advanced-scan", label: "상급 스캔" },
  { words: ["스캔"], id: "enemy-scan", label: "스캔" },
];

function claimedRole(room, text) {
  return formations[room.totalPlayers].find((role) => text.includes(role)) ?? null;
}

function selfClaimedRole(room, text) {
  return formations[room.totalPlayers].find((role) => new RegExp(`(?:나는|난|저는|제가|나)\\s*${role}`).test(text)) ?? null;
}

function claimedSkill(text) {
  return SKILL_CLAIMS.find((entry) => entry.words.some((word) => text.includes(word))) ?? null;
}

function respondToMessage(room, actor) {
  const memory = memoryOf(actor); const commandIndex = memory.inbox.findIndex((message) => /(\d+)번/.test(message.text) && /저격|쏴|사살|스캔|살펴|확인해/.test(message.text)); const incoming = commandIndex >= 0 ? memory.inbox.splice(commandIndex, 1)[0] : memory.inbox.shift(); if (!incoming) return false;
  const sender = room.player(incoming.from); if (!sender.alive) return true;
  const selfRoleClaim = selfClaimedRole(room, incoming.text); const roleClaim = selfRoleClaim ?? claimedRole(room, incoming.text); const skillClaim = claimedSkill(incoming.text);
  const reportMatch = incoming.text.match(/(\d+)번/); const reportedId = Number(reportMatch?.[1] ?? 0); const reportedTarget = room.players.find((player) => player.id === reportedId); const reportedRole = reportMatch ? claimedRole(room, incoming.text.slice(reportMatch.index)) : null;
  const reportAt = incoming.at ?? room.now();
  const observedInspection = Boolean(reportedTarget && room.publicInspections?.some((entry) => entry.targetId === reportedTarget.id && reportAt >= entry.at && reportAt - entry.at <= 8_000));
  const observedSelfInspection = Boolean(room.publicInspections?.some((entry) => entry.targetId === actor.id && reportAt >= entry.at && reportAt - entry.at <= 20_000));
  const commanderProof = actor.role === "히트맨" && actor.snipeAuthorized && actor.snipeCommanderId === sender.id;
  if (commanderProof) { memory.trust[sender.id] = 1; memory.claims[sender.id] = { role: "마피아대부", trust: 1, source: "저격명령" }; remember(actor, sender, { role: "마피아대부", confidence: 1, source: "저격명령" }); }
  if (selfRoleClaim) memory.claims[sender.id] = { ...(memory.claims[sender.id] ?? {}), role: selfRoleClaim, trust: memory.trust[sender.id] ?? .15 };
  if (reportedTarget && reportedRole && reportedTarget.id !== sender.id && /진명|확인|맞아|맞음|찾았/.test(incoming.text)) memory.reports[reportedTarget.id] = { role: reportedRole, reporterId: sender.id, source: skillClaim?.label ?? "제보", evidence: observedInspection ? .55 : .1 };
  const verified = memory.knowledge[sender.id]; let response;
  const trustedBoss = actor.role === "히트맨" && (commanderProof || (verified?.role === "마피아대부" && (verified.confidence ?? 0) >= .8));
  const wantsSnipe = reportedTarget && /저격|쏴|사살/.test(incoming.text);
  const wantsScan = reportedTarget && reportedRole && /스캔|살펴|확인해/.test(incoming.text);
  const asksIdentity = /너\s*누구|누구야|정체|무슨\s*직업|직업\s*뭐/.test(incoming.text);
  if (trustedBoss && wantsSnipe && actor.snipeAuthorized && reportedTarget.alive && reportedTarget.id !== actor.id) {
    room.act(actor.id, { skillId: "snipe", targetId: reportedTarget.id });
    if (!room.result) room.chat(actor.id, { text: `-${sender.id} 명령 확인. ${reportedTarget.id}번 저격을 완료했어.` });
    return true;
  }
  if (trustedBoss && wantsScan && ready(room, actor, "enemy-scan") && reportedTarget.alive && reportedTarget.id !== actor.id && !["마피아대부", "경찰반장"].includes(reportedRole)) {
    room.act(actor.id, { skillId: "enemy-scan", targetId: reportedTarget.id, role: reportedRole });
    const hit = actor.verdict?.success; if (hit) remember(actor, reportedTarget, { role: reportedRole, source: "대부 지시 스캔" }); else remember(actor, reportedTarget, { source: "대부 지시 스캔", excludedRole: reportedRole });
    if (!room.result) room.chat(actor.id, { text: `-${sender.id} ${reportedTarget.id}번 ${reportedRole} 스캔 ${hit ? "성공" : "실패"}.` });
    return true;
  }
  const privateRoleProof = selfRoleClaim && skillClaim && ((actor.role === "사립탐정" && selfRoleClaim === "탐정조수" && skillClaim.id === "detective-check") || (actor.role === "마피아대부" && selfRoleClaim === "마피아후계자" && skillClaim.id === "boss-check"));
  const reciprocalClaimRole = selfRoleClaim ?? sender.announced;
  const reciprocalAllyProof = incoming.channel !== "public" && observedSelfInspection && /아확|아군\s*확인|확인.*왔|찾아왔/.test(incoming.text) && (roleSkills[reciprocalClaimRole] ?? []).includes("ally-check") && factionOf(reciprocalClaimRole) === factionOf(actor.announced);
  const privateAllyTrust = Math.max(memory.trust[sender.id] ?? memory.claims[sender.id]?.trust ?? 0, verified?.faction === factionOf(actor.role) ? verified.confidence ?? 0 : 0);
  if (asksIdentity && incoming.channel !== "public" && privateAllyTrust >= .7) {
    response = `나는 ${actor.role}이야. 내가 직접 확인한 아군이니까 정체를 공유할게.`;
  } else if (reciprocalAllyProof) {
    memory.trust[sender.id] = .75; memory.claims[sender.id] = { role: reciprocalClaimRole, trust: .75, source: "직후 아군 확인 접촉" }; remember(actor, sender, { role: reciprocalClaimRole, confidence: .75, source: "직후 아군 확인 접촉" });
    response = `조금 전 나에게 확인 이펙트가 들어왔고 공표한 ${reciprocalClaimRole}도 아군 확인을 쓸 수 있어. 네가 찾아온 정황을 믿을게.`;
  } else if (privateRoleProof) {
    memory.trust[sender.id] = .85; remember(actor, sender, { role: selfRoleClaim, confidence: .85, source: skillClaim.label });
    response = `${skillClaim.label}으로 나를 찾아온 정황은 강한 증거야. ${selfRoleClaim}으로 우선 신뢰할게.`;
  } else if (verified?.faction === factionOf(actor.role) && (verified.confidence ?? 0) >= .8) {
    response = `응, 내가 직접 아군 확인한 ${sender.id}번의 제보니까 신뢰하고 움직일게.`;
  } else if (reportedTarget && reportedRole && observedInspection) {
    response = `방금 ${reportedTarget.id}번을 살핀 이펙트 직후 나온 제보라 맥락은 맞아. ${reportedRole} 후보로 우선 보겠어.`;
  } else if (selfRoleClaim && skillClaim && !(roleSkills[selfRoleClaim] ?? []).includes(skillClaim.id)) {
    response = `${selfRoleClaim}(은)는 ${skillClaim.label}을 쓸 수 없는데? 그 말은 못 믿겠어.`;
    memory.trust[sender.id] = -.5; memory.claims[sender.id] = { role: selfRoleClaim, trust: -.5, contradiction: `${skillClaim.label} 사용 불가` };
  } else if (verified?.role) {
    response = roleClaim === verified.role
      ? `응, 내가 직접 확인한 정보와 일치해. ${sender.id}번 ${roleClaim}으로 믿고 움직일게.`
      : `내가 직접 확인한 결과와 다른데? ${sender.id}번은 ${roleClaim} 주장을 믿을 수 없어.`;
  } else if (actor.role === "히트맨" && roleClaim === "마피아대부") {
    response = "진짜 대부면 나한테 저격명령으로 증명해줘. 말만으로는 못 믿어.";
    memory.claims[sender.id] = { role: roleClaim, trust: .2, requestedProof: "snipe-command" };
  } else if (roleClaim && skillClaim) {
    response = `${roleClaim}이 ${skillClaim.label}을 쓸 수 있는 건 맞지만 결과는 네 개인 정보잖아. 일단 주장으로만 기록할게.`;
    memory.claims[sender.id] = { role: roleClaim, trust: actor.alliances.has(sender.id) ? .4 : .2, source: skillClaim.label };
  } else if (roleClaim) {
    response = `${roleClaim} 주장 확인했어. 아직 증거는 없으니 바로 확정하진 않을게.`;
    memory.claims[sender.id] = { role: roleClaim, trust: actor.alliances.has(sender.id) ? .35 : .15 };
  } else if (incoming.channel === "public" && /확인|스캔|조사/.test(incoming.text)) {
    response = "몇 번을 어떤 직업으로 확인했는지 말해줘. 근거가 있어야 판단할 수 있어.";
  } else if (actor.alliances.has(sender.id)) response = "동맹 메시지 확인했어. 직접 확인된 정보와 맞춰보면서 움직일게.";
  else response = "말은 들었어. 아직 확인된 정보는 아니라서 참고만 할게.";
  if (incoming.respond !== false) room.chat(actor.id, incoming.channel === "public" ? { text: response, channel: "public" } : { text: `-${sender.id} ${response}` });
  return true;
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
  return room.players.filter((target) => { const memory = memoryOf(actor); const direct = memory.knowledge[target.id]; const trustedClaim = memory.claims[target.id]; return target.alive && target.id !== actor.id && ((direct?.faction === factionOf(actor.role) && (direct?.confidence ?? 0) >= .8) || (trustedClaim?.role && factionOf(trustedClaim.role) === factionOf(actor.role) && (memory.trust[target.id] ?? trustedClaim.trust ?? 0) >= .7)); });
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

function tryReportedAttack(room, actor) {
  const skillId = (roleSkills[actor.role] ?? []).find((id) => ATTACKS.has(id) && ready(room, actor, id)); if (!skillId) return false;
  const threshold = skillId === "upper-attack" ? .3 : actor.lowAttackFails === 0 ? .45 : .7; const memory = memoryOf(actor);
  const entry = Object.entries(memory.reports).find(([targetId, report]) => { const target = room.players.find((player) => player.id === Number(targetId)); const verifiedReporter = memory.knowledge[report.reporterId]; const directTrust = verifiedReporter?.faction === factionOf(actor.role) ? verifiedReporter.confidence ?? 0 : 0; const trust = Math.max(memory.trust[report.reporterId] ?? memory.claims[report.reporterId]?.trust ?? .15, directTrust); return target?.alive && factionOf(report.role) !== factionOf(actor.role) && Math.max(trust, report.evidence ?? .1) >= threshold; });
  if (!entry) return false; const [targetId, report] = entry; const target = room.player(Number(targetId));
  room.act(actor.id, { skillId, targetId: target.id, role: report.role }); return true;
}

function tryRoleCheck(room, actor) {
  const available = roleSkills[actor.role] ?? [];
  const skillId = available.find((id) => ["boss-check", "detective-check"].includes(id) && ready(room, actor, id));
  if (!skillId) return false;
  const expected = skillId === "boss-check" ? "마피아대부" : "사립탐정";
  const candidates = room.players.filter((target) => target.alive && target.id !== actor.id && !memoryOf(actor).knowledge[target.id]?.role && !memoryOf(actor).knowledge[target.id]?.excluded?.includes(expected));
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
  const candidates = room.players.filter((target) => target.alive && target.id !== actor.id && !memoryOf(actor).knowledge[target.id]?.role && target.announced !== "미공표" && (skillId === "ally-check") === (factionOf(target.announced) === mine));
  const target = pick(room, candidates); if (!target) return false;
  room.act(actor.id, { skillId, targetId: target.id });
  if (actor.verdict?.success) { remember(actor, target, { faction: factionOf(target.announced), confidence: .8, source: "공표 확인" }); memoryOf(actor).trust[target.id] = Math.max(memoryOf(actor).trust[target.id] ?? 0, .8); }
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
  const waiting = bots.filter((player) => memoryOf(player).inbox.length); const actor = pick(room, waiting.length ? waiting : bots); memoryOf(actor);
  try {
    if (respondToMessage(room, actor)) return;
    if (actor.announced === "미공표") {
      const roles = formations[room.totalPlayers]; const claim = room.random() < .68 ? actor.role : pick(room, roles);
      room.act(actor.id, { skillId: "announce", role: claim }); return;
    }
    if (tryShare(room, actor) || tryAlliance(room, actor) || tryKnownAttack(room, actor) || tryReportedAttack(room, actor)) return;
    if (tryRoleCheck(room, actor) || tryScan(room, actor) || tryClaimCheck(room, actor)) return;
    tryPublicChat(room, actor);
  } catch { /* Invalid or stale tactical choices are safely skipped. */ }
}

export function recordPublicDeath(room, target) {
  for (const observer of room.players.filter((player) => player.aiControlled)) {
    const memory = memoryOf(observer); const report = memory.reports[target.id]; if (!report) continue;
    const delta = report.role === target.role ? .55 : -.45;
    memory.trust[report.reporterId] = Math.max(-1, Math.min(1, (memory.trust[report.reporterId] ?? memory.claims[report.reporterId]?.trust ?? .15) + delta));
    if (memory.claims[report.reporterId]) memory.claims[report.reporterId].trust = memory.trust[report.reporterId];
  }
}
