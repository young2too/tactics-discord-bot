// src/util/skillMeta.js
import game from "../data/game.json" with { type: "json" };
import { getSessionByChannel, isAlive } from "../services/sessionService.js";
import roleSkills from "../data/roleSkills.json" with { type: "json" };
import { getFaction } from "./faction.js";

export function normalizeSkill(s) {
  return typeof s === "string" ? { name: s } : s;
}

export function findTeamKeyByRole(roleName) {
  return Object.keys(game.teams)
    .find(k => game.teams[k].roles.some(r => r.role === roleName)) ?? null;
}

export function getRoleSpec(roleName) {
  const teamKey = findTeamKeyByRole(roleName);
  if (!teamKey) return null;
  return game.teams[teamKey].roles.find(r => r.role === roleName) ?? null;
}

/** 해당 역할이 갖는 “공통 + 역할개별” 스킬을 머지해서 반환 */
export function getRoleSkillsFromGame(roleName) {
  const roleSpec = getRoleSpec(roleName);
  const common = (game.commonSkills ?? []).map(normalizeSkill);
  const roleOnly = (roleSpec?.skills ?? []).map(normalizeSkill);
  const map = new Map();
  for (const sk of common) map.set(sk.name, { ...sk });
  for (const sk of roleOnly) map.set(sk.name, { ...(map.get(sk.name) || {}), ...sk });
  return [...map.values()];
}

/** game.json 기준으로 cost/limit/cooldownSec을 종합해 meta로 반환 */
export function getSkillMeta(roleName, skillName) {
  let meta = {};
  for (const cs of game.commonSkills ?? []) {
    if (cs.name === skillName) meta = { ...meta, ...cs };
  }
  const roleSpec = getRoleSpec(roleName);
  if (roleSpec?.skills) {
    for (const s of roleSpec.skills.map(normalizeSkill)) {
      if (s.name === skillName) meta = { ...meta, ...s };
    }
  }
  const cost = meta.cost ?? null;
  const limit = meta.limit ?? null;
  const cooldownMs = meta.cooldownSec != null ? meta.cooldownSec * 1000 : null;
  return { cost, limit, cooldownMs };
}


// 공격 스킬 식별
const ATTACK_SKILLS = new Set(["상급 공격", "하급 공격", "저격", "복수귀"]);



// 유틸: 역할이 어느 팀에 속하는지 ("mafia" | "citizen" | null)
export function teamOfRole(roleName) {
  for (const [teamKey, team] of Object.entries(game.teams)) {
    if (team.roles.some(r => r.role === roleName)) return teamKey;
  }
  return null;
}

// 유틸: 역할이 팀 리더인지
export function isLeaderRole(roleName) {
  for (const team of Object.values(game.teams)) {
    const spec = team.roles.find(r => r.role === roleName);
    if (spec?.leader) return true;
  }
  return false;
}

// 유틸: 역할이 공격권자(공격 스킬 보유)인지
export function isAttackerRole(roleName) {
  for (const team of Object.values(game.teams)) {
    const spec = team.roles.find(r => r.role === roleName);
    if (!spec) continue;
    const skills = (spec.skills ?? []).map(normalizeSkill);
    if (skills.some(sk => ATTACK_SKILLS.has(sk.name))) return true;
  }
  return false;
}


/**
 * 플레이어가 가진 스킬 목록 반환
 */
export function getSkillsForPlayer(vcId, uid) {
  const s = getSessionByChannel(vcId);
  if (!s) return [];

  const role = s.roles.get(uid);
  if (!role) return [];

  return roleSkills[role] || [];
}


export function isEnemyFaction(a, b) {
  return getFaction(a) !== getFaction(b);
}
export function isSameFaction(a, b) {
  return getFaction(a) === getFaction(b);
}

// 세션에서 특정 역할이 '살아있는' 사람이 하나라도 있는지
export function isAnyAliveWithRole(s, vcId, roleName) {
  for (const [pid, role] of s.roles.entries()) {
    if (role === roleName && isAlive(vcId, pid)) return true;
  }
  return false;
}