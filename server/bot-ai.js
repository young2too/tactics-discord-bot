import { factionOf, formations, roleSkills, skills } from "./game-config.js";

const ATTACKS = new Set(["upper-attack", "lower-attack"]);
const SCANS = new Set(["ally-scan", "advanced-scan", "enemy-scan"]);
const CHECKS = new Set(["ally-check", "enemy-check"]);
const ORDER_LABELS = { "snipe-command": "저격명령", successor: "후계자 지정", leadership: "리더십", snipe: "저격", revenge: "복수", arrest: "검거", support: "마나 지원", "boss-check": "보스 확인", "detective-check": "탐정 확인", "ally-check": "아군 확인", "enemy-check": "적군 확인", "ally-scan": "아군 스캔", "advanced-scan": "상급 스캔", "enemy-scan": "적군 스캔", "upper-attack": "상급공격", "lower-attack": "하급공격", "ally-add": "동맹 추가", "ally-remove": "동맹 파기" };

function memoryOf(actor) {
  actor.aiMemory ??= {};
  actor.aiMemory.knowledge ??= {}; actor.aiMemory.sharedWith ??= {}; actor.aiMemory.bridged ??= {}; actor.aiMemory.publishedFindings ??= {}; actor.aiMemory.lastPublicAt ??= 0; actor.aiMemory.recentLines ??= []; actor.aiMemory.inbox ??= []; actor.aiMemory.claims ??= {}; actor.aiMemory.trust ??= {}; actor.aiMemory.reports ??= {};
  return actor.aiMemory;
}

