import test from "node:test";
import assert from "node:assert/strict";
import { SingleRoom } from "../room.js";

test("fills one room with bots and privately assigns roles", () => {
  const room = new SingleRoom();
  const host = room.join({ nickname: "host", socket: {} });
  room.setTotal(host.id, 8); room.start(host.id);
  assert.equal(room.players.length, 8); assert.equal(room.players.filter((player) => player.isBot).length, 7);
  assert.ok(room.snapshotFor(host).yourRole);
  assert.equal(room.snapshotFor(host).players.filter((player) => player.id !== host.id).every((player) => player.role === null), true);
});

test("returns a disconnected human seat from AI control on token reconnect", () => {
  const room = new SingleRoom(); const firstSocket = {};
  const host = room.join({ nickname: "host", socket: firstSocket }); room.start(host.id); room.disconnect(firstSocket);
  assert.equal(host.aiControlled, true);
  const returned = room.join({ nickname: "host", token: host.ownerToken, socket: {} });
  assert.equal(returned.id, host.id); assert.equal(returned.aiControlled, false); assert.equal(returned.connected, true);
});

test("server alone spends mana, applies cooldowns, and keeps scan result private", () => {
  let now = 1_000;
  const room = new SingleRoom({ now: () => now, random: () => 0.5 });
  const host = room.join({ nickname: "host", socket: {} });
  const guest = room.join({ nickname: "guest", socket: {} });
  room.start(host.id);
  host.role = "히트맨"; guest.role = "자경단원"; host.mana = 100;
  room.act(host.id, { skillId: "enemy-scan", targetId: guest.id, role: "자경단원" });
  assert.equal(host.mana, 80);
  assert.ok(host.cooldowns["enemy-scan"] > now);
  assert.match(room.snapshotFor(host).privateLogs.at(-1).text, /스캔 성공/);
  assert.equal(room.snapshotFor(guest).privateLogs.some((log) => /스캔 성공/.test(log.text)), false);
  assert.throws(() => room.act(host.id, { skillId: "enemy-scan", targetId: guest.id, role: "자경단원" }), /쿨타임/);
});

test("enemy scanners cannot nominate the opposing leader", () => {
  const room = new SingleRoom({ random: () => 0.5 });
  const host = room.join({ nickname: "host", socket: {} });
  const guest = room.join({ nickname: "guest", socket: {} });
  room.start(host.id); host.role = "히트맨"; guest.role = "경찰반장"; host.mana = 100;
  assert.throws(() => room.act(host.id, { skillId: "enemy-scan", targetId: guest.id, role: "경찰반장" }), /리더/);
});

test("disconnect hands the live seat to AI and token reconnect takes it back", () => {
  const room = new SingleRoom({ random: () => 0.5 }); const socket = {};
  const host = room.join({ nickname: "host", socket }); room.start(host.id); room.disconnect(socket);
  assert.equal(host.aiControlled, true);
  const returned = room.join({ nickname: "host", token: host.ownerToken, socket: {} });
  assert.equal(returned.id, host.id); assert.equal(returned.aiControlled, false);
});

test("host can reopen the lobby after a finished game without retaining bot secrets", () => {
  const room = new SingleRoom({ random: () => 0.5 });
  const host = room.join({ nickname: "host", socket: {} }); room.start(host.id);
  room.result = { winner: "citizen", reason: "test" }; room.restart(host.id);
  assert.equal(room.phase, "lobby"); assert.equal(room.players.length, 1);
  assert.equal(room.players[0].role, null); assert.equal(room.players[0].mana, 20);
});
