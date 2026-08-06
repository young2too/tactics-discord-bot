import { allRoles, portraitRoles } from "./catalog";
import type { Faction, GameResult, Player } from "./types";

export function factionOf(role: string): Faction {
  return allRoles.find((item) => item.name === role)?.faction ?? "citizen";
}

export function portraitStyle(role: string) {
  const index = Math.max(0, portraitRoles.indexOf(role));
  return { backgroundPosition: `${(index % 4) * 33.333}% ${Math.floor(index / 4) * 33.333}%` };
}

export function checkVictory(players: Player[], successorId: number | null = null, captainArrestAvailable = true, snipePotential = true, revengePotential = true): GameResult {
  const citizenLeader = players.find((player) => player.role === "경찰반장");
  if (citizenLeader && !citizenLeader.alive) return { winner: "mafia", reason: "경찰반장 사망" };
  const mafiaBoss = players.find((player) => player.role === "마피아대부");
  const successorAlive = successorId !== null && players.some((player) => player.id === successorId && player.alive);
  if (mafiaBoss && !mafiaBoss.alive && !successorAlive) return { winner: "citizen", reason: "마피아 대부 사망(후계자 없음/사망)" };
  const alive = (role: string) => players.some((player) => player.alive && player.role === role);
  if (!alive("마피아대부") && !alive("마피아일원") && !(alive("히트맨") && snipePotential)) return { winner: "citizen", reason: "마피아의 남은 처치 수단 소진" };
  const citizenThreatAlive = alive("자경단원") || alive("순찰경찰") || (alive("경찰반장") && captainArrestAvailable) || revengePotential;
  if (!citizenThreatAlive) return { winner: "mafia", reason: "시민의 남은 처치 수단 소진" };
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
