import { factionOf, formations, roleSkills, skillCost, skills } from "./game-config.js";
import { refreshDeductions } from "./ai/deduction.js";
import { desiredAnnouncement, ensureDoctrine, scanRolePriorities, shouldPublishInvestigation, threatPriority, updateDoctrineMode } from "./ai/doctrines.js";

const ATTACKS = new Set(["upper-attack", "lower-attack"]);
const SCANS = new Set(["ally-scan", "advanced-scan", "enemy-scan"]);
const CHECKS = new Set(["ally-check", "enemy-check"]);
const ORDER_LABELS = { "snipe-command": "저격명령", successor: "후계자 지정", leadership: "리더십", snipe: "저격", revenge: "복수", arrest: "검거", support: "마나 지원", tail: "미행", "boss-check": "보스 확인", "detective-check": "탐정 확인", "ally-check": "아군 확인", "enemy-check": "적군 확인", "ally-scan": "아군 스캔", "advanced-scan": "상급 스캔", "enemy-scan": "적군 스캔", "upper-attack": "상급공격", "lower-attack": "하급공격", "ally-add": "동맹 추가", "ally-remove": "동맹 파기" };

const ROLE_ALIASES = {
  "마피아대부": ["마피아대부", "마피아 대부", "맢대부", "대부"],
  "히트맨": ["히트맨", "힛맨"],
  "마피아일원": ["마피아일원", "마피아 일원", "맢일", "맢원", "마피아"],
  "마피아후계자": ["마피아후계자", "마피아 후계자", "맢후", "후계자"],
  "스파이": ["스파이", "슾"],
  "경찰반장": ["경찰반장", "경찰 반장", "경반"],
  "자경단원": ["자경단원", "자경단", "자경"],
  "사립탐정": ["사립탐정", "사립 탐정", "사탐", "탐정"],
  "순찰경찰": ["순찰경찰", "순찰 경찰", "순경"],
  "탐정조수": ["탐정조수", "탐정 조수", "탐조", "조수"],
  "남자연인": ["남자연인", "남연"],
  "여자연인": ["여자연인", "여연"],
  "공무원": ["공무원", "공뭔"],
};

function roleMentions(room, text) {
  const roles = new Set(formations[room.totalPlayers]);
  return Object.entries(ROLE_ALIASES)
    .filter(([role]) => roles.has(role))
    .flatMap(([role, aliases]) => aliases.map((alias) => ({ role, alias, index: text.indexOf(alias) })))
    .filter((mention) => mention.index >= 0)
    .sort((left, right) => left.index - right.index || right.alias.length - left.alias.length);
}

function memoryOf(actor) {
  actor.aiMemory ??= {};
  actor.aiMemory.knowledge ??= {}; actor.aiMemory.sharedWith ??= {}; actor.aiMemory.sharedFindings ??= {}; actor.aiMemory.bridged ??= {}; actor.aiMemory.publishedFindings ??= {}; actor.aiMemory.lastPublicAt ??= 0; actor.aiMemory.recentLines ??= []; actor.aiMemory.inbox ??= []; actor.aiMemory.claims ??= {}; actor.aiMemory.trust ??= {}; actor.aiMemory.reports ??= {}; actor.aiMemory.conversation ??= [];
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
  return roleMentions(room, text)[0]?.role ?? null;
}

function selfClaimedRole(room, text) {
  const firstPerson = /(?:^|[\s,.!?~])(?:나는|난|저는|전|제가|내가|나)\s*/g;
  const starts = [...text.matchAll(firstPerson)].map((match) => (match.index ?? 0) + match[0].length);
  return roleMentions(room, text).find((mention) => starts.some((start) => mention.index >= start && mention.index - start <= 4))?.role ?? null;
}

function claimsRecipientTrueRole(text) {
  const compact = text.replace(/[\s.,!?~·_-]+/g, "");
  return /(?:너|넌|니가|네가|당신)(?:는|은|도)?(?:공표)?진명/.test(compact)
    || /(?:너|넌|니가|네가|당신)(?:는|은|도)?(?:진명|진짜직업)(?:맞아|맞음|이야|임)/.test(compact);
}

function claimedSkill(text) {
  return SKILL_CLAIMS.find((entry) => entry.words.some((word) => text.includes(word))) ?? null;
}

function requestsSnipeAuthorization(text) {
  const compact = text.replace(/[\s.,!?~·_-]+/g, "");
  if (!compact.includes("저격")) return false;
  return /줘|주라|주세요|달라|내놔|내려|부여|허가|열어|활성|가능|쓸수|사용할수|받고싶/.test(compact);
}

function reportedPairs(room, text) {
  const matches = playerMentions(room, text);
  return matches.map((match, index) => {
    const target = room.players.find((player) => player.id === match.id);
    const segment = text.slice(match.index, matches[index + 1]?.index ?? text.length);
    const role = claimedRole(room, segment);
    return target && role ? { target, role } : null;
  }).filter(Boolean);
}

function playerMentions(room, text) {
  return [...text.matchAll(/(?:^|[^\d])(\d{1,2})(?:번|(?=\s|$))/g)]
    .map((match) => ({ id: Number(match[1]), index: (match.index ?? 0) + match[0].indexOf(match[1]) }))
    .filter((mention) => room.players.some((player) => player.id === mention.id));
}

function attributedSource(room, text) {
  const match = text.match(/(\d{1,2})(?:번)?([^\d]{0,24}?)(?:알려|말해|제보|전달|들었|출처|정보)/);
  if (!match) return null;
  const player = room.players.find((entry) => entry.id === Number(match[1])); if (!player) return null;
  const role = formations[room.totalPlayers].find((candidate) => match[2].includes(candidate)) ?? null;
  return { player, role };
}

function introducedAllies(room, actor, sender, incoming) {
  if (incoming.channel !== "alliance" || !actor.alliances.has(sender.id) || !/아군|동맹|같은\s*편|서로\s*믿/.test(incoming.text)) return null;
  const seats = [...new Set([...incoming.text.matchAll(/\d+/g)].map((match) => Number(match[0])))].filter((id) => room.players.some((player) => player.id === id));
  if (!seats.includes(actor.id)) return null;
  return room.players.find((player) => player.alive && player.id !== actor.id && seats.includes(player.id)) ?? null;
}

function replyPrivately(room, actor, recipient, text) {
  if (!room.result) { room.chat(actor.id, { text: `-${recipient.id} ${text}` }); return; }
  const sentAt = room.now(); const message = { from: actor.id, to: recipient.id, text, until: sentAt + 5500 };
  actor.whisper = message; recipient.whisper = message;
}

function tryHumanAllianceOrder(room, actor, sender, text, target, role) {
  if (sender.isBot || sender.aiControlled || (!actor.alliances.has(sender.id) && trustScore(actor, sender) < .7)) return false;
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
    if (CHECKS.has(skillId) && target) recordClaimCheck(room, actor, target, skillId);
    if (["boss-check", "detective-check"].includes(skillId) && target && actor.verdict?.success) remember(actor, target, { role: skillId === "boss-check" ? "마피아대부" : "사립탐정", source: "인간 동맹 확인 지시" });
    if (skillId === "leadership" && role) { const found = room.players.find((player) => player.alive && player.role === role); if (found) remember(actor, found, { role, source: "인간 동맹 리더십 지시" }); }
    const returnsResult = SCANS.has(skillId) || CHECKS.has(skillId) || ATTACKS.has(skillId) || ["boss-check", "detective-check", "leadership", "snipe", "revenge", "arrest", "snipe-command", "successor"].includes(skillId);
    const feedback = returnsResult && actor.verdict
      ? `${ORDER_LABELS[skillId] ?? skillId} ${actor.verdict.success ? "성공" : "실패"}. ${actor.verdict.message}`
      : `동맹 명령 확인. ${ORDER_LABELS[skillId] ?? skillId} 실행을 완료했어.`;
    replyPrivately(room, actor, sender, feedback);
  } catch (error) {
    if (!room.result) room.chat(actor.id, { text: `-${sender.id} 명령을 실행할 수 없어: ${error instanceof Error ? error.message : "규칙상 사용할 수 없는 행동"}` });
  }
  return true;
}

