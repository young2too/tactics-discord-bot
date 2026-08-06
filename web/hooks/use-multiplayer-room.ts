"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RoomState = {
  phase: "lobby" | "game";
  totalPlayers: number;
  hostId: number | null;
  yourSeatId: number;
  yourRole: string | null;
  mana?: number;
  nextManaIn?: number;
  cooldowns?: Record<string, number>;
  usedOnce?: Record<string, boolean>;
  lowAttackFails?: number;
  snipeAuthorized?: boolean;
  alliances?: number[];
  logs?: { time: string; icon: string; text: string; tone: string }[];
  privateLogs?: { time: string; text: string }[];
  chats?: { id: number; from: number; text: string; channel: "public" | "alliance" }[];
  effect?: { id: number; type: "inspect" | "attack" } | null;
  whisper?: { from: number; to: number; text: string } | null;
  verdict?: { id: number; title: string; success: boolean; message: string } | null;
  result?: { winner: "mafia" | "citizen"; reason: string } | null;
  players: {
    id: number;
    nickname: string;
    connected: boolean;
    isBot: boolean;
    aiControlled: boolean;
    alive: boolean;
    role: string | null;
    announced?: string;
    faction?: "mafia" | "citizen" | null;
  }[];
};

export function useMultiplayerRoom() {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const credentialsRef = useRef<{ nickname: string; token: string | null } | null>(null);
  const reconnectRef = useRef<() => void>(() => undefined);
  const [state, setState] = useState<RoomState | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "disconnected">("idle");
  const [error, setError] = useState("");

  const open = useCallback((nickname: string, reconnect = false) => {
    const sameOriginUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
    const serverUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL || (window.location.hostname === "localhost" ? "ws://localhost:10000/ws" : sameOriginUrl);
    if (!reconnect) setStatus("connecting");
    const savedToken = localStorage.getItem("tactics-reconnect-token");
    credentialsRef.current = { nickname, token: savedToken };
    const socket = new WebSocket(serverUrl);
    socketRef.current = socket;
    socket.onopen = () => {
      setStatus("connected");
      setError("");
      socket.send(JSON.stringify({ type: "join", nickname, token: credentialsRef.current?.token }));
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type === "welcome") {
        localStorage.setItem("tactics-reconnect-token", message.token);
        credentialsRef.current = { nickname, token: message.token };
      } else if (message.type === "state") setState(message.state);
      else if (message.type === "error") setError(message.message);
      else if (message.type === "server_restart") socket.close();
    };
    socket.onclose = () => {
      setStatus("disconnected");
      if (credentialsRef.current && reconnectTimer.current === null) {
        reconnectTimer.current = window.setTimeout(() => {
          reconnectTimer.current = null;
          reconnectRef.current();
        }, 2000);
      }
    };
    socket.onerror = () => setError("실시간 서버에 연결할 수 없습니다.");
  }, []);

  reconnectRef.current = () => {
    if (credentialsRef.current) open(credentialsRef.current.nickname, true);
  };

  useEffect(() => () => {
    credentialsRef.current = null;
    if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
    socketRef.current?.close();
  }, []);

  const send = (message: object) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify(message));
  };
  return {
    state,
    status,
    error,
    connect: (nickname: string) => open(nickname),
    setTotal: (total: number) => send({ type: "set_total", total }),
    start: () => send({ type: "start" }),
    act: (payload: { skillId: string; targetId?: number; role?: string; text?: string }) => send({ type: "action", ...payload }),
    chat: (text: string, channel: "public" | "alliance") => send({ type: "chat", text, channel }),
    restart: () => send({ type: "restart" }),
  };
}
