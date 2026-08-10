import assert from "node:assert/strict";
import test from "node:test";
import { desiredAnnouncement, ensureDoctrine, scanRolePriorities, shouldPublishInvestigation } from "../ai/doctrines.js";
import { runInvestigationBot, runStrategicBot } from "../bot-ai.js";
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

test("citizen ally-checkers double-check a successful claim when a spy is alive", () => {
  let now = 1_000; const room = new SingleRoom({ now: () => now, random: () => 0 }); const captain = room.join({ nickname: "captain", socket: {} }); const target = room.join({ nickname: "target", socket: {} });
  room.setTotal(captain.id, 12); room.start(captain.id); room.players.forEach((player) => { player.aiControlled = false; player.announced = "미공표"; player.mana = 200; });
  captain.role = "경찰반장"; captain.announced = "경찰반장"; captain.aiControlled = true; target.role = "스파이"; target.announced = "자경단원"; target.aiControlled = true;
  runInvestigationBot(room, { actor: captain });
  assert.equal(captain.aiMemory.knowledge[target.id]?.role, undefined); assert.ok(captain.aiMemory.spyChallenges[target.id].awaitingRecheck);
  runStrategicBot(room, { actor: target }); assert.notEqual(target.announced, "자경단원");
  now += 11_000; runInvestigationBot(room, { actor: captain });
  assert.equal(captain.aiMemory.knowledge[target.id].role, "스파이"); assert.ok(captain.aiMemory.trust[target.id] < 0);
});

test("a successor prioritizes finding the boss before advanced scanning", () => {
  const { room, actor } = setup(); const boss = room.players.find((player) => player.id !== actor.id);
  actor.role = "마피아후계자"; actor.aiControlled = true; boss.role = "마피아대부"; actor.aiMemory = { knowledge: {}, claims: {}, trust: {} };
  runInvestigationBot(room, { actor });
  assert.ok(actor.cooldowns["boss-check"] > room.now()); assert.equal(actor.verdict.success, true);
});

test("an authorized hitman spends its shot on a confirmed captain", () => {
  const { room, actor } = setup(); const captain = room.players.find((player) => player.id !== actor.id);
  actor.role = "히트맨"; actor.aiControlled = true; actor.snipeAuthorized = true; captain.role = "경찰반장";
  actor.aiMemory = { knowledge: { [captain.id]: { role: "경찰반장", faction: "citizen", confidence: 1, excluded: [] } } };
  runStrategicBot(room, { actor });
  assert.equal(actor.usedOnce.snipe, true); assert.equal(captain.alive, false);
});

test("an official turns shared confirmed intel into a public proclamation", () => {
  const { room, actor } = setup(); const enemy = room.players.find((player) => player.id !== actor.id);
  actor.role = "공무원"; actor.aiControlled = true; enemy.role = "히트맨";
  actor.aiMemory = { knowledge: { [enemy.id]: { role: "히트맨", faction: "mafia", confidence: 1, source: "동맹 조사 공유", excluded: [] } } };
  runStrategicBot(room, { actor });
  assert.match(room.chats.at(-1).text, /\[공문\].*히트맨 확정/);
});

test("a boss designates a confirmed successor autonomously", () => {
  const { room, actor } = setup(); const successor = room.players.find((player) => player.id !== actor.id);
  actor.role = "마피아대부"; actor.aiControlled = true; successor.role = "마피아후계자";
  actor.aiMemory = { knowledge: { [successor.id]: { role: "마피아후계자", faction: "mafia", confidence: 1, excluded: [] } } };
  runStrategicBot(room, { actor });
  assert.equal(actor.usedOnce.successor, true); assert.equal(room.successorId, successor.id);
});

test("a mafia member briefly delegates a publicly exposed investigator to its known boss", () => {
  let now = 1_000; const room = new SingleRoom({ now: () => now, random: () => 0 }); const member = room.join({ nickname: "member", socket: {} }); const boss = room.join({ nickname: "boss", socket: {} }); const enemy = room.join({ nickname: "enemy", socket: {} }); room.start(member.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = player.role; player.mana = 200; }); room.result = null;
  member.role = "마피아일원"; member.aiControlled = true; boss.role = "마피아대부"; enemy.role = "사립탐정";
  member.aiMemory = { knowledge: { [boss.id]: { role: "마피아대부", faction: "mafia", confidence: 1, source: "아확", excluded: [] }, [enemy.id]: { role: "사립탐정", faction: "citizen", confidence: 1, source: "공개수사 신원 노출", excluded: [] } }, sharedWith: { [boss.id]: true }, trust: { [boss.id]: 1 }, claims: {}, reports: {} };
  runStrategicBot(room, { actor: member }); assert.equal(enemy.alive, true);
  now += 13_000; room.result = null; runStrategicBot(room, { actor: member }); assert.equal(enemy.alive, false);
});

test("patrol hides by default while lovers split public and hidden roles", () => {
  const { room, actor } = setup(); actor.role = "순찰경찰"; actor.announced = "미공표"; actor.aiMemory = {};
  assert.notEqual(desiredAnnouncement(room, actor), "순찰경찰");
  const partner = room.players.find((player) => player.id !== actor.id); actor.role = "남자연인"; partner.role = "여자연인";
  actor.aiMemory = { knowledge: { [partner.id]: { role: "여자연인", confidence: 1 } } }; partner.aiMemory = { knowledge: { [actor.id]: { role: "남자연인", confidence: 1 } } };
  const actorClaim = desiredAnnouncement(room, actor); const partnerClaim = desiredAnnouncement(room, partner);
  assert.equal([actorClaim === actor.role, partnerClaim === partner.role].filter(Boolean).length, 1);
});

test("a hidden investigator waits to publish until its scannable mafia roles are resolved", () => {
  const room = new SingleRoom({ random: () => .75 }); const actor = room.join({ nickname: "detective", socket: {} }); room.start(actor.id);
  room.players.forEach((player) => { player.aiControlled = false; }); actor.role = "사립탐정";
  actor.aiMemory = { knowledge: { 2: { role: "히트맨", confidence: 1 } } };
  assert.equal(ensureDoctrine(room, actor).mode, "hidden"); assert.equal(shouldPublishInvestigation(room, actor), false);
  actor.aiMemory.knowledge[3] = { role: "마피아일원", confidence: 1 };
  assert.equal(shouldPublishInvestigation(room, actor), true);
});
