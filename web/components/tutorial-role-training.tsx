"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { formations, roleSkillIds, skillCatalog } from "../game/catalog";
import { factionOf } from "../game/rules";
import type { BattleLog, ChatMessage, Faction, Player, PrivateLog, PublicEffect, Skill } from "../game/types";
import { Battlefield } from "./battlefield";
import { ProclamationModal, RoleChoiceModal } from "./game-modals";
import { CommunicationPanel, MobilePanelDock, PrivateRolePanel, SkillDeck, type MobilePanel } from "./game-panels";
import { GameAudio } from "./game-audio";

type Track = {
  id: string;
  role: string;
  faction: Faction;
  steps: readonly { title: string; body: string; focus: string }[];
};

type Exercise = {
  kind: "skill" | "chat";
  skill?: string;
  target?: number;
  role?: string;
  channel?: "public" | "alliance";
  prompt: string;
  result: string;
};

const s = (skill: string, prompt: string, result: string, target?: number, role?: string): Exercise => ({ kind: "skill", skill, target, role, prompt, result });
const c = (prompt: string, result: string): Exercise => ({ kind: "chat", channel: "alliance", prompt, result });

const exercises: Record<string, Exercise[]> = {
  마피아대부: [
    s("announce", "공표를 눌러 마피아대부 진명을 내보세요.", "진명 공표로 조직이 당신을 확인할 길을 열었습니다.", undefined, "마피아대부"),
    s("snipe-command", "저격명령을 누르고 6번 히트맨을 선택하세요.", "저격명령 성공. 히트맨의 저격이 활성화되었습니다.", 6),
    s("lower-attack", "3번을 하급공격하고 순찰경찰을 선택하세요.", "공격 성공. 순찰경찰을 제거해 경찰반장 공격로를 열었습니다.", 3, "순찰경찰"),
    s("successor", "후계자 지정을 누르고 4번 마피아후계자를 선택하세요.", "후계자 지정 성공. 대부가 사망해도 조직이 이어집니다.", 4),
  ],
  히트맨: [
    s("enemy-scan", "3번을 적군 스캔하고 순찰경찰을 선택하세요.", "스캔 성공. 순찰경찰 정보를 대부에게 넘길 수 있습니다.", 3, "순찰경찰"),
    s("announce", "공표를 눌러 히트맨 진명을 내고 대부의 접촉을 유도하세요.", "진명을 공개했습니다. 위험하지만 대부와 빠르게 연결될 수 있습니다.", undefined, "히트맨"),
    s("ally-add", "저격명령을 내린 7번 대부와 동맹을 맺으세요.", "대부와 동맹이 되어 스캔 결과를 안전하게 공유할 수 있습니다.", 7),
    s("snipe", "활성화된 저격으로 5번 경찰반장 후보를 처치하세요.", "저격 성공. 경찰반장 후보를 즉시 처치했습니다.", 5),
  ],
  마피아일원: [
    s("ally-check", "7번의 마피아대부 공표에 아군 확인을 사용하세요.", "아군 확인 성공. 7번은 실제 마피아대부입니다.", 7),
    s("upper-attack", "3번을 상급공격하고 순찰경찰을 선택하세요.", "공격 성공. 노패널티 공격으로 핵심 시민을 찾아냈습니다.", 3, "순찰경찰"),
    s("ally-add", "확인한 7번 대부와 동맹을 맺으세요.", "대부와 연결되어 공격 결과를 공유할 수 있습니다.", 7),
    s("upper-attack", "공개수사 중인 2번을 상급공격하고 사립탐정을 선택하세요.", "공격 성공. 시민 조사망의 핵심을 제거했습니다.", 2, "사립탐정"),
  ],
  마피아후계자: [
    s("boss-check", "보스 확인으로 7번을 조사하세요.", "보스 확인 성공. 7번이 마피아대부입니다.", 7),
    s("advanced-scan", "6번을 상급 스캔하고 히트맨을 선택하세요.", "상급 스캔 성공. 저격 연계를 완성할 히트맨을 찾았습니다.", 6, "히트맨"),
    s("ally-add", "찾아낸 7번 대부와 동맹을 맺으세요.", "대부와 연결되어 후계자 지정과 정보를 요청할 수 있습니다.", 7),
    s("advanced-scan", "3번을 상급 스캔하고 순찰경찰을 선택하세요.", "상급 스캔 성공. 대부가 처리할 핵심 시민을 찾았습니다.", 3, "순찰경찰"),
  ],
  스파이: [
    s("announce", "공표에서 사립탐정을 골라 시민 진영에 침투하세요.", "시민 직업을 공표했습니다. 아군 확인을 속일 준비가 됐습니다.", undefined, "사립탐정"),
    s("deception", "기만을 눌러 지속 효과를 확인하세요.", "기만 효과: 시민 직업 공표가 아군 확인에서 진명으로 보입니다."),
    s("ally-add", "속아 넘어간 2번과 동맹을 맺으세요. 훈련에서는 상대도 맞동맹을 보냅니다.", "2번과 맞동맹이 되어 배신 조건을 완성했습니다.", 2),
    s("betrayal", "배신을 눌러 맞동맹인 2번을 즉시 처치하세요.", "배신 성공. 신뢰를 역이용해 시민 조사직을 처치했습니다.", 2),
  ],
  경찰반장: [
    s("announce", "연결이 막힌 상황입니다. 경찰반장 진명을 공표하세요.", "진명 공표로 마나와 시민의 접촉 기회를 얻었습니다.", undefined, "경찰반장"),
    s("ally-check", "2번의 사립탐정 공표에 아군 확인을 사용하세요.", "아군 확인 성공. 스파이가 있다면 다른 시민 명함으로 재검증하세요.", 2),
    s("leadership", "리더십을 눌러 아직 못 찾은 탐정조수를 찾으세요.", "리더십 성공. 탐정조수를 찾아 시민 수사망을 보강했습니다.", undefined, "탐정조수"),
    s("arrest", "소거된 7번 마피아대부를 검거하세요.", "검거 성공. 마피아대부를 체포해 시민이 승리했습니다.", 7),
  ],
  자경단원: [
    s("announce", "자경단원을 공표해 시민 수사망의 공격수임을 알리세요.", "진명 공표로 조사직의 제보를 받을 준비를 마쳤습니다.", undefined, "자경단원"),
    s("upper-attack", "제보받은 6번을 상급공격하고 히트맨을 선택하세요.", "공격 성공. 제보가 사실임을 확인했습니다.", 6, "히트맨"),
    s("ally-add", "정확한 정보를 준 2번 사립탐정과 동맹을 맺으세요.", "제보자와 연결되어 후속 조사 결과를 받을 수 있습니다.", 2),
    s("upper-attack", "소거된 7번을 상급공격하고 마피아대부를 선택하세요.", "공격 성공. 노패널티 공격으로 대부를 제거했습니다.", 7, "마피아대부"),
  ],
  사립탐정: [
    s("announce", "공개 운영을 연습합니다. 사립탐정 진명을 공표하세요.", "진명을 공개해 아군 확인과 동맹 연결을 유도했습니다.", undefined, "사립탐정"),
    s("enemy-scan", "6번을 적군 스캔하고 히트맨을 선택하세요.", "스캔 성공. 6번이 히트맨임을 찾아냈습니다.", 6, "히트맨"),
    s("ally-add", "8번 탐정조수와 동맹을 맺으세요.", "탐정조수와 수사망이 연결되었습니다.", 8),
    c("동맹 채팅에 ‘6번 히트맨 스캔 성공’이라고 공유하세요.", "스캔 결과를 공유해 중복 조사를 막고 공격권자에게 전달했습니다."),
  ],
  순찰경찰: [
    s("announce", "정체를 숨기기 위해 자경단원 가명을 공표하세요.", "가명 공표로 순찰경찰의 생존과 경찰반장 보호를 노립니다.", undefined, "자경단원"),
    s("ally-check", "2번 사립탐정 공표에 아군 확인을 사용하세요.", "아군 확인 성공. 2번이 실제 사립탐정입니다.", 2),
    s("ally-add", "확인한 2번과 동맹을 맺으세요.", "사립탐정과 연결되어 확정 공격 정보를 받을 수 있습니다.", 2),
    s("lower-attack", "제보받은 6번을 하급공격하고 히트맨을 선택하세요.", "공격 성공. 저렴한 하급공격으로 확정 적을 처리했습니다.", 6, "히트맨"),
  ],
  탐정조수: [
    s("enemy-check", "4번의 마피아일원 공표에 적군 확인을 사용하세요.", "적군 확인 성공. 4번은 실제 마피아일원입니다.", 4),
    s("detective-check", "탐정 확인으로 2번을 조사하세요.", "탐정 확인 성공. 2번이 사립탐정입니다.", 2),
    s("ally-add", "찾아낸 2번 사립탐정과 동맹을 맺으세요.", "사립탐정과 수사망을 만들었습니다.", 2),
    c("동맹 채팅에 ‘4번 마피아일원 확인 성공’이라고 공유하세요.", "적군 확인 결과가 탐정의 스캔표와 합쳐졌습니다."),
  ],
  남자연인: [
    s("ally-add", "서로 알고 시작한 8번 여자연인과 동맹을 맺으세요.", "연인 동맹이 연결되었습니다.", 8),
    s("ally-check", "2번 사립탐정 공표에 아군 확인을 사용하세요.", "아군 확인 성공. 두 연인의 독자 수사망이 넓어졌습니다.", 2),
    c("동맹 채팅으로 8번 연인에게 조사 결과를 공유하세요.", "두 연인의 조사표가 하나로 합쳐졌습니다."),
    s("revenge", "연인이 사망한 상황입니다. 복수귀로 7번을 처치하세요.", "복수귀 발동. 공유해 둔 핵심 마피아를 즉시 처치했습니다.", 7),
  ],
  여자연인: [
    s("ally-add", "서로 알고 시작한 8번 남자연인과 동맹을 맺으세요.", "연인 동맹이 연결되었습니다.", 8),
    s("enemy-check", "4번의 마피아일원 공표에 적군 확인을 사용하세요.", "적군 확인 성공. 두 연인의 독자 수사망이 넓어졌습니다.", 4),
    c("동맹 채팅으로 8번 연인에게 적군 확인 결과를 공유하세요.", "공개 역할과 잠복 역할을 나눌 수 있게 됐습니다."),
    s("revenge", "연인이 사망한 상황입니다. 복수귀로 7번을 처치하세요.", "복수귀 발동. 시민 수사망을 위협하던 마피아를 제거했습니다.", 7),
  ],
  공무원: [
    s("announce", "공무원 진명을 공표해 시민의 아군 확인을 기다리세요.", "진명 공표로 안정적인 시민 보급망에 합류할 길을 열었습니다.", undefined, "공무원"),
    s("support", "즉시 공격이 필요한 3번 순찰경찰에게 지원을 사용하세요.", "지원 성공. 3번에게 마나 30을 제공했고 대상은 전체 공개되었습니다.", 3),
    s("ally-add", "2번 사립탐정과 동맹을 맺어 확정 정보를 받으세요.", "시민 조사망과 연결되었습니다.", 2),
    s("proclamation", "공문을 눌러 대상 번호·직업·요청 행동이 담긴 제보를 작성하세요.", "공문이 전체에게 발송되어 공격권자가 즉시 행동할 수 있습니다."),
  ],
};

