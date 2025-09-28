import db from '../data/db.js';

export function regenMana(playerId, now = Math.floor(Date.now()/1000)) {
  const row = db.prepare(`SELECT mana, lastRegenAt FROM mana WHERE playerId=?`).get(playerId);
  if (!row) {
    db.prepare(`INSERT INTO mana(playerId, mana, lastRegenAt) VALUES(?,?,?)`).run(playerId, 20, now);
    return 20;
  }
  const elapsed = now - row.lastRegenAt;
  const ticks = Math.floor(elapsed / 300); // 5분
  if (ticks > 0) {
    const add = ticks * 20;
    const mana = row.mana + add;
    const newLast = row.lastRegenAt + ticks*300;
    db.prepare(`UPDATE mana SET mana=?, lastRegenAt=? WHERE playerId=?`).run(mana, newLast, playerId);
    return mana;
  }
  return row.mana;
}

export function addMana(playerId, amount) {
  const cur = regenMana(playerId);
  db.prepare(`UPDATE mana SET mana=? WHERE playerId=?`).run(cur + amount, playerId);
  return cur + amount;
}

export function spendMana(playerId, cost) {
  const cur = regenMana(playerId);
  if (cur < cost) return { ok:false, cur };
  db.prepare(`UPDATE mana SET mana=? WHERE playerId=?`).run(cur - cost, playerId);
  return { ok:true, cur: cur - cost };
}
