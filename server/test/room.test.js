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

test("a mafia member can ally-check mafia claims but not citizen claims", () => {
  let now = 1_000; const room = new SingleRoom({ random: () => 0, now: () => now }); const member = room.join({ nickname: "member", socket: {} }); const hitman = room.join({ nickname: "hitman", socket: {} }); room.start(member.id);
  const citizen = room.players.find((player) => ![member.id, hitman.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; }); member.role = "마피아일원"; member.announced = "마피아일원"; member.mana = 100; hitman.role = "히트맨"; hitman.announced = "히트맨"; citizen.role = "자경단원"; citizen.announced = "자경단원";
  room.act(member.id, { skillId: "ally-check", targetId: hitman.id }); assert.equal(member.verdict.success, true); assert.match(member.verdict.message, /진명/); now += 11_000;
  assert.throws(() => room.act(member.id, { skillId: "ally-check", targetId: citizen.id }), /공표 진영에 맞는 대상/);
});

test("an isolated AI checker actively checks and does not repeat a disproved claim", () => {
  let now = 1_000; const room = new SingleRoom({ random: () => 0, now: () => now }); const member = room.join({ nickname: "member", socket: {} }); room.start(member.id);
  const [falseClaim, hitman] = room.players.filter((player) => player.id !== member.id).slice(0, 2); room.players.forEach((player) => { player.aiControlled = false; player.announced = "경찰반장"; }); member.role = "마피아일원"; member.announced = "마피아일원"; member.aiControlled = true; member.mana = 100; falseClaim.role = "자경단원"; falseClaim.announced = "히트맨"; hitman.role = "히트맨"; hitman.announced = "히트맨";
  runStrategicBot(room); assert.ok(member.aiMemory.knowledge[falseClaim.id].excluded.includes("히트맨"));
  now += 11_000; room.result = null; runStrategicBot(room); assert.equal(member.aiMemory.knowledge[hitman.id].role, "히트맨");
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

test("strategic bots do not emit speculative public filler", () => {
  const room = new SingleRoom({ random: () => 0 });
  const actor = room.join({ nickname: "speaker", socket: {} });
  room.start(actor.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  actor.role = "마피아일원"; actor.announced = "마피아일원"; actor.mana = 0; actor.aiControlled = true;
  const claimant = room.players.find((player) => player.id !== actor.id); claimant.announced = "마피아대부";
  runStrategicBot(room);
  assert.equal(room.chats.length, 0);
});

test("AI players announce again whenever the announcement cooldown expires", () => {
  let now = 1_000; const room = new SingleRoom({ now: () => now, random: () => 0 }); const human = room.join({ nickname: "human", socket: {} }); room.start(human.id);
  const bot = room.players.find((player) => player.isBot); room.players.forEach((player) => { player.aiControlled = false; }); bot.aiControlled = true; bot.mana = 0;
  runStrategicBot(room); const firstCooldown = bot.cooldowns.announce; assert.ok(firstCooldown > now); const firstMana = bot.mana;
  now = firstCooldown; bot.mana = 0; room.result = null; runStrategicBot(room);
  assert.ok(bot.cooldowns.announce > firstCooldown); assert.ok(bot.mana > 0); assert.ok(firstMana > 0);
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

test("a ready enemy-check takes priority over announcements and non-investigator bots", () => {
  const room = new SingleRoom({ random: () => 0 }); const idle = room.join({ nickname: "idle", socket: {} }); const checker = room.join({ nickname: "checker", socket: {} }); room.start(idle.id);
  const enemy = room.players.find((player) => ![idle.id, checker.id].includes(player.id));
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  idle.role = "자경단원"; idle.announced = "자경단원"; idle.aiControlled = true; idle.mana = 200;
  checker.role = "탐정조수"; checker.announced = "탐정조수"; checker.aiControlled = true; checker.mana = 200;
  enemy.role = "히트맨"; enemy.announced = "히트맨";
  room.runBot();
  assert.ok(checker.cooldowns["enemy-check"] > room.now());
  assert.equal(checker.cooldowns.announce, undefined);
  assert.equal(checker.verdict.title, "공표 확인");
});

test("each due AI gets its own action during the same server tick", () => {
  let now = 1_000;
  const room = new SingleRoom({ now: () => now, random: () => 0 });
  const human = room.join({ nickname: "human", socket: {} });
  const left = room.join({ nickname: "left", socket: {} });
  const right = room.join({ nickname: "right", socket: {} });
  room.start(human.id);
  room.players.forEach((player) => { player.aiControlled = false; player.nextAiActionAt = null; });
  left.role = "자경단원"; left.announced = "미공표"; left.aiControlled = true; left.nextAiActionAt = now;
  right.role = "자경단원"; right.announced = "미공표"; right.aiControlled = true; right.nextAiActionAt = now;

  room.tick();

  assert.ok(left.cooldowns.announce > now);
  assert.ok(right.cooldowns.announce > now);
  assert.ok(left.nextAiActionAt > now);
  assert.ok(right.nextAiActionAt > now);
});

test("a human message wakes only its AI recipient ahead of schedule", () => {
  let now = 1_000;
  const room = new SingleRoom({ now: () => now, random: () => 0 });
  const human = room.join({ nickname: "human", socket: {} });
  const listener = room.join({ nickname: "listener", socket: {} });
  const sleeper = room.join({ nickname: "sleeper", socket: {} });
  room.start(human.id);
  room.players.forEach((player) => { player.aiControlled = false; player.nextAiActionAt = null; });
  listener.aiControlled = true; listener.nextAiActionAt = now + 20_000;
  sleeper.aiControlled = true; sleeper.nextAiActionAt = now + 20_000;

  room.chat(human.id, { text: `-${listener.id} 너 누구야` });

  assert.equal(listener.nextAiActionAt, now + 650);
  assert.equal(sleeper.nextAiActionAt, now + 20_000);
});

test("an allied checker still spends a ready check instead of waiting for an order", () => {
  const room = new SingleRoom({ random: () => 0 }); const checker = room.join({ nickname: "checker", socket: {} }); const ally = room.join({ nickname: "ally", socket: {} }); room.start(checker.id);
  const enemy = room.players.find((player) => ![checker.id, ally.id].includes(player.id));
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  checker.role = "탐정조수"; checker.announced = "탐정조수"; checker.aiControlled = true; checker.mana = 200;
  ally.role = "자경단원"; ally.announced = "자경단원"; checker.alliances.add(ally.id); ally.alliances.add(checker.id);
  enemy.role = "마피아일원"; enemy.announced = "마피아일원";
  room.runBot();
  assert.ok(checker.cooldowns["enemy-check"] > room.now());
  assert.equal(checker.verdict.title, "공표 확인");
});

test("ally-check never targets a player already in the alliance line", () => {
  const room = new SingleRoom({ random: () => 0 }); const checker = room.join({ nickname: "checker", socket: {} }); const detective = room.join({ nickname: "detective", socket: {} }); room.start(checker.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = "히트맨"; });
  checker.role = "순찰경찰"; checker.announced = "순찰경찰"; checker.aiControlled = true; checker.mana = 200;
  detective.role = "사립탐정"; detective.announced = "사립탐정"; checker.alliances.add(detective.id); detective.alliances.add(checker.id);
  room.runBot();
  assert.equal(checker.cooldowns["ally-check"], undefined);
  assert.equal(checker.verdict, null);
});

test("checks and scans skip a trusted ally even before a formal alliance", () => {
  const room = new SingleRoom({ random: () => 0 }); const checker = room.join({ nickname: "checker", socket: {} }); const trusted = room.join({ nickname: "trusted", socket: {} }); room.start(checker.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = "히트맨"; });
  checker.role = "탐정조수"; checker.announced = "탐정조수"; checker.aiControlled = true; checker.mana = 200;
  trusted.role = "사립탐정"; trusted.announced = "탐정조수";
  checker.aiMemory = { knowledge: {}, claims: { [trusted.id]: { role: "탐정조수", trust: .8 } }, trust: { [trusted.id]: .8 }, reports: {}, inbox: [] };
  room.runBot();
  assert.equal(checker.cooldowns["ally-check"], undefined);
  assert.notEqual(checker.verdict?.message?.includes(trusted.nickname), true);
});

test("strategic bots understand terse role aliases and second-person true-role reports", () => {
  const room = new SingleRoom({ random: () => 0 });
  const captain = room.join({ nickname: "captain", socket: {} });
  const bot = room.join({ nickname: "listener", socket: {} });
  room.start(captain.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  captain.role = "경찰반장"; captain.announced = "경찰반장"; captain.mana = 200;
  bot.role = "자경단원"; bot.announced = "자경단원"; bot.aiControlled = true;
  room.act(captain.id, { skillId: "ally-check", targetId: bot.id });
  room.result = null;
  bot.announced = "순찰경찰"; // The proof must use the announcement snapshot from inspection time.
  room.chat(captain.id, { text: `-${bot.id} 나 경반이야 너 진명` });
  runStrategicBot(room);
  assert.equal(bot.aiMemory.claims[captain.id].role, "경찰반장");
  assert.equal(bot.aiMemory.trust[captain.id], .75);
  assert.equal(bot.aiMemory.knowledge[captain.id].role, "경찰반장");
  assert.match(bot.whisper?.text ?? "", /내 공표가 진명/);
});

test("a later true announcement cannot turn an earlier false check into proof", () => {
  const room = new SingleRoom({ random: () => 0 });
  const captain = room.join({ nickname: "captain", socket: {} });
  const bot = room.join({ nickname: "listener", socket: {} });
  room.start(captain.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  captain.role = "경찰반장"; captain.announced = "경찰반장"; captain.mana = 200;
  bot.role = "자경단원"; bot.announced = "순찰경찰"; bot.aiControlled = true;
  room.act(captain.id, { skillId: "ally-check", targetId: bot.id });
  room.result = null;
  bot.announced = "자경단원";
  room.chat(captain.id, { text: `-${bot.id} 나 경반이야 너 진명` });
  runStrategicBot(room);
  assert.equal(bot.aiMemory.claims[captain.id].trust, .15);
  assert.equal(bot.aiMemory.knowledge[captain.id], undefined);
});

test("strategic bots do not trust a terse true-role claim without a matching inspection effect", () => {
  const room = new SingleRoom({ random: () => 0 });
  const captain = room.join({ nickname: "captain", socket: {} });
  const bot = room.join({ nickname: "listener", socket: {} });
  room.start(captain.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  captain.role = "경찰반장"; captain.announced = "경찰반장";
  bot.role = "자경단원"; bot.announced = "자경단원"; bot.aiControlled = true;
  room.chat(captain.id, { text: `-${bot.id} 나 경반이야 너 진명` });
  runStrategicBot(room);
  assert.equal(bot.aiMemory.claims[captain.id].role, "경찰반장");
  assert.equal(bot.aiMemory.claims[captain.id].trust, .15);
  assert.equal(bot.aiMemory.knowledge[captain.id], undefined);
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
  room.act(assistant.id, { skillId: "detective-check", targetId: detective.id }); room.result = null;
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

test("a vigilante acts on multiple terse reports following public inspections", () => {
  const room = new SingleRoom({ random: () => 0 }); const assistant = room.join({ nickname: "assistant", socket: {} }); const vigilante = room.join({ nickname: "vigilante", socket: {} }); room.start(assistant.id);
  const [hitman, member] = room.players.filter((player) => ![assistant.id, vigilante.id].includes(player.id)).slice(0, 2); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); assistant.role = "탐정조수"; assistant.announced = "탐정조수"; vigilante.role = "자경단원"; vigilante.announced = "자경단원"; vigilante.aiControlled = true; vigilante.mana = 200; hitman.role = "히트맨"; hitman.announced = "히트맨"; member.role = "마피아일원"; member.announced = "마피아일원";
  room.recordInspection(hitman); room.recordInspection(member); room.chat(assistant.id, { text: `${hitman.id}번 히트맨 ${member.id}번 마피아일원!` });
  runStrategicBot(room); assert.equal(vigilante.aiMemory.reports[hitman.id].role, "히트맨"); assert.equal(vigilante.aiMemory.reports[member.id].role, "마피아일원");
  room.result = null; runStrategicBot(room); assert.equal(hitman.alive, false);
  room.result = null; runStrategicBot(room); assert.equal(vigilante.alliances.has(assistant.id), true);
});

test("a private detective trusts a recent detective-check approach without repeated role self-introduction", () => {
  const room = new SingleRoom({ random: () => 0 }); const assistant = room.join({ nickname: "assistant", socket: {} }); const detective = room.join({ nickname: "detective", socket: {} }); room.start(assistant.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); assistant.role = "탐정조수"; assistant.announced = "마피아일원"; assistant.mana = 200; detective.role = "사립탐정"; detective.announced = "사립탐정"; detective.aiControlled = true;
  room.act(assistant.id, { skillId: "detective-check", targetId: detective.id }); room.result = null; room.chat(assistant.id, { text: `-${detective.id} 탐정확인 찍고 찾아왔어.` }); runStrategicBot(room);
  assert.equal(detective.aiMemory.trust[assistant.id], .85); assert.match(detective.whisper?.text ?? "", /공표와 무관하게/);
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

test("a patrol risks its first lower attack on a concrete public report", () => {
  const room = new SingleRoom({ random: () => 0 });
  const reporter = room.join({ nickname: "reporter", socket: {} });
  const patrol = room.join({ nickname: "patrol", socket: {} });
  room.start(reporter.id);
  const target = room.players.find((player) => ![reporter.id, patrol.id].includes(player.id));
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  patrol.role = "순찰경찰"; patrol.announced = "순찰경찰"; patrol.mana = 200; patrol.aiControlled = true;
  target.role = "마피아일원"; target.announced = "마피아일원";
  room.chat(reporter.id, { text: `${target.id}번 마피아일원!` }); runStrategicBot(room);
  assert.equal(patrol.aiMemory.reports[target.id].evidence, .45); runStrategicBot(room);
  assert.equal(target.alive, false);
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

test("a patrol attacks from a terse human ally report without an action verb", () => {
  const room = new SingleRoom({ random: () => 0 }); const human = room.join({ nickname: "human", socket: {} }); const patrol = room.join({ nickname: "patrol", socket: {} }); room.start(human.id);
  const target = room.players.find((player) => ![human.id, patrol.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); human.role = "사립탐정"; patrol.role = "순찰경찰"; patrol.announced = "순찰경찰"; patrol.aiControlled = true; patrol.mana = 200; target.role = "마피아일원"; target.announced = "마피아일원"; human.alliances.add(patrol.id); patrol.alliances.add(human.id);
  room.chat(human.id, { text: `-${patrol.id} ${target.id}번 마피아일원이야` }); runStrategicBot(room);
  assert.equal(patrol.aiMemory.reports[target.id].role, "마피아일원"); room.result = null; runStrategicBot(room); assert.equal(target.alive, false);
});

test("a patrol with one failure still trusts a terse report from a known investigator", () => {
  const room = new SingleRoom({ random: () => 0 }); const assistant = room.join({ nickname: "assistant", socket: {} }); const patrol = room.join({ nickname: "patrol", socket: {} }); room.start(assistant.id);
  const target = room.players.find((player) => ![assistant.id, patrol.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); assistant.role = "탐정조수"; patrol.role = "순찰경찰"; patrol.announced = "순찰경찰"; patrol.aiControlled = true; patrol.mana = 200; patrol.lowAttackFails = 1; target.role = "마피아일원"; target.announced = "마피아일원"; patrol.aiMemory = { knowledge: { [assistant.id]: { role: "탐정조수", faction: "citizen", confidence: .85, source: "탐정 확인", excluded: [] } }, trust: {}, claims: {}, reports: {}, sharedWith: {}, lastPublicAt: 0, recentLines: [], inbox: [] };
  room.chat(assistant.id, { text: `-${patrol.id} ${target.id}번 마피아일원이야` }); runStrategicBot(room);
  assert.equal(patrol.aiMemory.reports[target.id].evidence, .8); room.result = null; runStrategicBot(room); assert.equal(target.alive, false);
});

test("a patrol follows relayed intel when the attributed source is a known investigator", () => {
  const room = new SingleRoom({ random: () => 0 }); const human = room.join({ nickname: "human", socket: {} }); const patrol = room.join({ nickname: "patrol", socket: {} }); const detective = room.join({ nickname: "detective", socket: {} }); room.start(human.id);
  const target = room.players.find((player) => ![human.id, patrol.id, detective.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); human.role = "공무원"; patrol.role = "순찰경찰"; patrol.announced = "순찰경찰"; patrol.aiControlled = true; patrol.mana = 200; patrol.lowAttackFails = 1; detective.role = "사립탐정"; target.role = "마피아일원"; target.announced = "마피아일원"; patrol.aiMemory = { knowledge: { [detective.id]: { role: "사립탐정", faction: "citizen", confidence: .85, source: "동맹 소개", excluded: [] } }, trust: {}, claims: {}, reports: {}, sharedWith: {}, lastPublicAt: 0, recentLines: [], inbox: [] };
  room.chat(human.id, { text: `-${patrol.id} ${target.id}번 마피아일원이야. ${detective.id}번 사립탐정이 알려줬어` }); runStrategicBot(room);
  assert.equal(patrol.aiMemory.reports[target.id].evidence, .8); assert.equal(patrol.aiMemory.reports[detective.id], undefined); room.result = null; runStrategicBot(room); assert.equal(target.alive, false);
});

test("an AI trusts a valid ally-check claimant who whispers immediately after inspecting it", () => {
  const room = new SingleRoom({ random: () => 0 });
  const patrol = room.join({ nickname: "patrol", socket: {} });
  const detective = room.join({ nickname: "detective", socket: {} });
  room.start(patrol.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  patrol.role = "순찰경찰"; patrol.announced = "순찰경찰"; patrol.mana = 200;
  detective.role = "사립탐정"; detective.announced = "사립탐정"; detective.mana = 200; detective.aiControlled = true;
  room.act(patrol.id, { skillId: "ally-check", targetId: detective.id });
  room.result = null;
  room.chat(patrol.id, { text: `-${detective.id} 나는 순찰경찰이고 방금 너를 아군 확인하고 왔어.` });
  runStrategicBot(room);
  assert.equal(detective.aiMemory.trust[patrol.id], .75);
  assert.match(detective.whisper?.text ?? "", /정황.*믿을게/);
  room.result = null; runStrategicBot(room);
  assert.equal(detective.alliances.has(patrol.id), true);
});

test("an AI accepts a delayed ally-check approach regardless of the sender's public claim", () => {
  let now = 1_000_000; const room = new SingleRoom({ random: () => 0, now: () => now }); const patrol = room.join({ nickname: "patrol", socket: {} }); const detective = room.join({ nickname: "detective", socket: {} }); room.start(patrol.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); patrol.role = "순찰경찰"; patrol.announced = "마피아일원"; patrol.mana = 200; detective.role = "사립탐정"; detective.announced = "사립탐정"; detective.aiControlled = true;
  room.act(patrol.id, { skillId: "ally-check", targetId: detective.id }); room.result = null; patrol.alliances.add(detective.id); detective.alliances.add(patrol.id); now += 12_000;
  room.chat(patrol.id, { text: "아확 찍고 찾아왔어", channel: "alliance" }); runStrategicBot(room);
  assert.equal(detective.aiMemory.trust[patrol.id], .75); assert.match(detective.whisper?.text ?? "", /정황.*믿을게/);
});

test("an AI reveals its real role when a directly confirmed ally asks privately", () => {
  const room = new SingleRoom({ random: () => 0 }); const human = room.join({ nickname: "human", socket: {} }); const patrol = room.join({ nickname: "patrol", socket: {} }); room.start(human.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); human.role = "사립탐정"; human.announced = "사립탐정"; patrol.role = "순찰경찰"; patrol.announced = "순찰경찰"; patrol.aiControlled = true;
  patrol.alliances.add(human.id); human.alliances.add(patrol.id); patrol.aiMemory = { knowledge: { [human.id]: { faction: "citizen", confidence: .8, source: "공표 확인", excluded: [] } }, trust: { [human.id]: .8 }, claims: {}, reports: {}, sharedWith: { [human.id]: true }, lastPublicAt: 0, recentLines: [], inbox: [] };
  room.chat(human.id, { text: "너 누구야?", channel: "alliance" }); runStrategicBot(room);
  assert.match(patrol.whisper?.text ?? "", /나는 순찰경찰/);
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

test("an authorized AI hitman immediately follows its boss's alliance snipe order", () => {
  const room = new SingleRoom({ random: () => 0 }); const boss = room.join({ nickname: "boss", socket: {} }); const hitman = room.join({ nickname: "hitman", socket: {} }); room.start(boss.id);
  const victim = room.players.find((player) => ![boss.id, hitman.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  boss.role = "마피아대부"; boss.announced = "마피아대부"; boss.mana = 200; hitman.role = "히트맨"; hitman.announced = "히트맨"; hitman.aiControlled = true; hitman.mana = 200;
  boss.alliances.add(hitman.id); hitman.alliances.add(boss.id); room.act(boss.id, { skillId: "snipe-command", targetId: hitman.id }); room.result = null;
  room.chat(boss.id, { text: `저격으로 ${victim.id}번 쏴줘`, channel: "alliance" }); runStrategicBot(room);
  assert.equal(victim.alive, false); assert.equal(hitman.snipeAuthorized, false); assert.equal(hitman.aiMemory.trust[boss.id], 1);
});

test("an authorized AI hitman follows its boss's concrete alliance scan order", () => {
  const room = new SingleRoom({ random: () => 0 }); const boss = room.join({ nickname: "boss", socket: {} }); const hitman = room.join({ nickname: "hitman", socket: {} }); room.start(boss.id);
  const target = room.players.find((player) => ![boss.id, hitman.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  boss.role = "마피아대부"; boss.announced = "마피아대부"; boss.mana = 200; hitman.role = "히트맨"; hitman.announced = "히트맨"; hitman.aiControlled = true; hitman.mana = 200; target.role = "순찰경찰"; target.announced = "순찰경찰";
  boss.alliances.add(hitman.id); hitman.alliances.add(boss.id); room.act(boss.id, { skillId: "snipe-command", targetId: hitman.id }); room.result = null;
  room.chat(boss.id, { text: `${target.id}번이 순찰경찰 같아. 스캔해줘`, channel: "alliance" }); runStrategicBot(room);
  assert.equal(hitman.aiMemory.knowledge[target.id].role, "순찰경찰"); assert.equal(hitman.aiMemory.trust[boss.id], 1);
});

test("an AI vigilante attacks a concrete role target requested by a confirmed ally", () => {
  const room = new SingleRoom({ random: () => 0 }); const human = room.join({ nickname: "human", socket: {} }); const vigilante = room.join({ nickname: "vigilante", socket: {} }); room.start(human.id);
  const target = room.players.find((player) => ![human.id, vigilante.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  human.role = "사립탐정"; human.announced = "사립탐정"; vigilante.role = "자경단원"; vigilante.announced = "자경단원"; vigilante.aiControlled = true; vigilante.mana = 200; target.role = "히트맨"; target.announced = "히트맨";
  vigilante.aiMemory = { knowledge: { [human.id]: { faction: "citizen", confidence: .8, source: "공표 확인", excluded: [] } }, trust: { [human.id]: .8 }, claims: {}, reports: {}, sharedWith: {}, lastPublicAt: 0, recentLines: [], inbox: [] };
  room.chat(human.id, { text: `-${vigilante.id} ${target.id}번 히트맨 쳐볼래?` }); runStrategicBot(room);
  assert.equal(target.alive, false); assert.match(human.whisper?.text ?? "", /공격 성공.*공격 명중/);
});

test("a citizen attacker immediately prioritizes a directly verified hitman over investigation and planning", () => {
  const llmDirector = { enabled: true, planTurn: async () => { throw new Error("urgent attack must not wait for planning"); } };
  const room = new SingleRoom({ random: () => 0, llmDirector }); const vigilante = room.join({ nickname: "vigilante", socket: {} }); const hitman = room.join({ nickname: "hitman", socket: {} }); room.start(vigilante.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  vigilante.role = "자경단원"; vigilante.announced = "자경단원"; vigilante.aiControlled = true; vigilante.mana = 200; hitman.role = "히트맨"; hitman.announced = "히트맨";
  vigilante.aiMemory = { knowledge: { [hitman.id]: { role: "히트맨", faction: "mafia", confidence: 1, source: "적군 확인", excluded: [] } }, trust: {}, claims: {}, reports: {}, inbox: [] };
  room.runBot();
  assert.equal(hitman.alive, false); assert.equal(room.botPlanInFlight, false);
});

test("a failed trusted attack report marks its reporter as a likely enemy and discredits the report", () => {
  const room = new SingleRoom({ random: () => 0 }); const reporter = room.join({ nickname: "reporter", socket: {} }); const vigilante = room.join({ nickname: "vigilante", socket: {} }); const target = room.join({ nickname: "target", socket: {} }); room.start(reporter.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  reporter.role = "마피아일원"; reporter.announced = "탐정조수"; vigilante.role = "자경단원"; vigilante.announced = "자경단원"; vigilante.aiControlled = true; vigilante.mana = 200; target.role = "순찰경찰"; target.announced = "히트맨";
  vigilante.aiMemory = { knowledge: {}, trust: { [reporter.id]: .8 }, claims: { [reporter.id]: { role: "탐정조수", trust: .8 } }, reports: { [target.id]: { role: "히트맨", reporterId: reporter.id, evidence: .8, source: "신뢰 동맹 제보" } }, inbox: [] };
  room.runBot();
  assert.equal(vigilante.verdict.success, false); assert.equal(vigilante.aiMemory.trust[reporter.id], -.8); assert.equal(vigilante.aiMemory.knowledge[reporter.id].faction, "mafia"); assert.equal(vigilante.aiMemory.reports[target.id].discredited, true);
});

test("an AI accepts a bare seat number in a whispered attack order", () => {
  const room = new SingleRoom({ random: () => 0 }); const human = room.join({ nickname: "human", socket: {} }); const vigilante = room.join({ nickname: "vigilante", socket: {} }); room.start(human.id);
  const target = room.players.find((player) => ![human.id, vigilante.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  human.role = "탐정조수"; human.announced = "탐정조수"; vigilante.role = "자경단원"; vigilante.announced = "자경단원"; vigilante.aiControlled = true; vigilante.mana = 200; target.role = "마피아일원"; target.announced = "마피아일원";
  human.alliances.add(vigilante.id); vigilante.alliances.add(human.id); vigilante.aiMemory = { knowledge: { [human.id]: { role: "탐정조수", faction: "citizen", confidence: .9, source: "아군 확인", excluded: [] } }, trust: { [human.id]: .9 }, claims: {}, reports: {}, inbox: [] };
  room.chat(human.id, { text: `-${vigilante.id} ${target.id} 마피아일원 쳐` }); runStrategicBot(room);
  assert.equal(target.alive, false); assert.match(vigilante.whisper?.text ?? "", /공격 성공/);
});

test("an AI private detective scans a concrete target requested by a confirmed ally", () => {
  const room = new SingleRoom({ random: () => 0 }); const human = room.join({ nickname: "human", socket: {} }); const detective = room.join({ nickname: "detective", socket: {} }); room.start(human.id);
  const target = room.players.find((player) => ![human.id, detective.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  human.role = "순찰경찰"; human.announced = "순찰경찰"; detective.role = "사립탐정"; detective.announced = "사립탐정"; detective.aiControlled = true; detective.mana = 200; target.role = "히트맨"; target.announced = "히트맨";
  detective.aiMemory = { knowledge: { [human.id]: { role: "순찰경찰", faction: "citizen", confidence: .75, source: "직후 아군 확인 접촉", excluded: [] } }, trust: { [human.id]: .75 }, claims: {}, reports: {}, sharedWith: {}, lastPublicAt: 0, recentLines: [], inbox: [] };
  room.chat(human.id, { text: `-${detective.id} ${target.id}번 히트맨 스캔해봐` }); runStrategicBot(room);
  assert.equal(detective.aiMemory.knowledge[target.id].role, "히트맨"); assert.match(human.whisper?.text ?? "", /스캔 성공.*히트맨/);
});

test("an allied human can directly order a support skill from an AI official", () => {
  const room = new SingleRoom({ random: () => 0 }); const human = room.join({ nickname: "human", socket: {} }); const official = room.join({ nickname: "official", socket: {} }); room.start(human.id);
  const target = room.players.find((player) => ![human.id, official.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); official.role = "공무원"; official.announced = "공무원"; official.aiControlled = true; official.mana = 200; target.mana = 20;
  human.alliances.add(official.id); official.alliances.add(human.id); room.chat(human.id, { text: `${target.id}번에게 마나 지원해줘`, channel: "alliance" }); runStrategicBot(room);
  assert.equal(target.mana, 50); assert.match(official.whisper?.text ?? "", /마나 지원 실행/);
});

test("an allied human can order an AI leader to use leadership", () => {
  const room = new SingleRoom({ random: () => 0 }); const human = room.join({ nickname: "human", socket: {} }); const boss = room.join({ nickname: "boss", socket: {} }); room.start(human.id);
  const hitman = room.players.find((player) => ![human.id, boss.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); boss.role = "마피아대부"; boss.announced = "마피아대부"; boss.aiControlled = true; boss.mana = 200; hitman.role = "히트맨"; hitman.announced = "히트맨";
  human.alliances.add(boss.id); boss.alliances.add(human.id); room.chat(human.id, { text: "히트맨을 리더십으로 찾아봐", channel: "alliance" }); runStrategicBot(room);
  assert.equal(boss.aiMemory.knowledge[hitman.id].role, "히트맨"); assert.equal(boss.usedOnce.leadership, true);
});

test("an AI trusts the real leader who approaches after finding it with leadership", () => {
  const room = new SingleRoom({ random: () => 0 }); const captain = room.join({ nickname: "captain", socket: {} }); const patrol = room.join({ nickname: "patrol", socket: {} }); room.start(captain.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); captain.role = "경찰반장"; captain.announced = "경찰반장"; captain.mana = 200; patrol.role = "순찰경찰"; patrol.announced = "마피아일원"; patrol.aiControlled = true;
  room.act(captain.id, { skillId: "leadership", role: "순찰경찰" }); room.result = null; room.chat(captain.id, { text: `-${patrol.id} 리더십으로 찾아왔어 너는 순찰경찰이야` }); runStrategicBot(room);
  assert.equal(patrol.aiMemory.trust[captain.id], 1); assert.equal(patrol.aiMemory.knowledge[captain.id].role, "경찰반장"); assert.match(patrol.whisper?.text ?? "", /리더십으로 나를 찾은 기록/);
  room.result = null; runStrategicBot(room); assert.equal(patrol.alliances.has(captain.id), true);
});

test("an AI mafia boss autonomously uses leadership to find its hitman", () => {
  const room = new SingleRoom({ random: () => 0 }); const human = room.join({ nickname: "human", socket: {} }); const boss = room.join({ nickname: "boss", socket: {} }); room.start(human.id);
  const hitman = room.players.find((player) => ![human.id, boss.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; if (player.role === "히트맨") player.role = "자경단원"; });
  boss.role = "마피아대부"; boss.announced = "마피아대부"; boss.aiControlled = true; boss.mana = 200; hitman.role = "히트맨"; hitman.announced = "히트맨";
  runStrategicBot(room);
  assert.equal(boss.aiMemory.knowledge[hitman.id].role, "히트맨"); assert.equal(boss.usedOnce.leadership, true);
  room.result = null; runStrategicBot(room); assert.equal(hitman.snipeAuthorized, true); assert.equal(hitman.snipeCommanderId, boss.id); assert.equal(boss.usedOnce["snipe-command"], true);
  room.result = null; runStrategicBot(room); assert.equal(boss.alliances.has(hitman.id), true);
});

test("a human hitman can ask an unallied AI boss to verify it with snipe command", () => {
  const room = new SingleRoom({ random: () => 0 }); const hitman = room.join({ nickname: "hitman", socket: {} }); const boss = room.join({ nickname: "boss", socket: {} }); room.start(hitman.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); hitman.role = "히트맨"; hitman.announced = "자경단원"; boss.role = "마피아대부"; boss.announced = "마피아대부"; boss.aiControlled = true; boss.mana = 200;
  room.chat(hitman.id, { text: `-${boss.id} 나는 히트맨이야. 저격명령으로 확인해줘.` }); runStrategicBot(room);
  assert.equal(hitman.snipeAuthorized, true); assert.equal(boss.aiMemory.trust[hitman.id], 1);
  room.result = null; runStrategicBot(room); assert.equal(boss.alliances.has(hitman.id), true);
});

test("a hitman already found by leadership can simply ask the AI boss for snipe command", () => {
  const room = new SingleRoom({ random: () => 0 }); const hitman = room.join({ nickname: "hitman", socket: {} }); const boss = room.join({ nickname: "boss", socket: {} }); room.start(hitman.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); hitman.role = "히트맨"; hitman.announced = "자경단원"; boss.role = "마피아대부"; boss.announced = "마피아대부"; boss.aiControlled = true; boss.mana = 200; boss.aiMemory = { knowledge: { [hitman.id]: { role: "히트맨", faction: "mafia", confidence: 1, source: "리더십", excluded: [] } }, trust: {}, claims: {}, reports: {}, sharedWith: {}, lastPublicAt: 0, recentLines: [], inbox: [] };
  room.chat(hitman.id, { text: `-${boss.id} 저격명령을 달라` }); runStrategicBot(room);
  assert.equal(hitman.snipeAuthorized, true); assert.equal(hitman.snipeCommanderId, boss.id); assert.equal(boss.usedOnce["snipe-command"], true);
});

test("snipe authorization intent accepts colloquial wording and spacing", () => {
  for (const request of ["저격내놔", "저격 줘", "저격권 좀 열어줘", "나 저격 쓸 수 있게 해줘", "저격 허가 내려 주세요"]) {
    const room = new SingleRoom({ random: () => 0 }); const hitman = room.join({ nickname: "hitman", socket: {} }); const boss = room.join({ nickname: "boss", socket: {} }); room.start(hitman.id);
    room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); hitman.role = "히트맨"; boss.role = "마피아대부"; boss.announced = "마피아대부"; boss.aiControlled = true; boss.mana = 200; boss.aiMemory = { knowledge: { [hitman.id]: { role: "히트맨", faction: "mafia", confidence: 1, source: "리더십", excluded: [] } }, trust: {}, claims: {}, reports: {}, sharedWith: {}, lastPublicAt: 0, recentLines: [], inbox: [] };
    room.chat(hitman.id, { text: `-${boss.id} ${request}` }); runStrategicBot(room); assert.equal(hitman.snipeAuthorized, true, request);
  }
});

test("a privately approaching human mafia member can form a provisional mafia alliance", () => {
  const room = new SingleRoom({ random: () => 0 }); const member = room.join({ nickname: "member", socket: {} }); const boss = room.join({ nickname: "boss", socket: {} }); room.start(member.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); member.role = "마피아일원"; member.announced = "순찰경찰"; boss.role = "마피아대부"; boss.announced = "마피아대부"; boss.aiControlled = true; boss.mana = 200;
  room.chat(member.id, { text: `-${boss.id} 나는 마피아일원이야. 같이 움직이자.` }); runStrategicBot(room);
  assert.equal(boss.aiMemory.trust[member.id], .7); room.result = null; runStrategicBot(room); assert.equal(boss.alliances.has(member.id), true);
});

test("a mafia member validates a hitman's public investigation and then allies with it", () => {
  const room = new SingleRoom({ random: () => 0 }); const hitman = room.join({ nickname: "hitman", socket: {} }); const member = room.join({ nickname: "member", socket: {} }); room.start(hitman.id);
  const patrol = room.players.find((player) => ![hitman.id, member.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  hitman.role = "히트맨"; hitman.announced = "히트맨"; hitman.mana = 200; member.role = "마피아일원"; member.announced = "마피아일원"; member.aiControlled = true; member.mana = 200; patrol.role = "순찰경찰"; patrol.announced = "순찰경찰";
  room.act(hitman.id, { skillId: "enemy-scan", targetId: patrol.id, role: "순찰경찰" }); room.result = null;
  room.chat(hitman.id, { text: `나는 히트맨인데 ${patrol.id}번 순찰경찰로 때려줘` }); runStrategicBot(room); room.result = null; runStrategicBot(room);
  assert.equal(patrol.alive, false); assert.ok(member.aiMemory.trust[hitman.id] >= .7);
  room.result = null; runStrategicBot(room); assert.equal(member.alliances.has(hitman.id), true); assert.match(hitman.whisper?.text ?? "", /공개 합동수사|히트맨/);
});

test("a trusted intermediary can introduce two allies who stay connected after its death", () => {
  const room = new SingleRoom({ random: () => 0 }); const hitman = room.join({ nickname: "hitman", socket: {} }); const boss = room.join({ nickname: "boss", socket: {} }); const member = room.join({ nickname: "member", socket: {} }); room.start(hitman.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); hitman.role = "히트맨"; hitman.announced = "히트맨"; hitman.aiControlled = true; boss.role = "마피아대부"; boss.announced = "마피아대부"; member.role = "마피아일원"; member.announced = "마피아일원";
  hitman.alliances.add(boss.id); hitman.alliances.add(member.id); boss.alliances.add(hitman.id); member.alliances.add(hitman.id);
  hitman.aiMemory = { knowledge: { [boss.id]: { role: "마피아대부", faction: "mafia", confidence: 1, source: "저격명령", excluded: [] }, [member.id]: { role: "마피아일원", faction: "mafia", confidence: .7, source: "검증된 공개 제보", excluded: [] } }, trust: { [boss.id]: 1, [member.id]: .7 }, claims: { [boss.id]: { role: "마피아대부", trust: 1 }, [member.id]: { role: "마피아일원", trust: .7 } }, reports: {}, sharedWith: { [boss.id]: true, [member.id]: true }, lastPublicAt: 0, recentLines: [], inbox: [] };
  boss.aiMemory = { knowledge: { [hitman.id]: { role: "히트맨", faction: "mafia", confidence: 1, source: "저격명령", excluded: [] } }, trust: { [hitman.id]: 1 }, claims: {}, reports: {}, sharedWith: {}, lastPublicAt: 0, recentLines: [], inbox: [] };
  member.aiMemory = { knowledge: { [hitman.id]: { role: "히트맨", faction: "mafia", confidence: .7, source: "검증된 공개 제보", excluded: [] } }, trust: { [hitman.id]: .7 }, claims: {}, reports: {}, sharedWith: {}, lastPublicAt: 0, recentLines: [], inbox: [] };
  runStrategicBot(room);
  assert.ok(boss.aiMemory.trust[member.id] >= .7); assert.ok(member.aiMemory.trust[boss.id] >= .7);
  hitman.alive = false; hitman.aiControlled = false; boss.aiControlled = true; member.aiControlled = true; room.result = null; runStrategicBot(room);
  assert.equal(boss.alliances.has(member.id), true); assert.equal(member.alliances.has(boss.id), true);
});

test("a human can introduce two AI allies with terse alliance chat", () => {
  const room = new SingleRoom({ random: () => 0 }); const human = room.join({ nickname: "human", socket: {} }); const left = room.join({ nickname: "left", socket: {} }); const right = room.join({ nickname: "right", socket: {} }); room.start(human.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); human.role = "탐정조수"; left.role = "사립탐정"; left.announced = "사립탐정"; left.aiControlled = true; right.role = "자경단원"; right.announced = "자경단원"; right.aiControlled = true; human.alliances.add(left.id); human.alliances.add(right.id); left.alliances.add(human.id); right.alliances.add(human.id);
  room.chat(human.id, { text: `${left.id}/${right.id} 아군이야`, channel: "alliance" }); runStrategicBot(room); runStrategicBot(room);
  assert.ok(left.aiMemory.trust[right.id] >= .7); assert.ok(right.aiMemory.trust[left.id] >= .7);
  room.result = null; runStrategicBot(room); assert.equal(left.alliances.has(right.id), true); assert.equal(right.alliances.has(left.id), true);
});

test("an AI private detective publishes a finding that an AI vigilante acts on", () => {
  const room = new SingleRoom({ random: () => 0 }); const detective = room.join({ nickname: "detective", socket: {} }); const vigilante = room.join({ nickname: "vigilante", socket: {} }); room.start(detective.id);
  const hitman = room.players.find((player) => ![detective.id, vigilante.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); detective.role = "사립탐정"; detective.announced = "마피아일원"; detective.aiControlled = true; vigilante.role = "자경단원"; vigilante.announced = "자경단원"; vigilante.mana = 200; vigilante.aiControlled = true; hitman.role = "히트맨"; hitman.announced = "히트맨";
  detective.aiMemory = { knowledge: { [hitman.id]: { role: "히트맨", faction: "mafia", confidence: 1, source: "스캔", excluded: [] } }, trust: {}, claims: {}, reports: {}, sharedWith: {}, lastPublicAt: 0, recentLines: [], inbox: [] };
  room.recordInspection(hitman);
  runStrategicBot(room); assert.match(room.chats.at(-1)?.text ?? "", new RegExp(`${hitman.id}번 히트맨 조사 성공`));
  detective.aiControlled = false; room.result = null; runStrategicBot(room); room.result = null; runStrategicBot(room);
  assert.equal(hitman.alive, false);
});

test("a citizen AI that enemy-checks mafia publishes the result for attackers", () => {
  const room = new SingleRoom({ random: () => 0 }); const assistant = room.join({ nickname: "assistant", socket: {} }); const vigilante = room.join({ nickname: "vigilante", socket: {} }); room.start(assistant.id);
  const member = room.players.find((player) => ![assistant.id, vigilante.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); assistant.role = "탐정조수"; assistant.announced = "탐정조수"; assistant.aiControlled = true; vigilante.role = "자경단원"; vigilante.announced = "자경단원"; vigilante.aiControlled = true; vigilante.mana = 200; member.role = "마피아일원"; member.announced = "마피아일원";
  assistant.aiMemory = { knowledge: { [member.id]: { role: "마피아일원", faction: "mafia", confidence: .8, source: "공표 확인", excluded: [] } }, trust: {}, claims: {}, reports: {}, sharedWith: {}, lastPublicAt: 0, recentLines: [], inbox: [] };
  room.recordInspection(member); runStrategicBot(room); assert.match(room.chats.at(-1)?.text ?? "", /탐정조수.*마피아일원 조사 성공/);
  assistant.aiControlled = false; room.result = null; runStrategicBot(room); room.result = null; runStrategicBot(room); assert.equal(member.alive, false);
});

test("mafia attackers retaliate against a citizen investigator who reveals themself publicly", () => {
  const room = new SingleRoom({ random: () => 0 }); const detective = room.join({ nickname: "detective", socket: {} }); const member = room.join({ nickname: "member", socket: {} }); room.start(detective.id);
  const hitman = room.players.find((player) => ![detective.id, member.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); detective.role = "사립탐정"; detective.announced = "마피아일원"; member.role = "마피아일원"; member.announced = "마피아일원"; member.aiControlled = true; member.mana = 200; hitman.role = "히트맨"; hitman.announced = "히트맨";
  room.recordInspection(hitman); room.chat(detective.id, { text: `나는 사립탐정이야. ${hitman.id}번 히트맨 조사 성공. 공격권 있는 시민은 히트맨으로 쳐줘.` });
  runStrategicBot(room); assert.equal(member.aiMemory.reports[detective.id].role, "사립탐정");
  room.result = null; runStrategicBot(room); assert.equal(detective.alive, false);
});

test("mafia AI turns a public investigator reveal into ally proof and trusts the exposed ally's information dump", () => {
  const room = new SingleRoom({ random: () => 0 }); const detective = room.join({ nickname: "detective", socket: {} }); const hitman = room.join({ nickname: "hitman", socket: {} }); const member = room.join({ nickname: "member", socket: {} }); room.start(detective.id);
  const assistant = room.players.find((player) => ![detective.id, hitman.id, member.id].includes(player.id));
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  detective.role = "사립탐정"; detective.announced = "사립탐정"; hitman.role = "히트맨"; hitman.announced = "자경단원"; member.role = "마피아일원"; member.announced = "마피아일원"; member.aiControlled = true; member.mana = 200; assistant.role = "탐정조수"; assistant.announced = "탐정조수";
  room.recordInspection(hitman); room.chat(detective.id, { text: `나는 사립탐정이야. ${hitman.id} 히트맨 조사 성공. 공격권 있는 시민은 히트맨으로 쳐줘.` }); runStrategicBot(room);
  assert.equal(member.aiMemory.knowledge[hitman.id].role, "히트맨"); assert.equal(member.aiMemory.trust[hitman.id], .8); assert.equal(member.aiMemory.reports[detective.id].role, "사립탐정");
  room.result = null; room.chat(hitman.id, { text: `${assistant.id} 탐정조수` }); runStrategicBot(room);
  assert.equal(member.aiMemory.reports[assistant.id].role, "탐정조수"); assert.ok(member.aiMemory.reports[assistant.id].evidence >= .7);
});

test("a private detective's reports become trusted when their role is revealed on death", () => {
  const room = new SingleRoom({ random: () => 0 }); const detective = room.join({ nickname: "detective", socket: {} }); const vigilante = room.join({ nickname: "vigilante", socket: {} }); room.start(detective.id);
  const hitman = room.players.find((player) => ![detective.id, vigilante.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); detective.role = "사립탐정"; detective.announced = "마피아일원"; vigilante.role = "자경단원"; vigilante.announced = "자경단원"; vigilante.mana = 200; vigilante.aiControlled = true; hitman.role = "히트맨"; hitman.announced = "히트맨";
  room.chat(detective.id, { text: `나는 사립탐정이야. ${hitman.id}번 히트맨 스캔 성공. 공격해줘.` }); runStrategicBot(room);
  assert.equal(vigilante.aiMemory.reports[hitman.id].evidence, .45);
  room.kill(detective, "공격"); room.result = null; runStrategicBot(room);
  assert.equal(vigilante.aiMemory.trust[detective.id], 1); assert.equal(hitman.alive, false);
});

test("AI allies share investigation findings through alliance chat", () => {
  const room = new SingleRoom({ random: () => 0 }); const detective = room.join({ nickname: "detective", socket: {} }); const vigilante = room.join({ nickname: "vigilante", socket: {} }); room.start(detective.id);
  const hitman = room.players.find((player) => ![detective.id, vigilante.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); detective.role = "사립탐정"; detective.announced = "사립탐정"; detective.aiControlled = true; vigilante.role = "자경단원"; vigilante.announced = "자경단원"; vigilante.aiControlled = true; vigilante.mana = 200; hitman.role = "히트맨"; hitman.announced = "히트맨";
  detective.alliances.add(vigilante.id); vigilante.alliances.add(detective.id); detective.aiMemory = { knowledge: { [hitman.id]: { role: "히트맨", faction: "mafia", confidence: 1, source: "적군 스캔", excluded: [] } }, publishedFindings: { [hitman.id]: true }, sharedWith: { [vigilante.id]: true }, trust: { [vigilante.id]: .8 }, claims: {}, reports: {}, lastPublicAt: 0, recentLines: [], inbox: [] };
  runStrategicBot(room);
  assert.match(room.chats.at(-1)?.text ?? "", new RegExp(`${hitman.id}번은 히트맨`)); assert.equal(room.chats.at(-1)?.channel, "alliance"); assert.equal(vigilante.aiMemory.knowledge[hitman.id].role, "히트맨");
  detective.aiControlled = false; room.result = null; runStrategicBot(room); assert.equal(hitman.alive, false);
});

test("an AI detective immediately dumps accumulated scan results to a newly connected ally", () => {
  const room = new SingleRoom({ random: () => 0 }); const human = room.join({ nickname: "human", socket: {} }); const detective = room.join({ nickname: "detective", socket: {} }); room.start(human.id);
  const hitman = room.players.find((player) => ![human.id, detective.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  human.role = "탐정조수"; detective.role = "사립탐정"; detective.aiControlled = true; detective.mana = 200; hitman.role = "히트맨";
  detective.aiMemory = { knowledge: { [hitman.id]: { role: "히트맨", faction: "mafia", confidence: 1, source: "적군 스캔", excluded: [] } }, trust: { [human.id]: .8 }, claims: {}, reports: {}, sharedFindings: {}, inbox: [] };
  room.act(human.id, { skillId: "ally-add", targetId: detective.id });
  assert.match(room.chats.at(-1)?.text ?? "", new RegExp(`지금까지 조사 결과 공유: ${hitman.id}번 히트맨`));
  assert.equal(room.chats.at(-1)?.channel, "alliance");
});

test("alliance intel sync does not repeat publicly revealed death roles", () => {
  const room = new SingleRoom({ random: () => 0 }); const human = room.join({ nickname: "human", socket: {} }); const detective = room.join({ nickname: "detective", socket: {} }); room.start(human.id);
  const dead = room.players.find((player) => ![human.id, detective.id].includes(player.id)); room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; });
  human.role = "탐정조수"; detective.role = "사립탐정"; detective.aiControlled = true; dead.alive = false;
  detective.aiMemory = { knowledge: { [dead.id]: { role: dead.role, faction: "mafia", confidence: 1, source: "사후 직업 공개", excluded: [] } }, trust: { [human.id]: .8 }, claims: {}, reports: {}, sharedFindings: {}, inbox: [] };
  const chatCount = room.chats.length; room.act(human.id, { skillId: "ally-add", targetId: detective.id });
  assert.equal(room.chats.length, chatCount);
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

test("mana ticks reward only alliances initiated toward the receiving player", () => {
  let now = 1_000; const room = new SingleRoom({ now: () => now, random: () => .5 }); const initiator = room.join({ nickname: "initiator", socket: {} }); const receiver = room.join({ nickname: "receiver", socket: {} }); room.start(initiator.id);
  room.players.forEach((player) => { player.aiControlled = false; player.mana = 0; }); room.act(initiator.id, { skillId: "ally-add", targetId: receiver.id });
  room.nextBotAt = Infinity; now = room.nextManaAt; room.tick();
  assert.equal(initiator.mana, 20); assert.equal(receiver.mana, 30);
  room.act(receiver.id, { skillId: "ally-remove", targetId: initiator.id }); receiver.mana = 0; now = room.nextManaAt; room.tick();
  assert.equal(receiver.mana, 20);
});

test("a confirmed AI ally reciprocates a human-initiated alliance for the human mana bonus", () => {
  const room = new SingleRoom({ random: () => 0 }); const human = room.join({ nickname: "human", socket: {} }); const detective = room.join({ nickname: "detective", socket: {} }); room.start(human.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; }); human.role = "탐정조수"; detective.role = "사립탐정"; detective.aiControlled = true;
  detective.aiMemory = { knowledge: { [human.id]: { role: "탐정조수", faction: "citizen", confidence: .8, source: "아군 확인", excluded: [] } }, trust: { [human.id]: .8 }, claims: {}, reports: {}, sharedFindings: {}, inbox: [] };
  room.act(human.id, { skillId: "ally-add", targetId: detective.id }); assert.equal(human.incomingAlliances.has(detective.id), false);
  runStrategicBot(room); assert.equal(human.incomingAlliances.has(detective.id), true); assert.match(room.chats.at(-1)?.text ?? "", /맞동맹/);
});

test("a game ends immediately when only AI-controlled survivors remain", () => {
  let now = 0; const room = new SingleRoom({ now: () => now, random: () => .37 }); const host = room.join({ nickname: "host", socket: {} }); room.start(host.id);
  room.players.forEach((player) => { player.aiControlled = true; player.isBot = true; });
  now += 1_000; room.tick();
  assert.deepEqual(room.result, { winner: "draw", reason: "생존한 인간 플레이어가 없어 자동 종료" }); assert.equal(room.strategyCallsThisGame, 0);
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