function respondToMessage(room, actor) {
  const memory = memoryOf(actor); const llmWait = (room.llmDirector?.timeoutMs ?? 0) + 250; const eligible = (message) => !message.llmPending || room.now() - message.at > llmWait; const commandIndex = memory.inbox.findIndex((message) => eligible(message) && playerMentions(room, message.text).length && /저격|쏴|사살|스캔|살펴|확인해|공격|쳐|때려|잡아|검거|지원|아확|적확|확인|동맹/.test(message.text)); const fallbackIndex = memory.inbox.findIndex(eligible); const selectedIndex = commandIndex >= 0 ? commandIndex : fallbackIndex; const incoming = selectedIndex >= 0 ? memory.inbox.splice(selectedIndex, 1)[0] : null; if (!incoming) return false;
  const sender = room.player(incoming.from); if (!sender.alive) return true;
  memory.conversation = [...memory.conversation.slice(-11), { from: sender.id, channel: incoming.channel, text: incoming.originalText ?? incoming.text, interpretedAs: incoming.llm?.canonicalText ?? null, speechActs: incoming.llm?.speechActs ?? [], at: incoming.at }];
  const selfRoleClaim = selfClaimedRole(room, incoming.text); const roleClaim = selfRoleClaim ?? claimedRole(room, incoming.text); const skillClaim = claimedSkill(incoming.text);
  const reportMention = playerMentions(room, incoming.text)[0]; const reportedTarget = room.players.find((player) => player.id === reportMention?.id); const reportedRole = reportMention ? claimedRole(room, incoming.text.slice(reportMention.index)) : null;
  const introducedAlly = introducedAllies(room, actor, sender, incoming);
  if (introducedAlly) {
    memory.trust[introducedAlly.id] = Math.max(memory.trust[introducedAlly.id] ?? 0, .7);
    remember(actor, introducedAlly, { faction: factionOf(actor.role), confidence: .7, source: `${sender.nickname}의 동맹 소개` });
    replyPrivately(room, actor, sender, `${introducedAlly.id}번을 아군으로 전달받았어. 서로 연결해서 조사 결과를 공유할게.`); return true;
  }
  if (tryHumanAllianceOrder(room, actor, sender, incoming.text, reportedTarget, reportedRole ?? roleClaim)) return true;
  const reportAt = incoming.at ?? room.now();
  const senderIntelTrust = Math.max(memory.trust[sender.id] ?? memory.claims[sender.id]?.trust ?? 0, memory.knowledge[sender.id]?.faction === factionOf(actor.role) ? memory.knowledge[sender.id]?.confidence ?? 0 : 0, actor.alliances.has(sender.id) && !sender.aiControlled ? .7 : 0);
  const observedInspection = Boolean(reportedTarget && room.publicInspections?.some((entry) => entry.targetId === reportedTarget.id && reportAt >= entry.at && reportAt - entry.at <= 8_000));
  const observedSelfInspection = Boolean(room.publicInspections?.some((entry) => entry.targetId === actor.id && reportAt >= entry.at && reportAt - entry.at <= 20_000));
  const leadershipDiscovery = room.leadershipDiscoveries?.find((entry) => entry.leaderId === sender.id && entry.targetId === actor.id && entry.role === actor.role && reportAt >= entry.at && reportAt - entry.at <= 30_000);
  const commanderProof = actor.role === "히트맨" && actor.snipeAuthorized && actor.snipeCommanderId === sender.id;
  if (commanderProof) { memory.trust[sender.id] = 1; memory.claims[sender.id] = { role: "마피아대부", trust: 1, source: "저격명령" }; remember(actor, sender, { role: "마피아대부", confidence: 1, source: "저격명령" }); }
  if (selfRoleClaim) memory.claims[sender.id] = { ...(memory.claims[sender.id] ?? {}), role: selfRoleClaim, trust: memory.trust[sender.id] ?? .15 };
  const publicInvestigationOrder = incoming.channel === "public" && observedInspection && selfRoleClaim && (roleSkills[selfRoleClaim] ?? []).some((id) => SCANS.has(id)) && /공격|쳐|때려|잡아/.test(incoming.text);
  const relay = attributedSource(room, incoming.text);
  for (const { target, role } of reportedPairs(room, incoming.text)) {
    if (target.id === sender.id || target.id === relay?.player.id) continue;
    const pairObserved = Boolean(room.publicInspections?.some((entry) => entry.targetId === target.id && reportAt >= entry.at && reportAt - entry.at <= 8_000));
    const knownSenderRole = memory.knowledge[sender.id]?.role; const senderSkills = roleSkills[knownSenderRole] ?? [];
    const roleCanProveReport = (memory.knowledge[sender.id]?.confidence ?? 0) >= .7 && (senderSkills.some((skillId) => ["enemy-scan", "advanced-scan"].includes(skillId)) || (senderSkills.includes("enemy-check") && target.announced === role));
    const knownRelayRole = relay ? memory.knowledge[relay.player.id]?.role : null; const relayRole = knownRelayRole ?? relay?.role ?? null; const relaySkills = roleSkills[relayRole] ?? [];
    const relayCanProve = Boolean(relay && relayRole && (relaySkills.some((skillId) => ["enemy-scan", "advanced-scan"].includes(skillId)) || (relaySkills.includes("enemy-check") && target.announced === role)));
    const relayVerified = Boolean(relayCanProve && knownRelayRole && (memory.knowledge[relay.player.id]?.confidence ?? 0) >= .7);
    if (/진명|확인|성공|맞아|맞음|찾았/.test(incoming.text) || incoming.channel === "public" || senderIntelTrust >= .7 || roleCanProveReport || relayCanProve) memory.reports[target.id] = { role, reporterId: sender.id, source: publicInvestigationOrder || pairObserved ? "공개 합동수사" : roleCanProveReport ? `${knownSenderRole}의 조사 가능 정보` : relayCanProve ? `${relay.player.id}번 ${relayRole}에게 전달받은 정보` : senderIntelTrust >= .7 ? "신뢰 동맹 제보" : skillClaim?.label ?? "공개 제보", evidence: pairObserved ? .55 : roleCanProveReport ? .8 : relayVerified ? .8 : relayCanProve ? .55 : senderIntelTrust >= .7 ? .7 : incoming.channel === "public" ? .45 : .1, sourceId: relay?.player.id };
  }
  const publicCitizenInvestigator = incoming.channel === "public" && selfRoleClaim && factionOf(selfRoleClaim) === "citizen" && (roleSkills[selfRoleClaim] ?? []).some((skillId) => ["enemy-scan", "enemy-check"].includes(skillId));
  if (factionOf(actor.role) === "mafia" && publicCitizenInvestigator && reportedPairs(room, incoming.text).length) {
    memory.reports[sender.id] = { role: selfRoleClaim, reporterId: sender.id, source: "공개수사 신원 노출", evidence: observedInspection ? .8 : .55 };
    remember(actor, sender, { role: selfRoleClaim, confidence: observedInspection ? .8 : .55, source: "공개수사 신원 노출" });
    for (const { target, role } of reportedPairs(room, incoming.text)) {
      if (target.id === sender.id || factionOf(role) !== "mafia") continue;
      const pairObserved = Boolean(room.publicInspections?.some((entry) => entry.targetId === target.id && reportAt >= entry.at && reportAt - entry.at <= 8_000));
      if (!pairObserved) continue;
      memory.trust[target.id] = Math.max(memory.trust[target.id] ?? 0, .8);
      memory.claims[target.id] = { role, trust: .8, source: `${selfRoleClaim}의 공개 적발` };
      remember(actor, target, { role, confidence: .8, source: `적 ${selfRoleClaim}의 공개 조사 적발` });
    }
  }
  const verified = memory.knowledge[sender.id]; let response;
  const knownHitman = verified?.role === "히트맨" && (verified.confidence ?? 0) >= .8;
  const requestsSnipeProof = actor.role === "마피아대부" && (selfRoleClaim === "히트맨" || knownHitman) && requestsSnipeAuthorization(incoming.text);
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
    replyPrivately(room, actor, sender, `${reportedTarget.id}번 ${reportedRole} 스캔 ${hit ? "성공" : "실패"}. ${actor.verdict?.message ?? ""}`.trim());
    return true;
  }
  const directAllyTrust = Math.max(memory.trust[sender.id] ?? memory.claims[sender.id]?.trust ?? 0, verified?.faction === factionOf(actor.role) ? verified.confidence ?? 0 : 0);
  const commandedScan = (roleSkills[actor.role] ?? []).find((id) => SCANS.has(id) && ready(room, actor, id));
  if (wantsScan && commandedScan && directAllyTrust >= .7 && reportedTarget.alive && reportedTarget.id !== actor.id && allowedScanRoles(room, actor, commandedScan).includes(reportedRole)) {
    room.act(actor.id, { skillId: commandedScan, targetId: reportedTarget.id, role: reportedRole });
    const hit = actor.verdict?.success; if (hit) remember(actor, reportedTarget, { role: reportedRole, source: "아군 지시 스캔" }); else remember(actor, reportedTarget, { source: "아군 지시 스캔", excludedRole: reportedRole });
    replyPrivately(room, actor, sender, `${reportedTarget.id}번 ${reportedRole} 스캔 ${hit ? "성공" : "실패"}. ${actor.verdict?.message ?? ""}`.trim());
    return true;
  }
  const commandedAttack = (roleSkills[actor.role] ?? []).find((id) => ATTACKS.has(id) && ready(room, actor, id));
  const attackTrustNeeded = commandedAttack === "lower-attack" && actor.lowAttackFails > 0 ? .8 : .7;
  if (wantsAttack && commandedAttack && directAllyTrust >= attackTrustNeeded && reportedTarget.alive && reportedTarget.id !== actor.id && factionOf(reportedRole) !== factionOf(actor.role)) {
    room.act(actor.id, { skillId: commandedAttack, targetId: reportedTarget.id, role: reportedRole });
    replyPrivately(room, actor, sender, `${reportedTarget.id}번 ${reportedRole} 공격 ${actor.verdict?.success ? "성공" : "실패"}. ${actor.verdict?.message ?? ""}`.trim());
    return true;
  }
  const proofClaimRole = skillClaim?.id === "detective-check" ? "탐정조수" : skillClaim?.id === "boss-check" ? "마피아후계자" : selfRoleClaim;
  const privateRoleProof = incoming.channel !== "public" && observedSelfInspection && ((actor.role === "사립탐정" && skillClaim?.id === "detective-check") || (actor.role === "마피아대부" && skillClaim?.id === "boss-check"));
  const reciprocalClaimRole = selfRoleClaim && (roleSkills[selfRoleClaim] ?? []).includes("ally-check") ? selfRoleClaim : null;
  const recipientTrueRoleClaim = claimsRecipientTrueRole(incoming.originalText ?? incoming.text);
  const recipientTrueRoleProof = recipientTrueRoleClaim && room.publicInspections?.some((entry) => entry.targetId === actor.id && entry.actorId === sender.id && entry.skillId === "ally-check" && entry.announced === actor.role && entry.success === true && reportAt >= entry.at && reportAt - entry.at <= 20_000);
  const reciprocalAllyProof = incoming.channel !== "public" && ((!recipientTrueRoleClaim && observedSelfInspection && /아확|아군\s*확인|확인.*왔|찾아왔/.test(incoming.text)) || recipientTrueRoleProof) && (!selfRoleClaim || Boolean(reciprocalClaimRole));
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
    response = recipientTrueRoleClaim
      ? `응, 내 공표가 진명이라는 말과 방금 들어온 확인 이펙트가 일치해. ${selfRoleClaim ? `${selfRoleClaim}(으)로 주장한 것도 기록했고 ` : ""}아군 후보로 믿을게.`
      : `조금 전 나에게 확인 이펙트가 들어온 직후 찾아온 정황은 믿을게. 공표와 별개로 아군 후보로 판단했어.`;
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
  return Boolean(skill && actor.mana >= skillCost(skillId, room.totalPlayers) && (actor.cooldowns[skillId] ?? 0) <= room.now() && !(skill.once && actor.usedOnce[skillId]));
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

