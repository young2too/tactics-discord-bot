"use client";

import { useEffect, useMemo, useState } from "react";

type Faction = "mafia" | "citizen";
type Player = {
  id: number;
  name: string;
  announced: string;
  role: string;
  faction: Faction;
  alive: boolean;
  isMe?: boolean;
};

type Skill = {
  id: string;
  key: string;
  name: string;
  icon: string;
  cost: number;
  target: boolean;
  needsRole: boolean;
  tone: string;
  cooldown: number;
};

type GameResult = { winner: Faction; reason: string } | null;

const initialPlayers: Player[] = [
  { id: 1, name: "윤서", announced: "경찰반장", role: "마피아대부", faction: "mafia", alive: true },
  { id: 2, name: "민준", announced: "사립탐정", role: "사립탐정", faction: "citizen", alive: true },
  { id: 3, name: "하린", announced: "순찰경찰", role: "순찰경찰", faction: "citizen", alive: true },
  { id: 4, name: "도윤", announced: "마피아일원", role: "자경단원", faction: "citizen", alive: true },
  { id: 5, name: "서아", announced: "경찰반장", role: "경찰반장", faction: "citizen", alive: true },
  { id: 6, name: "지호", announced: "탐정조수", role: "히트맨", faction: "mafia", alive: true },
  { id: 7, name: "나", announced: "마피아일원", role: "마피아일원", faction: "mafia", alive: true, isMe: true },
  { id: 8, name: "예린", announced: "탐정조수", role: "탐정조수", faction: "citizen", alive: false },
];

const skills: Skill[] = [
  { id: "announce", key: "Q", name: "공표", icon: "⚑", cost: 0, target: false, needsRole: true, tone: "gold", cooldown: 120 },
  { id: "ally-check", key: "W", name: "아군 확인", icon: "◉", cost: 5, target: true, needsRole: false, tone: "blue", cooldown: 10 },
  { id: "attack", key: "E", name: "상급 공격", icon: "✦", cost: 40, target: true, needsRole: true, tone: "red", cooldown: 10 },
];

const formation = [
  { name: "마피아대부", faction: "mafia" as const },
  { name: "히트맨", faction: "mafia" as const },
  { name: "마피아일원", faction: "mafia" as const },
  { name: "경찰반장", faction: "citizen" as const },
  { name: "자경단원", faction: "citizen" as const },
  { name: "사립탐정", faction: "citizen" as const },
  { name: "순찰경찰", faction: "citizen" as const },
  { name: "탐정조수", faction: "citizen" as const },
];

function factionOf(role: string): Faction {
  return formation.find((item) => item.name === role)?.faction ?? "citizen";
}

const portraitRoles = [
  "마피아대부", "히트맨", "마피아일원", "마피아후계자",
  "스파이", "경찰반장", "자경단원", "사립탐정",
  "순찰경찰", "탐정조수", "남자연인", "여자연인", "공무원",
];

function portraitStyle(role: string) {
  const index = Math.max(0, portraitRoles.indexOf(role));
  const column = index % 4;
  const row = Math.floor(index / 4);
  return { backgroundPosition: `${column * 33.333}% ${row * 33.333}%` };
}

const seatPositions = [
  [50, 2], [75, 12], [92, 38], [78, 72], [50, 84], [22, 72], [8, 38], [25, 12],
];

const MANA_MAX = 200;
const MANA_TICK = 20;
const MANA_INTERVAL_SECONDS = 3 * 60;
const ATTACKER_ROLES = new Set(["마피아대부", "히트맨", "마피아일원", "자경단원", "순찰경찰"]);

function checkVictory(players: Player[]): GameResult {
  const citizenLeader = players.find((player) => player.role === "경찰반장");
  if (citizenLeader && !citizenLeader.alive) return { winner: "mafia", reason: "경찰반장 사망" };

  const mafiaBoss = players.find((player) => player.role === "마피아대부");
  if (mafiaBoss && !mafiaBoss.alive) return { winner: "citizen", reason: "마피아 대부 사망(후계자 없음/사망)" };

  const mafiaAttackers = players.filter((player) => player.alive && player.faction === "mafia" && ATTACKER_ROLES.has(player.role));
  if (mafiaAttackers.length === 0) return { winner: "citizen", reason: "마피아 공격권자 전멸" };

  const citizenAttackers = players.filter((player) => player.alive && player.faction === "citizen" && ATTACKER_ROLES.has(player.role));
  if (citizenAttackers.length === 0) return { winner: "mafia", reason: "시민 공격권자 전멸" };
  return null;
}

