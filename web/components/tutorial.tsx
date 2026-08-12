"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { formations, roleSkillIds, skillCatalog } from "../game/catalog";
import { trainingTracks } from "../game/guide-data";
import { factionOf } from "../game/rules";
import type { BattleLog, ChatMessage, Player, PrivateLog, PublicEffect, Skill } from "../game/types";
import { Battlefield } from "./battlefield";
import { RoleChoiceModal } from "./game-modals";
import { CommunicationPanel, MobilePanelDock, PrivateRolePanel, SkillDeck, type MobilePanel } from "./game-panels";
import { InteractiveTrackTraining } from "./tutorial-role-training";
import { GameAudio } from "./game-audio";

const basicSteps = [
  ["전장을 읽으세요", "당신은 항상 6시 방향입니다. 번호·공표·생존 여부는 공개되며 실제 직업은 본인과 사망자만 보입니다."],
  ["직업을 공표하세요", "하단 공표 스킬을 누르고 순찰경찰을 선택하세요. 진명 공표로 마나 10을 얻습니다."],
  ["공개 채팅을 보내세요", "오른쪽 채팅창에 아무 메시지나 입력해 전체 플레이어에게 보내세요."],
  ["3번 패널을 길게 누르세요", "모바일에서는 플레이어 패널을 길게 누르면 귓말 번호가 자동 입력됩니다. ‘-3 ’ 뒤에 내용을 적어 보내세요. 공개 채팅에는 남지 않습니다."],
  ["동맹을 맺으세요", "하단 동맹 추가 스킬을 누르고 게임판의 2번 민준을 선택하세요."],
  ["동맹 채팅을 보내세요", "채팅창의 동맹 탭으로 전환한 뒤 동맹에게만 보일 메시지를 보내세요."],
  ["공표를 확인하세요", "아군 확인을 누른 뒤 게임판의 4번 서아를 선택하세요."],
  ["공격 실패를 경험하세요", "하급공격 → 3번 현우 → 히트맨 순서로 선택하세요."],
  ["사망 정보를 확보하세요", "다시 하급공격 → 3번 현우 → 마피아일원을 선택하세요."],
] as const;

const initialTrainingPlayers: Player[] = [
  { id: 1, name: "나", announced: "미공표", role: "순찰경찰", faction: "citizen", alive: true, isMe: true },
  { id: 2, name: "민준", announced: "사립탐정", role: "비공개", faction: "citizen", alive: true },
  { id: 3, name: "현우", announced: "마피아일원", role: "비공개", faction: "mafia", alive: true },
  { id: 4, name: "서아", announced: "자경단원", role: "비공개", faction: "citizen", alive: true },
  { id: 5, name: "지민", announced: "경찰반장", role: "비공개", faction: "citizen", alive: true },
  { id: 6, name: "윤서", announced: "탐정조수", role: "비공개", faction: "mafia", alive: true },
  { id: 7, name: "도윤", announced: "마피아대부", role: "비공개", faction: "mafia", alive: true },
  { id: 8, name: "예린", announced: "미공표", role: "비공개", faction: "citizen", alive: true },
];

export function FirstVisitPrompt({ onTutorial, onSkip }: { onTutorial: () => void; onSkip: () => void }) {
  return <main className="welcome-gate"><section><small>WELCOME TO TACTICS</small><h1>처음 전장에 오셨나요?</h1><p>5분 기본 훈련에서 공표, 공개·비공개 대화, 동맹, 조사와 공격을 실제 게임 화면으로 익힐 수 있습니다. 언제든 건너뛰고 룰북에서 다시 확인할 수 있습니다.</p><div><button onClick={onTutorial}>튜토리얼 시작</button><button onClick={onSkip}>바로 입장</button></div></section></main>;
}

