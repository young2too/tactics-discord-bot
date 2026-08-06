"use client";

import { useState } from "react";
import { trainingTracks } from "../game/guide-data";

const basicSteps = [
  { title: "전장을 읽으세요", body: "당신은 항상 6시 방향에 배치됩니다. 번호, 공표명과 생존 여부는 공개되지만 실제 직업은 본인과 사망자만 보입니다.", action: "좌석 정보 확인", focus: "board" },
  { title: "직업을 공표하세요", body: "공표는 주장이지 신분 공개가 아닙니다. 진명과 가명 모두 가능하며 마나를 얻습니다.", action: "순찰경찰 공표", focus: "announce" },
  { title: "공개 채팅으로 대화하세요", body: "일반 메시지는 생존자 모두에게 보입니다. 정보와 거짓말을 섞어 상대의 판단을 흔드세요.", action: "전체 채팅 보내기", focus: "chat" },
  { title: "귓말을 보내세요", body: "‘-3 야’처럼 입력하면 3번에게만 전달되고 중앙 말풍선과 개인 기록에 표시됩니다.", action: "-3 같이 조사하자", focus: "chat" },
  { title: "공표를 확인하세요", body: "아군 확인은 아군 진영 이름을 공표한 생존자만 대상으로 삼습니다. 행동과 대상은 공개되지만 판정은 본인만 압니다.", action: "4번 아군 확인", focus: "inspect" },
  { title: "공격의 위험을 익히세요", body: "하급공격은 대상의 실제 직업을 맞혀야 합니다. 첫 실패가 누적되며 두 번째 실패에는 자신이 사망합니다.", action: "3번을 히트맨으로 공격", focus: "attack" },
  { title: "사망 정보를 활용하세요", body: "이번에는 정확히 맞힙니다. 사망자는 실제 직업이 모두에게 공개되고 이후 대상 목록에서 사라집니다.", action: "3번을 마피아일원으로 공격", focus: "attack" },
] as const;

const seats = [
  { id: 1, name: "나", claim: "순찰경찰", role: "순찰경찰" }, { id: 2, name: "민준", claim: "사립탐정", role: "사립탐정" },
  { id: 3, name: "현우", claim: "마피아일원", role: "마피아일원" }, { id: 4, name: "서아", claim: "자경단원", role: "자경단원" },
  { id: 5, name: "지민", claim: "경찰반장", role: "경찰반장" }, { id: 6, name: "윤서", claim: "탐정조수", role: "히트맨" },
  { id: 7, name: "도윤", claim: "마피아대부", role: "마피아대부" }, { id: 8, name: "예린", claim: "미공표", role: "탐정조수" },
];

export function FirstVisitPrompt({ onTutorial, onSkip }: { onTutorial: () => void; onSkip: () => void }) {
  return <main className="welcome-gate"><section><small>WELCOME TO TACTICS</small><h1>처음 전장에 오셨나요?</h1><p>5분 기본 훈련에서 공표, 채팅, 조사와 공격을 직접 익힐 수 있습니다. 언제든 건너뛰고 룰북에서 다시 확인할 수 있습니다.</p><div><button onClick={onTutorial}>튜토리얼 시작</button><button onClick={onSkip}>바로 입장</button></div></section></main>;
}

