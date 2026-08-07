"use client";

import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { formations, skillTooltips } from "../game/catalog";
import { factionOf, portraitStyle } from "../game/rules";
import type { BattleLog, ChatMessage, GameResult, Player, PrivateLog, Skill } from "../game/types";

export function DebugLobby({ playerCount, debugRole, setPlayerCount, setDebugRole, onStart }: {
  playerCount: number; debugRole: string; setPlayerCount: (count: number) => void; setDebugRole: (role: string) => void; onStart: () => void;
}) {
  const availableRoles = formations[playerCount];
  return <main className="debug-lobby"><section className="lobby-card">
    <span className="result-kicker">DEBUG SOLO MODE</span><h1>봇 게임 만들기</h1>
    <p>나머지 자리는 규칙 기반 봇으로 채웁니다. 테스트할 인원과 내 직업을 선택하세요.</p>
    <label>총 인원 <strong>{playerCount}명</strong></label>
    <div className="count-picker">{[8, 9, 10, 11, 12, 13].map((count) => <button className={playerCount === count ? "active" : ""} key={count} onClick={() => { setPlayerCount(count); if (!formations[count].includes(debugRole)) setDebugRole(formations[count][0]); }}>{count}</button>)}</div>
    <label>내 직업 <small>디버그용 강제 지정</small></label>
    <div className="debug-role-grid">{availableRoles.map((role) => <button className={`${factionOf(role)} ${debugRole === role ? "active" : ""}`} key={role} onClick={() => setDebugRole(role)}>{role}</button>)}</div>
    <div className="formation-summary"><span>포메이션</span><p>{availableRoles.join(" · ")}</p></div>
    <button className="start-debug" onClick={onStart}>나머지를 봇으로 채워 시작</button>
  </section></main>;
}

export function CommunicationPanel({ players, messages, channel, setChannel, input, setInput, onSubmit, logs, privateLogs = [] }: {
  players: Player[]; messages: ChatMessage[]; channel: "public" | "alliance"; setChannel: Dispatch<SetStateAction<"public" | "alliance">>;
  input: string; setInput: Dispatch<SetStateAction<string>>; onSubmit: (event: FormEvent<HTMLFormElement>) => void; logs: BattleLog[]; privateLogs?: PrivateLog[];
}) {
  const [mobileTab, setMobileTab] = useState<"public" | "alliance" | "battle" | "tactical">("public");
  const visibleMessages = messages.filter((message) => message.channel === channel);
  const eventListRef = useRef<HTMLDivElement>(null);
  useEffect(() => { eventListRef.current?.scrollTo({ top: eventListRef.current.scrollHeight, behavior: "smooth" }); }, [logs.length]);
  return <aside className="event-panel panel">
    <div className="panel-heading chat-heading"><span>통신·기록</span><div className="chat-tabs"><button className={mobileTab === "public" ? "active" : ""} onClick={() => { setMobileTab("public"); setChannel("public"); }}>공개</button><button className={mobileTab === "alliance" ? "active" : ""} onClick={() => { setMobileTab("alliance"); setChannel("alliance"); }}>동맹</button><button className={`mobile-record-tab ${mobileTab === "battle" ? "active" : ""}`} onClick={() => setMobileTab("battle")}>전장</button><button className={`mobile-record-tab ${mobileTab === "tactical" ? "active" : ""}`} onClick={() => setMobileTab("tactical")}>전술</button></div></div>
    <div className={`chat-stream ${mobileTab === "battle" || mobileTab === "tactical" ? "mobile-chat-hidden" : ""}`}>{visibleMessages.length === 0 ? <p className="chat-empty">{channel === "public" ? <>모두에게 메시지를 보냅니다.<br/><code>-3 야</code> → 3번에게 귓말<br/><code>+3 야</code> → 3번에게서 수신 테스트<br/><code>/a 작전</code> → 동맹챗</> : <>현재 동맹에게만 보이는 채팅입니다.<br/>동맹 추가/파기는 우하단 스킬을 사용하세요.</>}</p> : visibleMessages.map((message) => {
      const sender = players.find((player) => player.id === message.from);
      return <p className={message.channel} key={message.id}><b>{message.channel === "alliance" ? "◇ 동맹 · " : ""}{message.from}번 {sender?.name}</b><span>{message.text}</span></p>;
    })}</div>
    <form className={`chat-form ${mobileTab === "battle" || mobileTab === "tactical" ? "mobile-chat-hidden" : ""}`} onSubmit={onSubmit}><input aria-label="채팅 메시지" value={input} onChange={(event) => setInput(event.target.value)} placeholder={channel === "public" ? "전체 · -3 발신 · +3 수신 테스트 · /a 동맹" : "동맹에게 메시지 보내기"} maxLength={160}/><button>전송</button></form>
    <div className={`mobile-record-view ${mobileTab === "battle" ? "active" : ""}`}>{logs.map((log, index) => <div className={`event-row ${log.tone}`} key={`${log.time}-mobile-${index}`}><span className="event-icon">{log.icon}</span><p>{log.text}</p><time>{log.time}</time></div>)}</div>
    <div className={`mobile-record-view tactical ${mobileTab === "tactical" ? "active" : ""}`}>{privateLogs.length ? privateLogs.map((log, index) => <p key={`${log.time}-mobile-private-${index}`}><time>{log.time}</time><span>{log.text}</span></p>) : <p className="chat-empty">아직 개인 판정 기록이 없습니다.</p>}</div>
    <div className="panel-heading event-subheading"><span>전장 기록</span><button>전체</button></div>
    <div className="event-list" ref={eventListRef}>{logs.map((log, index) => <div className={`event-row ${log.tone}`} key={`${log.time}-${index}`}><span className="event-icon">{log.icon}</span><p>{log.text}</p><time>{log.time}</time></div>)}</div>
    <div className="intel-note"><span>정보 규칙</span><p>사망한 플레이어의 실제 직업은 모든 플레이어에게 공개됩니다.</p></div>
  </aside>;
}

