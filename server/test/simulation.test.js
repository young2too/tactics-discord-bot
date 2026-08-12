import assert from "node:assert/strict";
import test from "node:test";
import { formations, MANA_MAX, skillCost } from "../game-config.js";
import { SingleRoom } from "../room.js";

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
}

test("11+ player games reduce upper attack cost without changing smaller games", () => {
  assert.equal(skillCost("upper-attack", 10), 40);
  assert.equal(skillCost("upper-attack", 11), 30);
  assert.equal(skillCost("upper-attack", 13), 30);
  assert.equal(skillCost("lower-attack", 13), 30);
});

test("11-player formation adds the spy before introducing the lover pair", () => {
  assert.ok(formations[11].includes("스파이"));
  assert.ok(formations[11].includes("공무원"));
  assert.equal(formations[11].includes("남자연인"), false);
  assert.equal(formations[11].includes("여자연인"), false);
  assert.ok(formations[12].includes("남자연인"));
  assert.ok(formations[12].includes("여자연인"));
});

test("9-player formation replaces the official with the mafia successor", () => {
  assert.ok(formations[9].includes("마피아후계자"));
  assert.equal(formations[9].includes("공무원"), false);
  assert.equal(formations[9].filter((role) => role === "마피아후계자").length, 1);
});

for (const total of [8, 9, 10, 11, 12, 13]) {
  test(`${total}-player doctrine simulation preserves authoritative invariants`, () => {
    let now = 10_000; const random = seededRandom(total * 997);
    const room = new SingleRoom({ now: () => now, random }); const human = room.join({ nickname: `human-${total}`, socket: {} });
    room.setTotal(human.id, total); room.start(human.id);
    assert.deepEqual([...room.players.map((player) => player.role)].sort(), [...formations[total]].sort());
    assert.ok(room.players.filter((player) => player.aiControlled).every((player) => player.nextAiActionAt > now));

    for (let step = 0; step < 360 && !room.result; step += 1) { now += 500; room.tick(); }

    for (const player of room.players) {
      assert.ok(player.mana >= 0 && player.mana <= MANA_MAX);
      assert.ok(formations[total].includes(player.role));
      for (const roles of Object.values(player.aiMemory?.candidateRoles ?? {})) {
        assert.ok(roles.length > 0); assert.ok(roles.every((role) => formations[total].includes(role)));
      }
    }
    if (room.result) assert.ok(["citizen", "mafia", "draw"].includes(room.result.winner));
    assert.ok(room.logs.length > 1);
  });
}