export function TrainingCenter({ onExit }: { onExit: () => void }) {
  const [mode, setMode] = useState<"menu" | "basic" | "tracks">("menu");
  const [completedTracks, setCompletedTracks] = useState<string[]>([]);
  const [activeTrack, setActiveTrack] = useState<(typeof trainingTracks)[number] | null>(null);
  const [trackStep, setTrackStep] = useState(0);

  if (mode === "menu") return <main className="training-menu"><section><small>TACTICS ACADEMY</small><h1>전술 훈련소</h1><p>기본 조작을 익힌 뒤 13개 직업의 실전 운영과 수사·연결·처형 루트를 훈련할 수 있습니다.</p><div className="training-menu-actions"><button onClick={() => setMode("basic")}>기본 전술 훈련 <span>약 5분 · 9단계</span></button><button onClick={() => setMode("tracks")}>직업별 실전 훈련 <span>13개 직업 · 각 4단계</span></button></div><button className="training-exit" onClick={() => { localStorage.removeItem("tactics-tutorial-complete"); localStorage.removeItem("tactics-onboarding-dismissed"); setCompletedTracks([]); }}>진행 기록 초기화</button><button className="training-exit" onClick={onExit}>모드 선택으로 돌아가기</button></section></main>;

  if (mode === "tracks" && !activeTrack) return <main className="training-menu"><section className="track-menu"><small>SPECIALIZED TRAINING</small><h1>직업별 실전 훈련</h1><p>직업을 선택해 공표 전략, 조사 우선순위, 동맹 연결과 승리 루트를 실제 게임판에서 확인하세요.</p><div className="track-grid">{trainingTracks.map((track) => <button className={`${track.faction} ${completedTracks.includes(track.id) ? "complete" : ""}`} key={track.id} onClick={() => { setActiveTrack(track); setTrackStep(0); }}><b>{completedTracks.includes(track.id) ? "✓ " : ""}{track.role}</b><span>{track.summary}</span><small>{track.steps.length}단계 · {track.faction === "mafia" ? "마피아 진영" : "시민 진영"}</small></button>)}</div><button className="training-exit" onClick={() => setMode("menu")}>훈련소 처음으로</button><button className="training-finish" onClick={onExit}>훈련을 마치고 입장</button></section></main>;

  if (activeTrack) return <InteractiveTrackTraining track={activeTrack} step={trackStep} onAdvance={() => {
    if (trackStep < activeTrack.steps.length - 1) setTrackStep((current) => current + 1);
    else { setCompletedTracks((current) => [...new Set([...current, activeTrack.id])]); setActiveTrack(null); setTrackStep(0); }
  }} onExit={() => { setActiveTrack(null); setMode("tracks"); }} />;

  return <BasicTraining onComplete={() => { localStorage.setItem("tactics-tutorial-complete", "true"); setMode("tracks"); }} onExit={() => setMode("menu")} />;
}