const SKILL_CLAIMS = [
  { words: ["아확", "아군 확인"], id: "ally-check", label: "아군 확인" },
  { words: ["적확", "적군 확인"], id: "enemy-check", label: "적군 확인" },
  { words: ["보스 확인", "보스확인", "보확"], id: "boss-check", label: "보스 확인" },
  { words: ["탐정 확인", "탐정확인", "탐확"], id: "detective-check", label: "탐정 확인" },
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

function tryHumanAllianceOrder(room, actor, sender, text, target, role) {
  if (sender.isBot || sender.aiControlled || !actor.alliances.has(sender.id)) return false;
  if (actor.role === "히트맨" && actor.snipeAuthorized && actor.snipeCommanderId === sender.id) { memoryOf(actor).trust[sender.id] = 1; memoryOf(actor).claims[sender.id] = { role: "마피아대부", trust: 1, source: "저격명령" }; remember(actor, sender, { role: "마피아대부", confidence: 1, source: "저격명령" }); }
  const available = roleSkills[actor.role] ?? []; let skillId = null; const payload = {};
  if (/저격\s*명령/.test(text) && available.includes("snipe-command") && target) skillId = "snipe-command";
  else if (/후계자.*지정|후계자로/.test(text) && available.includes("successor") && target) skillId = "successor";
  else if (/리더십|리더쉽/.test(text) && available.includes("leadership") && role) { skillId = "leadership"; payload.role = role; }
  else if (/저격|쏴|사살/.test(text) && available.includes("snipe") && target) skillId = "snipe";
  else if (/복수/.test(text) && available.includes("revenge") && target) skillId = "revenge";
  else if (/검거/.test(text) && available.includes("arrest") && target) skillId = "arrest";
  else if (/지원|마나.*줘/.test(text) && available.includes("support") && target) skillId = "support";
  else if (/보스\s*확인|보확/.test(text) && available.includes("boss-check") && target) skillId = "boss-check";
  else if (/탐정\s*확인|탐확/.test(text) && available.includes("detective-check") && target) skillId = "detective-check";
  else if (/아확|아군\s*확인/.test(text) && available.includes("ally-check") && target) skillId = "ally-check";
  else if (/적확|적군\s*확인/.test(text) && available.includes("enemy-check") && target) skillId = "enemy-check";
  else if (/스캔|살펴|확인해/.test(text) && role && target) skillId = available.find((id) => SCANS.has(id)) ?? null;
  else if (/공격|쳐|때려|잡아/.test(text) && role && target) skillId = available.find((id) => ATTACKS.has(id)) ?? null;
  else if (/동맹.*파기|적대/.test(text) && target) skillId = "ally-remove";
  else if (/동맹.*추가|동맹.*맺/.test(text) && target) skillId = "ally-add";
  if (!skillId) return false;
  if (target) payload.targetId = target.id;
  if (role && (SCANS.has(skillId) || ATTACKS.has(skillId))) payload.role = role;
  try {
    if (SCANS.has(skillId) && role && !allowedScanRoles(room, actor, skillId).includes(role)) throw new Error(`${role}은(는) 이 스캔으로 지정할 수 없어.`);
    room.act(actor.id, { skillId, ...payload });
    if (SCANS.has(skillId) && target && role) { if (actor.verdict?.success) remember(actor, target, { role, source: "인간 동맹 지시" }); else remember(actor, target, { source: "인간 동맹 지시", excludedRole: role }); }
    if (CHECKS.has(skillId) && target && actor.verdict?.success) { remember(actor, target, { faction: factionOf(target.announced), confidence: .8, source: "인간 동맹 확인 지시" }); memoryOf(actor).trust[target.id] = Math.max(memoryOf(actor).trust[target.id] ?? 0, .8); }
    if (["boss-check", "detective-check"].includes(skillId) && target && actor.verdict?.success) remember(actor, target, { role: skillId === "boss-check" ? "마피아대부" : "사립탐정", source: "인간 동맹 확인 지시" });
    if (skillId === "leadership" && role) { const found = room.players.find((player) => player.alive && player.role === role); if (found) remember(actor, found, { role, source: "인간 동맹 리더십 지시" }); }
    if (!room.result) room.chat(actor.id, { text: `-${sender.id} 동맹 명령 확인. ${ORDER_LABELS[skillId] ?? skillId} 실행을 완료했어.` });
  } catch (error) {
    if (!room.result) room.chat(actor.id, { text: `-${sender.id} 명령을 실행할 수 없어: ${error instanceof Error ? error.message : "규칙상 사용할 수 없는 행동"}` });
  }
  return true;
}

function respondToMessage(room, actor) {
  const memory = memoryOf(actor); const commandIndex = memory.inbox.findIndex((message) => /(\d+)번/.test(message.text) && /저격|쏴|사살|스캔|살펴|확인해|공격|쳐|때려|잡아|검거|지원|아확|적확|확인|동맹/.test(message.text)); const incoming = commandIndex >= 0 ? memory.inbox.splice(commandIndex, 1)[0] : memory.inbox.shift(); if (!incoming) return false;
  const sender = room.player(incoming.from); if (!sender.alive) return true;
  const selfRoleClaim = selfClaimedRole(room, incoming.text); const roleClaim = selfRoleClaim ?? claimedRole(room, incoming.text); const skillClaim = claimedSkill(incoming.text);
  const reportMatch = incoming.text.match(/(\d+)번/); const reportedId = Number(reportMatch?.[1] ?? 0); const reportedTarget = room.players.find((player) => player.id === reportedId); const reportedRole = reportMatch ? claimedRole(room, incoming.text.slice(reportMatch.index)) : null;
  if (tryHumanAllianceOrder(room, actor, sender, incoming.text, reportedTarget, reportedRole ?? roleClaim)) return true;
  const reportAt = incoming.at ?? room.now();
  const observedInspection = Boolean(reportedTarget && room.publicInspections?.some((entry) => entry.targetId === reportedTarget.id && reportAt >= entry.at && reportAt - entry.at <= 8_000));
  const observedSelfInspection = Boolean(room.publicInspections?.some((entry) => entry.targetId === actor.id && reportAt >= entry.at && reportAt - entry.at <= 20_000));
  const leadershipDiscovery = room.leadershipDiscoveries?.find((entry) => entry.leaderId === sender.id && entry.targetId === actor.id && entry.role === actor.role && reportAt >= entry.at && reportAt - entry.at <= 30_000);
  const commanderProof = actor.role === "히트맨" && actor.snipeAuthorized && actor.snipeCommanderId === sender.id;
  if (commanderProof) { memory.trust[sender.id] = 1; memory.claims[sender.id] = { role: "마피아대부", trust: 1, source: "저격명령" }; remember(actor, sender, { role: "마피아대부", confidence: 1, source: "저격명령" }); }
  if (selfRoleClaim) memory.claims[sender.id] = { ...(memory.claims[sender.id] ?? {}), role: selfRoleClaim, trust: memory.trust[sender.id] ?? .15 };
  const publicInvestigationOrder = incoming.channel === "public" && observedInspection && selfRoleClaim && (roleSkills[selfRoleClaim] ?? []).some((id) => SCANS.has(id)) && /공격|쳐|때려|잡아/.test(incoming.text);
  if (reportedTarget && reportedRole && reportedTarget.id !== sender.id && (/진명|확인|성공|맞아|맞음|찾았/.test(incoming.text) || publicInvestigationOrder)) memory.reports[reportedTarget.id] = { role: reportedRole, reporterId: sender.id, source: publicInvestigationOrder ? "공개 합동수사" : skillClaim?.label ?? "제보", evidence: observedInspection ? .55 : .1 };
  const verified = memory.knowledge[sender.id]; let response;
  const requestsSnipeProof = actor.role === "마피아대부" && selfRoleClaim === "히트맨" && /저격\s*명령/.test(incoming.text);
  if (requestsSnipeProof && ready(room, actor, "snipe-command")) {
    room.act(actor.id, { skillId: "snipe-command", targetId: sender.id });
    if (actor.verdict?.success) { memory.trust[sender.id] = 1; memory.claims[sender.id] = { role: "히트맨", trust: 1, source: "저격명령 검증" }; remember(actor, sender, { role: "히트맨", confidence: 1, source: "저격명령 검증" }); }
    if (!room.result) room.chat(actor.id, { text: `-${sender.id} 저격명령으로 확인했어. 이제 히트맨으로 확정하고 같이 움직일게.` });
    return true;
  }
  const trustedBoss = actor.role === "히트맨" && (commanderProof || (verified?.role === "마피아대부" && (verified.confidence ?? 0) >= .8));
  const wantsSnipe = reportedTarget && /저격|쏴|사살/.test(incoming.text);
  const wantsScan = reportedTarget && reportedRole && /스캔|살펴|확인해/.test(incoming.text);
  const wantsAttack = reportedTarget && reportedRole && /공격|쳐|때려|잡아/.test(incoming.text);
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
  const directAllyTrust = Math.max(memory.trust[sender.id] ?? memory.claims[sender.id]?.trust ?? 0, verified?.faction === factionOf(actor.role) ? verified.confidence ?? 0 : 0);
  const commandedScan = (roleSkills[actor.role] ?? []).find((id) => SCANS.has(id) && ready(room, actor, id));
  if (wantsScan && commandedScan && directAllyTrust >= .7 && reportedTarget.alive && reportedTarget.id !== actor.id && allowedScanRoles(room, actor, commandedScan).includes(reportedRole)) {
    room.act(actor.id, { skillId: commandedScan, targetId: reportedTarget.id, role: reportedRole });
    const hit = actor.verdict?.success; if (hit) remember(actor, reportedTarget, { role: reportedRole, source: "아군 지시 스캔" }); else remember(actor, reportedTarget, { source: "아군 지시 스캔", excludedRole: reportedRole });
    if (!room.result) room.chat(actor.id, { text: `-${sender.id} ${reportedTarget.id}번 ${reportedRole} 스캔 ${hit ? "성공" : "실패"}.` });
    return true;
  }
  const commandedAttack = (roleSkills[actor.role] ?? []).find((id) => ATTACKS.has(id) && ready(room, actor, id));
  const attackTrustNeeded = commandedAttack === "lower-attack" && actor.lowAttackFails > 0 ? .8 : .7;
  if (wantsAttack && commandedAttack && directAllyTrust >= attackTrustNeeded && reportedTarget.alive && reportedTarget.id !== actor.id && factionOf(reportedRole) !== factionOf(actor.role)) {
    room.act(actor.id, { skillId: commandedAttack, targetId: reportedTarget.id, role: reportedRole });
    if (!room.result) room.chat(actor.id, { text: `-${sender.id} 제보를 믿고 ${reportedTarget.id}번을 ${reportedRole}(으)로 공격했어.` });
    return true;
  }
  const proofClaimRole = skillClaim?.id === "detective-check" ? "탐정조수" : skillClaim?.id === "boss-check" ? "마피아후계자" : selfRoleClaim;
  const privateRoleProof = incoming.channel !== "public" && observedSelfInspection && ((actor.role === "사립탐정" && skillClaim?.id === "detective-check") || (actor.role === "마피아대부" && skillClaim?.id === "boss-check"));
  const reciprocalClaimRole = selfRoleClaim && (roleSkills[selfRoleClaim] ?? []).includes("ally-check") ? selfRoleClaim : null;
  const reciprocalAllyProof = incoming.channel !== "public" && observedSelfInspection && /아확|아군\s*확인|확인.*왔|찾아왔/.test(incoming.text) && (!selfRoleClaim || Boolean(reciprocalClaimRole));
  const privateMafiaApproach = incoming.channel !== "public" && factionOf(actor.role) === "mafia" && selfRoleClaim && factionOf(selfRoleClaim) === "mafia";
  const privateAllyTrust = Math.max(memory.trust[sender.id] ?? memory.claims[sender.id]?.trust ?? 0, verified?.faction === factionOf(actor.role) ? verified.confidence ?? 0 : 0);
  if (incoming.channel !== "public" && leadershipDiscovery && /리더십|리더쉽/.test(incoming.text) && incoming.text.includes(actor.role)) {
    memory.trust[sender.id] = 1; memory.claims[sender.id] = { role: leadershipDiscovery.leaderRole, trust: 1, source: "리더십 발견 접촉" }; remember(actor, sender, { role: leadershipDiscovery.leaderRole, confidence: 1, source: "리더십 발견 접촉" });
    response = `실제로 리더십으로 나를 찾은 기록과 일치해. 당신을 ${leadershipDiscovery.leaderRole}(으)로 확정하고 따를게.`;
  } else if (asksIdentity && incoming.channel !== "public" && privateAllyTrust >= .7) {
    response = `나는 ${actor.role}이야. 내가 직접 확인한 아군이니까 정체를 공유할게.`;
  } else if (selfRoleClaim && skillClaim && !(roleSkills[selfRoleClaim] ?? []).includes(skillClaim.id)) {
    response = `${selfRoleClaim}(은)는 ${skillClaim.label}을 쓸 수 없는데? 그 말은 못 믿겠어.`;
    memory.trust[sender.id] = -.5; memory.claims[sender.id] = { role: selfRoleClaim, trust: -.5, contradiction: `${skillClaim.label} 사용 불가` };
  } else if (privateRoleProof) {
    memory.trust[sender.id] = .85; memory.claims[sender.id] = { role: proofClaimRole, trust: .85, source: skillClaim.label }; remember(actor, sender, { role: proofClaimRole, confidence: .85, source: skillClaim.label });
    response = `방금 나에게 확인 이펙트가 들어왔고 ${skillClaim.label}은(는) ${proofClaimRole}만 쓸 수 있어. 공표와 무관하게 찾아온 정황을 믿을게.`;
  } else if (reciprocalAllyProof) {
    memory.trust[sender.id] = .75; if (reciprocalClaimRole) memory.claims[sender.id] = { role: reciprocalClaimRole, trust: .75, source: "직후 아군 확인 접촉" }; remember(actor, sender, reciprocalClaimRole ? { role: reciprocalClaimRole, confidence: .75, source: "직후 아군 확인 접촉" } : { faction: factionOf(actor.role), confidence: .75, source: "직후 아군 확인 접촉" });
    response = `조금 전 나에게 확인 이펙트가 들어온 직후 찾아온 정황은 믿을게. 공표와 별개로 아군 후보로 판단했어.`;
  } else if (privateMafiaApproach) {
    memory.trust[sender.id] = Math.max(memory.trust[sender.id] ?? 0, .7); memory.claims[sender.id] = { role: selfRoleClaim, trust: .7, source: "마피아 비공개 접촉" }; remember(actor, sender, { role: selfRoleClaim, confidence: .7, source: "마피아 비공개 접촉" });
    response = `${selfRoleClaim} 공표 상태로 비공개 접촉한 건 확인했어. 우선 같은 진영 후보로 연대할게.`;
  } else if (verified?.faction === factionOf(actor.role) && (verified.confidence ?? 0) >= .8) {
    response = `응, 내가 직접 아군 확인한 ${sender.id}번의 제보니까 신뢰하고 움직일게.`;
  } else if (reportedTarget && reportedRole && observedInspection) {
    response = `방금 ${reportedTarget.id}번을 살핀 이펙트 직후 나온 제보라 맥락은 맞아. ${reportedRole} 후보로 우선 보겠어.`;
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
  return room.players.filter((target) => { const memory = memoryOf(actor); const direct = memory.knowledge[target.id]; const trustedClaim = memory.claims[target.id]; const directRoleProof = direct?.role && direct.faction === factionOf(actor.role) && (direct.confidence ?? 0) >= .8; const contextualFactionProof = direct?.faction === factionOf(actor.role) && (direct?.confidence ?? 0) >= .7 && (memory.trust[target.id] ?? 0) >= .7; return target.alive && target.id !== actor.id && (directRoleProof || contextualFactionProof || (trustedClaim?.role && factionOf(trustedClaim.role) === factionOf(actor.role) && (memory.trust[target.id] ?? trustedClaim.trust ?? 0) >= .7)); });
}

function knownEnemies(room, actor) {
  return room.players.filter((target) => target.alive && target.id !== actor.id && memoryOf(actor).knowledge[target.id]?.faction && memoryOf(actor).knowledge[target.id].faction !== factionOf(actor.role) && (memoryOf(actor).knowledge[target.id]?.confidence ?? 0) >= .8);
}

function trustScore(actor, target) {
  const memory = memoryOf(actor); const known = memory.knowledge[target.id];
  return Math.max(memory.trust[target.id] ?? 0, memory.claims[target.id]?.trust ?? 0, known?.faction === factionOf(actor.role) ? known.confidence ?? 0 : 0);
}

function tryBridgeAllies(room, actor) {
  const memory = memoryOf(actor); const allies = knownAllies(room, actor).filter((player) => actor.alliances.has(player.id));
  for (let leftIndex = 0; leftIndex < allies.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < allies.length; rightIndex += 1) {
    const left = allies[leftIndex]; const right = allies[rightIndex]; const key = [left.id, right.id].sort((a, b) => a - b).join(":");
    if (memory.bridged[key] || left.alliances.has(right.id) || trustScore(actor, left) < .7 || trustScore(actor, right) < .7) continue;
    const introductions = [[left, right], [right, left]];
    for (const [recipient, subject] of introductions) {
      if (trustScore(recipient, actor) < .7) continue;
      const actorMemory = memoryOf(actor); const role = actorMemory.knowledge[subject.id]?.role ?? actorMemory.claims[subject.id]?.role ?? subject.announced;
      const recipientMemory = memoryOf(recipient); recipientMemory.trust[subject.id] = Math.max(recipientMemory.trust[subject.id] ?? 0, .7); recipientMemory.claims[subject.id] = { role, trust: .7, source: `${actor.nickname}의 동맹 보증` }; remember(recipient, subject, { role, confidence: .7, source: `${actor.nickname}의 동맹 보증` });
      room.private(recipient, `${actor.id}번 ${actor.nickname}이(가) ${subject.id}번 ${subject.nickname}을(를) 신뢰 가능한 동맹으로 소개했습니다.`);
    }
    memory.bridged[key] = true; return true;
  }
  return false;
}

function tryPublishFinding(room, actor) {
  if (actor.role !== "사립탐정") return false;
  const memory = memoryOf(actor); const target = room.players.find((player) => player.alive && player.id !== actor.id && memory.knowledge[player.id]?.role && memory.knowledge[player.id].faction !== factionOf(actor.role) && (memory.knowledge[player.id].confidence ?? 0) >= .8 && !memory.publishedFindings[player.id]);
  if (!target) return false;
  const role = memory.knowledge[target.id].role; memory.publishedFindings[target.id] = true;
  room.chat(actor.id, { text: `나는 사립탐정이야. ${target.id}번 ${role} 스캔 성공. 공격권 있는 시민은 ${role}(으)로 쳐줘.`, aiBroadcast: true }); return true;
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

function tryLeadership(room, actor) {
  if (!(roleSkills[actor.role] ?? []).includes("leadership") || !ready(room, actor, "leadership") || actor.announced !== actor.role) return false;
  const priorities = factionOf(actor.role) === "mafia" ? ["히트맨", "마피아후계자", "마피아일원", "스파이"] : ["사립탐정", "자경단원", "순찰경찰", "탐정조수", "공무원"];
  const role = priorities.find((candidate) => formations[room.totalPlayers].includes(candidate) && !Object.values(memoryOf(actor).knowledge).some((known) => known.role === candidate));
  if (!role) return false;
  room.act(actor.id, { skillId: "leadership", role });
  const found = room.players.find((player) => player.alive && player.role === role); if (found) remember(actor, found, { role, confidence: 1, source: "리더십" });
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
    if (tryPublishFinding(room, actor) || tryBridgeAllies(room, actor) || tryShare(room, actor) || tryAlliance(room, actor) || tryKnownAttack(room, actor) || tryReportedAttack(room, actor)) return;
    if (tryLeadership(room, actor) || tryRoleCheck(room, actor) || tryScan(room, actor) || tryClaimCheck(room, actor)) return;
    tryPublicChat(room, actor);
  } catch { /* Invalid or stale tactical choices are safely skipped. */ }
}

export function recordPublicDeath(room, target) {
  for (const observer of room.players.filter((player) => player.aiControlled)) {
    const memory = memoryOf(observer);
    remember(observer, target, { role: target.role, confidence: 1, source: "사후 직업 공개" });
    if (target.role === "사립탐정") {
      memory.trust[target.id] = 1;
      memory.claims[target.id] = { role: target.role, trust: 1, source: "사후 직업 공개" };
      for (const report of Object.values(memory.reports).filter((entry) => entry.reporterId === target.id)) {
        report.evidence = Math.max(report.evidence ?? .1, .85);
        report.source = "사망한 사립탐정의 공개 제보";
      }
    }
    const report = memory.reports[target.id]; if (!report) continue;
    const delta = report.role === target.role ? .55 : -.45;
    memory.trust[report.reporterId] = Math.max(-1, Math.min(1, (memory.trust[report.reporterId] ?? memory.claims[report.reporterId]?.trust ?? .15) + delta));
    if (memory.claims[report.reporterId]) memory.claims[report.reporterId].trust = memory.trust[report.reporterId];
    const claim = memory.claims[report.reporterId]; if (delta > 0 && claim?.role && memory.trust[report.reporterId] >= .7) remember(observer, room.player(report.reporterId), { role: claim.role, confidence: memory.trust[report.reporterId], source: "검증된 공개 제보" });
  }
}
