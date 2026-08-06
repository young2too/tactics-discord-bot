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
