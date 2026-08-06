import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { SingleRoom } from "./room.js";

const port = Number(process.env.PORT ?? 10000);
const room = new SingleRoom();
const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, phase: room.phase, players: room.players.length }));
    return;
  }
  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  response.end("TACTICS realtime server");
});
const wss = new WebSocketServer({ server, path: "/ws" });

function send(socket, payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}
function broadcastState() {
  for (const player of room.players) if (player.socket) send(player.socket, { type: "state", state: room.snapshotFor(player) });
}

wss.on("connection", (socket) => {
  socket.isAlive = true;
  socket.on("pong", () => { socket.isAlive = true; });
  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === "join") {
        const player = room.join({ nickname: message.nickname, token: message.token, socket });
        socket.playerId = player.id;
        send(socket, { type: "welcome", token: player.ownerToken, seatId: player.id });
        broadcastState();
        return;
      }
      if (!socket.playerId) throw new Error("먼저 입장하세요.");
      if (message.type === "set_total") room.setTotal(socket.playerId, message.total);
      else if (message.type === "start") room.start(socket.playerId);
      else if (message.type === "ping") { send(socket, { type: "pong" }); return; }
      else throw new Error("지원하지 않는 요청입니다.");
      broadcastState();
    } catch (error) {
      send(socket, { type: "error", message: error instanceof Error ? error.message : "요청 처리 실패" });
    }
  });
  socket.on("close", () => { room.disconnect(socket); broadcastState(); });
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) { socket.terminate(); continue; }
    socket.isAlive = false;
    socket.ping();
  }
}, 25000);
server.on("close", () => clearInterval(heartbeat));
process.on("SIGTERM", () => {
  for (const socket of wss.clients) send(socket, { type: "server_restart" });
  server.close(() => process.exit(0));
});
server.listen(port, "0.0.0.0", () => console.log(`TACTICS realtime server listening on ${port}`));
