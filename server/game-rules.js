import { attackerRoles, factionOf } from "./game-config.js";

export function checkVictory(players, successorId, captainArrestAvailable = true) {
  const captain = players.find((player) => player.role === "경찰반장");
  if (captain && !captain.alive) return { winner: "mafia", reason: "경찰반장 사망" };
  const boss = players.find((player) => player.role === "마피아대부");
  const successorAlive = successorId && players.some((player) => player.id === successorId && player.alive);
  if (boss && !boss.alive && !successorAlive) return { winner: "citizen", reason: "마피아대부 사망 및 후계자 부재" };
  if (!players.some((player) => player.alive && factionOf(player.role) === "mafia" && attackerRoles.has(player.role))) return { winner: "citizen", reason: "마피아 공격권자 전멸" };
  const citizenThreatAlive = players.some((player) => player.alive && factionOf(player.role) === "citizen" && (attackerRoles.has(player.role) || (player.role === "경찰반장" && captainArrestAvailable)));
  if (!citizenThreatAlive) return { winner: "mafia", reason: "시민 공격권자 및 검거권 소진" };
  return null;
}
