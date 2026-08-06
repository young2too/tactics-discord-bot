import { allRoles, ATTACKER_ROLES, portraitRoles } from "./catalog";
import type { Faction, GameResult, Player } from "./types";

export function factionOf(role: string): Faction {
  return allRoles.find((item) => item.name === role)?.faction ?? "citizen";
}

export function portraitStyle(role: string) {
  const index = Math.max(0, portraitRoles.indexOf(role));
  return { backgroundPosition: `${(index % 4) * 33.333}% ${Math.floor(index / 4) * 33.333}%` };
}

export function checkVictory(players: Player[], successorId: number | null = null): GameResult {
  const citizenLeader = players.find((player) => player.role === "경찰반장");
  if (citizenLeader && !citizenLeader.alive) return { winner: "mafia", reason: "경찰반장 사망" };
  const mafiaBoss = players.find((player) => player.role === "마피아대부");
  const successorAlive = successorId !== null && players.some((player) => player.id === successorId && player.alive);
  if (mafiaBoss && !mafiaBoss.alive && !successorAlive) return { winner: "citizen", reason: "마피아 대부 사망(후계자 없음/사망)" };
  if (!players.some((player) => player.alive && player.faction === "mafia" && ATTACKER_ROLES.has(player.role))) return { winner: "citizen", reason: "마피아 공격권자 전멸" };
  if (!players.some((player) => player.alive && player.faction === "citizen" && ATTACKER_ROLES.has(player.role))) return { winner: "mafia", reason: "시민 공격권자 전멸" };
  return null;
}

export function shuffle<T>(values: T[]) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}
