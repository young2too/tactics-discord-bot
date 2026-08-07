import test from "node:test";
import assert from "node:assert/strict";
import { SingleRoom } from "../room.js";
import { runStrategicBot } from "../bot-ai.js";
import { checkVictory } from "../game-rules.js";

test("fills one room with bots and privately assigns roles", () => {
  const room = new SingleRoom();
  const host = room.join({ nickname: "host", socket: {} });
  room.setTotal(host.id, 8); room.start(host.id);
  assert.equal(room.players.length, 8); assert.equal(room.players.filter((player) => player.isBot).length, 7);
  assert.ok(room.snapshotFor(host).yourRole);
  assert.equal(room.snapshotFor(host).players.filter((player) => player.id !== host.id).every((player) => player.role === null), true);
});

test("lovers know each other from the start without revealing them to others", () => {
  const room = new SingleRoom({ random: () => 0.5 });
  const host = room.join({ nickname: "host", socket: {} });
  room.setTotal(host.id, 11); room.start(host.id);
  const male = room.players.find((player) => player.role === "남자연인");
  const female = room.players.find((player) => player.role === "여자연인");
  const outsider = room.players.find((player) => !["남자연인", "여자연인"].includes(player.role));
  assert.equal(room.snapshotFor(male).players.find((player) => player.id === female.id).role, "여자연인");
  assert.equal(room.snapshotFor(female).players.find((player) => player.id === male.id).role, "남자연인");
  assert.equal(room.snapshotFor(outsider).players.find((player) => player.id === male.id).role, null);
  assert.match(male.privateLogs.at(-1).text, /연인 정보/);
  assert.equal(male.aiMemory.knowledge[female.id].confidence, 1);
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
  assert.equal(room.snapshotFor(host).verdict.success, true);
  assert.equal(room.snapshotFor(guest).verdict, null);
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

test("mafia successor advanced scan covers both factions but excludes the police captain", () => {
  const room = new SingleRoom({ random: () => 0.5 });
  const host = room.join({ nickname: "host", socket: {} });
  const guest = room.join({ nickname: "guest", socket: {} });
  room.start(host.id); host.role = "마피아후계자"; guest.role = "자경단원"; host.mana = 100;
  room.act(host.id, { skillId: "advanced-scan", targetId: guest.id, role: "자경단원" });
  assert.equal(room.snapshotFor(host).verdict.success, true);
  host.cooldowns["advanced-scan"] = 0;
  assert.throws(() => room.act(host.id, { skillId: "advanced-scan", targetId: guest.id, role: "경찰반장" }), /리더/);
});

test("strategic successor finds the boss, allies, and explains itself by whisper", () => {
  const room = new SingleRoom({ random: () => 0 });
  const boss = room.join({ nickname: "boss", socket: {} });
  const successor = room.join({ nickname: "successor", socket: {} });
  room.start(boss.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  boss.role = "마피아대부"; successor.role = "마피아후계자"; successor.announced = "마피아후계자"; successor.mana = 200; successor.aiControlled = true;
  successor.aiMemory = { knowledge: Object.fromEntries(room.players.filter((player) => player.id !== boss.id && player.id !== successor.id).map((player) => [player.id, { excluded: ["마피아대부"] }])), sharedWith: {}, lastPublicAt: 0, recentLines: [] };
  runStrategicBot(room);
  assert.equal(successor.aiMemory.knowledge[boss.id].role, "마피아대부");
  runStrategicBot(room);
  assert.equal(successor.alliances.has(boss.id), true);
  assert.match(boss.whisper.text, /보스 확인/);
  assert.match(boss.whisper.text, /마피아후계자/);
});

test("strategic bots use contextual public chat without an LLM", () => {
  const room = new SingleRoom({ random: () => 0 });
  const actor = room.join({ nickname: "speaker", socket: {} });
  room.start(actor.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  actor.role = "마피아일원"; actor.announced = "마피아일원"; actor.mana = 0; actor.aiControlled = true;
  const claimant = room.players.find((player) => player.id !== actor.id); claimant.announced = "마피아대부";
  runStrategicBot(room);
  assert.match(room.chats.at(-1).text, /대부 이름|리더십/);
});

test("strategic bots answer human whispers but treat private skill claims as unverified", () => {
  const room = new SingleRoom({ random: () => 0 });
  const human = room.join({ nickname: "human", socket: {} });
  const bot = room.join({ nickname: "listener", socket: {} });
  room.start(human.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  human.role = "순찰경찰"; human.announced = "순찰경찰"; bot.role = "자경단원"; bot.announced = "자경단원"; bot.aiControlled = true;
  room.chat(human.id, { text: `-${bot.id} 나 순찰경찰이라 아확 찍고 붙었어.` });
  runStrategicBot(room);
  assert.equal(bot.whisper.from, bot.id);
  assert.match(bot.whisper.text, /개인 정보|주장으로만/);
  assert.equal(bot.aiMemory.claims[human.id].trust, .2);
  assert.equal(bot.aiMemory.knowledge[human.id], undefined);
});

test("strategic bots challenge impossible role and skill claims", () => {
  const room = new SingleRoom({ random: () => 0 });
  const human = room.join({ nickname: "human", socket: {} });
  const bot = room.join({ nickname: "listener", socket: {} });
  room.start(human.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  bot.aiControlled = true;
  room.chat(human.id, { text: `-${bot.id} 나 마피아대부라서 아군 확인 찍고 왔어.` });
  runStrategicBot(room);
  assert.match(bot.whisper.text, /쓸 수 없|못 믿/);
  assert.equal(bot.aiMemory.claims[human.id].trust, -.5);
});

test("a verified public report can trigger a safe attack and build a citizen alliance", () => {
  const room = new SingleRoom({ random: () => 0 });
  const assistant = room.join({ nickname: "assistant", socket: {} });
  const vigilante = room.join({ nickname: "vigilante", socket: {} });
  const detective = room.join({ nickname: "detective", socket: {} });
  room.start(assistant.id);
  const target = room.players.find((player) => ![assistant.id, vigilante.id, detective.id].includes(player.id));
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  assistant.role = "탐정조수"; assistant.announced = "탐정조수";
  vigilante.role = "자경단원"; vigilante.announced = "자경단원"; vigilante.mana = 200; vigilante.aiControlled = true;
  detective.role = "사립탐정"; detective.announced = "사립탐정"; detective.aiControlled = true;
  target.role = "마피아일원"; target.announced = "마피아일원";
  room.chat(assistant.id, { text: `-${detective.id} 나는 탐정조수고 탐정 확인으로 당신이 사립탐정인 걸 찾았어.` });
  runStrategicBot(room);
  assert.equal(detective.aiMemory.trust[assistant.id], .85);
  room.act(assistant.id, { skillId: "enemy-check", targetId: target.id });
  room.chat(assistant.id, { text: `나는 탐정조수고 ${target.id}번 마피아일원 진명 확인했어.` });
  runStrategicBot(room); runStrategicBot(room);
  runStrategicBot(room);
  assert.equal(target.alive, false);
  assert.ok(vigilante.aiMemory.trust[assistant.id] >= .7);
  room.result = null; // Keep the synthetic role-overridden fixture running to inspect alliance behavior.
  runStrategicBot(room);
  assert.equal(vigilante.alliances.has(assistant.id), true);
  room.result = null;
  vigilante.aiControlled = false;
  runStrategicBot(room);
  assert.equal(detective.alliances.has(assistant.id), true);
});

test("a lower attacker may test a report that immediately follows a public inspection", () => {
  const room = new SingleRoom({ random: () => 0 });
  const reporter = room.join({ nickname: "reporter", socket: {} });
  const patrol = room.join({ nickname: "patrol", socket: {} });
  room.start(reporter.id);
  const target = room.players.find((player) => ![reporter.id, patrol.id].includes(player.id));
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  reporter.role = "사립탐정"; reporter.announced = "사립탐정"; reporter.mana = 200;
  patrol.role = "순찰경찰"; patrol.announced = "순찰경찰"; patrol.mana = 200; patrol.aiControlled = true;
  target.role = "마피아일원"; target.announced = "마피아일원";
  room.act(reporter.id, { skillId: "enemy-scan", targetId: target.id, role: "마피아일원" });
  room.chat(reporter.id, { text: `${target.id}번 마피아일원 진명 확인` });
  runStrategicBot(room); // Contextualizes and answers the report.
  runStrategicBot(room); // Acts on the contextualized report.
  assert.equal(target.alive, false);
  assert.equal(patrol.lowAttackFails, 0);
});

test("an unknown public report without an observed inspection does not trigger an attack", () => {
  const room = new SingleRoom({ random: () => 0 });
  const reporter = room.join({ nickname: "reporter", socket: {} });
  const patrol = room.join({ nickname: "patrol", socket: {} });
  room.start(reporter.id);
  const target = room.players.find((player) => ![reporter.id, patrol.id].includes(player.id));
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  patrol.role = "순찰경찰"; patrol.announced = "순찰경찰"; patrol.mana = 200; patrol.aiControlled = true;
  target.role = "마피아일원"; target.announced = "마피아일원";
  patrol.aiMemory = { reports: { [target.id]: { role: "마피아일원", reporterId: reporter.id, source: "제보", evidence: .1 } }, trust: {}, claims: {}, knowledge: {}, sharedWith: {}, lastPublicAt: 0, recentLines: [], inbox: [] };
  runStrategicBot(room);
  assert.equal(target.alive, true);
  assert.equal(patrol.lowAttackFails, 0);
});

test("a patrol trusts and acts on reports from a player it directly ally-checked", () => {
  const room = new SingleRoom({ random: () => 0 });
  const detective = room.join({ nickname: "detective", socket: {} });
  const patrol = room.join({ nickname: "patrol", socket: {} });
  room.start(detective.id);
  const target = room.players.find((player) => ![detective.id, patrol.id].includes(player.id));
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  detective.role = "사립탐정"; detective.announced = "사립탐정"; detective.mana = 200;
  patrol.role = "순찰경찰"; patrol.announced = "순찰경찰"; patrol.mana = 200; patrol.aiControlled = true;
  target.role = "히트맨"; target.announced = "히트맨";
  patrol.alliances.add(detective.id);
  patrol.aiMemory = { knowledge: { [detective.id]: { faction: "citizen", confidence: .8, source: "공표 확인", excluded: [] } }, reports: {}, trust: {}, claims: {}, sharedWith: { [detective.id]: true }, lastPublicAt: 0, recentLines: [], inbox: [{ from: detective.id, text: `${target.id}번 히트맨 진명 확인`, channel: "public", respond: true }] };
  runStrategicBot(room);
  assert.match(room.chats.at(-1)?.text ?? "", /직접 아군 확인/);
  room.result = null; runStrategicBot(room);
  assert.equal(target.alive, false);
});

test("a lower attacker requires trusted information after one failure", () => {
  const room = new SingleRoom({ random: () => 0 });
  const reporter = room.join({ nickname: "reporter", socket: {} });
  const patrol = room.join({ nickname: "patrol", socket: {} });
  room.start(reporter.id);
  const target = room.players.find((player) => ![reporter.id, patrol.id].includes(player.id));
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  patrol.role = "순찰경찰"; patrol.announced = "순찰경찰"; patrol.mana = 200; patrol.lowAttackFails = 1; patrol.aiControlled = true;
  target.role = "마피아일원"; target.announced = "마피아일원";
  patrol.aiMemory = { reports: { [target.id]: { role: "마피아일원", reporterId: reporter.id, source: "제보" } }, trust: {}, claims: {}, knowledge: {}, sharedWith: {}, lastPublicAt: 0, recentLines: [], inbox: [] };
  runStrategicBot(room);
  assert.equal(target.alive, true);
  assert.equal(patrol.lowAttackFails, 1);
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

test("lower attack kills its user after two accumulated failures", () => {
  let now = 1_000;
  const room = new SingleRoom({ now: () => now, random: () => 0.5 });
  const host = room.join({ nickname: "patrol", socket: {} });
  const target = room.join({ nickname: "target", socket: {} });
  room.start(host.id); host.role = "순찰경찰"; target.role = "마피아일원"; host.mana = 200;
  room.act(host.id, { skillId: "lower-attack", targetId: target.id, role: "히트맨" });
  assert.equal(host.lowAttackFails, 1); assert.equal(host.alive, true);
  assert.match(host.privateLogs.at(-1).text, /1\/2/);
  now += 11_000;
  room.act(host.id, { skillId: "lower-attack", targetId: target.id, role: "마피아대부" });
  assert.equal(host.lowAttackFails, 2); assert.equal(host.alive, false);
  assert.match(room.logs.at(-1).text, /하급공격 2회 실패/);
});

test("a living patrol blocks the police-captain attack choice before inspecting the target", () => {
  const makeRoom = () => {
    const room = new SingleRoom({ random: () => 0.5 });
    const boss = room.join({ nickname: "boss", socket: {} });
    const captain = room.join({ nickname: "captain", socket: {} });
    room.start(boss.id); boss.role = "마피아대부"; boss.mana = 200; captain.role = "경찰반장";
    room.players.find((player) => player.id !== boss.id && player.id !== captain.id).role = "순찰경찰";
    return { room, boss, captain };
  };
  const actualCaptain = makeRoom();
  const manaBefore = actualCaptain.boss.mana;
  actualCaptain.room.act(actualCaptain.boss.id, { skillId: "lower-attack", targetId: actualCaptain.captain.id, role: "경찰반장" });
  assert.match(actualCaptain.boss.privateLogs.at(-1).text, /공격할 수 없습니다/);
  assert.equal(actualCaptain.boss.mana, manaBefore);
  assert.equal(actualCaptain.boss.cooldowns["lower-attack"], undefined);
  assert.equal(actualCaptain.boss.lowAttackFails, 0);
  assert.equal(actualCaptain.captain.alive, true);
  const unrelatedTarget = makeRoom();
  unrelatedTarget.captain.role = "자경단원";
  unrelatedTarget.room.act(unrelatedTarget.boss.id, { skillId: "lower-attack", targetId: unrelatedTarget.captain.id, role: "경찰반장" });
  assert.equal(unrelatedTarget.boss.privateLogs.at(-1).text, actualCaptain.boss.privateLogs.at(-1).text);
  assert.equal(unrelatedTarget.room.snapshotFor(unrelatedTarget.boss).verdict.message, actualCaptain.room.snapshotFor(actualCaptain.boss).verdict.message);
});

test("leadership does not unlock snipe but a correct one-use snipe command does", () => {
  let now = 1_000;
  const room = new SingleRoom({ now: () => now, random: () => 0.5 });
  const boss = room.join({ nickname: "boss", socket: {} });
  const hitman = room.join({ nickname: "hitman", socket: {} });
  const victim = room.join({ nickname: "victim", socket: {} });
  room.start(boss.id); boss.role = "마피아대부"; boss.announced = "마피아대부"; boss.mana = 200; hitman.role = "히트맨"; victim.role = "자경단원";
  room.act(boss.id, { skillId: "leadership", role: "히트맨" });
  assert.equal(room.snapshotFor(boss).verdict.title, "리더십 서치");
  assert.equal(room.snapshotFor(boss).verdict.success, true);
  assert.match(room.snapshotFor(boss).verdict.message, /hitman/);
  assert.equal(hitman.snipeAuthorized, false);
  assert.equal(room.logs.some((log) => /저격명령/.test(log.text)), false);
  assert.throws(() => room.act(hitman.id, { skillId: "snipe", targetId: victim.id }), /저격명령/);
  now += 11_000;
  room.act(boss.id, { skillId: "snipe-command", targetId: hitman.id });
  assert.equal(hitman.snipeAuthorized, true); assert.equal(boss.usedOnce["snipe-command"], true); assert.equal(boss.cooldowns["snipe-command"], undefined);
  const manaBefore = hitman.mana;
  room.act(hitman.id, { skillId: "snipe", targetId: victim.id });
  assert.equal(hitman.mana, manaBefore); assert.equal(hitman.snipeAuthorized, false); assert.equal(hitman.cooldowns.snipe, undefined); assert.equal(victim.alive, false);
});

test("snipe command result is public while its target stays private", () => {
  const room = new SingleRoom({ random: () => 0.5 });
  const boss = room.join({ nickname: "boss", socket: {} });
  const wrongTarget = room.join({ nickname: "wrong", socket: {} });
  room.start(boss.id); boss.role = "마피아대부"; wrongTarget.role = "자경단원";
  room.act(boss.id, { skillId: "snipe-command", targetId: wrongTarget.id });
  assert.equal(room.effect, null);
  assert.equal(room.logs.at(-1).text, "마피아대부의 저격명령이 실패했습니다.");
  assert.doesNotMatch(room.logs.at(-1).text, /wrong|히트맨|자경단원/);
  assert.match(boss.privateLogs.at(-1).text, /실패/);
});

test("both sides receive distinct alliance and shared hostility notifications", () => {
  let now = 1_000;
  const room = new SingleRoom({ now: () => now, random: () => 0.5 });
  const actor = room.join({ nickname: "alpha", socket: {} });
  const target = room.join({ nickname: "beta", socket: {} });
  room.start(actor.id);
  room.act(actor.id, { skillId: "ally-add", targetId: target.id });
  assert.equal(actor.privateLogs.at(-1).text, `${target.id}번 beta와 동맹이 되었습니다.`);
  assert.equal(target.privateLogs.at(-1).text, `${actor.id}번 alpha에게 동맹을 받았습니다.`);
  assert.equal(room.snapshotFor(actor).notification.tone, "alliance");
  assert.equal(room.snapshotFor(target).notification.tone, "alliance");
  assert.equal(actor.alliances.has(target.id), true); assert.equal(target.alliances.has(actor.id), true);
  now += 6_000;
  room.act(actor.id, { skillId: "ally-remove", targetId: target.id });
  assert.equal(actor.privateLogs.at(-1).text, `${target.id}번 beta와 적대관계가 되었습니다.`);
  assert.equal(target.privateLogs.at(-1).text, `${actor.id}번 alpha와 적대관계가 되었습니다.`);
  assert.equal(room.snapshotFor(actor).notification.tone, "hostile");
  assert.equal(room.snapshotFor(target).notification.tone, "hostile");
});

test("a living captain always prevents an attacker-extinction victory", () => {
  const players = [
    { role: "마피아대부", alive: true }, { role: "마피아일원", alive: true },
    { role: "경찰반장", alive: true }, { role: "자경단원", alive: false }, { role: "순찰경찰", alive: false },
  ];
  assert.equal(checkVictory(players, null), null);
  // A used arrest is already a terminal game state. Even malformed restored data
  // must not reinterpret a living captain as having no remaining victory route.
  players.find((player) => player.role === "경찰반장").usedOnce = { arrest: true };
  assert.equal(checkVictory(players, null), null);
});

test("unused revenge and a viable snipe command chain count as comeback threats", () => {
  const base = [
    { role: "마피아대부", alive: true, usedOnce: {} }, { role: "히트맨", alive: true, usedOnce: {}, snipeAuthorized: false },
    { role: "경찰반장", alive: true, usedOnce: {} }, { role: "남자연인", alive: true, usedOnce: {} },
    { role: "자경단원", alive: false }, { role: "순찰경찰", alive: false },
    { id: 6, role: "마피아후계자", alive: true },
  ];
  assert.equal(checkVictory(base, null), null);
  base.find((player) => player.role === "남자연인").usedOnce.revenge = true;
  assert.equal(checkVictory(base, null), null);
  const mafiaOnlySnipe = base.map((player) => ({ ...player, usedOnce: { ...(player.usedOnce ?? {}) } }));
  mafiaOnlySnipe.find((player) => player.role === "마피아대부").alive = false;
  mafiaOnlySnipe.find((player) => player.role === "히트맨").snipeAuthorized = true;
  assert.equal(checkVictory(mafiaOnlySnipe, 6), null);
  mafiaOnlySnipe.find((player) => player.role === "히트맨").usedOnce.snipe = true;
  assert.deepEqual(checkVictory(mafiaOnlySnipe, 6), { winner: "citizen", reason: "마피아의 남은 처치 수단 소진" });
});
