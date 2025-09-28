// src/services/formationService.js
import { formations } from "../data/formation.js";
import { getRole } from "./gameService.js";

export function getFormation(playerCount) {
  const formation = formations[playerCount];
  if (!formation) return null;

  // 역할 데이터 포함해서 반환
  return formation.map(name => getRole(name));
}