const trainingPlayers: Player[] = [
  { id: 1, name: "나", announced: "미공표", role: "비공개", faction: "citizen", alive: true, isMe: true },
  { id: 2, name: "민준", announced: "사립탐정", role: "비공개", faction: "citizen", alive: true },
  { id: 3, name: "현우", announced: "순찰경찰", role: "비공개", faction: "citizen", alive: true },
  { id: 4, name: "서아", announced: "마피아일원", role: "비공개", faction: "mafia", alive: true },
  { id: 5, name: "지민", announced: "경찰반장", role: "비공개", faction: "citizen", alive: true },
  { id: 6, name: "윤서", announced: "히트맨", role: "비공개", faction: "mafia", alive: true },
  { id: 7, name: "도윤", announced: "마피아대부", role: "비공개", faction: "mafia", alive: true },
  { id: 8, name: "예린", announced: "탐정조수", role: "비공개", faction: "citizen", alive: true },
];

function scenarioPlayers(role: string, faction: Faction) {
  return trainingPlayers.map((player) => {
    if (player.isMe) return { ...player, role, faction };
    if (role === "마피아후계자" && player.id === 4) return { ...player, announced: "마피아후계자" };
    if (role === "남자연인" && player.id === 8) return { ...player, announced: "여자연인" };
    if (role === "여자연인" && player.id === 8) return { ...player, announced: "남자연인" };
    return { ...player };
  });
}

