import { randomUUID } from "node:crypto";
import { botNames, factionOf, formations, MANA_INTERVAL, MANA_MAX, MANA_TICK, roleSkills, shuffle, skills } from "./game-config.js";
import { buildBotPlanningTurn, executeBotPlannedAction, recordPublicDeath, runInvestigationBot, runStrategicBot, runUrgentAttackBot, syncAllianceIntel } from "./bot-ai.js";
import { checkVictory } from "./game-rules.js";

const nowLabel = () => new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

export class SingleRoom {
  constructor({ random = Math.random, now = () => Date.now(), llmDirector = null, onAsyncChange = null, strategyMinIntervalMs = Number(process.env.OPENAI_STRATEGY_MIN_INTERVAL_MS ?? 30_000), strategyMaxCallsPerGame = Number(process.env.OPENAI_STRATEGY_MAX_CALLS_PER_GAME ?? 12) } = {}) { this.random = random; this.now = now; this.llmDirector = llmDirector; this.onAsyncChange = onAsyncChange; this.strategyMinIntervalMs = strategyMinIntervalMs; this.strategyMaxCallsPerGame = strategyMaxCallsPerGame; this.reset(); }
  reset() {
    this.phase = "lobby"; this.totalPlayers = 8; this.players = []; this.hostId = null; this.logs = [];
    this.chats = []; this.result = null; this.successorId = null; this.effect = null; this.publicInspections = []; this.leadershipDiscoveries = []; this.nextManaAt = null; this.botPlanInFlight = false; this.botPlannerCursor = 0; this.botRuleCursor = 0; this.botInvestigationCursor = 0; this.botTurnsSinceInvestigation = 0; this.strategyCallsThisGame = 0; this.lastStrategyAt = -Infinity;
  }
  join({ nickname, token, socket }) {
    const cleanName = String(nickname ?? "").trim().slice(0, 16);
    if (!cleanName) throw new Error("닉네임을 입력하세요.");
    const returning = token && this.players.find((player) => player.ownerToken === token && !player.isBot);
    if (returning) { returning.socket = socket; returning.connected = true; returning.aiControlled = false; returning.nickname = cleanName; return returning; }
    if (this.phase !== "lobby") throw new Error("게임 진행 중에는 새 좌석에 참가할 수 없습니다.");
    if (this.players.some((player) => !player.isBot && player.nickname === cleanName)) throw new Error("이미 사용 중인 닉네임입니다.");
    if (this.players.length >= 13) throw new Error("좌석이 모두 찼습니다.");
    const player = this.createPlayer(this.nextSeat(), cleanName, false, socket, randomUUID());
    this.players.push(player); if (this.hostId === null) this.hostId = player.id; this.totalPlayers = Math.max(this.totalPlayers, this.players.length); return player;
  }
  createPlayer(id, nickname, isBot, socket = null, ownerToken = null) {
    return { id, nickname, ownerToken, socket, connected: true, isBot, aiControlled: isBot, nextAiActionAt: null, alive: true, role: null, announced: "미공표", mana: 20, cooldowns: {}, usedOnce: {}, alliances: new Set(), incomingAlliances: new Set(), privateLogs: [], lowAttackFails: 0, whisper: null, verdict: null, notification: null, snipeAuthorized: false, snipeCommanderId: null };
  }
  disconnect(socket) {
    const player = this.players.find((entry) => entry.socket === socket); if (!player) return;
    player.socket = null; player.connected = false;
    if (this.phase === "game" && !player.isBot && player.alive) { player.aiControlled = true; player.nextAiActionAt = this.now() + this.aiReactionDelay(); this.finishIfOnlyAi(); }
    if (this.phase === "lobby") { this.players = this.players.filter((entry) => entry !== player); if (this.hostId === player.id) this.hostId = this.players.find((entry) => !entry.isBot)?.id ?? null; }
  }
  setTotal(playerId, total) {
    if (playerId !== this.hostId) throw new Error("방장만 총인원을 변경할 수 있습니다.");
    const value = Number(total); const humans = this.players.filter((player) => !player.isBot).length;
    if (!Number.isInteger(value) || value < Math.max(8, humans) || value > 13) throw new Error("총인원은 현재 인원 이상, 8~13명이어야 합니다.");
    this.totalPlayers = value;
  }
  start(playerId) {
    if (playerId !== this.hostId) throw new Error("방장만 게임을 시작할 수 있습니다.");
    if (this.phase !== "lobby") throw new Error("이미 게임이 시작되었습니다.");
    const botCount = this.totalPlayers - this.players.length;
    for (let index = 0; index < botCount; index += 1) this.players.push(this.createPlayer(this.nextSeat(), botNames[index], true));
    const roles = shuffle(formations[this.totalPlayers], this.random);
    shuffle(this.players, this.random).forEach((player, index) => { player.role = roles[index]; player.privateLogs.push({ time: nowLabel(), text: `직업이 ${player.role}(으)로 배정되었습니다.` }); });
    this.players.sort((a, b) => a.id - b.id);
    const maleLover = this.players.find((player) => player.role === "남자연인"); const femaleLover = this.players.find((player) => player.role === "여자연인");
    if (maleLover && femaleLover) {
      this.private(maleLover, `연인 정보 · ${femaleLover.id}번 ${femaleLover.nickname}은(는) 여자연인입니다.`);
      this.private(femaleLover, `연인 정보 · ${maleLover.id}번 ${maleLover.nickname}은(는) 남자연인입니다.`);
      maleLover.aiMemory = { knowledge: { [femaleLover.id]: { role: femaleLover.role, faction: "citizen", confidence: 1, source: "연인", excluded: [] } }, sharedWith: {}, lastPublicAt: 0, recentLines: [] };
      femaleLover.aiMemory = { knowledge: { [maleLover.id]: { role: maleLover.role, faction: "citizen", confidence: 1, source: "연인", excluded: [] } }, sharedWith: {}, lastPublicAt: 0, recentLines: [] };
    }
    this.phase = "game"; this.nextManaAt = this.now() + MANA_INTERVAL;
    for (const player of this.players.filter((entry) => entry.aiControlled)) player.nextAiActionAt = this.now() + this.aiActionDelay();
    this.addLog("⚔", `${this.totalPlayers}인 게임이 시작되었습니다.`, "plain");
  }
  restart(playerId) {
    if (playerId !== this.hostId) throw new Error("방장만 다음 게임 로비를 열 수 있습니다.");
    if (!this.result) throw new Error("게임 종료 후에만 다음 게임을 준비할 수 있습니다.");
    const humans = this.players.filter((player) => !player.isBot && player.connected).map((player) => this.createPlayer(player.id, player.nickname, false, player.socket, player.ownerToken));
    this.reset(); this.players = humans; this.hostId = humans.find((player) => player.id === playerId)?.id ?? humans[0]?.id ?? null; this.totalPlayers = Math.max(8, humans.length);
  }
  act(playerId, payload) {
    this.assertGame(); const actor = this.player(playerId); if (!actor.alive) throw new Error("사망한 플레이어는 행동할 수 없습니다.");
    const skillId = String(payload.skillId ?? ""); const skill = skills[skillId]; if (!skill) throw new Error("존재하지 않는 스킬입니다.");
    if (skillId !== "announce" && ![...(roleSkills[actor.role] ?? []), "ally-add", "ally-remove"].includes(skillId)) throw new Error("현재 직업이 사용할 수 없는 스킬입니다.");
    const current = this.now(); if ((actor.cooldowns[skillId] ?? 0) > current) throw new Error("아직 쿨타임입니다.");
    if (skill.once && actor.usedOnce[skillId]) throw new Error("게임 중 한 번만 사용할 수 있습니다.");
    if (actor.mana < skill.cost) throw new Error(`마나 부족 · 필요 ${skill.cost} / 현재 ${actor.mana}`);
    const target = skill.target ? this.player(Number(payload.targetId)) : null;
    if (target && (!target.alive || target.id === actor.id)) throw new Error("대상을 선택할 수 없습니다.");
    const guessedRole = payload.role ? String(payload.role) : null;
    if (skill.role && !formations[this.totalPlayers].includes(guessedRole)) throw new Error("유효한 직업을 선택하세요.");
    if (skillId === "enemy-scan" && ((factionOf(actor.role) === "mafia" && guessedRole === "경찰반장") || (factionOf(actor.role) === "citizen" && guessedRole === "마피아대부"))) throw new Error("적군 스캔으로 상대 진영 리더를 지정할 수 없습니다.");
    if (skillId === "advanced-scan" && guessedRole === "경찰반장") throw new Error("상급 스캔으로 적 진영 리더인 경찰반장을 지정할 수 없습니다.");
    if (skill.text && !String(payload.text ?? "").trim()) throw new Error("내용을 입력하세요.");
    this.validateSpecial(actor, skillId, target);
    if (["upper-attack", "lower-attack"].includes(skillId) && guessedRole === "경찰반장" && this.players.some((player) => player.alive && player.role === "순찰경찰")) {
      const message = "순찰경찰이 살아 있어 경찰반장으로 공격할 수 없습니다.";
      this.private(actor, message); this.verdict(actor, "공격 불가", false, message); return;
    }
    actor.mana -= skill.cost; if (!skill.once) actor.cooldowns[skillId] = current + skill.cooldown * 1000; if (skill.once) actor.usedOnce[skillId] = true;
    this.resolve(actor, skillId, target, guessedRole, String(payload.text ?? "").trim().slice(0, 200));
    if (!this.result) this.result = checkVictory(this.players, this.successorId);
    if (this.result) { const label = this.result.winner === "mafia" ? "마피아 진영 승리" : this.result.winner === "citizen" ? "시민 진영 승리" : "무승부"; if (this.logs.at(-1)?.text !== `게임 종료 · ${label}`) this.addLog("🏁", `게임 종료 · ${label}`, "danger"); }
  }
  validateSpecial(actor, skillId, target) {
    if (["ally-check", "enemy-check"].includes(skillId)) {
      if (target.announced === "미공표") throw new Error("확인 계열은 공표한 대상만 선택할 수 있습니다.");
      const same = factionOf(target.announced) === factionOf(actor.role);
      if ((skillId === "ally-check") !== same) throw new Error("공표 진영에 맞는 대상만 선택할 수 있습니다.");
    }
    if (skillId === "leadership" && actor.announced !== actor.role) throw new Error("진명 공표 후에만 리더십을 사용할 수 있습니다.");
    if (skillId === "snipe" && !actor.snipeAuthorized) throw new Error("마피아대부가 히트맨에게 저격명령을 내려야 합니다.");
    if (skillId === "revenge") { const partner = this.players.find((player) => player.role === (actor.role === "남자연인" ? "여자연인" : "남자연인")); if (!partner || partner.alive) throw new Error("연인이 사망한 뒤 사용할 수 있습니다."); }
    if (skillId === "ally-add" && actor.alliances.has(target.id)) throw new Error("이미 동맹입니다.");
    if (skillId === "ally-remove" && !actor.alliances.has(target.id)) throw new Error("현재 동맹이 아닙니다.");
  }
  resolve(actor, skillId, target, guessedRole, text) {
    if (skillId === "announce") { actor.announced = guessedRole; const gain = guessedRole === actor.role ? 10 : 5; actor.mana = Math.min(MANA_MAX, actor.mana + gain); const message = `${guessedRole} 공표 완료 · 마나 +${gain}`; this.addLog("📜", `${actor.nickname}이(가) ${guessedRole}(을)를 공표했습니다.`, "plain"); this.private(actor, message); this.verdict(actor, "공표 완료", true, message); return; }
    if (skillId === "deception") { const message = "기만은 지속 효과입니다. 시민 직업 공표 시 시민의 아군 확인을 속입니다."; this.private(actor, message); this.verdict(actor, "기만 활성", true, message); return; }
    if (skillId === "leadership") { const match = this.players.find((player) => player.alive && player.role === guessedRole); const message = match ? `${guessedRole}은(는) ${match.id}번 ${match.nickname}입니다.` : `생존한 ${guessedRole}은(는) 없습니다.`; if (match) { const at = this.now(); this.leadershipDiscoveries.push({ leaderId: actor.id, leaderRole: actor.role, targetId: match.id, role: guessedRole, at }); this.leadershipDiscoveries = this.leadershipDiscoveries.filter((entry) => at - entry.at <= 45_000).slice(-10); } this.private(actor, `리더십 결과 · ${message}`); this.verdict(actor, "리더십 서치", Boolean(match), message); return; }
    if (skillId === "proclamation") { if (!text) throw new Error("공문 내용을 입력하세요."); const message = "공문을 전체 플레이어에게 발송했습니다."; this.chats.push({ id: this.now(), from: actor.id, text: `[공문] ${text}`, channel: "public" }); this.addLog("📢", `공무원 공문 · ${text}`, "plain"); this.private(actor, message); this.verdict(actor, "공문 발송", true, message); return; }
    if (skillId === "ally-add" || skillId === "ally-remove") {
      const adding = skillId === "ally-add";
      if (adding) { actor.alliances.add(target.id); target.alliances.add(actor.id); target.incomingAlliances.add(actor.id); }
      else { actor.alliances.delete(target.id); target.alliances.delete(actor.id); target.incomingAlliances.delete(actor.id); actor.incomingAlliances.delete(target.id); }
      const actorMessage = adding ? `${target.id}번 ${target.nickname}와 동맹이 되었습니다.` : `${target.id}번 ${target.nickname}와 적대관계가 되었습니다.`;
      const targetMessage = adding ? `${actor.id}번 ${actor.nickname}에게 동맹을 받았습니다.` : `${actor.id}번 ${actor.nickname}와 적대관계가 되었습니다.`;
      this.private(actor, actorMessage); this.private(target, targetMessage);
      this.notify(actor, adding ? "동맹 체결" : "동맹 파기", actorMessage, adding ? "alliance" : "hostile");
      this.notify(target, adding ? "동맹 요청 수신" : "동맹 파기", targetMessage, adding ? "alliance" : "hostile");
      if (adding) { syncAllianceIntel(this, actor, target); syncAllianceIntel(this, target, actor); }
      return;
    }
    if (["ally-scan", "enemy-scan", "advanced-scan"].includes(skillId)) { this.effect = { id: target.id, type: "inspect", until: this.now() + 1500 }; const hit = guessedRole === target.role; this.recordInspection(target, { actor, skillId, announced: target.announced, success: hit }); const message = hit ? `${target.nickname}은(는) ${target.role}입니다.` : `${target.nickname}은(는) ${guessedRole}이(가) 아닙니다.`; this.addLog("🔎", `누군가가 ${target.nickname}을(를) 살피고 있습니다.`, "scan"); this.private(actor, `스캔 ${hit ? "성공" : "실패"} · ${message}`); this.verdict(actor, "스캔 판정", hit, message); return; }
    if (["ally-check", "enemy-check"].includes(skillId)) { this.effect = { id: target.id, type: "inspect", until: this.now() + 1500 }; const announced = target.announced; const fooled = skillId === "ally-check" && target.role === "스파이" && factionOf(announced) === "citizen" && factionOf(actor.role) === "citizen"; const hit = fooled || announced === target.role; this.recordInspection(target, { actor, skillId, announced, success: hit }); const message = `${target.nickname}의 ${announced} 공표는 ${hit ? "진명" : "가명"}입니다.`; this.addLog("🔎", `누군가가 ${target.nickname}을(를) 살피고 있습니다.`, "scan"); this.private(actor, message); this.verdict(actor, "공표 확인", hit, message); return; }
    if (skillId === "boss-check" || skillId === "detective-check") { this.effect = { id: target.id, type: "inspect", until: this.now() + 1500 }; const role = skillId === "boss-check" ? "마피아대부" : "사립탐정"; const hit = target.role === role; this.recordInspection(target, { actor, skillId, announced: target.announced, success: hit }); const message = `${target.nickname}은(는) ${role}${hit ? "이 맞습니다" : "이 아닙니다"}.`; this.private(actor, message); this.verdict(actor, "직업 확인", hit, message); return; }
    if (skillId === "support") { const message = `${target.nickname}에게 마나 30을 지원했습니다.`; target.mana = Math.min(MANA_MAX, target.mana + 30); this.addLog("+", `공무원이 ${target.nickname}에게 마나를 지원합니다.`, "mana"); this.private(actor, message); this.private(target, "공무원에게서 마나 30을 지원받았습니다."); this.verdict(actor, "지원 완료", true, message); return; }
    if (skillId === "successor") { const hit = target.role === "마피아후계자"; const message = hit ? `${target.nickname}을(를) 후계자로 지정했습니다.` : `${target.nickname}은(는) 마피아후계자가 아닙니다.`; if (hit) this.successorId = target.id; this.private(actor, message); this.verdict(actor, "후계자 지정", hit, message); this.addLog("♛", "마피아대부가 후계자를 지정했습니다.", "plain"); return; }
    if (skillId === "snipe-command") {
      const hit = target.role === "히트맨";
      if (hit) { target.snipeAuthorized = true; target.snipeCommanderId = actor.id; this.private(actor, `${target.nickname}에게 저격명령을 내렸습니다.`); this.private(target, "마피아대부의 저격명령을 받았습니다. 저격 1회가 활성화됩니다."); }
      else this.private(actor, `${target.nickname}은(는) 히트맨이 아닙니다. 저격명령이 실패했습니다.`);
      this.verdict(actor, "저격명령", hit, hit ? `${target.nickname}의 저격을 활성화했습니다.` : `${target.nickname}은(는) 히트맨이 아닙니다.`);
      this.addLog("⚑", `마피아대부의 저격명령이 ${hit ? "성공했습니다" : "실패했습니다"}.`, "danger"); return;
    }
    if (skillId === "arrest") { this.effect = { id: target.id, type: "attack", until: this.now() + 1500 }; const hit = target.role === "마피아대부"; const message = hit ? `${target.nickname} 검거에 성공했습니다.` : `${target.nickname}은(는) 마피아대부가 아닙니다. 검거에 실패했습니다.`; if (!hit) this.result = { winner: "mafia", reason: "경찰반장의 검거 실패" }; else { this.kill(target, "검거"); const successorAlive = this.successorId && this.player(this.successorId).alive; if (!successorAlive) this.result = { winner: "citizen", reason: "마피아대부 검거 성공" }; } this.private(actor, message); this.verdict(actor, "검거 판정", hit, message); return; }
    if (["snipe", "revenge"].includes(skillId)) { this.effect = { id: target.id, type: "attack", until: this.now() + 1500 }; if (skillId === "snipe") { actor.snipeAuthorized = false; actor.snipeCommanderId = null; } const title = skillId === "snipe" ? "저격 완료" : "복수 완료"; const message = `${target.nickname}을(를) 즉시 처치했습니다.`; this.kill(target, skillId === "snipe" ? "저격" : "복수"); this.private(actor, message); this.verdict(actor, title, true, message); return; }
    if (["upper-attack", "lower-attack"].includes(skillId)) {
      this.effect = { id: target.id, type: "attack", until: this.now() + 1500 };
      if (guessedRole === target.role) { this.kill(target, "공격"); const message = `${target.nickname} 공격 명중 · 실제 직업은 ${target.role}입니다.`; this.private(actor, message); this.verdict(actor, "공격 판정", true, message); }
      else {
        this.addLog("⚔", `누군가가 ${target.nickname}을(를) 공격했지만 실패했습니다.`, "danger");
        const reason = `${target.nickname}은(는) ${guessedRole}이(가) 아님`;
        if (skillId === "lower-attack") {
          actor.lowAttackFails += 1;
          this.private(actor, `하급공격 실패 ${actor.lowAttackFails}/2 · ${reason}`);
          this.verdict(actor, "공격 판정", false, `하급공격 실패 ${actor.lowAttackFails}/2 · ${reason}`);
          if (actor.lowAttackFails >= 2) this.kill(actor, "하급공격 2회 실패");
        } else { this.private(actor, `공격 실패 · ${reason}`); this.verdict(actor, "공격 판정", false, reason); }
      }
    }
  }
  kill(target, cause) { if (!target.alive) return; target.alive = false; this.addLog("☠", `${target.nickname}이(가) ${cause}(으)로 사망했습니다. 직업은 ${target.role}입니다.`, "danger"); recordPublicDeath(this, target); this.finishIfOnlyAi(); }
  chat(playerId, payload) {
    this.assertGame(); const actor = this.player(playerId); const text = String(payload.text ?? "").trim().slice(0, 160); if (!text) return;
    const whisper = text.match(/^-(\d+)\s+(.+)$/s);
    if (whisper) { const target = this.player(Number(whisper[1])); const body = whisper[2].trim(); const sentAt = this.now(); const message = { from: actor.id, to: target.id, text: body, until: sentAt + 5500 }; actor.whisper = message; target.whisper = message; this.private(actor, `${target.id}번 ${target.nickname}에게 귓말 · ${body}`); this.private(target, `${actor.id}번 ${actor.nickname}의 귓말 · ${body}`); if (!actor.aiControlled && target.aiControlled) { target.aiMemory ??= {}; target.aiMemory.inbox ??= []; const incoming = { id: sentAt, from: actor.id, text: body, channel: "whisper", at: sentAt }; target.aiMemory.inbox.push(incoming); this.enrichAiMessage(actor, [target], incoming); this.wakeAi(target, sentAt); } return; }
    const allianceText = text.match(/^\/a\s+(.+)$/s)?.[1] ?? (payload.channel === "alliance" ? text : null);
    if (allianceText) { if (!actor.alliances.size) throw new Error("동맹이 없습니다."); const sentAt = this.now(); this.chats.push({ id: sentAt, from: actor.id, text: allianceText, channel: "alliance", recipients: [actor.id, ...actor.alliances] }); if (!actor.aiControlled) { const listeners = this.players.filter((player) => actor.alliances.has(player.id) && player.alive && player.aiControlled); const incomingMessages = []; for (const listener of listeners) { listener.aiMemory ??= {}; listener.aiMemory.inbox ??= []; const incoming = { id: sentAt, from: actor.id, text: allianceText, channel: "alliance", at: sentAt }; listener.aiMemory.inbox.push(incoming); incomingMessages.push(incoming); this.wakeAi(listener, sentAt); } if (listeners.length) this.enrichAiMessage(actor, listeners, incomingMessages); } }
    else { const sentAt = this.now(); this.chats.push({ id: sentAt, from: actor.id, text, channel: "public" }); const relayToAi = !actor.aiControlled || payload.aiBroadcast === true; const listeners = relayToAi ? this.players.filter((player) => player.alive && player.aiControlled && player.id !== actor.id) : []; const incomingMessages = listeners.map((listener, index) => { listener.aiMemory ??= {}; listener.aiMemory.inbox ??= []; const incoming = { id: sentAt, from: actor.id, text, channel: "public", at: sentAt, respond: !actor.aiControlled && index === 0 }; listener.aiMemory.inbox.push(incoming); this.wakeAi(listener, sentAt, 900); return incoming; }); if (!actor.aiControlled && listeners.length) this.enrichAiMessage(actor, listeners, incomingMessages); }
    this.chats = this.chats.slice(-50);
  }
  enrichAiMessage(sender, listeners, incomingOrMessages) {
    if (!this.llmDirector?.enabled) return;
    const messages = Array.isArray(incomingOrMessages) ? incomingOrMessages : [incomingOrMessages]; const originalText = messages[0]?.text; if (!originalText) return;
    for (const message of messages) message.llmPending = true;
    this.llmDirector.interpret({ text: originalText, channel: messages[0].channel, senderId: sender.id, recipientIds: listeners.map((listener) => listener.id), visiblePlayers: this.players.map((player) => ({ id: player.id, nickname: player.nickname, alive: player.alive, announced: player.announced })) }).then((interpretation) => {
      for (const message of messages) message.llmPending = false;
      if (interpretation && interpretation.confidence >= .55) {
        for (const message of messages) { message.originalText = message.text; message.text = interpretation.canonicalText ? `${message.text}\n${interpretation.canonicalText}` : message.text; message.llm = interpretation; }
        for (const listener of listeners) { listener.aiMemory ??= {}; listener.aiMemory.llmPlan = { goal: interpretation.strategicIntent, confidence: interpretation.confidence, at: this.now(), sourceMessageId: messages[0].id }; }
      }
      for (const listener of listeners) this.wakeAi(listener, this.now(), 100);
      this.onAsyncChange?.();
    });
  }
  tick() {
    if (this.phase !== "game" || this.result) return false;
    if (this.finishIfOnlyAi()) return true;
    const current = this.now(); let changed = false;
    if (current >= this.nextManaAt) {
      for (const player of this.players) player.mana = Math.min(MANA_MAX, player.mana + MANA_TICK + player.incomingAlliances.size * 10);
      this.nextManaAt = current + MANA_INTERVAL; this.addLog("+", `마나 보급 · 기본 +${MANA_TICK}, 받은 동맹당 +10`, "mana"); changed = true;
    }
    const dueBots = this.players
      .filter((player) => player.alive && player.aiControlled && (player.nextAiActionAt ?? Infinity) <= current)
      .sort((left, right) => (left.nextAiActionAt - right.nextAiActionAt) || (left.id - right.id));
    for (const actor of dueBots) {
      if (this.result) break;
      if (!actor.alive || !actor.aiControlled) continue;
      this.runBot(actor);
      actor.nextAiActionAt = current + this.aiActionDelay();
      changed = true;
    }
    if (this.effect && current >= this.effect.until) { this.effect = null; changed = true; }
    return true;
  }
  aiActionDelay() { return 2500 + Math.floor(this.random() * 2500); }
  aiReactionDelay() { return 650 + Math.floor(this.random() * 850); }
  wakeAi(actor, sentAt = this.now(), minimumDelay = null) {
    if (!actor?.alive || !actor.aiControlled) return;
    const delay = minimumDelay ?? (this.llmDirector?.enabled ? 2200 : this.aiReactionDelay());
    actor.nextAiActionAt = Math.min(actor.nextAiActionAt ?? Infinity, sentAt + delay);
  }
  runBot(actor = null) {
    if (!actor) {
      if (this.llmDirector?.enabled) {
        if (runUrgentAttackBot(this)) return true;
        const candidates = this.players
          .filter((player) => player.alive && player.aiControlled)
          .filter((player) => buildBotPlanningTurn(this, player).actions.length);
        if (!candidates.length) return Boolean(runStrategicBot(this, { fair: true }));
        return this.runBot(candidates[this.botPlannerCursor % candidates.length]);
      }
      if (runUrgentAttackBot(this)) return true;
      if (runInvestigationBot(this, { fair: true })) return true;
      return Boolean(runStrategicBot(this, { fair: true }));
    }
    if (!actor?.alive || !actor.aiControlled) return false;
    const waiting = Boolean(actor.aiMemory?.inbox?.length);
    if (waiting && runStrategicBot(this, { actor })) return true;
    if (runUrgentAttackBot(this, { actor })) return true;
    if (!this.llmDirector?.enabled) { if (runInvestigationBot(this, { actor })) return true; return runStrategicBot(this, { actor }); }
    this.botTurnsSinceInvestigation += 1;
    if (this.botTurnsSinceInvestigation >= 3 && runInvestigationBot(this, { actor })) { this.botTurnsSinceInvestigation = 0; return true; }
    if (this.strategyCallsThisGame >= this.strategyMaxCallsPerGame || this.now() - this.lastStrategyAt < this.strategyMinIntervalMs) return runStrategicBot(this, { actor });
    if (this.botPlanInFlight) return false;
    const bots = [actor];
    const turns = bots.map((candidate) => ({ actor: candidate, turn: buildBotPlanningTurn(this, candidate) })).filter(({ turn }) => turn.actions.length);
    if (!turns.length) return runStrategicBot(this, { actor });
    const selected = turns[this.botPlannerCursor % turns.length]; this.botPlannerCursor += 1; this.botPlanInFlight = true; this.strategyCallsThisGame += 1; this.lastStrategyAt = this.now();
    this.llmDirector.planTurn(selected.turn).then((plan) => {
      if (this.phase !== "game" || this.result || !this.players.includes(selected.actor) || !selected.actor.alive || !selected.actor.aiControlled) return;
      const action = plan?.confidence >= .5 ? selected.turn.actions.find((candidate) => candidate.id === plan.actionId) : null;
      let acted = false;
      try { acted = executeBotPlannedAction(this, selected.actor, action); if (plan && selected.actor.aiMemory) selected.actor.aiMemory.llmPlan = { goal: plan.nextGoal, reason: plan.reason, confidence: plan.confidence, at: this.now() }; }
      catch { acted = false; }
      if (!acted) runStrategicBot(this, { actor: selected.actor });
    }).finally(() => { this.botPlanInFlight = false; selected.actor.nextAiActionAt = this.now() + 800; this.onAsyncChange?.(); });
    return true;
  }
  finishIfOnlyAi() {
    if (this.phase !== "game" || this.result) return Boolean(this.result);
    const living = this.players.filter((player) => player.alive);
    if (!living.length || !living.every((player) => player.aiControlled)) return false;
    this.result = checkVictory(this.players, this.successorId) ?? { winner: "draw", reason: "생존한 인간 플레이어가 없어 자동 종료" };
    const label = this.result.winner === "mafia" ? "마피아 진영 승리" : this.result.winner === "citizen" ? "시민 진영 승리" : "무승부";
    this.addLog("🏁", `게임 종료 · ${label}`, "danger"); return true;
  }
  snapshotFor(viewer) {
    const current = this.now(); return {
      phase: this.phase, totalPlayers: this.totalPlayers, hostId: this.hostId, yourSeatId: viewer.id, yourRole: viewer.role,
      mana: viewer.mana, nextManaIn: this.nextManaAt ? Math.max(0, Math.ceil((this.nextManaAt - current) / 1000)) : 0,
      cooldowns: Object.fromEntries(Object.entries(viewer.cooldowns).map(([id, until]) => [id, Math.max(0, Math.ceil((until - current) / 1000))])),
      usedOnce: viewer.usedOnce, alliances: [...viewer.alliances], logs: this.logs.slice(-60), privateLogs: viewer.privateLogs.slice(-40), lowAttackFails: viewer.lowAttackFails, result: this.result,
      snipeAuthorized: viewer.snipeAuthorized,
      effect: this.effect && this.effect.until > current ? { id: this.effect.id, type: this.effect.type } : null,
      verdict: viewer.verdict && viewer.verdict.until > current ? { id: viewer.verdict.id, title: viewer.verdict.title, success: viewer.verdict.success, message: viewer.verdict.message } : null,
      notification: viewer.notification && viewer.notification.until > current ? { id: viewer.notification.id, title: viewer.notification.title, message: viewer.notification.message, tone: viewer.notification.tone } : null,
      whisper: viewer.whisper && viewer.whisper.until > current ? { from: viewer.whisper.from, to: viewer.whisper.to, text: viewer.whisper.text } : null,
      chats: this.chats.filter((chat) => chat.channel === "public" || chat.recipients?.includes(viewer.id)).map(({ recipients, ...chat }) => chat),
      players: this.players.map((player) => { const loverVisible = (viewer.role === "남자연인" && player.role === "여자연인") || (viewer.role === "여자연인" && player.role === "남자연인"); return { id: player.id, nickname: player.nickname, connected: player.connected, isBot: player.isBot, aiControlled: player.aiControlled, alive: player.alive, announced: player.announced, faction: player.id === viewer.id || loverVisible || !player.alive || this.result ? factionOf(player.role) : null, role: player.id === viewer.id || loverVisible || !player.alive || this.result ? player.role : null }; }),
    };
  }
  addLog(icon, text, tone) { this.logs.push({ time: nowLabel(), icon, text, tone }); this.logs = this.logs.slice(-60); }
  recordInspection(target, { actor = null, skillId = null, announced = target.announced, success = null } = {}) { const at = this.now(); this.publicInspections.push({ targetId: target.id, actorId: actor?.id ?? null, skillId, announced, success, at }); this.publicInspections = this.publicInspections.filter((entry) => at - entry.at <= 30_000).slice(-20); }
  private(player, text) { player.privateLogs.push({ time: nowLabel(), text }); player.privateLogs = player.privateLogs.slice(-40); }
  verdict(player, title, success, message) { player.verdict = { id: this.now() + this.random(), title, success, message, until: this.now() + 3000 }; }
  notify(player, title, message, tone) { player.notification = { id: this.now() + this.random(), title, message, tone, until: this.now() + 3000 }; }
  player(id) { const player = this.players.find((entry) => entry.id === id); if (!player) throw new Error("플레이어를 찾을 수 없습니다."); return player; }
  assertGame() { if (this.phase !== "game" || this.result) throw new Error("진행 중인 게임이 없습니다."); }
  nextSeat() { for (let id = 1; id <= 13; id += 1) if (!this.players.some((player) => player.id === id)) return id; throw new Error("빈 좌석이 없습니다."); }
}
