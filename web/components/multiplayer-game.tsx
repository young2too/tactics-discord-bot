"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { formations, roleSkillIds, skillCatalog } from "../game/catalog";
import { factionOf, portraitStyle } from "../game/rules";
import type { ChatMessage, Player, Skill } from "../game/types";
import { Battlefield } from "./battlefield";
import { CommunicationPanel, MobilePanelDock, SkillDeck, type MobilePanel } from "./game-panels";
import { ProclamationModal, RoleChoiceModal } from "./game-modals";
import type { useMultiplayerRoom } from "../hooks/use-multiplayer-room";

type RoomController = ReturnType<typeof useMultiplayerRoom>;

export function MultiplayerGame({ room }: { room: RoomController }) {
  const state = room.state!;
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<Player | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatChannel, setChatChannel] = useState<"public" | "alliance">("public");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [skillText, setSkillText] = useState("");
  const [dismissedVerdictId, setDismissedVerdictId] = useState<number | null>(null);
  const [dismissedNotificationId, setDismissedNotificationId] = useState<number | null>(null);
  useEffect(() => {
    if (!selectedSkill) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setSelectedSkill(null); setSelectedTarget(null); setSkillText("");
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedSkill]);
  const players = useMemo<Player[]>(() => state.players.map((player) => ({
    id: player.id,
    name: player.nickname,
    announced: player.announced ?? "미공표",
    role: player.role ?? "비공개",
    faction: player.faction ?? "citizen",
    alive: player.alive,
    isMe: player.id === state.yourSeatId,
  })), [state.players, state.yourSeatId]);
  const me = players.find((player) => player.isMe)!;
  const mySeatIndex = players.findIndex((player) => player.isMe);
  const skills = useMemo(() => [skillCatalog.announce, ...(roleSkillIds[state.yourRole ?? ""] ?? []).map((id) => skillCatalog[id]), skillCatalog["ally-add"], skillCatalog["ally-remove"]].map((skill, index) => ({ ...skill, cost: skill.id === "leadership" ? 40 : skill.id === "enemy-check" ? 10 : skill.cost, key: ["Q", "W", "E", "R", "T", "Y"][index] ?? String(index + 1) })), [state.yourRole]);
  const notice = room.error || state.privateLogs?.at(-1)?.text || "스킬을 선택하거나 채팅으로 정보를 교환하세요.";
  const manaTick = `${String(Math.floor((state.nextManaIn ?? 0) / 60)).padStart(2, "0")}:${String((state.nextManaIn ?? 0) % 60).padStart(2, "0")}`;
  useEffect(() => {
    if (!room.actionError) return;
    const timer = window.setTimeout(room.dismissActionError, 3200);
    return () => window.clearTimeout(timer);
  }, [room.actionError?.id]);
  const modalRoles = useMemo(() => {
    if (!selectedSkill) return [];
    let roles = formations[players.length].map((name) => ({ name, faction: factionOf(name) }));
    if (selectedSkill.id === "ally-scan" || selectedSkill.id === "leadership") roles = roles.filter((role) => role.faction === me.faction);
    if (selectedSkill.id === "advanced-scan") roles = roles.filter((role) => role.name !== "경찰반장");
    if (selectedSkill.id === "enemy-scan") roles = roles.filter((role) => role.faction !== me.faction && role.name !== "마피아대부" && role.name !== "경찰반장");
    else if (selectedSkill.id !== "announce" && selectedSkill.id !== "ally-scan" && selectedSkill.id !== "advanced-scan" && selectedSkill.id !== "leadership") roles = roles.filter((role) => role.faction !== me.faction);
    const deadRoles = new Set(players.filter((player) => !player.alive).map((player) => player.role));
    return roles.filter((role) => !deadRoles.has(role.name));
  }, [selectedSkill, players, me.faction]);

  function isTargetable(player: Player, skill: Skill) {
    if (!player.alive || player.isMe) return false;
    if (["ally-check", "enemy-check"].includes(skill.id) && player.announced === "미공표") return false;
    const sameClaimFaction = factionOf(player.announced) === me.faction;
    if (skill.id === "ally-check") return sameClaimFaction;
    if (skill.id === "enemy-check") return !sameClaimFaction;
    if (skill.id === "ally-add") return !(state.outgoingAlliances ?? []).includes(player.id);
    if (skill.id === "ally-remove") return (state.alliances ?? []).includes(player.id);
    return true;
  }
  function chooseSkill(skill: Skill) {
    if (selectedSkill?.id === skill.id) { cancel(); return; }
    setMobilePanel(null); setSelectedTarget(null); setSelectedSkill(skill);
    if (!skill.target && !skill.needsRole && !skill.needsText) { room.act({ skillId: skill.id }); setSelectedSkill(null); }
  }
  function chooseTarget(player: Player) {
    if (!selectedSkill || !isTargetable(player, selectedSkill)) return;
    if (selectedSkill.needsRole) setSelectedTarget(player);
    else { room.act({ skillId: selectedSkill.id, targetId: player.id }); setSelectedSkill(null); }
  }
  function resolveRole(role: string) {
    room.act({ skillId: selectedSkill!.id, targetId: selectedTarget?.id, role }); setSelectedSkill(null); setSelectedTarget(null);
  }
  function sendChat(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!chatInput.trim()) return; room.chat(chatInput.trim(), chatChannel); setChatInput(""); }
  function sendProclamation(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!skillText.trim()) return; room.act({ skillId: "proclamation", text: skillText.trim() }); setSkillText(""); setSelectedSkill(null); }
  function cancel() { setSelectedSkill(null); setSelectedTarget(null); setSkillText(""); }

  return <main className={`game-shell size-${players.length} mobile-panel-${mobilePanel ?? "closed"}`}>
    <header className="topbar"><div className="brand"><span className="brand-mark">T</span><div><strong>TACTICS</strong><small>실시간 마피아 전술전</small></div></div><div className="room-status"><span className="live-dot" /> LIVE ROOM <b>{players.filter((player) => player.alive).length} 생존</b></div><div className="supply"><span>마나 · 다음 보급 {manaTick}</span><strong>{state.mana ?? 0}</strong><div className="supply-track"><i style={{ width: `${Math.min(100, (state.mana ?? 0) / 2)}%` }} /></div></div></header>
    <section className="battle-layout">
      <CommunicationPanel players={players} messages={(state.chats ?? []) as ChatMessage[]} channel={chatChannel} setChannel={setChatChannel} input={chatInput} setInput={setChatInput} onSubmit={sendChat} logs={state.logs ?? []} privateLogs={state.privateLogs ?? []} />
      <Battlefield players={players} mySeatIndex={mySeatIndex} selectedSkill={selectedSkill} notice={notice} effectTarget={state.effect ?? null} alliances={state.alliances ?? []} incomingAlliances={state.incomingAlliances ?? []} outgoingAlliances={state.outgoingAlliances ?? []} whisper={state.whisper ?? null} onCancel={cancel} onTarget={chooseTarget} onWhisperPrefill={(player) => { setChatChannel("public"); setChatInput(`-${player.id} `); setMobilePanel("chat"); }} isTargetable={isTargetable} />
      <aside className="detail-panel panel"><div className="panel-heading"><span>전술 정보</span><b>PRIVATE</b></div><div className="role-card"><span className="role-kicker">나의 실제 직업</span><div className="role-portrait-large"><span style={portraitStyle(me.role)} /></div><h2>{me.role}</h2><span className="faction-tag">{me.faction === "mafia" ? "마피아" : "시민"} 진영</span></div>{(state.lowAttackFails ?? 0) > 0 && <div className="penalty-warning"><span>⚠ 하급공격 실패</span><strong>{state.lowAttackFails} / 2</strong><small>2회 실패 시 자신이 사망합니다.</small></div>}<div className="private-result"><span>개인 판정</span><div className="private-log-list">{(state.privateLogs ?? []).map((log, index) => <p key={`${log.time}-${index}`}><time>{log.time}</time>{log.text}</p>)}</div></div><div className="mana-block"><div><span>마나</span><strong>{state.mana ?? 0}<small> · 보급 {manaTick}</small></strong></div><div className="mana-track"><i style={{ width: `${Math.min(100, (state.mana ?? 0) / 2)}%` }} /></div></div></aside>
    </section>
    <SkillDeck me={me} notice={notice} skills={skills} selectedSkill={selectedSkill} cooldowns={state.cooldowns ?? {}} usedOnce={state.usedOnce ?? {}} gameResult={state.result ?? null} onChoose={chooseSkill} disabledSkills={!state.snipeAuthorized ? ["snipe"] : []} />
    <MobilePanelDock open={mobilePanel} setOpen={setMobilePanel}/>
    {selectedSkill?.needsRole && (selectedTarget || !selectedSkill.target) && <RoleChoiceModal skill={selectedSkill} target={selectedTarget} roles={modalRoles} onResolve={resolveRole} onCancel={cancel} />}
    {selectedSkill?.needsText && <ProclamationModal text={skillText} setText={setSkillText} onSubmit={sendProclamation} onCancel={cancel} />}
    {room.actionError && <div className="verdict-popup failure" key={room.actionError.id} role="button" tabIndex={0} onClick={room.dismissActionError} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") room.dismissActionError(); }}><span>{room.actionError.message.includes("마나 부족") ? "마나 부족" : "사용 불가"}</span><strong>실패</strong><p>{room.actionError.message}</p></div>}
    {state.verdict && state.verdict.id !== dismissedVerdictId && <div className={`verdict-popup ${state.verdict.success ? "success" : "failure"}`} key={state.verdict.id} role="button" tabIndex={0} onClick={() => setDismissedVerdictId(state.verdict!.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setDismissedVerdictId(state.verdict!.id); }}><span>{state.verdict.title}</span><strong>{state.verdict.success ? "성공" : "실패"}</strong><p>{state.verdict.message}</p></div>}
    {state.notification && state.notification.id !== dismissedNotificationId && <div className={`alliance-popup ${state.notification.tone}`} key={state.notification.id} role="button" tabIndex={0} onClick={() => setDismissedNotificationId(state.notification!.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setDismissedNotificationId(state.notification!.id); }}><span>{state.notification.title}</span><strong>{state.notification.tone === "alliance" ? "동맹" : "적대"}</strong><p>{state.notification.message}</p></div>}
    {state.result && <div className="game-over-backdrop"><section className={`game-over-panel ${state.result.winner}`}><span className="result-kicker">GAME OVER</span><h1>{state.result.winner === "mafia" ? "마피아 진영 승리" : state.result.winner === "citizen" ? "시민 진영 승리" : "게임 자동 종료"}</h1><p>{state.result.reason}</p><div className="final-roster">{players.map((player) => <div className={player.faction} key={player.id}><span>{player.alive ? "생존" : "사망"}</span><strong>{player.name}</strong><b>{player.role}</b><small>공표 · {player.announced}</small></div>)}</div>{state.hostId === state.yourSeatId ? <button onClick={room.restart}>다음 게임 로비 열기</button> : <button disabled>방장이 다음 게임을 준비하는 중</button>}</section></div>}
  </main>;
}