export function InteractiveTrackTraining({ track, step, onAdvance, onExit }: { track: Track; step: number; onAdvance: () => void; onExit: () => void }) {
  const current = track.steps[step];
  const exercise = exercises[track.role][step];
  const [players, setPlayers] = useState(() => scenarioPlayers(track.role, track.faction));
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<Player | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatChannel, setChatChannel] = useState<"public" | "alliance">("public");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<BattleLog[]>([{ time: "지금", icon: "◆", text: `${track.role} 실전 훈련을 시작합니다.`, tone: "plain" }]);
  const [privateLogs, setPrivateLogs] = useState<PrivateLog[]>([{ time: "지금", text: "안내된 행동을 직접 수행해야 다음 단계로 진행됩니다." }]);
  const [alliances, setAlliances] = useState<number[]>([]);
  const [effect, setEffect] = useState<PublicEffect>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(exercise.kind === "chat" ? "chat" : "skills");
  const [proclamationText, setProclamationText] = useState("");
  const [verdict, setVerdict] = useState<{ success: boolean; title: string; message: string; advance: boolean } | null>(null);
  const skills = [skillCatalog.announce, ...(roleSkillIds[track.role] ?? []).map((id) => skillCatalog[id]), skillCatalog["ally-add"]]
    .filter(Boolean).map((skill, index) => ({ ...skill, key: ["Q", "W", "E", "R", "A"][index] ?? skill.key }));
  const roles = useMemo(() => formations[13].map((name) => ({ name, faction: factionOf(name) })), []);
  const me = players[0];
  const selector = selectedSkill?.needsRole && (selectedTarget || !selectedSkill.target)
    ? `.role-choice[data-role="${exercise.role}"]`
    : selectedSkill?.target ? `.player-seat:nth-of-type(${exercise.target})`
    : exercise.kind === "chat" ? ".chat-form" : `.skill-${exercise.skill}`;
  const callout = useCallout(selector);
  const notice = `${track.role} · ${current.title} — ${exercise.prompt}`;

  useEffect(() => {
    setSelectedSkill(null); setSelectedTarget(null); setEffect(null); setProclamationText(""); setVerdict(null);
    setMobilePanel(exercise.kind === "chat" ? "chat" : "skills");
  }, [step, exercise.kind]);
  useEffect(() => {
    if (!selectedSkill) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); setSelectedSkill(null); setSelectedTarget(null); setProclamationText("");
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedSkill]);

  function record(text: string, icon = "◆", tone = "plain") {
    setLogs((items) => [...items, { time: "지금", icon, text, tone }]);
    setPrivateLogs((items) => [...items, { time: "지금", text }]);
  }
  function finish(icon = "✓", tone = "plain") {
    record(exercise.result, icon, tone); setSelectedSkill(null); setSelectedTarget(null);
    setVerdict({ success: true, title: "훈련 판정", message: exercise.result, advance: true });
  }
  function fail(message: string) {
    record(message, "!", "danger");
    setVerdict({ success: false, title: "다시 시도", message, advance: false });
  }
  function dismissVerdict() {
    if (!verdict) return;
    const shouldAdvance = verdict.advance;
    setVerdict(null);
    if (shouldAdvance) onAdvance();
  }
  function chooseSkill(skill: Skill) {
    if (verdict) return;
    if (selectedSkill?.id === skill.id) { setSelectedSkill(null); setSelectedTarget(null); setProclamationText(""); return; }
    if (exercise.kind !== "skill" || exercise.skill !== skill.id) { fail(`지금은 ‘${exercise.prompt}’ 과제를 수행하세요.`); return; }
    setMobilePanel(null); setSelectedSkill(skill); setSelectedTarget(null);
    if (!skill.target && !skill.needsRole && !skill.needsText) finish();
  }
  function chooseTarget(player: Player) {
    if (verdict || !selectedSkill?.target || player.isMe || !player.alive) return;
    if (player.id !== exercise.target) { fail(`${exercise.target}번 플레이어를 선택하세요.`); return; }
    if (selectedSkill.needsRole) { setSelectedTarget(player); return; }
    if (selectedSkill.id === "ally-add") setAlliances((items) => [...new Set([...items, player.id])]);
    if (["ally-check", "enemy-check", "boss-check", "detective-check"].includes(selectedSkill.id)) {
      setEffect({ id: player.id, type: "inspect" }); window.setTimeout(() => setEffect(null), 1200);
    }
    finish(["snipe", "revenge", "arrest", "betrayal"].includes(selectedSkill.id) ? "✦" : "✓");
  }
  function resolveRole(role: string) {
    if (role !== exercise.role) { fail(`이번 훈련에서는 ‘${exercise.role}’을 선택하세요.`); return; }
    if (selectedSkill?.id === "announce") setPlayers((items) => items.map((player) => player.isMe ? { ...player, announced: role } : player));
    if (selectedTarget && selectedSkill && ["enemy-scan", "advanced-scan"].includes(selectedSkill.id)) {
      setEffect({ id: selectedTarget.id, type: "scan" }); window.setTimeout(() => setEffect(null), 1200);
    }
    finish(selectedSkill?.id.includes("attack") ? "✦" : "✓", selectedSkill?.id.includes("attack") ? "danger" : "plain");
  }
  function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const text = chatInput.trim(); if (!text) return;
    if (exercise.kind !== "chat" || chatChannel !== exercise.channel) { fail("동맹 채팅 탭을 선택한 뒤 메시지를 보내세요."); return; }
    setMessages((items) => [...items, { id: Date.now(), from: 1, text, channel: chatChannel }]); setChatInput(""); finish("◇");
  }
  function sendProclamation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!proclamationText.trim()) return;
    setMessages((items) => [...items, { id: Date.now(), from: 0, anonymous: true, text: `[공문] ${proclamationText.trim()}`, channel: "public" }]);
    setProclamationText(""); finish("✉");
  }

  return <main className={`game-shell tutorial-live role-training-${track.id} track-spotlight-${step} mobile-panel-${mobilePanel ?? "closed"} ${selectedSkill ? "tutorial-target-phase" : ""}`}>
    <GameAudio logs={logs} chats={messages} effect={effect}/>
    <header className="topbar"><div className="brand"><span className="brand-mark">T</span><div><strong>TACTICS</strong><small>{track.role} 실전 훈련</small></div></div><div className="room-status"><span className="live-dot"/> TRAINING <b>{step + 1} / {track.steps.length}</b></div><button className="tutorial-exit" onClick={onExit}>훈련 종료</button></header>
    <div className={`tutorial-guide arrow-${callout.side}`} style={callout.style}><small>{track.faction === "mafia" ? "마피아 진영" : "시민 진영"} · {track.role}</small><strong>{current.title}</strong><span>{current.body}</span><b>{exercise.prompt}</b></div>
    <section className="battle-layout"><CommunicationPanel players={players} messages={messages} channel={chatChannel} setChannel={setChatChannel} input={chatInput} setInput={setChatInput} onSubmit={sendChat} logs={logs} privateLogs={privateLogs}/><Battlefield players={players} mySeatIndex={0} selectedSkill={selectedSkill} notice={notice} effectTarget={effect} alliances={alliances} whisper={null} onCancel={() => { setSelectedSkill(null); setSelectedTarget(null); }} onTarget={chooseTarget} onWhisperPrefill={(player) => { setChatChannel("public"); setChatInput(`-${player.id} `); setMobilePanel("chat"); }} isTargetable={(player) => Boolean(selectedSkill?.target) && !player.isMe && player.alive}/><PrivateRolePanel me={me} notice={notice} logs={privateLogs}/></section>
    <SkillDeck me={me} notice={notice} skills={skills} selectedSkill={selectedSkill} cooldowns={{}} usedOnce={{}} gameResult={null} onChoose={chooseSkill}/><MobilePanelDock open={mobilePanel} setOpen={setMobilePanel}/>
    {selectedSkill?.needsRole && (selectedTarget || !selectedSkill.target) && <RoleChoiceModal skill={selectedSkill} target={selectedTarget} roles={roles} onResolve={resolveRole} onCancel={() => { setSelectedSkill(null); setSelectedTarget(null); }}/>} 
    {selectedSkill?.needsText && <ProclamationModal text={proclamationText} setText={setProclamationText} onSubmit={sendProclamation} onCancel={() => setSelectedSkill(null)}/>} 
    {verdict && <div className={`verdict-popup ${verdict.success ? "success" : "failure"}`} role="button" tabIndex={0} onClick={dismissVerdict} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") dismissVerdict(); }}><span>{verdict.title}</span><strong>{verdict.success ? "성공" : "실패"}</strong><p>{verdict.message}</p><small>{verdict.advance ? "터치하여 다음 단계" : "터치하여 다시 시도"}</small></div>}
  </main>;
}

