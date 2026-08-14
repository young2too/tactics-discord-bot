"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { useMultiplayerRoom } from "../hooks/use-multiplayer-room";
import type { ChatMessage, Player } from "../game/types";
import { Battlefield } from "./battlefield";
import { CommunicationPanel } from "./game-panels";
import { GameAudio } from "./game-audio";

type RoomController = ReturnType<typeof useMultiplayerRoom>;

export function SpectatorGame({ room }: { room: RoomController }) {
  const state = room.state!; const [feedOpen, setFeedOpen] = useState(false); const [channel, setChannel] = useState<"public" | "alliance">("public"); const [input, setInput] = useState("");
  const players = useMemo<Player[]>(() => state.players.map((player) => ({ id: player.id, name: player.nickname, announced: player.announced ?? "미공표", role: player.role ?? "비공개", faction: player.faction ?? "citizen", alive: player.alive, isMe: false })), [state.players]);
  const noopSubmit = (event: FormEvent<HTMLFormElement>) => event.preventDefault();
  return <main className={`game-shell spectator-shell size-${players.length} ${feedOpen ? "mobile-panel-chat" : "mobile-panel-closed"}`}>
    <GameAudio logs={state.logs ?? []} chats={(state.chats ?? []) as ChatMessage[]} effect={state.effect ?? null}/>
    <header className="topbar"><div className="brand"><span className="brand-mark">T</span><div><strong>TACTICS</strong><small>실시간 마피아 전술전</small></div></div><div className="room-status spectator-status"><span className="live-dot"/> SPECTATING <b>{players.filter((player) => player.alive).length} 생존</b></div><div className="spectator-queue"><span>다음 게임</span><strong>자동 참가 대기 중</strong></div></header>
    <section className="battle-layout">
      <CommunicationPanel players={players} messages={(state.chats ?? []) as ChatMessage[]} channel={channel} setChannel={setChannel} input={input} setInput={setInput} onSubmit={noopSubmit} logs={state.logs ?? []} readOnly/>
      <Battlefield players={players} mySeatIndex={0} selectedSkill={null} notice="관전 중" effectTarget={state.effect ?? null} alliances={[]} whisper={null} onCancel={() => undefined} onTarget={() => undefined} isTargetable={() => false}/>
      <aside className="detail-panel panel spectator-info"><div className="panel-heading"><span>관전 안내</span><b>OBSERVER</b></div><div className="spectator-card"><strong>게임 진행 중</strong><p>공표, 공개 채팅, 전장 효과와 사망 공개를 볼 수 있습니다.</p><p>개인 판정·귓말·동맹 정보는 공개되지 않습니다.</p></div></aside>
    </section>
    <footer className="spectator-footer"><span>◉ 관전 모드</span><strong>게임이 끝나고 다음 로비가 열리면 빈 좌석에 자동으로 참가합니다.</strong></footer>
    <button className="spectator-feed-toggle" onClick={() => setFeedOpen((open) => !open)}>{feedOpen ? "기록 닫기" : "채팅·전장 기록"}</button>
    {feedOpen && <button className="mobile-panel-shade open" aria-label="관전 기록 닫기" onClick={() => setFeedOpen(false)}/>} 
  </main>;
}
