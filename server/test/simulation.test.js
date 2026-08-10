import assert from "node:assert/strict";
import test from "node:test";
import { formations, MANA_MAX } from "../game-config.js";
import { SingleRoom } from "../room.js";

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
}

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
