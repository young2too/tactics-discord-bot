import { getRoleSkillsFromGame } from "../util/skillMeta.js";

const sessions = new Map();
const MANA_MAX = 200;

export function startSession(vcId, hostId, playerIds, playerDisplayNames = {}, isTest = false) {
  const mana = new Map();
  const roles = new Map();
  const revealed = new Map();
  const cooldowns = new Map();
  const alive = new Map();
  const limits = new Map();     // ✅ 스킬 사용 제한 (ex: 리더쉽 1회)
  const counters = new Map();   // ✅ 누적 카운터 (ex: 하급 공격 실패 누적)

  for (const pid of playerIds) {
    mana.set(pid, 20);      // 시작 마나
    alive.set(pid, true);   // 시작 시 모두 생존
    limits.set(pid, {});   // 개별 스킬 키로 저장
    counters.set(pid, {}); // 개별 카운터 키로 저장
  }

  const s = {
    hostId,
    players: new Set(playerIds),
    roles,
    revealed,
    mana,
    cooldowns,
    alive,
    limits,
    counters,
    size: playerIds.length,
    startedAt: Date.now(),
    testMode: isTest,
    successor: null,   // ✅ 후계자 슬롯
    gameOver: false,   // 종료 여부
    winner: null,      // 승리 진영
    reason: null,      // 종료 이유
  };

  sessions.set(vcId, s);
  return s;
}

function seedLimitsForUser(s, userId, roleName) {
  const bag = s.limits.get(userId) ?? {};
  for (const sk of getRoleSkillsFromGame(roleName)) {
    if (typeof sk.limit === "number" && bag[sk.name] == null) {
      bag[sk.name] = sk.limit; // 최초 1회 시딩
    }
  }
  s.limits.set(userId, bag);
}


export function getSessionByChannel(vcId) {
  return sessions.get(vcId) ?? null;
}

export function listPlayers(vcId) {
  return Array.from(sessions.get(vcId)?.players ?? []);
}

export function setRole(vcId, userId, roleName) {
  const s = sessions.get(vcId);
  if (!s) return;
  s.roles.set(userId, roleName);
  // ✅ 역할이 정해지는 시점에 limit 시딩
  seedLimitsForUser(s, userId, roleName);
}

export function addMana(vcId, userId, amount) {
  const s = sessions.get(vcId);
  if (!s) return null;
  const cur = s.mana.get(userId) ?? 0;
  const next = Math.max(0, Math.min(MANA_MAX, cur + amount));
  s.mana.set(userId, next);
  return next;
}

export function getMana(vcId, userId) {
  return sessions.get(vcId)?.mana.get(userId) ?? null;
}

export function setCooldown(vcId, userId, key, ms) {
  const s = sessions.get(vcId);
  if (!s) return;
  s.cooldowns.set(`${userId}:${key}`, Date.now() + ms);
}

export function getCooldown(vcId, userId, key) {
  const s = sessions.get(vcId);
  if (!s) return 0;
  return s.cooldowns.get(`${userId}:${key}`) ?? 0;
}

export function isAlive(vcId, userId) {
  return sessions.get(vcId)?.alive.get(userId) ?? false;
}

export function setAlive(vcId, userId, value) {
  const s = sessions.get(vcId);
  if (!s) return;
  s.alive.set(userId, value);
}


export function endSession(vcId) {
  const s = sessions.get(vcId);
  if (!s) return false;

  // 마나 자동 회복 타이머 정리
  if (s._manaInterval) {
    clearInterval(s._manaInterval);
  }

  sessions.delete(vcId);
  return true;
}


// export function getSkillsForPlayer(vcId, playerId) {
//   const s = sessions.get(vcId);
//   if (!s) return [];

//   const role = s.roles.get(playerId);   // 세션에서 플레이어의 직업
//   if (!role) return [];

//   return roleSkills[role] || [];        // [{name, cost, desc}, ...]
// }



// --- 유틸 추가 ---
export function getLimit(vcId, userId, key) {
  const s = sessions.get(vcId);
  if (!s) return 0;
  return s.limits.get(userId)?.[key] ?? 0;
}
export function setLimit(vcId, userId, key, value) {
  const s = sessions.get(vcId);
  if (!s) return;
  const bag = s.limits.get(userId) ?? {};
  bag[key] = value;
  s.limits.set(userId, bag);
}
export function addLimit(vcId, userId, key, delta) {
  const s = sessions.get(vcId);
  if (!s) return 0;
  const bag = s.limits.get(userId) ?? {};
  const next = Math.max(0, (bag[key] ?? 0) + delta);
  bag[key] = next;
  s.limits.set(userId, bag);
  return next;
}

export function getCounter(vcId, userId, key) {
  const s = sessions.get(vcId);
  if (!s) return 0;
  return s.counters.get(userId)?.[key] ?? 0;
}
export function incCounter(vcId, userId, key, by = 1) {
  const s = sessions.get(vcId);
  if (!s) return 0;
  const bag = s.counters.get(userId) ?? {};
  const next = (bag[key] ?? 0) + by;
  bag[key] = next;
  s.counters.set(userId, bag);
  return next;
}


export function setLoverPair(vcId, maleId, femaleId) {
  const s = getSessionByChannel(vcId);
  if (!s) return;
  if (!s.lovers) s.lovers = new Map();
  s.lovers.set(maleId, femaleId);
  s.lovers.set(femaleId, maleId);
}

export function getPartner(vcId, uid) {
  const s = getSessionByChannel(vcId);
  return s?.lovers?.get(uid) ?? null;
}