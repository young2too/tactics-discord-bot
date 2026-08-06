import { factionOf } from "./game-config.js";

export function checkVictory(players, successorId) {
  const captain = players.find((player) => player.role === "경찰반장");
  if (captain && !captain.alive) return { winner: "mafia", reason: "경찰반장 사망" };
  const boss = players.find((player) => player.role === "마피아대부");
  const successorAlive = successorId && players.some((player) => player.id === successorId && player.alive);
  if (boss && !boss.alive && !successorAlive) return { winner: "citizen", reason: "마피아대부 사망 및 후계자 부재" };
  const alive = (role) => players.find((player) => player.alive && player.role === role);
  const bossAlive = alive("마피아대부");
  const hitmanAlive = alive("히트맨");
  const hitmanCanSnipe = Boolean(hitmanAlive && !hitmanAlive.usedOnce?.snipe && (hitmanAlive.snipeAuthorized || (bossAlive && !bossAlive.usedOnce?.["snipe-command"])));
  const mafiaThreatAlive = Boolean(bossAlive || alive("마피아일원") || hitmanCanSnipe);
  if (!mafiaThreatAlive) return { winner: "citizen", reason: "마피아의 남은 처치 수단 소진" };
  const captainThreat = alive("경찰반장");
  const arrestAvailable = Boolean(captainThreat && !captainThreat.usedOnce?.arrest);
  const revengeAvailable = players.some((player) => player.alive && ["남자연인", "여자연인"].includes(player.role) && !player.usedOnce?.revenge);
  const citizenThreatAlive = Boolean(alive("자경단원") || alive("순찰경찰") || arrestAvailable || revengeAvailable);
  if (!citizenThreatAlive) return { winner: "mafia", reason: "시민의 남은 처치 수단 소진" };
  return null;
}