export function TrainingCenter({ onExit }: { onExit: () => void }) {
  const [mode, setMode] = useState<"menu" | "basic" | "tracks">("menu");
  const [step, setStep] = useState(0);
  const [completedTracks, setCompletedTracks] = useState<string[]>([]);
  const [activeTrack, setActiveTrack] = useState<(typeof trainingTracks)[number] | null>(null);
  const [trackStep, setTrackStep] = useState(0);
  const [logs, setLogs] = useState<string[]>(["훈련 통제관: 실제 게임에 영향을 주지 않는 안전한 훈련장입니다."]);
  const [dead, setDead] = useState<number[]>([]);

  function advanceBasic() {
    const messages = ["좌석과 공개 정보를 확인했습니다.", "순찰경찰을 진명 공표했습니다. · 마나 +10", "나: 경찰 쪽 공표를 확인하겠습니다.", "1번 나 → 3번 현우 귓말 · 같이 조사하자", "4번 서아의 자경단원 공표는 진명입니다.", "하급공격 실패 1/2 · 현우는 히트맨이 아닙니다.", "현우가 공격으로 사망했습니다. 실제 직업은 마피아일원입니다."];
    setLogs((current) => [...current, messages[step]]);
    if (step === 6) setDead([3]);
    if (step < basicSteps.length - 1) setStep((current) => current + 1);
    else {
      localStorage.setItem("tactics-tutorial-complete", "true");
      setMode("tracks");
    }
  }

  function runTrackStep() {
    if (!activeTrack) return;
    setLogs((current) => [...current, `${activeTrack.title}: ${activeTrack.steps[trackStep]} 완료`]);
    if (trackStep < activeTrack.steps.length - 1) setTrackStep((current) => current + 1);
    else { setCompletedTracks((current) => [...new Set([...current, activeTrack.id])]); setActiveTrack(null); setTrackStep(0); }
  }

  if (mode === "menu") return <main className="training-menu"><section><small>TACTICS ACADEMY</small><h1>전술 훈련소</h1><p>기본 훈련으로 공통 조작을 익히거나 원하는 직업군의 핵심 상호작용을 연습하세요.</p><div className="training-menu-actions"><button onClick={() => { setMode("basic"); setStep(0); setDead([]); }}>기본 전술 훈련 <span>약 5분 · 7단계</span></button><button onClick={() => setMode("tracks")}>직업군별 훈련 <span>4개 선택 과정</span></button></div><button className="training-exit" onClick={() => { localStorage.removeItem("tactics-tutorial-complete"); localStorage.removeItem("tactics-onboarding-dismissed"); setCompletedTracks([]); setStep(0); setDead([]); }}>진행 기록 초기화</button><button className="training-exit" onClick={onExit}>모드 선택으로 돌아가기</button></section></main>;

  if (mode === "tracks" && !activeTrack) return <main className="training-menu"><section className="track-menu"><small>SPECIALIZED TRAINING</small><h1>직업군별 선택 훈련</h1><p>모든 과정을 끝낼 필요는 없습니다. 실제 배정받은 직업과 가까운 과정을 골라 연습하세요.</p><div className="track-grid">{trainingTracks.map((track) => <button className={completedTracks.includes(track.id) ? "complete" : ""} key={track.id} onClick={() => { setActiveTrack(track); setTrackStep(0); }}><b>{completedTracks.includes(track.id) ? "✓ " : ""}{track.title}</b><span>{track.roles}</span><small>{track.steps.length}단계</small></button>)}</div><button className="training-exit" onClick={() => setMode("menu")}>훈련소 처음으로</button><button className="training-finish" onClick={onExit}>훈련을 마치고 입장</button></section></main>;

  const current = mode === "basic" ? basicSteps[step] : null;
  const trackInstruction = activeTrack?.steps[trackStep];
  return <main className="tutorial-shell">
    <header><div><small>TACTICS ACADEMY</small><strong>{activeTrack?.title ?? "기본 전술 훈련"}</strong></div><span>{activeTrack ? `${trackStep + 1} / ${activeTrack.steps.length}` : `${step + 1} / ${basicSteps.length}`}</span><button onClick={() => { setActiveTrack(null); setMode("menu"); }}>훈련 종료</button></header>
    <section className="tutorial-stage">
      <aside className="tutorial-log"><h2>훈련 기록</h2>{logs.slice(-8).map((log, index) => <p key={index}>{log}</p>)}</aside>
      <div className={`tutorial-board focus-${current?.focus ?? "track"}`}><div className="tutorial-objective"><small>현재 목표</small><h1>{current?.title ?? activeTrack?.title}</h1><p>{current?.body ?? trackInstruction}</p></div>{seats.map((seat, index) => <article className={`tutorial-seat seat-${index + 1} ${seat.id === 1 ? "me" : ""} ${dead.includes(seat.id) ? "dead" : ""}`} key={seat.id}><b>{seat.id}</b><strong>{seat.name}</strong><small>공표 · {seat.id === 1 && step === 0 ? "미공표" : seat.claim}</small>{dead.includes(seat.id) && <em>사망 · {seat.role}</em>}</article>)}</div>
      <aside className="tutorial-private"><h2>나의 전술 정보</h2><strong>순찰경찰</strong><p>시민 진영</p><div>{logs.slice(-3).map((log, index) => <small key={index}>{log}</small>)}</div></aside>
    </section>
    <footer className="tutorial-command"><div><small>{current ? "안내된 행동을 수행하세요" : "직업군 모의 행동"}</small><strong>{current?.body ?? trackInstruction}</strong></div><button className={`tutorial-action action-${current?.focus ?? "track"}`} onClick={current ? advanceBasic : runTrackStep}>{current?.action ?? "모의 행동 수행"}</button></footer>
  </main>;
}
