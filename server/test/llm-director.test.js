import test from "node:test";
import assert from "node:assert/strict";
import { LlmDirector } from "../llm-director.js";

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
