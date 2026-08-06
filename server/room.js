import { randomUUID } from "node:crypto";
import { botNames, factionOf, formations, MANA_INTERVAL, MANA_MAX, MANA_TICK, roleSkills, shuffle, skills } from "./game-config.js";
import { checkVictory } from "./game-rules.js";

const nowLabel = () => new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

export class SingleRoom {
  constructor({ random = Math.random, now = () => Date.now() } = {}) { this.random = random; this.now = now; this.reset(); }
  reset() {
    this.phase = "lobby"; this.totalPlayers = 8; this.players = []; this.hostId = null; this.logs = [];
    this.chats = []; this.result = null; this.successorId = null; this.effect = null; this.nextManaAt = null; this.nextBotAt = null;
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
    return { id, nickname, ownerToken, socket, connected: true, isBot, aiControlled: isBot, alive: true, role: null, announced: "미공표", mana: 20, cooldowns: {}, usedOnce: {}, alliances: new Set(), privateLogs: [], lowAttackFails: 0, whisper: null };
  }
  disconnect(socket) {
    const player = this.players.find((entry) => entry.socket === socket); if (!player) return;
    player.socket = null; player.connected = false;
    if (this.phase === "game" && !player.isBot && player.alive) player.aiControlled = true;
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
    this.players.sort((a, b) => a.id - b.id); this.phase = "game"; this.nextManaAt = this.now() + MANA_INTERVAL; this.nextBotAt = this.now() + 2500;
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
    if (actor.mana < skill.cost) throw new Error(`마나가 ${skill.cost} 필요합니다.`);
    const target = skill.target ? this.player(Number(payload.targetId)) : null;
    if (target && (!target.alive || target.id === actor.id)) throw new Error("대상을 선택할 수 없습니다.");
    const guessedRole = payload.role ? String(payload.role) : null;
    if (skill.role && !formations[this.totalPlayers].includes(guessedRole)) throw new Error("유효한 직업을 선택하세요.");
    if (skillId === "enemy-scan" && ((factionOf(actor.role) === "mafia" && guessedRole === "경찰반장") || (factionOf(actor.role) === "citizen" && guessedRole === "마피아대부"))) throw new Error("적군 스캔으로 상대 진영 리더를 지정할 수 없습니다.");
    if (skill.text && !String(payload.text ?? "").trim()) throw new Error("내용을 입력하세요.");
    this.validateSpecial(actor, skillId, target);
    actor.mana -= skill.cost; actor.cooldowns[skillId] = current + skill.cooldown * 1000; if (skill.once) actor.usedOnce[skillId] = true;
    this.resolve(actor, skillId, target, guessedRole, String(payload.text ?? "").trim().slice(0, 200));
    if (!this.result) this.result = checkVictory(this.players, this.successorId);
    if (this.result) this.addLog("🏁", `게임 종료 · ${this.result.winner === "mafia" ? "마피아" : "시민"} 진영 승리`, "danger");
  }
  validateSpecial(actor, skillId, target) {
    if (["ally-check", "enemy-check"].includes(skillId)) {
      if (target.announced === "미공표") throw new Error("확인 계열은 공표한 대상만 선택할 수 있습니다.");
      const same = factionOf(target.announced) === factionOf(actor.role);
      if ((skillId === "ally-check") !== same) throw new Error("공표 진영에 맞는 대상만 선택할 수 있습니다.");
    }
    if (skillId === "leadership" && actor.announced !== actor.role) throw new Error("진명 공표 후에만 리더십을 사용할 수 있습니다.");
    if (skillId === "snipe" && !this.players.some((player) => player.role === "마피아대부" && player.usedOnce.leadership)) throw new Error("대부가 리더십으로 저격 명령을 내려야 합니다.");
    if (skillId === "revenge") { const partner = this.players.find((player) => player.role === (actor.role === "남자연인" ? "여자연인" : "남자연인")); if (!partner || partner.alive) throw new Error("연인이 사망한 뒤 사용할 수 있습니다."); }
    if (skillId === "ally-add" && actor.alliances.has(target.id)) throw new Error("이미 동맹입니다.");
    if (skillId === "ally-remove" && !actor.alliances.has(target.id)) throw new Error("현재 동맹이 아닙니다.");
  }
  resolve(actor, skillId, target, guessedRole, text) {
    if (skillId === "announce") { actor.announced = guessedRole; const gain = guessedRole === actor.role ? 10 : 5; actor.mana = Math.min(MANA_MAX, actor.mana + gain); this.addLog("📜", `${actor.nickname}이(가) ${guessedRole}(을)를 공표했습니다.`, "plain"); this.private(actor, `공표 완료 · 마나 +${gain}`); return; }
    if (skillId === "deception") { this.private(actor, "기만은 지속 효과입니다. 시민 직업 공표 시 시민의 아군 확인을 속입니다."); return; }
    if (skillId === "leadership") { const match = this.players.find((player) => player.alive && player.role === guessedRole); this.private(actor, match ? `리더십 결과 · ${guessedRole}은(는) ${match.id}번 ${match.nickname}` : `리더십 결과 · 생존한 ${guessedRole} 없음`); if (actor.role === "마피아대부") this.addLog("⚑", "마피아대부가 저격 명령을 내렸습니다.", "danger"); return; }
    if (skillId === "proclamation") { if (!text) throw new Error("공문 내용을 입력하세요."); this.chats.push({ id: this.now(), from: actor.id, text: `[공문] ${text}`, channel: "public" }); this.addLog("📢", `공무원 공문 · ${text}`, "plain"); return; }
    if (skillId === "ally-add" || skillId === "ally-remove") { const adding = skillId === "ally-add"; if (adding) { actor.alliances.add(target.id); target.alliances.add(actor.id); } else { actor.alliances.delete(target.id); target.alliances.delete(actor.id); } this.private(actor, `${target.id}번 ${target.nickname}과(와) 동맹을 ${adding ? "맺었습니다" : "파기했습니다"}.`); this.private(target, `${actor.id}번 ${actor.nickname}이(가) 동맹을 ${adding ? "맺었습니다" : "파기했습니다"}.`); return; }
    this.effect = { id: target.id, type: ["upper-attack", "lower-attack", "snipe", "revenge", "arrest"].includes(skillId) ? "attack" : "inspect", until: this.now() + 1500 };
    if (["ally-scan", "enemy-scan"].includes(skillId)) { const hit = guessedRole === target.role; this.addLog("🔎", `누군가가 ${target.nickname}을(를) 살피고 있습니다.`, "scan"); this.private(actor, hit ? `스캔 성공 · ${target.nickname}은(는) ${target.role}` : `스캔 실패 · ${target.nickname}은(는) ${guessedRole}이(가) 아님`); return; }
    if (["ally-check", "enemy-check"].includes(skillId)) { const fooled = skillId === "ally-check" && target.role === "스파이" && factionOf(target.announced) === "citizen" && factionOf(actor.role) === "citizen"; this.addLog("🔎", `누군가가 ${target.nickname}을(를) 살피고 있습니다.`, "scan"); this.private(actor, `${target.nickname}의 공표는 ${fooled || target.announced === target.role ? "진명" : "가명"}입니다.`); return; }
    if (skillId === "boss-check" || skillId === "detective-check") { const role = skillId === "boss-check" ? "마피아대부" : "사립탐정"; this.private(actor, `${target.nickname}은(는) ${role}${target.role === role ? "이 맞습니다" : "이 아닙니다"}.`); return; }
    if (skillId === "support") { target.mana = Math.min(MANA_MAX, target.mana + 30); this.addLog("+", `공무원이 ${target.nickname}에게 마나를 지원합니다.`, "mana"); this.private(actor, `${target.nickname}에게 마나 30을 지원했습니다.`); this.private(target, "공무원에게서 마나 30을 지원받았습니다."); return; }
    if (skillId === "successor") { if (target.role === "마피아후계자") { this.successorId = target.id; this.private(actor, `${target.nickname}을(를) 후계자로 지정했습니다.`); } else this.private(actor, `${target.nickname}은(는) 마피아후계자가 아닙니다.`); this.addLog("♛", "마피아대부가 후계자를 지정했습니다.", "plain"); return; }
    if (skillId === "arrest") { if (target.role !== "마피아대부") this.result = { winner: "mafia", reason: "경찰반장의 검거 실패" }; else { this.kill(target, "검거"); const successorAlive = this.successorId && this.player(this.successorId).alive; if (!successorAlive) this.result = { winner: "citizen", reason: "마피아대부 검거 성공" }; } return; }
    if (["snipe", "revenge"].includes(skillId)) { this.kill(target, skillId === "snipe" ? "저격" : "복수"); return; }
    if (["upper-attack", "lower-attack"].includes(skillId)) {
      const shielded = target.role === "경찰반장" && this.players.some((player) => player.alive && player.role === "순찰경찰");
      if (guessedRole === target.role && !shielded) { this.kill(target, "공격"); this.private(actor, `공격 명중 · ${target.nickname}의 직업은 ${target.role}`); }
      else {
        this.addLog("⚔", `누군가가 ${target.nickname}을(를) 공격했지만 실패했습니다.`, "danger");
        const reason = shielded ? "순찰경찰이 경찰반장을 보호 중" : `${target.nickname}은(는) ${guessedRole}이(가) 아님`;
        if (skillId === "lower-attack") {
          actor.lowAttackFails += 1;
          this.private(actor, `하급공격 실패 ${actor.lowAttackFails}/2 · ${reason}`);
          if (actor.lowAttackFails >= 2) this.kill(actor, "하급공격 2회 실패");
        } else this.private(actor, `공격 실패 · ${reason}`);
      }
    }
  }
  kill(target, cause) { if (!target.alive) return; target.alive = false; this.addLog("☠", `${target.nickname}이(가) ${cause}(으)로 사망했습니다. 직업은 ${target.role}입니다.`, "danger"); }
  chat(playerId, payload) {
    this.assertGame(); const actor = this.player(playerId); const text = String(payload.text ?? "").trim().slice(0, 160); if (!text) return;
    const whisper = text.match(/^-(\d+)\s+(.+)$/s);
    if (whisper) { const target = this.player(Number(whisper[1])); const body = whisper[2].trim(); const message = { from: actor.id, to: target.id, text: body, until: this.now() + 5500 }; actor.whisper = message; target.whisper = message; this.private(actor, `${target.id}번 ${target.nickname}에게 귓말 · ${body}`); this.private(target, `${actor.id}번 ${actor.nickname}의 귓말 · ${body}`); return; }
    const allianceText = text.match(/^\/a\s+(.+)$/s)?.[1] ?? (payload.channel === "alliance" ? text : null);
    if (allianceText) { if (!actor.alliances.size) throw new Error("동맹이 없습니다."); this.chats.push({ id: this.now(), from: actor.id, text: allianceText, channel: "alliance", recipients: [actor.id, ...actor.alliances] }); }
    else this.chats.push({ id: this.now(), from: actor.id, text, channel: "public" });
    this.chats = this.chats.slice(-50);
  }
  tick() {
    if (this.phase !== "game" || this.result) return false; const current = this.now(); let changed = false;
    if (current >= this.nextManaAt) { for (const player of this.players) player.mana = Math.min(MANA_MAX, player.mana + MANA_TICK); this.nextManaAt = current + MANA_INTERVAL; this.addLog("+", `마나 보급 · 모든 플레이어 +${MANA_TICK}`, "mana"); changed = true; }
    if (current >= this.nextBotAt) { this.runBot(); this.nextBotAt = current + 2500 + Math.floor(this.random() * 2500); changed = true; }
    if (this.effect && current >= this.effect.until) { this.effect = null; changed = true; }
    return true;
  }
  runBot() {
    const bots = this.players.filter((player) => player.alive && player.aiControlled); if (!bots.length) return;
    const actor = bots[Math.floor(this.random() * bots.length)];
    try {
      if (actor.announced === "미공표") { const claim = this.random() < .65 ? actor.role : formations[this.totalPlayers][Math.floor(this.random() * this.totalPlayers)]; this.act(actor.id, { skillId: "announce", role: claim }); return; }
      const targets = this.players.filter((player) => player.alive && player.id !== actor.id); if (!targets.length) return;
      const target = targets[Math.floor(this.random() * targets.length)]; const available = roleSkills[actor.role] ?? [];
      const attacks = available.filter((id) => ["upper-attack", "lower-attack"].includes(id) && actor.mana >= skills[id].cost && (actor.cooldowns[id] ?? 0) <= this.now());
      if (attacks.length && this.random() < .45) this.act(actor.id, { skillId: attacks[0], targetId: target.id, role: this.random() < .55 ? target.role : formations[this.totalPlayers][Math.floor(this.random() * this.totalPlayers)] });
    } catch { /* A bot can skip an invalid tactical choice. */ }
  }
  snapshotFor(viewer) {
    const current = this.now(); return {
      phase: this.phase, totalPlayers: this.totalPlayers, hostId: this.hostId, yourSeatId: viewer.id, yourRole: viewer.role,
      mana: viewer.mana, nextManaIn: this.nextManaAt ? Math.max(0, Math.ceil((this.nextManaAt - current) / 1000)) : 0,
      cooldowns: Object.fromEntries(Object.entries(viewer.cooldowns).map(([id, until]) => [id, Math.max(0, Math.ceil((until - current) / 1000))])),
      usedOnce: viewer.usedOnce, alliances: [...viewer.alliances], logs: this.logs.slice(-60), privateLogs: viewer.privateLogs.slice(-40), lowAttackFails: viewer.lowAttackFails, result: this.result,
      effect: this.effect && this.effect.until > current ? { id: this.effect.id, type: this.effect.type } : null,
      whisper: viewer.whisper && viewer.whisper.until > current ? { from: viewer.whisper.from, to: viewer.whisper.to, text: viewer.whisper.text } : null,
      chats: this.chats.filter((chat) => chat.channel === "public" || chat.recipients?.includes(viewer.id)).map(({ recipients, ...chat }) => chat),
      players: this.players.map((player) => ({ id: player.id, nickname: player.nickname, connected: player.connected, isBot: player.isBot, aiControlled: player.aiControlled, alive: player.alive, announced: player.announced, faction: player.id === viewer.id || !player.alive || this.result ? factionOf(player.role) : null, role: player.id === viewer.id || !player.alive || this.result ? player.role : null })),
    };
  }
  addLog(icon, text, tone) { this.logs.push({ time: nowLabel(), icon, text, tone }); this.logs = this.logs.slice(-60); }
  private(player, text) { player.privateLogs.push({ time: nowLabel(), text }); player.privateLogs = player.privateLogs.slice(-40); }
  player(id) { const player = this.players.find((entry) => entry.id === id); if (!player) throw new Error("플레이어를 찾을 수 없습니다."); return player; }
  assertGame() { if (this.phase !== "game" || this.result) throw new Error("진행 중인 게임이 없습니다."); }
  nextSeat() { for (let id = 1; id <= 13; id += 1) if (!this.players.some((player) => player.id === id)) return id; throw new Error("빈 좌석이 없습니다."); }
}
