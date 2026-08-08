const ROLE_NAMES = ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "스파이", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "남자연인", "여자연인", "공무원"];

const INTERPRETATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["canonicalText", "speechActs", "strategicIntent", "replyStyle", "confidence"],
  properties: {
    canonicalText: { type: "string", maxLength: 240 },
    speechActs: {
      type: "array", maxItems: 8,
      items: {
        type: "object", additionalProperties: false,
        required: ["type", "subject", "targetId", "role", "skill", "truthValue"],
        properties: {
          type: { type: "string", enum: ["role_claim", "role_report", "skill_report", "action_request", "alliance_offer", "question", "social"] },
          subject: { type: "string", enum: ["sender", "recipient", "seat", "unknown"] },
          targetId: { type: ["integer", "null"] },
          role: { type: ["string", "null"], enum: [...ROLE_NAMES, null] },
          skill: { type: ["string", "null"] },
          truthValue: { type: ["string", "null"], enum: ["true_role", "false_role", "unknown", null] },
        },
      },
    },
    strategicIntent: { type: "string", enum: ["share_intel", "request_verification", "coordinate_attack", "coordinate_scan", "build_alliance", "conceal_identity", "ask_identity", "casual", "unclear"] },
    replyStyle: { type: "string", enum: ["brief", "skeptical", "cooperative", "urgent"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
};

function outputText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  return (payload.output ?? []).flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text ?? null;
}

export class LlmDirector {
  constructor({ apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_MODEL_DIALOGUE ?? "gpt-5.6-luna", fetchImpl = globalThis.fetch, timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS ?? 3500) } = {}) {
    this.apiKey = apiKey; this.model = model; this.fetch = fetchImpl; this.timeoutMs = timeoutMs;
    this.enabled = Boolean(apiKey && fetchImpl && process.env.OPENAI_AI_ENABLED !== "false");
    this.inFlight = new Map(); this.usage = { calls: 0, inputTokens: 0, outputTokens: 0, failures: 0 };
  }

  async interpret({ text, channel, senderId, recipientIds, visiblePlayers }) {
    if (!this.enabled) return null;
    const key = JSON.stringify([text, channel, senderId, recipientIds, visiblePlayers.map((player) => [player.id, player.announced, player.alive])]);
    if (this.inFlight.has(key)) return this.inFlight.get(key);
    const request = this.#request({ text, channel, senderId, recipientIds, visiblePlayers }).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request); return request;
  }

  async #request(context) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch("https://api.openai.com/v1/responses", {
        method: "POST", signal: controller.signal,
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          reasoning: { effort: "low" },
          max_output_tokens: 500,
          store: false,
          input: [
            { role: "developer", content: "너는 한국어 마피아 전술 게임의 중앙 대화 해석기다. 원문에 없는 사실을 만들지 말고, 지칭과 축약어만 문맥에 맞게 풀어라. '나'는 sender, 귓말의 '너'는 recipient다. '너 진명'은 recipient가 검사 당시 공표한 직업이 진짜였다는 주장이지, 현재 실제 직업을 새로 알아낸 것이 아니다. canonicalText는 기존 규칙 엔진이 이해하도록 좌석 번호와 정식 직업명을 사용해 짧게 다시 쓴다. 애매하면 confidence를 낮추고 단정하지 마라." },
            { role: "user", content: JSON.stringify(context) },
          ],
          text: { format: { type: "json_schema", name: "tactics_message", strict: true, schema: INTERPRETATION_SCHEMA } },
        }),
      });
      if (!response.ok) throw new Error(`OpenAI ${response.status}`);
      const payload = await response.json(); const text = outputText(payload); if (!text) throw new Error("OpenAI response had no text output");
      const result = JSON.parse(text); this.usage.calls += 1; this.usage.inputTokens += payload.usage?.input_tokens ?? 0; this.usage.outputTokens += payload.usage?.output_tokens ?? 0;
      return result;
    } catch (error) {
      this.usage.failures += 1; console.warn(`LLM interpretation fallback: ${error instanceof Error ? error.message : "unknown error"}`); return null;
    } finally { clearTimeout(timeout); }
  }
}
