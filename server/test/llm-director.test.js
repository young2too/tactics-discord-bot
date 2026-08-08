import test from "node:test";
import assert from "node:assert/strict";
import { LlmDirector } from "../llm-director.js";
import { SingleRoom } from "../room.js";
import { buildBotPlanningTurn, runStrategicBot } from "../bot-ai.js";

test("central LLM interpreter requests strict structured output", async () => {
  let requestBody;
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ output_text: JSON.stringify({ canonicalText: "나는 경찰반장이다. 2번의 자경단원 공표는 진명이다.", speechActs: [], strategicIntent: "share_intel", replyStyle: "cooperative", confidence: .96 }), usage: { input_tokens: 100, output_tokens: 25 } }) };
  };
  const director = new LlmDirector({ apiKey: "test-key", fetchImpl });
  const result = await director.interpret({ text: "나 경반이야 너 진명", channel: "whisper", senderId: 1, recipientIds: [2], visiblePlayers: [{ id: 1, announced: "경찰반장", alive: true }, { id: 2, announced: "자경단원", alive: true }] });
  assert.equal(result.strategicIntent, "share_intel");
  assert.equal(requestBody.model, "gpt-5.6-luna");
  assert.equal(requestBody.text.format.type, "json_schema");
  assert.equal(director.usage.calls, 1);
});

test("central LLM interpreter safely falls back on API failure", async () => {
  const director = new LlmDirector({ apiKey: "test-key", fetchImpl: async () => ({ ok: false, status: 429 }) });
  const result = await director.interpret({ text: "애매한 말", channel: "public", senderId: 1, recipientIds: [2], visiblePlayers: [] });
  assert.equal(result, null);
  assert.equal(director.usage.failures, 1);
});

test("private strategy planner uses Terra and can only select a supplied action id", async () => {
  let requestBody;
  const director = new LlmDirector({ apiKey: "test-key", fetchImpl: async (_url, options) => { requestBody = JSON.parse(options.body); return { ok: true, json: async () => ({ output_text: JSON.stringify({ actionId: "share:::5:", reason: "직접 확인 정보 공유", nextGoal: "공동 공격", confidence: .9 }) }) }; } });
  const result = await director.planTurn({ context: { self: { role: "사립탐정" }, facts: [] }, actions: [{ id: "share:::5:", type: "share" }] });
  assert.equal(result.actionId, "share:::5:"); assert.equal(requestBody.model, "gpt-5.6-terra"); assert.equal(requestBody.text.format.name, "tactics_plan");
});

test("LLM normalization preserves the original deictic proof for the rule engine", async () => {
  let resolveInterpretation;
  const llmDirector = { enabled: true, timeoutMs: 3500, interpret: () => new Promise((resolve) => { resolveInterpretation = resolve; }) };
  const room = new SingleRoom({ random: () => 0, llmDirector });
  const captain = room.join({ nickname: "captain", socket: {} }); const bot = room.join({ nickname: "bot", socket: {} }); room.start(captain.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = "자경단원"; });
  captain.role = "경찰반장"; captain.announced = "경찰반장"; captain.mana = 200; bot.role = "자경단원"; bot.announced = "자경단원"; bot.aiControlled = true;
  room.act(captain.id, { skillId: "ally-check", targetId: bot.id }); room.result = null;
  room.chat(captain.id, { text: `-${bot.id} 나 경반이야 너 진명` });
  resolveInterpretation({ canonicalText: `나는 경찰반장이다. ${bot.id}번의 자경단원 공표는 진명이다.`, speechActs: [], strategicIntent: "share_intel", replyStyle: "cooperative", confidence: .95 });
  await Promise.resolve();
  runStrategicBot(room);
  assert.equal(bot.aiMemory.trust[captain.id], .75);
  assert.match(bot.whisper?.text ?? "", /내 공표가 진명/);
});

