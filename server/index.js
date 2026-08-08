import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { SingleRoom } from "./room.js";
import { LlmDirector } from "./llm-director.js";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(serverDir, "..");
const port = Number(process.env.PORT ?? 10000);
const serveWeb = process.env.SERVE_WEB === "true";
const webPort = Number(process.env.WEB_INTERNAL_PORT ?? 10001);
const llmDirector = new LlmDirector();
const room = new SingleRoom({ llmDirector });
let webProcess = null;

function proxyToWeb(request, response) {
  const proxy = http.request({ hostname: "127.0.0.1", port: webPort, path: request.url, method: request.method, headers: request.headers }, (upstream) => {
    response.writeHead(upstream.statusCode ?? 502, upstream.headers); upstream.pipe(response);
  });
  proxy.on("error", () => { if (!response.headersSent) response.writeHead(503, { "content-type": "text/plain; charset=utf-8", "retry-after": "2" }); response.end("웹 화면을 준비하고 있습니다. 잠시 후 새로고침하세요."); });
  request.pipe(proxy);
}

const server = http.createServer((request, response) => {
  if (request.url === "/health") { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ ok: true, phase: room.phase, players: room.players.length, web: serveWeb, llm: { enabled: llmDirector.enabled, dialogueModel: llmDirector.model, strategyModel: llmDirector.strategyModel, usage: llmDirector.usage } })); return; }
  if (serveWeb) { proxyToWeb(request, response); return; }
  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" }); response.end("TACTICS realtime server");
});
const wss = new WebSocketServer({ server, path: "/ws" });

function send(socket, payload) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload)); }
function broadcastState() { for (const player of room.players) if (player.socket) send(player.socket, { type: "state", state: room.snapshotFor(player) }); }
room.onAsyncChange = broadcastState;

wss.on("connection", (socket) => {
  socket.isAlive = true; socket.on("pong", () => { socket.isAlive = true; });
  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === "join") { const player = room.join({ nickname: message.nickname, token: message.token, socket }); socket.playerId = player.id; send(socket, { type: "welcome", token: player.ownerToken, seatId: player.id }); broadcastState(); return; }
      if (!socket.playerId) throw new Error("먼저 입장하세요.");
      if (message.type === "set_total") room.setTotal(socket.playerId, message.total);
      else if (message.type === "start") room.start(socket.playerId);
      else if (message.type === "action") room.act(socket.playerId, message);
      else if (message.type === "chat") room.chat(socket.playerId, message);
      else if (message.type === "restart") room.restart(socket.playerId);
      else if (message.type === "ping") { send(socket, { type: "pong" }); return; }
      else throw new Error("지원하지 않는 요청입니다.");
      broadcastState();
    } catch (error) { send(socket, { type: "error", message: error instanceof Error ? error.message : "요청 처리 실패" }); }
  });
  socket.on("close", () => { room.disconnect(socket); broadcastState(); });
});

if (serveWeb) {
  const cli = path.join(repoDir, "web", "node_modules", "vinext", "dist", "cli.js");
  webProcess = spawn(process.execPath, [cli, "start", "--port", String(webPort), "--hostname", "127.0.0.1"], { cwd: path.join(repoDir, "web"), env: { ...process.env, PORT: String(webPort) }, stdio: "inherit" });
  webProcess.on("exit", (code) => { if (code && !server.closed) console.error(`Web process exited with code ${code}`); });
}

const heartbeat = setInterval(() => { for (const socket of wss.clients) { if (!socket.isAlive) { socket.terminate(); continue; } socket.isAlive = false; socket.ping(); } }, 25000);
const gameClock = setInterval(() => { if (room.tick()) broadcastState(); }, 1000);
server.on("close", () => { clearInterval(heartbeat); clearInterval(gameClock); });
process.on("SIGTERM", () => { for (const socket of wss.clients) send(socket, { type: "server_restart" }); webProcess?.kill("SIGTERM"); server.close(() => process.exit(0)); });
server.listen(port, "0.0.0.0", () => console.log(`TACTICS web + realtime server listening on ${port} · LLM ${llmDirector.enabled ? llmDirector.model : "disabled"}`));
