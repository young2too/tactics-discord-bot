import assert from "node:assert/strict";
import test from "node:test";
import { deriveCandidates, refreshDeductions } from "../ai/deduction.js";
import { SingleRoom } from "../room.js";

function preparedRoom() {
  const room = new SingleRoom({ random: () => 0 });
  const actor = room.join({ nickname: "actor", socket: {} });
  room.start(actor.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = "미공표"; });
  actor.aiMemory = { knowledge: {}, claims: {}, trust: {} };
  return { room, actor };
}

test("deduction never reads a living enemy's hidden role", () => {
  const { room, actor } = preparedRoom();
  const target = room.players.find((player) => player.id !== actor.id);
  const first = deriveCandidates(room, actor).candidates[target.id];
  const original = target.role; target.role = room.players.find((player) => player.role !== original).role;
  const second = deriveCandidates(room, actor).candidates[target.id];
  assert.deepEqual([...first].sort(), [...second].sort());
});

test("global one-to-one elimination confirms the last remaining roles", () => {
  const { room, actor } = preparedRoom();
  const others = room.players.filter((player) => player.id !== actor.id);
  for (const player of others.slice(0, -2)) actor.aiMemory.knowledge[player.id] = { role: player.role, faction: player.role.startsWith("마피아") || player.role === "히트맨" ? "mafia" : "citizen", confidence: 1, excluded: [] };
  const [left, right] = others.slice(-2); actor.aiMemory.knowledge[left.id] = { excluded: [right.role] };
  const result = refreshDeductions(room, actor);
  assert.equal(result.certain[left.id], left.role);
  assert.equal(result.certain[right.id], right.role);
  assert.equal(actor.aiMemory.knowledge[right.id].source, "소거법 확정");
});

test("a failed scan removes only that role from the target candidate set", () => {
  const { room, actor } = preparedRoom(); const target = room.players.find((player) => player.id !== actor.id);
  actor.aiMemory.knowledge[target.id] = { excluded: ["히트맨"], confidence: 1 };
  const result = deriveCandidates(room, actor);
  assert.equal(result.candidates[target.id].has("히트맨"), false);
  assert.ok(result.candidates[target.id].size > 1);
});
