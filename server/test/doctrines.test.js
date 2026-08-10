import assert from "node:assert/strict";
import test from "node:test";
import { ensureDoctrine, scanRolePriorities } from "../ai/doctrines.js";
import { runStrategicBot } from "../bot-ai.js";
import { SingleRoom } from "../room.js";

function setup() {
  const room = new SingleRoom({ random: () => 0 }); const actor = room.join({ nickname: "actor", socket: {} }); room.start(actor.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; player.mana = 200; }); room.result = null;
  return { room, actor };
}

test("role doctrine chooses a persistent per-game operating mode", () => {
  const { room, actor } = setup(); actor.role = "사립탐정"; actor.aiMemory = {};
  const first = ensureDoctrine(room, actor); const second = ensureDoctrine(room, actor);
  assert.equal(first, second); assert.equal(first.mode, "public");
});

test("hitman and successor scanning priorities reflect their doctrine", () => {
  const hitman = { role: "히트맨", aiMemory: {} };
  assert.deepEqual(scanRolePriorities(hitman).slice(0, 2), ["순찰경찰", "탐정조수"]);
  const successor = { role: "마피아후계자", aiMemory: { knowledge: { 2: { role: "마피아대부", confidence: 1 } } } };
  assert.equal(scanRolePriorities(successor)[0], "히트맨");
});

test("mafia publicly reveals a confirmed patrol and captain kill route", () => {
  const { room, actor } = setup(); const [patrol, captain] = room.players.filter((player) => player.id !== actor.id).slice(0, 2);
  actor.role = "마피아후계자"; actor.aiControlled = true; patrol.role = "순찰경찰"; captain.role = "경찰반장";
  actor.aiMemory = { knowledge: { [patrol.id]: { role: "순찰경찰", faction: "citizen", confidence: 1, excluded: [] }, [captain.id]: { role: "경찰반장", faction: "citizen", confidence: 1, excluded: [] } } };
  runStrategicBot(room, { actor });
  assert.match(room.chats.at(-1).text, new RegExp(`${patrol.id}번 순찰경찰, ${captain.id}번 경찰반장`));
  assert.match(room.chats.at(-1).text, /순찰경찰부터/);
});

test("an AI captain arrests a directly confirmed boss without waiting to announce", () => {
  const { room, actor } = setup(); const boss = room.players.find((player) => player.id !== actor.id);
  actor.role = "경찰반장"; actor.aiControlled = true; actor.announced = "자경단원"; boss.role = "마피아대부";
  actor.aiMemory = { knowledge: { [boss.id]: { role: "마피아대부", faction: "mafia", confidence: 1, excluded: [] } } };
  runStrategicBot(room, { actor });
  assert.equal(actor.usedOnce.arrest, true); assert.equal(boss.alive, false);
});