function isConfirmedAlly(room, actor, target) {
  return actor.alliances.has(target.id) || knownAllies(room, actor).some((ally) => ally.id === target.id);
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
      room.notify(recipient, "동맹 소개", `${actor.id}번 ${actor.nickname}이(가) ${subject.id}번 ${subject.nickname}을(를) 신뢰 가능한 동맹으로 소개했습니다.`, "alliance");
    }
    memory.bridged[key] = true; return true;
  }
  return false;
}

function tryPublishFinding(room, actor) {
  const canInvestigateEnemies = (roleSkills[actor.role] ?? []).some((skillId) => ["enemy-scan", "advanced-scan", "enemy-check"].includes(skillId));
  if (factionOf(actor.role) !== "citizen" || !canInvestigateEnemies || !shouldPublishInvestigation(room, actor)) return false;
  const memory = memoryOf(actor); const target = room.players.find((player) => player.alive && player.id !== actor.id && memory.knowledge[player.id]?.role && memory.knowledge[player.id].faction !== factionOf(actor.role) && (memory.knowledge[player.id].confidence ?? 0) >= .8 && !memory.publishedFindings[player.id]);
  if (!target) return false;
  const role = memory.knowledge[target.id].role; memory.publishedFindings[target.id] = true;
  room.chat(actor.id, { text: `나는 ${actor.role}이야. ${target.id}번 ${role} 조사 성공. 공격권 있는 시민은 ${role}(으)로 쳐줘.`, aiBroadcast: true }); return true;
}

function tryAnnounce(room, actor) {
  const forcedClaim = memoryOf(actor).forcedAnnouncementRole;
  const hasAnnouncedBefore = Object.hasOwn(actor.cooldowns, "announce");
  if (!forcedClaim && actor.announced !== "미공표" && !hasAnnouncedBefore) return false;
  if (!ready(room, actor, "announce")) return false;
  const roles = formations[room.totalPlayers];
  const alternatives = roles.filter((role) => role !== actor.announced);
  const doctrinalClaim = forcedClaim ?? desiredAnnouncement(room, actor);
  const claim = alternatives.includes(doctrinalClaim) ? doctrinalClaim : pick(room, alternatives.length ? alternatives : roles);
  room.act(actor.id, { skillId: "announce", role: claim });
  memoryOf(actor).announcementCount = (memoryOf(actor).announcementCount ?? 0) + 1;
  if (forcedClaim) delete memoryOf(actor).forcedAnnouncementRole;
  return true;
}