export function GameBoard() {
  const [players, setPlayers] = useState(initialPlayers);
  const [mana, setMana] = useState(20);
  const [manaTickSeconds, setManaTickSeconds] = useState(2 * 60 + 14);
  const [gameResult, setGameResult] = useState<GameResult>(null);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<Player | null>(null);
  const [effectTarget, setEffectTarget] = useState<number | null>(null);
  const [notice, setNotice] = useState("상급 공격을 준비하려면 우하단 스킬을 선택하세요.");
  const [logs, setLogs] = useState([
    { time: "21:08", icon: "⚑", text: "윤서가 경찰반장을 공표했습니다.", tone: "plain" },
    { time: "21:07", icon: "◉", text: "누군가 민준을 살피고 있습니다.", tone: "scan" },
    { time: "21:05", icon: "+", text: "마나 보급 · 모든 플레이어 +20", tone: "mana" },
  ]);

  const me = players.find((player) => player.isMe)!;
  const manaTickLabel = `${String(Math.floor(manaTickSeconds / 60)).padStart(2, "0")}:${String(manaTickSeconds % 60).padStart(2, "0")}`;

  useEffect(() => {
    if (gameResult) return;
    const timer = window.setInterval(() => {
      setManaTickSeconds((seconds) => Math.max(0, seconds - 1));
      setCooldowns((current) => {
        const next = Object.fromEntries(Object.entries(current).map(([id, seconds]) => [id, Math.max(0, seconds - 1)]));
        return Object.values(next).some((seconds) => seconds > 0) ? next : {};
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [gameResult]);

  useEffect(() => {
    if (manaTickSeconds !== 0) return;
    setMana((current) => Math.min(MANA_MAX, current + MANA_TICK));
    setLogs((current) => [{ time: "지금", icon: "+", text: `마나 보급 · 모든 플레이어 +${MANA_TICK}`, tone: "mana" }, ...current]);
    setNotice(`마나 보급 완료 · 마나가 ${MANA_TICK} 회복되었습니다.`);
    setManaTickSeconds(MANA_INTERVAL_SECONDS);
  }, [manaTickSeconds]);
  const modalRoles = useMemo(() => {
    if (!selectedSkill) return [];
    if (selectedSkill.id === "announce") return formation;
    return formation.filter((item) => item.faction === "citizen");
  }, [selectedSkill]);

  function chooseSkill(skill: Skill) {
    if (gameResult || mana < skill.cost || (cooldowns[skill.id] ?? 0) > 0) return;
    setSelectedTarget(null);
    setSelectedSkill(skill);
    setNotice(skill.target ? `${skill.name}: 게임판에서 대상을 선택하세요.` : `${skill.name}: 공표할 직업을 선택하세요.`);
  }

  function chooseTarget(player: Player) {
    if (!selectedSkill?.target || !isTargetable(player, selectedSkill)) return;
    setSelectedTarget(player);
    if (!selectedSkill.needsRole) resolveSkill(selectedSkill, player);
  }

  function isTargetable(player: Player, skill: Skill) {
    if (!player.alive || player.isMe) return false;
    const announcedFaction = factionOf(player.announced);
    if (skill.id === "ally-check") return announcedFaction === me.faction;
    if (skill.id === "enemy-check") return announcedFaction !== me.faction;
    return true;
  }

  function resolveSkill(skill: Skill, target: Player | null, guessedRole?: string) {
    setMana((value) => Math.max(0, value - skill.cost));
    setCooldowns((current) => ({ ...current, [skill.id]: skill.cooldown }));
    setSelectedSkill(null);
    setSelectedTarget(null);

    if (skill.id === "announce" && guessedRole) {
      const announceGain = guessedRole === me.role ? 10 : 5;
      setMana((current) => Math.min(MANA_MAX, current + announceGain));
      setPlayers((current) => current.map((player) => player.isMe ? { ...player, announced: guessedRole } : player));
      setLogs((current) => [{ time: "지금", icon: "⚑", text: `내가 ${guessedRole}을 공표했습니다.`, tone: "plain" }, ...current]);
      setNotice(`${guessedRole} 공표 완료 · 마나 +${announceGain} · 진명 여부와 보상량은 비공개입니다.`);
      return;
    }

    if (!target) return;
    setEffectTarget(target.id);
    window.setTimeout(() => setEffectTarget(null), 900);

    if (skill.id === "attack") {
      const hit = guessedRole === target.role;
      if (hit) {
        const nextPlayers = players.map((player) => player.id === target.id ? { ...player, alive: false } : player);
        const result = checkVictory(nextPlayers);
        setPlayers(nextPlayers);
        if (result) {
          setGameResult(result);
          setLogs((current) => [{ time: "지금", icon: "🏁", text: `게임 종료 · ${result.winner === "mafia" ? "마피아" : "시민"} 진영 승리`, tone: "danger" }, { time: "지금", icon: "✦", text: `${me.role}이 ${target.role}을 처치했습니다.`, tone: "danger" }, ...current]);
          setNotice(`게임 종료 · ${result.reason}`);
          return;
        }
        setLogs((current) => [{ time: "지금", icon: "✦", text: `${me.role}이 ${target.role}을 처치했습니다.`, tone: "danger" }, ...current]);
        setNotice(`공격 명중 · ${target.name}의 실제 직업은 ${target.role}이었습니다.`);
      } else {
        setLogs((current) => [{ time: "지금", icon: "↗", text: `${me.role}이 누군가를 ${guessedRole}(으)로 공격했으나 실패했습니다.`, tone: "danger" }, ...current]);
        setNotice(`공격 실패 · ${target.name}은(는) ${guessedRole}이(가) 아닙니다.`);
      }
      return;
    }

    setLogs((current) => [{ time: "지금", icon: "◉", text: `누군가 ${target.name}을 살피고 있습니다.`, tone: "scan" }, ...current]);
    setNotice(`${target.name}의 공표는 ${target.announced === target.role ? "진명" : "가명"}입니다.`);
  }

  function cancelTargeting() {
    setSelectedSkill(null);
    setSelectedTarget(null);
    setNotice("행동을 취소했습니다.");
  }

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">T</span><div><strong>TACTICS</strong><small>실시간 마피아 전술전</small></div></div>
        <div className="room-status"><span className="live-dot" /> ROOM 7K2F <b>8 / 8</b></div>
        <div className="supply"><span>다음 마나 보급</span><strong>{manaTickLabel}</strong><div className="supply-track"><i style={{ width: `${((MANA_INTERVAL_SECONDS - manaTickSeconds) / MANA_INTERVAL_SECONDS) * 100}%` }} /></div></div>
        <button className="sound-button" aria-label="소리 설정">♪</button>
      </header>

      <section className="battle-layout">
        <aside className="event-panel panel">
          <div className="panel-heading"><span>전장 기록</span><button>전체</button></div>
          <div className="event-list">
            {logs.map((log, index) => (
              <div className={`event-row ${log.tone}`} key={`${log.time}-${index}`}>
                <span className="event-icon">{log.icon}</span><p>{log.text}</p><time>{log.time}</time>
              </div>
            ))}
          </div>
          <div className="intel-note"><span>정보 규칙</span><p>사망한 플레이어의 실제 직업은 모든 플레이어에게 공개됩니다.</p></div>
        </aside>

        <section className={`board-area ${selectedSkill?.target ? "targeting" : ""}`}>
          <div className="mode-banner">
            <span>{selectedSkill ? (selectedSkill.target ? "TARGETING MODE" : "SELECT ROLE") : "BATTLE IN PROGRESS"}</span>
            <strong>{selectedSkill ? notice : "공표를 읽고, 적의 정체를 추적하세요"}</strong>
            {selectedSkill && <button onClick={cancelTargeting}>ESC 취소</button>}
          </div>
          <div className="arena">
            <div className="table-core">
              <div className="core-rings"><i /><i /><i /></div>
              <span className="round-label">실시간 진행 중</span>
              <strong>8</strong><small>플레이어</small>
            </div>
            {players.map((player, index) => {
              const [left, top] = seatPositions[index];
              const selectable = Boolean(selectedSkill?.target && isTargetable(player, selectedSkill));
              const untargetable = Boolean(selectedSkill?.target && !selectable);
              return (
                <button
                  className={`player-seat ${player.alive ? "alive" : "dead"} ${player.isMe ? "me" : ""} ${selectable ? "selectable" : ""} ${untargetable ? "untargetable" : ""} ${effectTarget === player.id ? "hit-effect" : ""}`}
                  style={{ left: `${left}%`, top: `${top}%` }}
                  key={player.id}
                  onClick={() => chooseTarget(player)}
                  disabled={Boolean(selectedSkill?.target) && !selectable}
                >
                  <span className="seat-pointer" />
                  <span className="portrait"><span className="portrait-art" style={portraitStyle(player.alive ? player.announced : player.role)} />{!player.alive && <b>☠</b>}</span>
                  <span className="player-copy"><strong>{player.name}{player.isMe && <em>YOU</em>}</strong><small>공표 · <b className={`${factionOf(player.announced)}-text`}>{player.announced}</b></small>{!player.alive && <small className={`revealed-role ${factionOf(player.role)}-text`}>실제 · {player.role}</small>}</span>
                  <span className={`life-state ${player.alive ? "" : "down"}`}>{player.alive ? "생존" : "사망 · 직업 공개"}</span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="detail-panel panel">
          <div className="panel-heading"><span>전술 정보</span><b>PRIVATE</b></div>
          <div className="role-card"><span className="role-kicker">나의 실제 직업</span><div className="role-portrait-large"><span style={portraitStyle(me.role)} /></div><h2>{me.role}</h2><p>시민 진영을 제거하고 팀의 승리 조건을 완성하십시오.</p><span className="faction-tag">마피아 진영</span></div>
          <div className="private-result"><span>개인 판정</span><p>{notice}</p></div>
          <div className="mana-block"><div><span>현재 마나</span><strong>{mana}<small>/ {MANA_MAX}</small></strong></div><div className="mana-track"><i style={{ width: `${(mana / MANA_MAX) * 100}%` }} /></div></div>
        </aside>
      </section>

      <footer className="command-deck">
        <div className="identity"><div className="mini-portrait"><span style={portraitStyle(me.role)} /></div><div><span>현재 공표</span><strong>{me.announced}</strong><small>실제 직업 · {me.role}</small></div><span className="health">● 생존</span></div>
        <div className="hint"><span>{selectedSkill ? selectedSkill.icon : "⌖"}</span><div><small>{selectedSkill ? "명령 대기 중" : "전술 지침"}</small><strong>{notice}</strong></div></div>
        <div className="skill-deck">
          <div className="deck-label"><span>스킬</span><small>클릭하여 사용</small></div>
          {skills.map((skill) => (
            <button className={`skill-button ${skill.tone} ${selectedSkill?.id === skill.id ? "active" : ""} ${(cooldowns[skill.id] ?? 0) > 0 ? "cooling" : ""}`} key={skill.id} onClick={() => chooseSkill(skill)} disabled={Boolean(gameResult) || mana < skill.cost || (cooldowns[skill.id] ?? 0) > 0}>
              {(cooldowns[skill.id] ?? 0) > 0 && <span className="cooldown-fill" style={{ width: `${(1 - (cooldowns[skill.id] ?? 0) / skill.cooldown) * 100}%` }} />}
              <kbd>{skill.key}</kbd><span className="skill-icon">{skill.icon}</span><strong>{skill.name}</strong><small>{skill.cost === 0 ? "무료" : `◆ ${skill.cost}`}</small>
              {(cooldowns[skill.id] ?? 0) > 0 && <span className="cooldown-time">{cooldowns[skill.id]}초</span>}
            </button>
          ))}
        </div>
      </footer>

      {selectedSkill?.needsRole && (selectedTarget || !selectedSkill.target) && (
        <div className="modal-backdrop" role="presentation" onMouseDown={cancelTargeting}>
          <section className="role-modal" role="dialog" aria-modal="true" aria-label="직업 선택" onMouseDown={(event) => event.stopPropagation()}>
            <header><span>{selectedSkill.icon}</span><div><small>{selectedSkill.name}</small><h2>{selectedTarget ? `${selectedTarget.name}의 직업을 지정하세요` : "공표할 직업을 선택하세요"}</h2></div><button onClick={cancelTargeting}>×</button></header>
            {selectedTarget && <div className="target-summary"><span>선택 대상</span><strong>{selectedTarget.name}</strong><small>공표 · {selectedTarget.announced}</small></div>}
            <div className="role-grid">
              {modalRoles.map((role) => <button className={`role-choice ${role.faction}`} key={role.name} onClick={() => resolveSkill(selectedSkill, selectedTarget, role.name)}>{role.name}<small>{role.faction === "mafia" ? "마피아 진영" : "시민 진영"}</small></button>)}
            </div>
            <footer><span>격발 전까지 마나가 소모되지 않습니다.</span><button onClick={cancelTargeting}>취소</button></footer>
          </section>
        </div>
      )}

      {gameResult && (
        <div className="game-over-backdrop">
          <section className={`game-over-panel ${gameResult.winner}`} role="dialog" aria-modal="true" aria-label="게임 종료 결과">
            <span className="result-kicker">GAME OVER</span>
            <h1>{gameResult.winner === "mafia" ? "마피아 진영 승리" : "시민 진영 승리"}</h1>
            <p>{gameResult.reason}</p>
            <div className="final-roster">
              {players.map((player) => (
                <div className={player.faction} key={player.id}>
                  <span>{player.alive ? "생존" : "사망"}</span><strong>{player.name}</strong><b>{player.role}</b><small>공표 · {player.announced}</small>
                </div>
              ))}
            </div>
            <button onClick={() => window.location.reload()}>프로토타입 다시 시작</button>
          </section>
        </div>
      )}
    </main>
  );
}