export function PrivateRolePanel({ me, notice, logs }: { me: Player; notice: string; logs: PrivateLog[] }) {
  const privateListRef = useRef<HTMLDivElement>(null);
  useEffect(() => { privateListRef.current?.scrollTo({ top: privateListRef.current.scrollHeight, behavior: "smooth" }); }, [logs.length]);
  return <aside className="detail-panel panel"><div className="panel-heading"><span>전술 정보</span><b>PRIVATE</b></div>
    <div className="role-card"><span className="role-kicker">나의 실제 직업</span><div className="role-portrait-large"><span style={portraitStyle(me.role)} /></div><h2>{me.role}</h2><p>시민 진영을 제거하고 팀의 승리 조건을 완성하십시오.</p><span className="faction-tag">{me.faction === "mafia" ? "마피아" : "시민"} 진영</span></div>
    <div className="private-result"><span>개인 판정</span><div className="private-log-list" ref={privateListRef}>{logs.length ? logs.map((log, index) => <p key={`${log.time}-${index}`}><time>{log.time}</time>{log.text}</p>) : <p><time>현재</time>{notice}</p>}</div></div>
    <div className="mana-block"><div><span>디버그 마나</span><strong>∞<small> 무제한</small></strong></div><div className="mana-track"><i style={{ width: "100%" }} /></div></div>
  </aside>;
}

export function SkillDeck({ me, notice, skills, selectedSkill, cooldowns, usedOnce, gameResult, onChoose, disabledSkills = [] }: {
  me: Player; notice: string; skills: Skill[]; selectedSkill: Skill | null; cooldowns: Record<string, number>; usedOnce: Record<string, boolean>; gameResult: GameResult; onChoose: (skill: Skill) => void; disabledSkills?: string[];
}) {
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);
  useEffect(() => {
    const closeTooltip = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest(".skill-slot")) setOpenTooltip(null);
    };
    document.addEventListener("pointerdown", closeTooltip);
    return () => document.removeEventListener("pointerdown", closeTooltip);
  }, []);
  return <footer className="command-deck">
    <div className="identity"><div className="mini-portrait"><span style={portraitStyle(me.role)} /></div><div><span>현재 공표</span><strong>{me.announced}</strong><small>실제 직업 · {me.role}</small></div><span className="health">● 생존</span></div>
    <div className="hint"><span>{selectedSkill ? selectedSkill.icon : "⌖"}</span><div><small>{selectedSkill ? "명령 대기 중" : "전술 지침"}</small><strong>{notice}</strong></div></div>
    <div className="skill-deck"><div className="deck-label"><span>스킬</span><small>클릭하여 사용</small></div>{skills.map((skill) => {
      const spent = Boolean(usedOnce[skill.id]);
      const remaining = cooldowns[skill.id] ?? 0;
      const tooltip = skillTooltips[skill.id];
      const usage = skill.target ? "대상 지정" : skill.needsRole ? "직업 선택" : skill.needsText ? "문구 입력" : "즉시 발동";
      const oneUse = ["leadership", "successor", "snipe-command", "arrest", "snipe", "revenge"].includes(skill.id);
      return <div className={`skill-slot ${openTooltip === skill.id ? "tooltip-open" : ""}`} key={skill.id}>
        <button className={`skill-button skill-${skill.id} ${skill.tone} ${selectedSkill?.id === skill.id ? "active" : ""} ${remaining > 0 ? "cooling" : ""} ${spent ? "spent" : ""}`} onClick={() => { setOpenTooltip(null); onChoose(skill); }} disabled={Boolean(gameResult) || remaining > 0 || spent || disabledSkills.includes(skill.id)} aria-describedby={`skill-tip-${skill.id}`}>
          {remaining > 0 && <span className="cooldown-fill" style={{ width: `${(1 - remaining / skill.cooldown) * 100}%` }} />}<kbd>{skill.key}</kbd><span className="skill-icon">{skill.icon}</span><strong>{skill.name}</strong><small>{skill.cost === 0 ? "무료" : `◆ ${skill.cost}`}</small>
          {remaining > 0 && !spent && <span className="cooldown-time">{remaining}초</span>}{spent && <span className="spent-label">사용 완료</span>}
        </button>
        <button className="skill-info" type="button" aria-label={`${skill.name} 설명 ${openTooltip === skill.id ? "닫기" : "열기"}`} aria-expanded={openTooltip === skill.id} onClick={() => setOpenTooltip((current) => current === skill.id ? null : skill.id)}>i</button>
        <aside className={`skill-tooltip ${skill.tone}`} id={`skill-tip-${skill.id}`} role="tooltip">
          <header><span>{skill.icon}</span><div><strong>{skill.name}</strong><small>{usage} · {skill.cost === 0 ? "마나 무료" : `마나 ${skill.cost}`}</small></div></header>
          <p>{tooltip?.description ?? "스킬을 사용합니다."}</p>
          {tooltip?.condition && <p className="tooltip-condition"><b>사용 조건</b>{tooltip.condition}</p>}
          {tooltip?.warning && <p className="tooltip-warning"><b>주의</b>{tooltip.warning}</p>}
          <footer>{skill.cooldown === 0 ? "지속 효과" : oneUse ? "게임당 1회" : `쿨타임 ${skill.cooldown}초`}</footer>
        </aside>
      </div>;
    })}</div>
  </footer>;
}