test("bot planning context contains subjective evidence but never hidden enemy roles", () => {
  const room = new SingleRoom({ random: () => 0 }); const actor = room.join({ nickname: "actor", socket: {} }); const target = room.join({ nickname: "target", socket: {} }); room.start(actor.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = "자경단원"; });
  actor.role = "탐정조수"; actor.announced = "탐정조수"; actor.aiControlled = true; actor.mana = 200;
  target.role = "히트맨"; target.announced = "자경단원";
  actor.aiMemory = { knowledge: {}, claims: { [target.id]: { role: "자경단원", trust: .2 } }, trust: { [target.id]: .2 }, reports: {}, inbox: [] };
  const turn = buildBotPlanningTurn(room, actor); const fact = turn.context.facts.find((entry) => entry.seat === target.id);
  assert.equal(fact.knownRole, null); assert.equal(fact.announced, "자경단원"); assert.equal(JSON.stringify(turn.context).includes("히트맨"), false);
});

test("room executes only the legal action id selected by the private bot planner", async () => {
  let plannedTurn;
  const llmDirector = { enabled: true, planTurn: async (turn) => { plannedTurn = turn; const check = turn.actions.find((action) => action.skillId === "enemy-check"); return { actionId: check.id, reason: "미확인 적 명함을 확인", nextGoal: "확인 결과를 아군에게 공유", confidence: .9 }; } };
  const room = new SingleRoom({ random: () => 0, llmDirector }); const actor = room.join({ nickname: "actor", socket: {} }); const target = room.join({ nickname: "target", socket: {} }); room.start(actor.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = "자경단원"; });
  actor.role = "탐정조수"; actor.announced = "탐정조수"; actor.aiControlled = true; actor.mana = 200; target.role = "히트맨"; target.announced = "히트맨";
  room.runBot(); await new Promise((resolve) => setImmediate(resolve));
  assert.ok(plannedTurn.context.facts.length); assert.ok(actor.cooldowns["enemy-check"] > room.now()); assert.equal(actor.aiMemory.llmPlan.goal, "확인 결과를 아군에게 공유");
});

test("private planner can share a verified finding with allies and propagate its provenance", async () => {
  const llmDirector = { enabled: true, planTurn: async (turn) => { const share = turn.actions.find((action) => action.type === "share"); return { actionId: share.id, reason: "직접 확인한 적 정보 공유", nextGoal: "아군 공격 연계", confidence: .95 }; } };
  const room = new SingleRoom({ random: () => 0, llmDirector }); const investigator = room.join({ nickname: "investigator", socket: {} }); const ally = room.join({ nickname: "ally", socket: {} }); const enemy = room.join({ nickname: "enemy", socket: {} }); room.start(investigator.id);
  room.players.forEach((player) => { player.aiControlled = false; player.announced = "자경단원"; });
  investigator.role = "사립탐정"; investigator.announced = "사립탐정"; investigator.aiControlled = true; ally.role = "자경단원"; ally.announced = "자경단원"; ally.aiControlled = true; enemy.role = "히트맨"; enemy.announced = "히트맨";
  investigator.alliances.add(ally.id); ally.alliances.add(investigator.id);
  investigator.aiMemory = { knowledge: { [enemy.id]: { role: "히트맨", faction: "mafia", confidence: 1, source: "적군 스캔", excluded: [] } }, trust: { [ally.id]: .8 }, claims: {}, reports: {}, sharedWith: { [ally.id]: true }, inbox: [] };
  room.runBot(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ally.aiMemory.knowledge[enemy.id].role, "히트맨"); assert.match(ally.aiMemory.knowledge[enemy.id].source, /동맹 조사 공유/); assert.equal(room.chats.at(-1).channel, "alliance");
});

test("room rate-limits and caps strategy planning while rule bots keep running", async () => {
  let calls = 0; let now = 10_000;
  const llmDirector = { enabled: true, planTurn: async () => { calls += 1; return null; } };
  const room = new SingleRoom({ now: () => now, random: () => 0, llmDirector, strategyMinIntervalMs: 30_000, strategyMaxCallsPerGame: 1 }); const actor = room.join({ nickname: "actor", socket: {} }); room.start(actor.id);
  room.players.forEach((player) => { player.aiControlled = false; }); actor.aiControlled = true; actor.role = "공무원"; actor.announced = "공무원"; actor.mana = 200;
  room.runBot(); await new Promise((resolve) => setImmediate(resolve)); now += 31_000; room.runBot(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1); assert.equal(room.strategyCallsThisGame, 1);
});
