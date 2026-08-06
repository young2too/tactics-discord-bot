"use client";

import { useState } from "react";
import { useMultiplayerRoom } from "../hooks/use-multiplayer-room";
import { MultiplayerGame } from "./multiplayer-game";

export function ModeLobby({ onDebug, onMultiplayer, onTutorial }: { onDebug: () => void; onMultiplayer: () => void; onTutorial: () => void }) {
  return <main className="debug-lobby"><section className="lobby-card mode-card">
    <span className="result-kicker">TACTICS WEB</span>
    <h1>게임 모드 선택</h1>
    <p>실제 플레이어와 단일 방에 착석하거나, 규칙 기반 AI로 혼자 테스트할 수 있습니다.</p>
    <div className="mode-actions">
      <button className="start-debug" onClick={onMultiplayer}>멀티플레이 입장</button>
      <button className="secondary-mode" onClick={onDebug}>AI 디버그 게임</button>
      <button className="secondary-mode tutorial-mode" onClick={onTutorial}>전술 튜토리얼</button>
    </div>
  </section></main>;
}

export function MultiplayerLobby() {
  const room = useMultiplayerRoom();
  const [nickname, setNickname] = useState("");
  if (!room.state) return <main className="debug-lobby"><section className="lobby-card multiplayer-card">
    <span className="result-kicker">SINGLE LIVE ROOM</span>
    <h1>닉네임으로 착석</h1>
    <p>방 코드는 없습니다. 접속하면 하나뿐인 게임 로비의 빈 좌석에 바로 앉습니다.</p>
    <form onSubmit={(event) => { event.preventDefault(); if (nickname.trim()) room.connect(nickname.trim()); }}>
      <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={16} placeholder="닉네임" autoFocus />
      <button className="start-debug" disabled={room.status === "connecting"}>{room.status === "connecting" ? "연결 중…" : "착석하기"}</button>
    </form>
    {room.error && <p className="lobby-error">{room.error}</p>}
  </section></main>;

  const isHost = room.state.yourSeatId === room.state.hostId;
  if (room.state.phase === "game") return <MultiplayerGame room={room} />;
  return <main className="debug-lobby"><section className="lobby-card multiplayer-card">
    <span className="result-kicker">{room.status === "connected" ? "● LIVE" : "● RECONNECTING"}</span>
    <h1>{room.state.phase === "lobby" ? "플레이어 대기실" : "게임이 시작되었습니다"}</h1>
    {room.state.phase === "game" && <div className="assigned-role">
      <span>나의 실제 직업</span><strong>{room.state.yourRole}</strong>
      <small>다른 플레이어의 직업은 서버가 비공개로 보관합니다.</small>
    </div>}
    <div className="live-roster">{room.state.players.map((player) => <div className={`${player.id === room.state.yourSeatId ? "me" : ""} ${!player.connected ? "away" : ""}`} key={player.id}>
      <b>{player.id}</b><span>{player.nickname}</span>
      <small>{player.isBot ? "AI" : player.aiControlled ? "AI 대행" : player.connected ? "접속" : "연결 끊김"}</small>
    </div>)}</div>
    {room.state.phase === "lobby" && <>
      <label>총 게임 인원 <strong>{room.state.totalPlayers}명</strong></label>
      <div className="count-picker">{[8, 9, 10, 11, 12, 13].map((count) => <button key={count} className={room.state?.totalPlayers === count ? "active" : ""} disabled={!isHost || count < room.state.players.length} onClick={() => room.setTotal(count)}>{count}</button>)}</div>
      <p className="bot-fill">현재 사람 {room.state.players.length}명 · 시작 시 AI {room.state.totalPlayers - room.state.players.length}명 충원</p>
      <button className="start-debug" disabled={!isHost} onClick={room.start}>{isHost ? "직업을 무작위 배정하고 시작" : "방장이 시작하기를 기다리는 중"}</button>
    </>}
  </section></main>;
}