function BasicTraining({ onComplete, onExit }: { onComplete: () => void; onExit: () => void }) {
  const [step, setStep] = useState(0);
  const [players, setPlayers] = useState(initialTrainingPlayers);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<Player | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatChannel, setChatChannel] = useState<"public" | "alliance">("public");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<BattleLog[]>([{ time: "지금", icon: "◆", text: "실제 게임 UI를 사용하는 기본 훈련이 시작되었습니다.", tone: "plain" }]);
  const [privateLogs, setPrivateLogs] = useState<PrivateLog[]>([{ time: "지금", text: "훈련 안내에 따라 직접 조작하세요." }]);
  const [effect, setEffect] = useState<PublicEffect>(null);
  const [whisper, setWhisper] = useState<{ from: number; to: number; text: string } | null>(null);
  const [alliances, setAlliances] = useState<number[]>([]);
  const me = players[0];
  const skills = [skillCatalog.announce, skillCatalog["ally-check"], skillCatalog["lower-attack"], skillCatalog["ally-add"]].map((skill, index) => ({ ...skill, key: ["Q", "W", "E", "R"][index] }));
  const expectedSkill = [null, "announce", null, null, "ally-add", null, "ally-check", "lower-attack", "lower-attack"][step];
  const calloutSelector = step === 0 ? ".board-area"
    : step === 1 ? (selectedSkill ? '.role-choice[data-role="순찰경찰"]' : ".skill-announce")
    : step === 2 ? ".chat-form"
    : step === 3 ? (chatInput.startsWith("-3 ") ? ".chat-form" : ".player-seat:nth-of-type(3)")
    : step === 5 ? ".event-panel"
    : step === 4 ? (selectedSkill ? ".player-seat:nth-of-type(2)" : ".skill-ally-add")
    : step === 6 ? (selectedSkill ? ".player-seat:nth-of-type(4)" : ".skill-ally-check")
    : step === 7 ? (selectedTarget ? '.role-choice[data-role="히트맨"]' : selectedSkill ? ".player-seat:nth-of-type(3)" : ".skill-lower-attack")
    : (selectedTarget ? '.role-choice[data-role="마피아일원"]' : selectedSkill ? ".player-seat:nth-of-type(3)" : ".skill-lower-attack");
  const callout = useTutorialCallout(calloutSelector);
  const notice = `${step + 1}/${basicSteps.length} · ${basicSteps[step][0]} — ${basicSteps[step][1]}`;
  const modalRoles = useMemo(() => formations[8].map((name) => ({ name, faction: factionOf(name) })), []);
  useEffect(() => {
    if (selectedSkill) setMobilePanel(null);
    else if ([1, 4, 6, 7, 8].includes(step)) setMobilePanel("skills");
    else if ([2, 5].includes(step) || (step === 3 && chatInput.startsWith("-3 "))) setMobilePanel("chat");
    else setMobilePanel(null);
  }, [step, selectedSkill, chatInput]);
  useEffect(() => {
    if (!whisper) return;
    const timer = window.setTimeout(() => setWhisper(null), 5500);
    return () => window.clearTimeout(timer);
  }, [whisper]);
  useEffect(() => {
    if (!selectedSkill) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); setSelectedSkill(null); setSelectedTarget(null);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedSkill]);

  function record(text: string, icon = "◆", tone = "plain") { setLogs((current) => [...current, { time: "지금", icon, text, tone }]); setPrivateLogs((current) => [...current, { time: "지금", text }]); }
  function next() { setSelectedSkill(null); setSelectedTarget(null); if (step === basicSteps.length - 1) onComplete(); else setStep((current) => current + 1); }
  function chooseSkill(skill: Skill) { if (selectedSkill?.id === skill.id) { setSelectedSkill(null); setSelectedTarget(null); return; } if (expectedSkill !== skill.id) { record(`지금은 ${basicSteps[step][0]} 단계입니다. 안내된 행동을 먼저 수행하세요.`, "!", "danger"); return; } setMobilePanel(null); setSelectedSkill(skill); setSelectedTarget(null); }
  function chooseTarget(player: Player) {
    if (!selectedSkill || player.isMe || !player.alive) return;
    if (step === 4 && player.id === 2) { setAlliances([2]); record("2번 민준과 동맹이 되었습니다. 이제 동맹 채팅을 공유합니다.", "🤝"); next(); return; }
    if (step === 6 && player.id === 4) { setEffect({ id: 4, type: "inspect" }); record("4번 서아의 자경단원 공표는 진명입니다.", "🔎", "scan"); window.setTimeout(() => setEffect(null), 1400); next(); return; }
    if ((step === 7 || step === 8) && player.id === 3) setSelectedTarget(player);
    else record("훈련 안내에 지정된 번호의 플레이어를 선택하세요.", "!", "danger");
  }
  function resolveRole(role: string) {
    if (step === 1 && role === "순찰경찰") { setPlayers((current) => current.map((player) => player.id === 1 ? { ...player, announced: role } : player)); record("순찰경찰 진명 공표 · 마나 +10", "⚑"); next(); return; }
    if (step === 7 && role === "히트맨") { record("하급공격 실패 1/2 · 현우는 히트맨이 아닙니다.", "↗", "danger"); next(); return; }
    if (step === 8 && role === "마피아일원") { setPlayers((current) => current.map((player) => player.id === 3 ? { ...player, alive: false, role: "마피아일원" } : player)); record("현우가 공격으로 사망했습니다. 실제 직업은 마피아일원입니다.", "☠", "danger"); window.setTimeout(onComplete, 900); return; }
    record("안내된 직업을 선택해 판정 과정을 확인하세요.", "!", "danger");
  }
  function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const text = chatInput.trim(); if (!text) return;
    if (step === 2 && !text.startsWith("-")) { setMessages((current) => [...current, { id: Date.now(), from: 1, text, channel: "public" }]); record(`공개 채팅 · 나: ${text}`); setChatInput(""); next(); return; }
    if (step === 3 && /^-3\s+.+/.test(text)) { const body = text.replace(/^-3\s+/, ""); setWhisper({ from: 1, to: 3, text: body }); record(`3번 현우에게 귓말 · ${body}`); setChatInput(""); next(); return; }
    if (step === 5 && chatChannel === "alliance") { setMessages((current) => [...current, { id: Date.now(), from: 1, text, channel: "alliance" }]); record(`동맹 채팅 · 나: ${text}`); setChatInput(""); next(); return; }
    record(step === 3 ? "‘-3 내용’ 형식으로 3번에게 귓말을 보내세요." : step === 5 ? "먼저 동맹 탭으로 전환한 뒤 메시지를 보내세요." : "현재 단계에서는 공개 메시지를 보내세요.", "!", "danger");
  }

  return <main className={`game-shell tutorial-live tutorial-step-${step} mobile-panel-${mobilePanel ?? "closed"} ${selectedSkill ? "tutorial-target-phase" : ""}`}>
    <GameAudio logs={logs} chats={messages} effect={effect}/>
    <header className="topbar"><div className="brand"><span className="brand-mark">T</span><div><strong>TACTICS</strong><small>기본 전술 훈련</small></div></div><div className="room-status"><span className="live-dot"/> TRAINING <b>{step + 1} / {basicSteps.length}</b></div><button className="tutorial-exit" onClick={onExit}>훈련 종료</button></header>
    <div className={`tutorial-guide arrow-${callout.side}`} style={callout.style} role="status"><small>STEP {step + 1}</small><strong>{basicSteps[step][0]}</strong><span>{basicSteps[step][1]}</span>{step === 0 && <button onClick={() => { record("좌석과 공개 정보를 확인했습니다."); next(); }}>확인했어요</button>}</div>
    <section className="battle-layout"><CommunicationPanel players={players} messages={messages} channel={chatChannel} setChannel={setChatChannel} input={chatInput} setInput={setChatInput} onSubmit={sendChat} logs={logs} privateLogs={privateLogs}/><Battlefield players={players} mySeatIndex={0} selectedSkill={selectedSkill} notice={notice} effectTarget={effect} alliances={alliances} whisper={whisper} onCancel={() => { setSelectedSkill(null); setSelectedTarget(null); }} onTarget={chooseTarget} onWhisperPrefill={(player) => { setChatChannel("public"); setChatInput(`-${player.id} `); setMobilePanel("chat"); }} isTargetable={(player) => !player.isMe && player.alive}/><PrivateRolePanel me={me} notice={notice} logs={privateLogs}/></section>
    <SkillDeck me={me} notice={notice} skills={skills} selectedSkill={selectedSkill} cooldowns={{}} usedOnce={{}} gameResult={null} onChoose={chooseSkill}/>
    <MobilePanelDock open={mobilePanel} setOpen={setMobilePanel}/>
    {selectedSkill?.needsRole && (selectedTarget || !selectedSkill.target) && (
      <RoleChoiceModal skill={selectedSkill} target={selectedTarget} roles={modalRoles} onResolve={resolveRole} onCancel={() => { setSelectedSkill(null); setSelectedTarget(null); }}/>
    )}
  </main>;
}