type CalloutStyle = CSSProperties & { "--arrow-offset"?: string };
function useCallout(selector: string): { side: "up" | "down"; style: CalloutStyle } {
  const [value, setValue] = useState<{ side: "up" | "down"; style: CalloutStyle }>({ side: "down", style: { left: "50%", top: 82, transform: "translateX(-50%)", "--arrow-offset": "50%" } });
  useEffect(() => {
    let target: HTMLElement | null = null;
    const measure = () => {
      target?.classList.remove("tutorial-callout-target"); target = document.querySelector<HTMLElement>(`.tutorial-live ${selector}`); if (!target) return;
      target.classList.add("tutorial-callout-target"); const rect = target.getBoundingClientRect();
      const guide = document.querySelector<HTMLElement>(".tutorial-live .tutorial-guide"); const width = guide?.offsetWidth ?? Math.min(380, window.innerWidth - 24); const height = guide?.offsetHeight ?? 170;
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
      const arrow = `${Math.max(22, Math.min(width - 22, rect.left + rect.width / 2 - left))}px`;
      if (rect.top > height + 90) setValue({ side: "down", style: { left, top: rect.top - height - 12, transform: "none", "--arrow-offset": arrow } });
      else setValue({ side: "up", style: { left, top: Math.min(window.innerHeight - height - 12, rect.bottom + 12), transform: "none", "--arrow-offset": arrow } });
    };
    const frame = requestAnimationFrame(measure); window.addEventListener("resize", measure); window.addEventListener("scroll", measure, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); target?.classList.remove("tutorial-callout-target"); };
  }, [selector]);
  return value;
}
