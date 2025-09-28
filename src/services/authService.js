import db from '../data/db.js';

export function isLeader(playerId) {
  const r = db.prepare(`SELECT isLeader, alive FROM players WHERE playerId=?`).get(playerId);
  return !!(r?.alive && r?.isLeader);
}
export function isAttacker(playerId) {
  const r = db.prepare(`SELECT isAttacker, alive FROM players WHERE playerId=?`).get(playerId);
  return !!(r?.alive && r?.isAttacker);
}
