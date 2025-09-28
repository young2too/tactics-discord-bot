import Database from 'better-sqlite3';
const db = new Database('game.db');

db.exec(`
CREATE TABLE IF NOT EXISTS mana(
  playerId TEXT PRIMARY KEY, mana INTEGER, lastRegenAt INTEGER
);
CREATE TABLE IF NOT EXISTS players(
  playerId TEXT PRIMARY KEY, team TEXT, role TEXT,
  isLeader INTEGER, isAttacker INTEGER, alive INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS announce(
  playerId TEXT PRIMARY KEY, nameAnnounced TEXT, roleAnnounced TEXT,
  isTrueName INTEGER, lockUntil INTEGER
);
CREATE TABLE IF NOT EXISTS counters(
  playerId TEXT PRIMARY KEY, lowAttackFails INTEGER DEFAULT 0
);
`);

export default db;
