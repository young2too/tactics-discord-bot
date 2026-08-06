import { randomUUID } from "node:crypto";
import { botNames, formations, shuffle } from "./game-config.js";

export class SingleRoom {
  constructor() { this.reset(); }

  reset() {
    this.phase = "lobby";
    this.totalPlayers = 8;
    this.players = [];
    this.hostId = null;
  }

  join({ nickname, token, socket }) {
    const cleanName = String(nickname ?? "").trim().slice(0, 16);
    if (!cleanName) throw new Error("닉네임을 입력하세요.");
    const returning = token && this.players.find((player) => player.ownerToken === token && !player.isBot);
    if (returning) {
      returning.socket = socket;
      returning.connected = true;
      returning.aiControlled = false;
      returning.nickname = cleanName;
      return returning;
    }
    if (this.phase !== "lobby") throw new Error("게임 진행 중에는 새 좌석에 참가할 수 없습니다.");
    if (this.players.some((player) => !player.isBot && player.nickname === cleanName)) throw new Error("이미 사용 중인 닉네임입니다.");
    if (this.players.length >= 13) throw new Error("좌석이 모두 찼습니다.");
    const player = {
      id: this.nextSeat(), nickname: cleanName, ownerToken: randomUUID(), socket,
      connected: true, isBot: false, aiControlled: false, alive: true, role: null,
    };
    this.players.push(player);
    if (this.hostId === null) this.hostId = player.id;
    this.totalPlayers = Math.max(this.totalPlayers, this.players.length);
    return player;
  }

  disconnect(socket) {
    const player = this.players.find((entry) => entry.socket === socket);
    if (!player) return;
    player.socket = null;
    player.connected = false;
    if (this.phase === "game" && !player.isBot && player.alive) player.aiControlled = true;
    if (this.phase === "lobby") {
      this.players = this.players.filter((entry) => entry !== player);
      if (this.hostId === player.id) this.hostId = this.players.find((entry) => !entry.isBot)?.id ?? null;
    }
  }

  setTotal(playerId, total) {
    if (playerId !== this.hostId) throw new Error("방장만 총인원을 변경할 수 있습니다.");
    const value = Number(total);
    const humans = this.players.filter((player) => !player.isBot).length;
    if (!Number.isInteger(value) || value < Math.max(8, humans) || value > 13) {
      throw new Error("총인원은 현재 인원 이상, 8~13명이어야 합니다.");
    }
    this.totalPlayers = value;
  }

  start(playerId) {
    if (playerId !== this.hostId) throw new Error("방장만 게임을 시작할 수 있습니다.");
    if (this.phase !== "lobby") throw new Error("이미 게임이 시작되었습니다.");
    const humans = this.players.filter((player) => !player.isBot);
    const botCount = this.totalPlayers - humans.length;
    for (let index = 0; index < botCount; index += 1) {
      this.players.push({
        id: this.nextSeat(), nickname: botNames[index], ownerToken: null, socket: null,
        connected: true, isBot: true, aiControlled: true, alive: true, role: null,
      });
    }
    const roles = shuffle(formations[this.totalPlayers]);
    shuffle(this.players).forEach((player, index) => { player.role = roles[index]; });
    this.players.sort((a, b) => a.id - b.id);
    this.phase = "game";
  }

  nextSeat() {
    for (let id = 1; id <= 13; id += 1) if (!this.players.some((player) => player.id === id)) return id;
    throw new Error("빈 좌석이 없습니다.");
  }

  snapshotFor(viewer) {
    return {
      phase: this.phase,
      totalPlayers: this.totalPlayers,
      hostId: this.hostId,
      yourSeatId: viewer.id,
      yourRole: viewer.role,
      players: this.players.map((player) => ({
        id: player.id,
        nickname: player.nickname,
        connected: player.connected,
        isBot: player.isBot,
        aiControlled: player.aiControlled,
        alive: player.alive,
        role: player.id === viewer.id || !player.alive ? player.role : null,
      })),
    };
  }
}