function TrackTraining({ track, step, onAdvance, onExit }: { track: (typeof trainingTracks)[number]; step: number; onAdvance: () => void; onExit: () => void }) {
  const current = track.steps[step];
  const players = initialTrainingPlayers.map((player, index) => index === 0 ? { ...player, role: track.role, announced: step === 0 ? "미공표" : track.role, faction: track.faction } : player);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(current.focus === "skills" ? "skills" : current.focus === "chat" ? "chat" : null);
  useEffect(() => setMobilePanel(current.focus === "skills" ? "skills" : current.focus === "chat" ? "chat" : null), [current.focus]);
  const selector = current.focus === "skills" ? ".skill-deck" : current.focus === "chat" ? ".event-panel" : current.focus === "intel" ? ".detail-panel" : ".board-area";
  const callout = useTutorialCallout(selector);
  const roleSkills = [skillCatalog.announce, ...(roleSkillIds[track.role] ?? []).map((id) => skillCatalog[id]), skillCatalog["ally-add"]].filter(Boolean).map((skill, index) => ({ ...skill, key: ["Q", "W", "E", "R", "A"][index] ?? skill.key }));
  const notice = `${track.role} · ${current.title} — ${current.body}`;
  const trainingLog = [{ time: "지금", icon: current.focus === "intel" ? "🔎" : "◆", text: current.body, tone: current.focus === "intel" ? "scan" : "plain" }];
  return <main className={`game-shell tutorial-live role-training-${track.id} track-spotlight-${step} mobile-panel-${mobilePanel ?? "closed"}`}><header className="topbar"><div className="brand"><span className="brand-mark">T</span><div><strong>TACTICS</strong><small>{track.role} 실전 훈련</small></div></div><div className="room-status"><span className="live-dot"/> TRAINING <b>{step + 1} / {track.steps.length}</b></div><button className="tutorial-exit" onClick={onExit}>훈련 종료</button></header><div className={`tutorial-guide arrow-${callout.side}`} style={callout.style}><small>{track.faction === "mafia" ? "마피아 진영" : "시민 진영"} · {track.role}</small><strong>{current.title}</strong><span>{current.body}</span><button onClick={onAdvance}>{step === track.steps.length - 1 ? "훈련 완료" : "다음 전술"}</button></div><section className="battle-layout"><CommunicationPanel players={players} messages={[]} channel="public" setChannel={() => {}} input="" setInput={() => {}} onSubmit={(event) => event.preventDefault()} logs={trainingLog} privateLogs={[{ time: "지금", text: current.body }]}/><Battlefield players={players} mySeatIndex={0} selectedSkill={null} notice={notice} effectTarget={current.focus === "intel" ? { id: 3, type: "inspect" } : null} alliances={current.focus === "chat" ? [2] : []} whisper={null} onCancel={() => {}} onTarget={() => {}} isTargetable={() => false}/><PrivateRolePanel me={players[0]} notice={notice} logs={[{ time: "지금", text: current.body }]}/></section><SkillDeck me={players[0]} notice={notice} skills={roleSkills} selectedSkill={null} cooldowns={{}} usedOnce={{}} gameResult={null} onChoose={onAdvance}/><MobilePanelDock open={mobilePanel} setOpen={setMobilePanel}/></main>;
}

