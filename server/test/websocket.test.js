import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { WebSocket } from "ws";

test("websocket protocol joins, starts, and returns a private game snapshot", { timeout: 10_000 }, async () => {
  const port = 18000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ["index.js"], { cwd: new URL("..", import.meta.url), env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  try {
    const socket = await new Promise((resolve, reject) => {
      const attempt = () => {
        const candidate = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        candidate.once("open", () => resolve(candidate));
        candidate.once("error", () => { candidate.close(); setTimeout(attempt, 80); });
      };
      child.once("exit", (code) => reject(new Error(`server exited ${code}`)));
      attempt();
    });
    const gameState = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("game state timeout")), 5000);
      socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === "welcome") socket.send(JSON.stringify({ type: "start" }));
        if (message.type === "state" && message.state.phase === "game") { clearTimeout(timer); resolve(message.state); }
      });
    });
    socket.send(JSON.stringify({ type: "join", nickname: "integration-host" }));
    const state = await gameState;
    assert.ok(state.yourRole); assert.equal(state.players.length, 8);
    assert.equal(state.players.filter((player) => player.id !== state.yourSeatId).every((player) => player.role === null), true);
    socket.close();
  } finally {
    child.kill("SIGTERM");
  }
});