function tryAuthorizeHitman(room, actor) {
  if (actor.role !== "마피아대부" || !ready(room, actor, "snipe-command")) return false;
  const hitman = room.players.find((player) => player.alive && memoryOf(actor).knowledge[player.id]?.role === "히트맨" && (memoryOf(actor).knowledge[player.id]?.confidence ?? 0) >= .8);
  if (!hitman) return false;
  room.act(actor.id, { skillId: "snipe-command", targetId: hitman.id });
  if (actor.verdict?.success) { memoryOf(actor).trust[hitman.id] = 1; memoryOf(actor).claims[hitman.id] = { role: "히트맨", trust: 1, source: "저격명령" }; }
  return true;
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

function tryShareFinding(room, actor) {
  if (!actor.alliances.size) return false;
  const memory = memoryOf(actor);
  const finding = Object.entries(memory.knowledge).find(([targetId, known]) => {
    const target = room.players.find((player) => player.id === Number(targetId));
    if (!target || target.id === actor.id || known.source === "사후 직업 공개" || (!known.role && !known.faction && !known.excluded?.length)) return false;
    const signature = `${known.role ?? ""}|${known.faction ?? ""}|${(known.excluded ?? []).join(",")}`;
    return [...actor.alliances].some((allyId) => !memory.sharedFindings[`${allyId}:${target.id}:${signature}`]);
  });
  if (!finding) return false;
  const [targetId, known] = finding; const target = room.player(Number(targetId));
  const detail = known.role ? `${target.id}번은 ${known.role}` : known.faction ? `${target.id}번은 ${known.faction === "mafia" ? "마피아" : "시민"} 진영` : `${target.id}번은 ${(known.excluded ?? []).join(", ")} 아님`;
  room.chat(actor.id, { text: `${known.source ?? "조사"} 결과 공유: ${detail}.`, channel: "alliance" });
  for (const allyId of actor.alliances) {
    const ally = room.players.find((player) => player.id === allyId); if (!ally?.alive) continue;
    const signature = `${known.role ?? ""}|${known.faction ?? ""}|${(known.excluded ?? []).join(",")}`; memory.sharedFindings[`${ally.id}:${target.id}:${signature}`] = true;
    if (!ally.aiControlled) continue;
    const confidence = Math.min(known.confidence ?? .8, .8);
    memoryOf(ally).sharedFindings[`${actor.id}:${target.id}:${signature}`] = true;
    if (known.role) remember(ally, target, { role: known.role, confidence, source: `${actor.nickname}의 동맹 조사 공유` });
    else if (known.faction) remember(ally, target, { faction: known.faction, confidence, source: `${actor.nickname}의 동맹 조사 공유` });
    for (const excludedRole of known.excluded ?? []) remember(ally, target, { confidence, source: `${actor.nickname}의 동맹 조사 공유`, excludedRole });
    if (known.role && factionOf(known.role) !== factionOf(ally.role)) memoryOf(ally).reports[target.id] = { role: known.role, reporterId: actor.id, source: "동맹 조사 공유", evidence: .7 };
  }
  return true;
}

function tryKnownAttack(room, actor) {
  const skillId = (roleSkills[actor.role] ?? []).find((id) => ATTACKS.has(id) && ready(room, actor, id));
  if (!skillId) return false;
  const target = knownEnemies(room, actor).filter((candidate) => memoryOf(actor).knowledge[candidate.id]?.role && !shouldDelegatePublicTarget(room, actor, candidate)).sort((left, right) => enemyThreatScore(actor, right) - enemyThreatScore(actor, left))[0];
  if (!target) return false;
  room.act(actor.id, { skillId, targetId: target.id, role: memoryOf(actor).knowledge[target.id].role }); return true;
}

function tryReportedAttack(room, actor) {
  const skillId = (roleSkills[actor.role] ?? []).find((id) => ATTACKS.has(id) && ready(room, actor, id)); if (!skillId) return false;
  const threshold = skillId === "upper-attack" ? .3 : actor.lowAttackFails === 0 ? .45 : .7; const memory = memoryOf(actor);
  const entry = Object.entries(memory.reports).find(([targetId, report]) => { const target = room.players.find((player) => player.id === Number(targetId)); const verifiedReporter = memory.knowledge[report.reporterId]; const directTrust = verifiedReporter?.faction === factionOf(actor.role) ? verifiedReporter.confidence ?? 0 : 0; const trust = Math.max(memory.trust[report.reporterId] ?? memory.claims[report.reporterId]?.trust ?? .15, directTrust); return target?.alive && !shouldDelegatePublicTarget(room, actor, target) && factionOf(report.role) !== factionOf(actor.role) && Math.max(trust, report.evidence ?? .1) >= threshold; });
  if (!entry) return false; const [targetId, report] = entry; const target = room.player(Number(targetId));
  room.act(actor.id, { skillId, targetId: target.id, role: report.role }); gradeAttackReport(room, actor, target, report); return true;
}

function tryReciprocateAlliance(room, actor) {
  const target = knownAllies(room, actor).find((candidate) => actor.alliances.has(candidate.id) && !candidate.incomingAlliances.has(actor.id));
  if (!target) return false;
  target.incomingAlliances.add(actor.id);
  const message = `${actor.id}번 ${actor.nickname}이(가) 맞동맹을 걸었습니다.`;
  room.notify(target, "맞동맹 수신", message, "alliance");
  room.chat(actor.id, { text: `${target.id}번 아군 확인. 나도 맞동맹 걸었어.`, channel: "alliance" });
  return true;
}

export function syncAllianceIntel(room, actor, ally) {
  if (!actor?.aiControlled || !ally?.alive || !ally.incomingAlliances.has(actor.id)) return false;
  const memory = memoryOf(actor);
  const findings = Object.entries(memory.knowledge).flatMap(([targetId, known]) => {
    const target = room.players.find((player) => player.id === Number(targetId));
    if (!target || target.id === actor.id || target.id === ally.id || known.source === "사후 직업 공개" || (!known.role && !known.faction && !known.excluded?.length)) return [];
    const signature = `${known.role ?? ""}|${known.faction ?? ""}|${(known.excluded ?? []).join(",")}`;
    if (memory.sharedFindings[`${ally.id}:${target.id}:${signature}`]) return [];
    return [{ target, known, signature }];
  });
  if (!findings.length) return false;

  const details = findings.map(({ target, known }) => known.role
    ? `${target.id}번 ${known.role}`
    : known.faction
      ? `${target.id}번 ${known.faction === "mafia" ? "마피아" : "시민"} 진영`
      : `${target.id}번 ${(known.excluded ?? []).join(", ")} 아님`);
  room.chat(actor.id, { text: `지금까지 조사 결과 공유: ${details.join(" / ")}.`, channel: "alliance" });

  for (const { target, known, signature } of findings) {
    memory.sharedFindings[`${ally.id}:${target.id}:${signature}`] = true;
    if (!ally.aiControlled) continue;
    const confidence = Math.min(known.confidence ?? .8, .8);
    memoryOf(ally).sharedFindings[`${actor.id}:${target.id}:${signature}`] = true;
    if (known.role) remember(ally, target, { role: known.role, confidence, source: `${actor.nickname}의 동맹 조사 공유` });
    else if (known.faction) remember(ally, target, { faction: known.faction, confidence, source: `${actor.nickname}의 동맹 조사 공유` });
    for (const excludedRole of known.excluded ?? []) remember(ally, target, { confidence, source: `${actor.nickname}의 동맹 조사 공유`, excludedRole });
    if (known.role && factionOf(known.role) !== factionOf(ally.role)) memoryOf(ally).reports[target.id] = { role: known.role, reporterId: actor.id, source: "동맹 조사 공유", evidence: .7 };
  }
  return true;
}

function gradeAttackReport(room, actor, target, report) {
  if (!report?.reporterId || report.reporterId === actor.id) return;
  const memory = memoryOf(actor); const reporter = room.players.find((player) => player.id === report.reporterId); if (!reporter) return;
  if (actor.verdict?.success) {
    memory.trust[reporter.id] = Math.min(1, Math.max(memory.trust[reporter.id] ?? 0, report.evidence ?? 0) + .2);
    report.evidence = Math.max(report.evidence ?? 0, .9); report.source = `${report.source ?? "제보"} · 공격으로 검증됨`; return;
  }
  memory.trust[reporter.id] = Math.min(memory.trust[reporter.id] ?? 0, -.8);
  const hostileFaction = factionOf(actor.role) === "citizen" ? "mafia" : "citizen";
  remember(actor, reporter, { faction: hostileFaction, confidence: .75, source: `${target.id}번 거짓 공격 제보` });
  memory.claims[reporter.id] = { ...(memory.claims[reporter.id] ?? {}), trust: -.8, contradiction: `${target.id}번 ${report.role} 거짓 제보` };
  report.evidence = 0; report.discredited = true; report.source = `${report.source ?? "제보"} · 공격 실패로 반증됨`;
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
  const candidates = room.players.filter((target) => { const known = memoryOf(actor).knowledge[target.id]; return target.alive && target.id !== actor.id && !known?.role && !isConfirmedAlly(room, actor, target); });
  const target = pick(room, candidates); if (!target) return false;
  const roles = allowedScanRoles(room, actor, skillId);
  const priorities = scanRolePriorities(actor).filter((role) => roles.includes(role));
  const publicGuess = roles.includes(target.announced) ? target.announced : null;
  const excluded = memoryOf(actor).knowledge[target.id]?.excluded ?? [];
  const guessedRole = publicGuess ?? priorities.find((role) => !excluded.includes(role)) ?? pick(room, roles.filter((role) => !excluded.includes(role)));
  if (!guessedRole) return false;
  room.act(actor.id, { skillId, targetId: target.id, role: guessedRole });
  if (target.role === guessedRole) remember(actor, target, { role: guessedRole, source: skillId === "advanced-scan" ? "상급 스캔" : "스캔" });
  else remember(actor, target, { source: "스캔", excludedRole: guessedRole });
  return true;
}

function tryClaimCheck(room, actor) {
  const plan = claimCheckPlan(room, actor); if (!plan) return false;
  const { skillId, candidates } = plan;
  const challenged = candidates.find((candidate) => memoryOf(actor).spyChallenges?.[candidate.id]?.awaitingRecheck && memoryOf(actor).spyChallenges[candidate.id].challengedRole === candidate.announced);
  const target = challenged ?? pick(room, candidates); if (!target) return false;
  room.act(actor.id, { skillId, targetId: target.id });
  recordClaimCheck(room, actor, target, skillId);
  return true;
}

function tryBetrayal(room, actor) {
  if (actor.role !== "스파이" || !ready(room, actor, "betrayal")) return false;
  const target = knownEnemies(room, actor).filter((candidate) => actor.incomingAlliances.has(candidate.id) && candidate.incomingAlliances.has(actor.id)).sort((left, right) => enemyThreatScore(actor, right) - enemyThreatScore(actor, left))[0];
  if (!target) return false;
  room.act(actor.id, { skillId: "betrayal", targetId: target.id }); return true;
}

function tryTail(room, actor) {
  if (actor.role !== "스파이" || memoryOf(actor).forcedAnnouncementRole || !ready(room, actor, "tail")) return false;
  const activeTargetIds = new Set((room.tails ?? []).filter((entry) => entry.until > room.now() && entry.spyId === actor.id).map((entry) => entry.targetId));
  const candidates = room.players.filter((target) => target.alive && target.id !== actor.id && !activeTargetIds.has(target.id) && !isConfirmedAlly(room, actor, target));
  const target = pick(room, candidates); if (!target) return false;
  room.act(actor.id, { skillId: "tail", targetId: target.id }); return true;
}

function shouldDelegatePublicTarget(room, actor, target) {
  if (actor.role !== "마피아일원") return false;
  const source = `${memoryOf(actor).knowledge[target.id]?.source ?? ""} ${memoryOf(actor).reports[target.id]?.source ?? ""}`;
  if (!/공개|수사|신원 노출/.test(source)) return false;
  const bossKnown = room.players.some((player) => player.alive && memoryOf(actor).knowledge[player.id]?.role === "마피아대부" && (memoryOf(actor).knowledge[player.id]?.confidence ?? 0) >= .8);
  if (!bossKnown) return false;
  const memory = memoryOf(actor); memory.delegatedPublicTargets ??= {}; memory.delegatedPublicTargets[target.id] ??= room.now();
  return room.now() - memory.delegatedPublicTargets[target.id] < 12_000;
}

function recordClaimCheck(room, actor, target, skillId) {
  const memory = memoryOf(actor); const success = Boolean(actor.verdict?.success);
  const spyPresent = formations[room.totalPlayers].includes("스파이") && !room.players.some((player) => !player.alive && player.role === "스파이");
  const challenge = memory.spyChallenges?.[target.id];
  if (skillId === "ally-check" && factionOf(actor.role) === "citizen" && spyPresent && challenge?.awaitingRecheck && challenge.challengedRole === target.announced) {
    memory.spyChallenges[target.id].awaitingRecheck = false;
    if (success) { remember(actor, target, { role: "스파이", confidence: .9, source: "스파이 이중 아확" }); memory.trust[target.id] = -.8; }
    else { remember(actor, target, { role: challenge.originalRole, confidence: .9, source: "스파이 이중 아확 통과" }); memory.trust[target.id] = .9; }
    return;
  }
  if (success && skillId === "ally-check" && factionOf(actor.role) === "citizen" && spyPresent) {
    memory.spyChallenges ??= {};
    const citizenRoles = formations[room.totalPlayers].filter((role) => factionOf(role) === "citizen" && role !== target.announced);
    const challengedRole = citizenRoles.find((role) => role !== actor.role) ?? citizenRoles[0];
    memory.spyChallenges[target.id] = { originalRole: target.announced, challengedRole, awaitingRecheck: true, at: room.now() };
    memory.trust[target.id] = Math.max(memory.trust[target.id] ?? 0, .45);
    replyPrivately(room, actor, target, `아확은 성공했지만 스파이 검증이 필요해. ${challengedRole}(으)로 공표를 바꿔줘. 다시 확인할게.`);
    if (target.aiControlled) { memoryOf(target).forcedAnnouncementRole = challengedRole; room.wakeAi?.(target); }
    return;
  }
  if (success) { remember(actor, target, { role: target.announced, confidence: .8, source: "공표 확인" }); memory.trust[target.id] = Math.max(memory.trust[target.id] ?? 0, .8); }
  else remember(actor, target, { confidence: .8, source: "공표 확인 실패", excludedRole: target.announced });
}

function claimCheckPlan(room, actor) {
  const skillId = (roleSkills[actor.role] ?? []).find((id) => CHECKS.has(id) && ready(room, actor, id));
  if (!skillId) return null;
  const mine = factionOf(actor.role);
  const candidates = room.players.filter((target) => { const known = memoryOf(actor).knowledge[target.id]; const challenge = memoryOf(actor).spyChallenges?.[target.id]; return target.alive && target.id !== actor.id && (!isConfirmedAlly(room, actor, target) || challenge?.awaitingRecheck) && !known?.role && !known?.excluded?.includes(target.announced) && target.announced !== "미공표" && (skillId === "ally-check") === (factionOf(target.announced) === mine); });
  return candidates.length ? { skillId, candidates } : null;
}

function enemyThreatScore(actor, target) {
  const role = memoryOf(actor).knowledge[target.id]?.role ?? memoryOf(actor).reports[target.id]?.role;
  return threatPriority(actor, role);
}

function tryDecisiveMafiaReveal(room, actor) {
  if (factionOf(actor.role) !== "mafia") return false;
  const memory = memoryOf(actor); if (memory.decisiveReveal) return false;
  const entries = Object.entries(memory.knowledge);
  const patrolEntry = entries.find(([, known]) => known.role === "순찰경찰" && (known.confidence ?? 0) >= .8);
  const captainEntry = entries.find(([, known]) => known.role === "경찰반장" && (known.confidence ?? 0) >= .8);
  if (!patrolEntry || !captainEntry) return false;
  const patrol = room.players.find((player) => player.id === Number(patrolEntry[0])); const captain = room.players.find((player) => player.id === Number(captainEntry[0]));
  if (!patrol?.alive || !captain?.alive) return false;
  memory.decisiveReveal = true;
  room.chat(actor.id, { text: `나는 ${actor.role}이야. ${patrol.id}번 순찰경찰, ${captain.id}번 경찰반장 확정. 마피아 공격권자는 순찰경찰부터 처리하고 다음에 경찰반장을 쳐줘.`, aiBroadcast: true });
  return true;
}

function tryAutonomousSpecial(room, actor) {
  const memory = memoryOf(actor); const known = (role) => room.players.find((player) => player.alive && memory.knowledge[player.id]?.role === role && (memory.knowledge[player.id]?.confidence ?? 0) >= .8);
  if (actor.role === "마피아대부" && ready(room, actor, "successor")) {
    const target = known("마피아후계자"); if (target) { room.act(actor.id, { skillId: "successor", targetId: target.id }); return true; }
  }
  if (actor.role === "경찰반장" && ready(room, actor, "arrest")) {
    const target = known("마피아대부"); if (target) { room.act(actor.id, { skillId: "arrest", targetId: target.id }); return true; }
    const livingCitizenRoles = formations[room.totalPlayers].filter((role) => factionOf(role) === "citizen" && !room.players.some((player) => !player.alive && player.role === role));
    const comebackCollapsed = livingCitizenRoles.length <= 2;
    const guess = comebackCollapsed ? room.players.filter((player) => player.alive && player.id !== actor.id && memory.candidateRoles?.[player.id]?.includes("마피아대부")).sort((left, right) => memory.candidateRoles[left.id].length - memory.candidateRoles[right.id].length)[0] : null;
    if (guess) { room.act(actor.id, { skillId: "arrest", targetId: guess.id }); return true; }
  }
  if (actor.role === "히트맨" && actor.snipeAuthorized && ready(room, actor, "snipe")) {
    const captainSuspect = room.players.filter((player) => player.alive && player.id !== actor.id && memory.candidateRoles?.[player.id]?.includes("경찰반장")).sort((left, right) => memory.candidateRoles[left.id].length - memory.candidateRoles[right.id].length)[0];
    const target = known("경찰반장") ?? (captainSuspect && memory.candidateRoles[captainSuspect.id].length <= 2 ? captainSuspect : null) ?? known("순찰경찰") ?? knownEnemies(room, actor).sort((left, right) => enemyThreatScore(actor, right) - enemyThreatScore(actor, left))[0];
    if (target) { room.act(actor.id, { skillId: "snipe", targetId: target.id }); return true; }
  }
  if (["남자연인", "여자연인"].includes(actor.role) && ready(room, actor, "revenge")) {
    const partnerRole = actor.role === "남자연인" ? "여자연인" : "남자연인"; const partner = room.players.find((player) => !player.alive && player.role === partnerRole);
    const target = knownEnemies(room, actor).sort((left, right) => enemyThreatScore(actor, right) - enemyThreatScore(actor, left))[0];
    if (partner && target) { room.act(actor.id, { skillId: "revenge", targetId: target.id }); return true; }
  }
  if (actor.role === "공무원" && ready(room, actor, "support")) {
    const publicEnemy = knownEnemies(room, actor).find((target) => memory.knowledge[target.id]?.role && !memory.officialNotices?.[target.id]);
    if (publicEnemy && ready(room, actor, "proclamation")) {
      memory.officialNotices ??= {}; memory.officialNotices[publicEnemy.id] = true;
      room.act(actor.id, { skillId: "proclamation", text: `시민 수사망 공지: ${publicEnemy.id}번 ${memory.knowledge[publicEnemy.id].role} 확정 정보가 공유되었습니다. 공격권자는 확인 후 처리 바랍니다.` }); return true;
    }
    const priorities = ["순찰경찰", "자경단원", "사립탐정", "탐정조수", "경찰반장"];
    const allies = knownAllies(room, actor); const target = priorities.map(known).find((player) => player && allies.some((ally) => ally.id === player.id)) ?? pick(room, allies.length ? allies : room.players.filter((player) => player.alive && player.id !== actor.id));
    if (target) { room.act(actor.id, { skillId: "support", targetId: target.id }); return true; }
  }
  return false;
}

function tryLlmStrategicIntent(room, actor) {
  const plan = memoryOf(actor).llmPlan;
  if (!plan || room.now() - plan.at > 30_000 || plan.confidence < .55) return false;
  const attempts = {
    coordinate_attack: [tryKnownAttack, tryReportedAttack],
    coordinate_scan: [tryRoleCheck, tryScan, tryClaimCheck],
    request_verification: [tryClaimCheck, tryRoleCheck, tryScan],
    build_alliance: [tryBridgeAllies, tryAlliance, tryShare],
    share_intel: [tryPublishFinding, tryShareFinding, tryShare],
  }[plan.goal] ?? [];
  const acted = attempts.some((attempt) => attempt(room, actor));
  if (acted) memoryOf(actor).llmPlan = null;
  return acted;
}

function hasReadyInvestigation(room, actor) {
  const available = roleSkills[actor.role] ?? [];
  const hasReadySkill = available.some((skillId) => (SCANS.has(skillId) || CHECKS.has(skillId) || ["boss-check", "detective-check", "leadership"].includes(skillId)) && ready(room, actor, skillId));
  if (!hasReadySkill) return false;
  if (claimCheckPlan(room, actor)) return true;
  if (available.some((skillId) => SCANS.has(skillId) && ready(room, actor, skillId))) {
    return room.players.some((target) => { const known = memoryOf(actor).knowledge[target.id]; return target.alive && target.id !== actor.id && !known?.role && !actor.alliances.has(target.id); });
  }
  if (available.some((skillId) => ["boss-check", "detective-check"].includes(skillId) && ready(room, actor, skillId))) {
    return room.players.some((target) => target.alive && target.id !== actor.id && !memoryOf(actor).knowledge[target.id]?.role);
  }
  if (available.includes("leadership") && ready(room, actor, "leadership") && actor.announced === actor.role) return true;
  return false;
}

export function runStrategicBot(room, { fair = false, actor: scheduledActor = null } = {}) {
  const bots = room.players.filter((player) => player.alive && player.aiControlled); if (!bots.length) return false;
  if (scheduledActor && (!scheduledActor.alive || !scheduledActor.aiControlled)) return false;
  for (const bot of scheduledActor ? [scheduledActor] : bots) { memoryOf(bot); ensureDoctrine(room, bot); refreshDeductions(room, bot); updateDoctrineMode(room, bot); }
  const waiting = bots.filter((player) => memoryOf(player).inbox.length);
  const isolatedCheckers = bots.filter((player) => !player.alliances.size && knownAllies(room, player).length === 0 && claimCheckPlan(room, player));
  const candidates = scheduledActor ? [scheduledActor] : waiting.length ? waiting : isolatedCheckers.length ? isolatedCheckers : bots;
  const actor = scheduledActor ?? (fair ? candidates[room.botRuleCursor % candidates.length] : pick(room, candidates));
  if (fair) room.botRuleCursor += 1; memoryOf(actor);
  try {
    if (respondToMessage(room, actor)) return true;
    if (tryDecisiveMafiaReveal(room, actor)) return true;
    if (tryAutonomousSpecial(room, actor) || tryBetrayal(room, actor) || tryTail(room, actor)) return true;
    if (tryAnnounce(room, actor)) return true;
    if (tryLlmStrategicIntent(room, actor)) return true;
    if (tryPublishFinding(room, actor) || tryAuthorizeHitman(room, actor) || tryBridgeAllies(room, actor) || tryReciprocateAlliance(room, actor) || tryShare(room, actor) || tryKnownAttack(room, actor) || tryReportedAttack(room, actor) || tryAlliance(room, actor) || tryShareFinding(room, actor)) return true;
    if (tryLeadership(room, actor) || tryRoleCheck(room, actor) || tryScan(room, actor) || tryClaimCheck(room, actor)) return true;
    return false;
  } catch { /* Invalid or stale tactical choices are safely skipped. */ }
  return false;
}

export function runInvestigationBot(room, { fair = false, actor: scheduledActor = null } = {}) {
  for (const bot of scheduledActor ? [scheduledActor] : room.players.filter((player) => player.alive && player.aiControlled)) { memoryOf(bot); ensureDoctrine(room, bot); refreshDeductions(room, bot); }
  const investigators = room.players.filter((player) => player.alive && player.aiControlled && !memoryOf(player).inbox.length && hasReadyInvestigation(room, player) && (!scheduledActor || player === scheduledActor));
  if (!investigators.length) return false;
  const actor = fair ? investigators[room.botInvestigationCursor % investigators.length] : pick(room, investigators);
  if (fair) room.botInvestigationCursor += 1;
  try {
    const hasBoss = Object.values(memoryOf(actor).knowledge).some((known) => known.role === "마피아대부" && (known.confidence ?? 0) >= .8);
    if (actor.role === "마피아후계자" && !hasBoss) return tryRoleCheck(room, actor) || tryScan(room, actor);
    if (actor.role === "탐정조수" && !Object.values(memoryOf(actor).knowledge).some((known) => known.role === "사립탐정" && (known.confidence ?? 0) >= .8)) {
      memoryOf(actor).assistantInvestigationTurn = (memoryOf(actor).assistantInvestigationTurn ?? 0) + 1;
      return memoryOf(actor).assistantInvestigationTurn % 2 ? tryClaimCheck(room, actor) || tryRoleCheck(room, actor) : tryRoleCheck(room, actor) || tryClaimCheck(room, actor);
    }
    return tryClaimCheck(room, actor) || tryScan(room, actor) || tryRoleCheck(room, actor) || tryLeadership(room, actor);
  }
  catch { return false; }
}

export function processPendingBotMessages(room) {
  let processed = false;
  for (const actor of room.players.filter((player) => player.alive && player.aiControlled && memoryOf(player).inbox.length)) {
    try { if (respondToMessage(room, actor)) processed = true; } catch { /* stale message */ }
  }
  return processed;
}

export function runUrgentAttackBot(room, { actor: scheduledActor = null } = {}) {
  const attackers = room.players.filter((actor) => actor.alive && actor.aiControlled && (!scheduledActor || actor === scheduledActor) && (roleSkills[actor.role] ?? []).some((skillId) => ATTACKS.has(skillId) && ready(room, actor, skillId)));
  for (const actor of attackers) refreshDeductions(room, actor);
  const ranked = attackers.flatMap((actor) => knownEnemies(room, actor).filter((target) => memoryOf(actor).knowledge[target.id]?.role).map((target) => ({ actor, target, score: enemyThreatScore(actor, target) })) ).sort((left, right) => right.score - left.score);
  for (const { actor } of ranked) { try { if (tryKnownAttack(room, actor)) return true; } catch { /* stale target */ } }
  for (const actor of attackers) {
    const memory = memoryOf(actor); const trustedReport = Object.entries(memory.reports).some(([targetId, report]) => { const target = room.players.find((player) => player.id === Number(targetId)); const reporter = room.players.find((player) => player.id === report.reporterId); return target?.alive && reporter && factionOf(report.role) !== factionOf(actor.role) && Math.max(report.evidence ?? 0, trustScore(actor, reporter)) >= .7; });
    if (trustedReport) { try { if (tryReportedAttack(room, actor)) return true; } catch { /* stale target */ } }
  }
  return false;
}

export function buildBotPlanningTurn(room, actor) {
  const memory = memoryOf(actor); ensureDoctrine(room, actor); refreshDeductions(room, actor); const faction = factionOf(actor.role); const actions = [];
  const add = (action) => actions.push({ ...action, id: `${action.type}:${action.skillId ?? ""}:${action.targetId ?? ""}:${action.role ?? ""}` });
  const available = roleSkills[actor.role] ?? [];

  const checkId = available.find((skillId) => CHECKS.has(skillId) && ready(room, actor, skillId));
  if (checkId) {
    const mine = factionOf(actor.role);
    for (const target of room.players) {
      const known = memory.knowledge[target.id]; const correctSide = (checkId === "ally-check") === (factionOf(target.announced) === mine);
      if (target.alive && target.id !== actor.id && target.announced !== "미공표" && correctSide && !isConfirmedAlly(room, actor, target) && !known?.role && !known?.excluded?.includes(target.announced)) add({ type: "skill", skillId: checkId, targetId: target.id, label: `${target.id}번 ${target.announced} 공표 확인`, purpose: "verify_claim" });
    }
  }
  for (const skillId of available.filter((id) => SCANS.has(id) && ready(room, actor, id))) {
    const roles = allowedScanRoles(room, actor, skillId);
    for (const target of room.players) {
      const known = memory.knowledge[target.id]; if (!target.alive || target.id === actor.id || known?.role || isConfirmedAlly(room, actor, target)) continue;
      const role = roles.includes(target.announced) && !known?.excluded?.includes(target.announced) ? target.announced : roles.find((candidate) => !known?.excluded?.includes(candidate));
      if (role) add({ type: "skill", skillId, targetId: target.id, role, label: `${target.id}번을 ${role}(으)로 스캔`, purpose: "discover_role" });
    }
  }
  for (const skillId of available.filter((id) => ["boss-check", "detective-check"].includes(id) && ready(room, actor, id))) {
    const expected = skillId === "boss-check" ? "마피아대부" : "사립탐정";
    for (const target of room.players.filter((player) => player.alive && player.id !== actor.id && !memory.knowledge[player.id]?.role && !memory.knowledge[player.id]?.excluded?.includes(expected) && !isConfirmedAlly(room, actor, player))) add({ type: "skill", skillId, targetId: target.id, label: `${target.id}번 ${expected} 여부 확인`, purpose: "find_special_ally" });
  }
  for (const skillId of available.filter((id) => ATTACKS.has(id) && ready(room, actor, id))) {
    for (const target of knownEnemies(room, actor)) if (memory.knowledge[target.id]?.role) add({ type: "skill", skillId, targetId: target.id, role: memory.knowledge[target.id].role, label: `${target.id}번 ${memory.knowledge[target.id].role} 공격`, purpose: "eliminate_enemy" });
    for (const [targetId, report] of Object.entries(memory.reports)) { const target = room.players.find((player) => player.id === Number(targetId)); if (target?.alive && !report.discredited && factionOf(report.role) !== faction) add({ type: "skill", skillId, targetId: target.id, role: report.role, reporterId: report.reporterId, label: `${target.id}번 ${report.role} 제보 기반 공격`, purpose: "act_on_intel" }); }
  }
  if (available.includes("leadership") && ready(room, actor, "leadership") && actor.announced === actor.role) {
    for (const role of formations[room.totalPlayers].filter((candidate) => factionOf(candidate) === faction && candidate !== actor.role && !Object.values(memory.knowledge).some((known) => known.role === candidate))) add({ type: "skill", skillId: "leadership", role, label: `리더십으로 ${role} 탐색`, purpose: "find_key_ally" });
  }
  if (available.includes("snipe-command") && ready(room, actor, "snipe-command")) for (const target of knownAllies(room, actor).filter((player) => memory.knowledge[player.id]?.role === "히트맨")) add({ type: "skill", skillId: "snipe-command", targetId: target.id, label: `${target.id}번 히트맨에게 저격명령`, purpose: "enable_ally_attack" });
  if (available.includes("successor") && ready(room, actor, "successor")) for (const target of knownAllies(room, actor).filter((player) => memory.knowledge[player.id]?.role === "마피아후계자")) add({ type: "skill", skillId: "successor", targetId: target.id, label: `${target.id}번을 후계자로 지정`, purpose: "secure_succession" });
  if (available.includes("snipe") && ready(room, actor, "snipe") && actor.snipeAuthorized) for (const target of knownEnemies(room, actor)) add({ type: "skill", skillId: "snipe", targetId: target.id, label: `${target.id}번 검증된 적 저격`, purpose: "eliminate_enemy" });
  if (available.includes("arrest") && ready(room, actor, "arrest")) for (const target of knownEnemies(room, actor).filter((player) => memory.knowledge[player.id]?.role === "마피아대부")) add({ type: "skill", skillId: "arrest", targetId: target.id, label: `${target.id}번 마피아대부 검거`, purpose: "win_game" });
  if (available.includes("support") && ready(room, actor, "support")) for (const target of knownAllies(room, actor)) add({ type: "skill", skillId: "support", targetId: target.id, label: `${target.id}번 아군에게 마나 지원`, purpose: "support_ally" });
  if (available.includes("revenge") && ready(room, actor, "revenge")) { const partnerRole = actor.role === "남자연인" ? "여자연인" : "남자연인"; const partnerEntry = Object.entries(memory.knowledge).find(([, known]) => known.role === partnerRole); const partner = partnerEntry ? room.players.find((player) => player.id === Number(partnerEntry[0])) : null; if (partner && !partner.alive) for (const target of knownEnemies(room, actor)) add({ type: "skill", skillId: "revenge", targetId: target.id, label: `${target.id}번 검증된 적에게 복수`, purpose: "eliminate_enemy" }); }
  for (const target of knownAllies(room, actor).filter((player) => !actor.alliances.has(player.id))) if (ready(room, actor, "ally-add")) add({ type: "ally", skillId: "ally-add", targetId: target.id, label: `${target.id}번 검증된 아군과 동맹`, purpose: "build_network" });
  if (actor.alliances.size && Object.values(memory.knowledge).some((known) => known.role || known.faction || known.excluded?.length)) add({ type: "share", label: "아직 공유하지 않은 조사 정보 전달", purpose: "share_intel" });
  if (ready(room, actor, "announce")) add({ type: "skill", skillId: "announce", role: actor.role, label: `${actor.role} 진명 공표`, purpose: "gain_mana" });

  const facts = room.players.filter((player) => player.id !== actor.id).map((player) => {
    const known = memory.knowledge[player.id]; const claim = memory.claims[player.id]; const report = memory.reports[player.id];
    return { seat: player.id, alive: player.alive, announced: player.announced, allied: actor.alliances.has(player.id), knownRole: known?.role ?? null, knownFaction: known?.faction ?? null, excludedRoles: known?.excluded ?? [], source: known?.source ?? null, confidence: known?.confidence ?? null, claimedRole: claim?.role ?? null, trust: trustScore(actor, player), reportedRole: report?.role ?? null, reportSource: report?.source ?? null, reportEvidence: report?.evidence ?? null };
  });
  return { actorId: actor.id, context: { self: { seat: actor.id, role: actor.role, faction, announced: actor.announced, mana: actor.mana, skills: available, cooldowns: actor.cooldowns }, facts, recentConversation: memory.conversation.slice(-8), currentGoal: memory.llmPlan?.goal ?? null }, actions };
}

export function executeBotPlannedAction(room, actor, action) {
  if (!action || !actor.alive || !actor.aiControlled) return false;
  const memory = memoryOf(actor);
  if (action.type === "share") return tryShareFinding(room, actor);
  if (action.type === "ally") { const target = room.player(action.targetId); if (!target.alive || !knownAllies(room, actor).some((ally) => ally.id === target.id)) return false; room.act(actor.id, { skillId: "ally-add", targetId: target.id }); whisperIntroduction(room, actor, target); return true; }
  if (action.type !== "skill" || !ready(room, actor, action.skillId)) return false;
  const target = action.targetId ? room.player(action.targetId) : null;
  room.act(actor.id, { skillId: action.skillId, targetId: action.targetId, role: action.role });
  if (target && CHECKS.has(action.skillId)) { if (actor.verdict?.success) { remember(actor, target, { role: target.announced, confidence: .8, source: "LLM 계획 공표 확인" }); memory.trust[target.id] = Math.max(memory.trust[target.id] ?? 0, .8); } else remember(actor, target, { confidence: .8, source: "LLM 계획 공표 확인 실패", excludedRole: target.announced }); }
  if (target && SCANS.has(action.skillId) && action.role) { if (actor.verdict?.success) remember(actor, target, { role: action.role, confidence: 1, source: "LLM 계획 스캔" }); else remember(actor, target, { source: "LLM 계획 스캔 실패", excludedRole: action.role }); }
  if (target && ATTACKS.has(action.skillId) && action.reporterId) gradeAttackReport(room, actor, target, memory.reports[target.id]);
  if (target && ["boss-check", "detective-check"].includes(action.skillId)) { const role = action.skillId === "boss-check" ? "마피아대부" : "사립탐정"; if (actor.verdict?.success) remember(actor, target, { role, confidence: 1, source: "LLM 계획 특수 확인" }); else remember(actor, target, { source: "LLM 계획 특수 확인 실패", excludedRole: role }); }
  if (action.skillId === "leadership" && actor.verdict?.success) { const found = room.players.find((player) => player.alive && player.role === action.role); if (found) remember(actor, found, { role: action.role, confidence: 1, source: "LLM 계획 리더십" }); }
  return true;
}

export function recordPublicDeath(room, target) {
  for (const observer of room.players.filter((player) => player.aiControlled)) {
    const memory = memoryOf(observer);
    remember(observer, target, { role: target.role, confidence: 1, source: "사후 직업 공개" });
    const investigationSkills = roleSkills[target.role] ?? [];
    const canValidateReport = (report) => {
      const sameFaction = factionOf(report.role) === factionOf(target.role);
      if (investigationSkills.some((skillId) => ["enemy-scan", "advanced-scan", "enemy-check"].includes(skillId)) && !sameFaction) return true;
      if (investigationSkills.includes("ally-check") && sameFaction) return true;
      if (investigationSkills.includes("boss-check") && report.role === "마피아대부") return true;
      return investigationSkills.includes("detective-check") && report.role === "사립탐정";
    };
    const validatedReports = Object.entries(memory.reports).filter(([, report]) => report.reporterId === target.id && canValidateReport(report));
    if (validatedReports.length) {
      memory.trust[target.id] = 1;
      memory.claims[target.id] = { role: target.role, trust: 1, source: "사후 직업 공개" };
      for (const [reportedTargetId, report] of validatedReports) {
        report.evidence = Math.max(report.evidence ?? .1, .85);
        report.source = `사망한 ${target.role}의 검증 가능한 공개 제보`;
        const reportedTarget = room.players.find((player) => player.id === Number(reportedTargetId));
        if (!reportedTarget?.alive) continue;
        remember(observer, reportedTarget, { role: report.role, confidence: .85, source: `${target.role} 사후 제보 인증` });
        if (factionOf(report.role) === factionOf(observer.role)) {
          memory.trust[reportedTarget.id] = Math.max(memory.trust[reportedTarget.id] ?? 0, .85);
          memory.claims[reportedTarget.id] = { role: report.role, trust: .85, source: `${target.role} 사후 제보 인증` };
        }
      }
    }
    const report = memory.reports[target.id]; if (!report) continue;
    const delta = report.role === target.role ? .55 : -.45;
    memory.trust[report.reporterId] = Math.max(-1, Math.min(1, (memory.trust[report.reporterId] ?? memory.claims[report.reporterId]?.trust ?? .15) + delta));
    if (memory.claims[report.reporterId]) memory.claims[report.reporterId].trust = memory.trust[report.reporterId];
    if (delta > 0) {
      const reporter = room.player(report.reporterId); const inferredFaction = factionOf(target.role) === "mafia" ? "citizen" : "mafia";
      remember(observer, reporter, { faction: inferredFaction, confidence: memory.trust[report.reporterId], source: "적중한 공개 제보" });
    }
    const claim = memory.claims[report.reporterId]; if (delta > 0 && claim?.role && memory.trust[report.reporterId] >= .7) remember(observer, room.player(report.reporterId), { role: claim.role, confidence: memory.trust[report.reporterId], source: "검증된 공개 제보" });
  }
}