type CalloutStyle = CSSProperties & { "--arrow-offset"?: string };

function useTutorialCallout(selector: string): { side: "up" | "down" | "left" | "right"; style: CalloutStyle } {
  const [position, setPosition] = useState<{ side: "up" | "down" | "left" | "right"; style: CalloutStyle }>({ side: "down", style: { left: "50%", top: 82, transform: "translateX(-50%)", "--arrow-offset": "50%" } });
  useEffect(() => {
    let target: HTMLElement | null = null;
    let settleTimer: number | null = null;
    const measure = () => {
      target?.classList.remove("tutorial-callout-target");
      target = document.querySelector<HTMLElement>(`.tutorial-live ${selector}`);
      if (!target) return;
      target.classList.add("tutorial-callout-target");
      const rect = target.getBoundingClientRect();
      const guide = document.querySelector<HTMLElement>(".tutorial-live .tutorial-guide");
      const width = guide?.getBoundingClientRect().width ?? Math.min(380, window.innerWidth - 24);
      const height = guide?.getBoundingClientRect().height ?? 150;
      const mobile = window.innerWidth <= 760;
      const gap = mobile ? 10 : 14;
      const clampX = (value: number) => Math.max(12, Math.min(window.innerWidth - width - 12, value));
      const clampY = (value: number) => Math.max(74, Math.min(window.innerHeight - height - 12, value));
      const horizontal = (left: number) => `${Math.max(22, Math.min(width - 22, rect.left + rect.width / 2 - left))}px`;
      const vertical = (top: number) => `${Math.max(22, Math.min(height - 22, rect.top + rect.height / 2 - top))}px`;
      if (selector === ".board-area") { const left = clampX(rect.left + rect.width / 2 - width / 2); setPosition({ side: "down", style: { left, top: rect.top + (mobile ? 10 : 16), transform: "none", "--arrow-offset": horizontal(left) } }); }
      else if (!mobile && window.innerWidth - rect.right >= width + gap) { const top = clampY(rect.top + rect.height / 2 - height / 2); setPosition({ side: "left", style: { left: rect.right + gap, top, transform: "none", "--arrow-offset": vertical(top) } }); }
      else if (!mobile && rect.left >= width + gap) { const top = clampY(rect.top + rect.height / 2 - height / 2); setPosition({ side: "right", style: { left: rect.left - width - gap, top, transform: "none", "--arrow-offset": vertical(top) } }); }
      else if (rect.top >= height + gap + 60) { const left = clampX(rect.left + rect.width / 2 - width / 2); setPosition({ side: "down", style: { left, top: rect.top - height - gap, transform: "none", "--arrow-offset": horizontal(left) } }); }
      else { const left = clampX(rect.left + rect.width / 2 - width / 2); setPosition({ side: "up", style: { left, top: clampY(rect.bottom + gap), transform: "none", "--arrow-offset": horizontal(left) } }); }
    };
    const frame = requestAnimationFrame(() => {
      measure();
      if (window.innerWidth <= 760 && target) {
        const rect = target.getBoundingClientRect();
        if (rect.top < 62 || rect.bottom > window.innerHeight - 118) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          settleTimer = window.setTimeout(measure, 380);
        }
      }
    });
    window.addEventListener("resize", measure); window.addEventListener("scroll", measure, true);
    return () => { cancelAnimationFrame(frame); if (settleTimer !== null) window.clearTimeout(settleTimer); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); target?.classList.remove("tutorial-callout-target"); };
  }, [selector]);
  return position;
}
