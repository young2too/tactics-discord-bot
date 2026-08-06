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
type ChatMessage = { id: number; from: number; text: string; channel: "public" | "alliance" };

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

const skillCatalog: Record<string, Skill> = {
  announce: { id: "announce", key: "Q", name: "공표", icon: "⚑", cost: 0, target: false, needsRole: true, tone: "gold", cooldown: 90 },
  "ally-check": { id: "ally-check", key: "W", name: "아군 확인", icon: "◉", cost: 5, target: true, needsRole: false, tone: "blue", cooldown: 10 },
  "enemy-check": { id: "enemy-check", key: "W", name: "적군 확인", icon: "◉", cost: 5, target: true, needsRole: false, tone: "blue", cooldown: 10 },
  "ally-scan": { id: "ally-scan", key: "E", name: "아군 스캔", icon: "⌁", cost: 15, target: true, needsRole: true, tone: "blue", cooldown: 10 },
  "enemy-scan": { id: "enemy-scan", key: "E", name: "적군 스캔", icon: "⌁", cost: 20, target: true, needsRole: true, tone: "blue", cooldown: 10 },
  "upper-attack": { id: "upper-attack", key: "R", name: "상급 공격", icon: "✦", cost: 40, target: true, needsRole: true, tone: "red", cooldown: 10 },
  "lower-attack": { id: "lower-attack", key: "R", name: "하급 공격", icon: "✦", cost: 30, target: true, needsRole: true, tone: "red", cooldown: 10 },
  "boss-check": { id: "boss-check", key: "W", name: "보스 확인", icon: "♛", cost: 10, target: true, needsRole: false, tone: "red", cooldown: 10 },
  "detective-check": { id: "detective-check", key: "W", name: "탐정 확인", icon: "⌕", cost: 10, target: true, needsRole: false, tone: "blue", cooldown: 10 },
  support: { id: "support", key: "W", name: "지원", icon: "+", cost: 20, target: true, needsRole: false, tone: "blue", cooldown: 10 },
  "ally-add": { id: "ally-add", key: "A", name: "동맹 추가", icon: "◇+", cost: 0, target: true, needsRole: false, tone: "gold", cooldown: 5 },
  "ally-remove": { id: "ally-remove", key: "S", name: "동맹 파기", icon: "◇×", cost: 0, target: true, needsRole: false, tone: "red", cooldown: 5 },
};

const roleSkillIds: Record<string, string[]> = {
  마피아대부: ["lower-attack"], 히트맨: ["enemy-scan"], 마피아일원: ["upper-attack", "ally-check"],
  마피아후계자: ["ally-scan", "boss-check"], 스파이: [], 경찰반장: ["ally-check"],
  자경단원: ["upper-attack"], 사립탐정: ["enemy-scan"], 순찰경찰: ["ally-check", "lower-attack"],
  탐정조수: ["detective-check", "enemy-check"], 남자연인: ["ally-check"], 여자연인: ["enemy-check"], 공무원: ["support"],
};

const allRoles = [
  { name: "마피아대부", faction: "mafia" as const },
  { name: "히트맨", faction: "mafia" as const },
  { name: "마피아일원", faction: "mafia" as const },
  { name: "마피아후계자", faction: "mafia" as const },
  { name: "스파이", faction: "mafia" as const },
  { name: "경찰반장", faction: "citizen" as const },
  { name: "자경단원", faction: "citizen" as const },
  { name: "사립탐정", faction: "citizen" as const },
  { name: "순찰경찰", faction: "citizen" as const },
  { name: "탐정조수", faction: "citizen" as const },
  { name: "남자연인", faction: "citizen" as const },
  { name: "여자연인", faction: "citizen" as const },
  { name: "공무원", faction: "citizen" as const },
];

const formations: Record<number, string[]> = {
  8: ["마피아대부", "히트맨", "마피아일원", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수"],
  9: ["마피아대부", "히트맨", "마피아일원", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "공무원"],
  10: ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "공무원"],
  11: ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "남자연인", "여자연인"],
  12: ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "스파이", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "남자연인", "여자연인"],
  13: ["마피아대부", "히트맨", "마피아일원", "마피아후계자", "스파이", "경찰반장", "자경단원", "사립탐정", "순찰경찰", "탐정조수", "남자연인", "여자연인", "공무원"],
};

const botNames = ["윤서", "민준", "하린", "도윤", "서아", "지호", "예린", "현우", "수빈", "건우", "채원", "시우"];

function factionOf(role: string): Faction {
  return allRoles.find((item) => item.name === role)?.faction ?? "citizen";
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
  const [started, setStarted] = useState(false);
  const [playerCount, setPlayerCount] = useState(8);
  const [debugRole, setDebugRole] = useState("마피아일원");
  const [players, setPlayers] = useState(initialPlayers);
  const [mana, setMana] = useState(20);
  const [manaTickSeconds, setManaTickSeconds] = useState(2 * 60 + 14);
  const [gameResult, setGameResult] = useState<GameResult>(null);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [botMana, setBotMana] = useState<Record<number, number>>({});
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatChannel, setChatChannel] = useState<"public" | "alliance">("public");
  const [whisperBubble, setWhisperBubble] = useState<{ from: number; to: number; text: string } | null>(null);
  const [alliances, setAlliances] = useState<number[]>([]);
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
  const mySeatIndex = players.findIndex((player) => player.isMe);
  const manaTickLabel = `${String(Math.floor(manaTickSeconds / 60)).padStart(2, "0")}:${String(manaTickSeconds % 60).padStart(2, "0")}`;
  const availableSkills = useMemo(() => [skillCatalog.announce, ...(roleSkillIds[me.role] ?? []).map((id) => skillCatalog[id]), skillCatalog["ally-add"], skillCatalog["ally-remove"]].map((skill, index) => ({ ...skill, key: ["Q", "W", "E", "R", "T", "Y"][index] ?? String(index + 1) })), [me.role]);

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
    setBotMana((current) => Object.fromEntries(Object.entries(current).map(([id, value]) => [id, Math.min(MANA_MAX, value + MANA_TICK)])));
    setLogs((current) => [{ time: "지금", icon: "+", text: `마나 보급 · 모든 플레이어 +${MANA_TICK}`, tone: "mana" }, ...current]);
    setNotice(`마나 보급 완료 · 마나가 ${MANA_TICK} 회복되었습니다.`);
    setManaTickSeconds(MANA_INTERVAL_SECONDS);
  }, [manaTickSeconds]);

  useEffect(() => {
    if (!started || gameResult) return;
    const timer = window.setTimeout(() => {
      const aliveBots = players.filter((player) => player.alive && !player.isMe);
      if (aliveBots.length === 0) return;
      const unannounced = aliveBots.filter((player) => player.announced === "미공표");
      if (unannounced.length > 0) {
        const actor = unannounced[Math.floor(Math.random() * unannounced.length)];
        const claims = formations[players.length];
        const claim = Math.random() < 0.55 ? actor.role : claims[Math.floor(Math.random() * claims.length)];
        const gain = claim === actor.role ? 10 : 5;
        setPlayers((current) => current.map((player) => player.id === actor.id ? { ...player, announced: claim } : player));
        setBotMana((current) => ({ ...current, [actor.id]: Math.min(MANA_MAX, (current[actor.id] ?? 20) + gain) }));
        setLogs((current) => [{ time: "지금", icon: "⚑", text: `${actor.name}이(가) ${claim}을(를) 공표했습니다.`, tone: "plain" }, ...current]);
        return;
      }

      const actor = aliveBots[Math.floor(Math.random() * aliveBots.length)];
      const currentMana = botMana[actor.id] ?? 20;
      const attackCost = actor.role === "마피아대부" || actor.role === "순찰경찰" ? 30 : actor.role === "마피아일원" || actor.role === "자경단원" ? 40 : null;
      const enemyTargets = players.filter((player) => player.alive && player.id !== actor.id && player.faction !== actor.faction && player.announced !== "미공표");

      if (attackCost && currentMana >= attackCost && enemyTargets.length > 0 && Math.random() < 0.45) {
        const target = enemyTargets[Math.floor(Math.random() * enemyTargets.length)];
        const guessedRole = target.announced;
        const hit = guessedRole === target.role;
        setBotMana((current) => ({ ...current, [actor.id]: (current[actor.id] ?? 20) - attackCost }));
        if (hit) {
          const nextPlayers = players.map((player) => player.id === target.id ? { ...player, alive: false } : player);
          const result = checkVictory(nextPlayers);
          setPlayers(nextPlayers);
          setLogs((current) => [{ time: "지금", icon: "✦", text: `${actor.role}이(가) ${target.role}을(를) 처치했습니다.`, tone: "danger" }, ...current]);
          if (result) { setGameResult(result); setNotice(`게임 종료 · ${result.reason}`); }
        } else {
          setLogs((current) => [{ time: "지금", icon: "↗", text: `${actor.role}이(가) 누군가를 ${guessedRole}(으)로 공격했으나 실패했습니다.`, tone: "danger" }, ...current]);
        }
        return;
      }

      const inspectTargets = players.filter((player) => player.alive && player.id !== actor.id && player.announced !== "미공표");
      if (currentMana >= 5 && inspectTargets.length > 0) {
        const target = inspectTargets[Math.floor(Math.random() * inspectTargets.length)];
        setBotMana((current) => ({ ...current, [actor.id]: (current[actor.id] ?? 20) - 5 }));
        setLogs((current) => [{ time: "지금", icon: "◉", text: `누군가 ${target.name}을 살피고 있습니다.`, tone: "scan" }, ...current]);
      }
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [started, gameResult, players, botMana]);
  const modalRoles = useMemo(() => {
    if (!selectedSkill) return [];
    const currentFormation = formations[players.length].map((role) => ({ name: role, faction: factionOf(role) }));
    if (selectedSkill.id === "announce") return currentFormation;
    if (selectedSkill.id === "ally-scan") return currentFormation.filter((item) => item.faction === me.faction);
    return currentFormation.filter((item) => item.faction !== me.faction);
  }, [selectedSkill, players.length, me.faction]);

  function shuffle<T>(values: T[]) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  function startDebugGame() {
    const rolePool = [...formations[playerCount]];
    const ownRole = rolePool.includes(debugRole) ? debugRole : rolePool[0];
    rolePool.splice(rolePool.indexOf(ownRole), 1);
    const assignedBots = shuffle(rolePool);
    const nextPlayers: Player[] = [
      { id: 1, name: "나", announced: "미공표", role: ownRole, faction: factionOf(ownRole), alive: true, isMe: true },
      ...assignedBots.map((role, index) => ({ id: index + 2, name: botNames[index], announced: "미공표", role, faction: factionOf(role), alive: true })),
    ];
    setPlayers(nextPlayers);
    setMana(20);
    setManaTickSeconds(2 * 60 + 14);
    setCooldowns({});
    setBotMana(Object.fromEntries(nextPlayers.filter((player) => !player.isMe).map((player) => [player.id, 20])));
    setGameResult(null);
    setSelectedSkill(null);
    setSelectedTarget(null);
    setChatMessages([]);
    setChatInput("");
    setWhisperBubble(null);
    setAlliances([]);
    setLogs([{ time: "지금", icon: "◆", text: `${playerCount}인 디버그 게임이 시작되었습니다.`, tone: "plain" }]);
    setNotice("직업이 배정되었습니다. 먼저 직업을 공표하세요.");
    setStarted(true);
  }

  function chooseSkill(skill: Skill) {
    if (gameResult || mana < skill.cost || (cooldowns[skill.id] ?? 0) > 0) return;
    setSelectedTarget(null);
    setSelectedSkill(skill);
    setNotice(skill.target ? `${skill.name}: 게임판에서 대상을 선택하세요.` : `${skill.name}: 공표할 직업을 선택하세요.`);
    if (!skill.target && !skill.needsRole) resolveSkill(skill, null);
  }

  function chooseTarget(player: Player) {
    if (!selectedSkill?.target || !isTargetable(player, selectedSkill)) return;
    setSelectedTarget(player);
    if (!selectedSkill.needsRole) resolveSkill(selectedSkill, player);
  }

  function isTargetable(player: Player, skill: Skill) {
    if (!player.alive || player.isMe) return false;
    if ((skill.id === "ally-check" || skill.id === "enemy-check") && player.announced === "미공표") return false;
    const announcedFaction = factionOf(player.announced);
    if (skill.id === "ally-check") return announcedFaction === me.faction;
    if (skill.id === "enemy-check") return announcedFaction !== me.faction;
    if (skill.id === "ally-add") return !alliances.includes(player.id);
    if (skill.id === "ally-remove") return alliances.includes(player.id);
    return true;
  }

  function sendChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    const whisper = text.match(/^-(\d+)\s+(.+)$/s);
    if (whisper) {
      const targetId = Number(whisper[1]);
      const target = players.find((player) => player.id === targetId);
      if (!target || target.id === me.id) {
        setNotice("귓말 대상 번호를 확인하세요. 예: -3 야");
        return;
      }
      setWhisperBubble({ from: me.id, to: targetId, text: whisper[2] });
      setNotice(`${targetId}번 플레이어에게 귓말을 보냈습니다.`);
      window.setTimeout(() => setWhisperBubble(null), 5500);
    } else {
      const allianceCommand = text.match(/^\/a\s+(.+)$/s);
      const channel = allianceCommand || chatChannel === "alliance" ? "alliance" : "public";
      const messageText = allianceCommand?.[1] ?? text;
      if (channel === "alliance" && alliances.length === 0) {
        setNotice("동맹챗을 보낼 동맹이 없습니다. 먼저 동맹 추가를 사용하세요.");
        return;
      }
      setChatMessages((current) => [...current.slice(-30), { id: Date.now(), from: me.id, text: messageText, channel }]);
      if (allianceCommand) setChatChannel("alliance");
    }
    setChatInput("");
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

    if (skill.id === "ally-scan" || skill.id === "enemy-scan") {
      const hit = guessedRole === target.role;
      setLogs((current) => [{ time: "지금", icon: "⌁", text: `누군가 ${target.name}을 스캔하고 있습니다.`, tone: "scan" }, ...current]);
      setNotice(hit ? `스캔 성공 · ${target.name}은(는) ${target.role}입니다.` : `스캔 실패 · ${target.name}은(는) ${guessedRole}이(가) 아닙니다.`);
      return;
    }

    if (skill.id === "upper-attack" || skill.id === "lower-attack") {
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

    if (skill.id === "boss-check" || skill.id === "detective-check") {
      const expectedRole = skill.id === "boss-check" ? "마피아대부" : "사립탐정";
      setNotice(`${target.name}은(는) ${expectedRole}${target.role === expectedRole ? "이 맞습니다" : "이 아닙니다"}.`);
      return;
    }

    if (skill.id === "support") {
      setLogs((current) => [{ time: "지금", icon: "+", text: `공무원이 ${target.name}에게 마나를 지원했습니다.`, tone: "mana" }, ...current]);
      setNotice(`${target.name}에게 마나 50을 지원했습니다.`);
      return;
    }

    if (skill.id === "ally-add") {
      setAlliances((current) => [...new Set([...current, target.id])]);
      setNotice(`${target.id}번 ${target.name}과(와) 동맹을 맺었습니다.`);
      return;
    }

    if (skill.id === "ally-remove") {
      setAlliances((current) => current.filter((id) => id !== target.id));
      setNotice(`${target.id}번 ${target.name}과(와)의 동맹을 파기했습니다.`);
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

  if (!started) {
    const availableRoles = formations[playerCount];
    return (
      <main className="debug-lobby">
        <section className="lobby-card">
          <span className="result-kicker">DEBUG SOLO MODE</span>
          <h1>봇 게임 만들기</h1>
          <p>나머지 자리는 규칙 기반 봇으로 채웁니다. 테스트할 인원과 내 직업을 선택하세요.</p>
          <label>총 인원 <strong>{playerCount}명</strong></label>
          <div className="count-picker">{[8, 9, 10, 11, 12, 13].map((count) => <button className={playerCount === count ? "active" : ""} key={count} onClick={() => { setPlayerCount(count); if (!formations[count].includes(debugRole)) setDebugRole(formations[count][0]); }}>{count}</button>)}</div>
          <label>내 직업 <small>디버그용 강제 지정</small></label>
          <div className="debug-role-grid">{availableRoles.map((role) => <button className={`${factionOf(role)} ${debugRole === role ? "active" : ""}`} key={role} onClick={() => setDebugRole(role)}>{role}</button>)}</div>
          <div className="formation-summary"><span>포메이션</span><p>{availableRoles.join(" · ")}</p></div>
          <button className="start-debug" onClick={startDebugGame}>나머지를 봇으로 채워 시작</button>
        </section>
      </main>
    );
  }

  return (
    <main className={`game-shell size-${players.length}`}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">T</span><div><strong>TACTICS</strong><small>실시간 마피아 전술전</small></div></div>
        <div className="room-status"><span className="live-dot" /> DEBUG ROOM <b>{players.length} / {players.length}</b></div>
        <div className="supply"><span>다음 마나 보급</span><strong>{manaTickLabel}</strong><div className="supply-track"><i style={{ width: `${((MANA_INTERVAL_SECONDS - manaTickSeconds) / MANA_INTERVAL_SECONDS) * 100}%` }} /></div></div>
        <button className="sound-button" aria-label="소리 설정">♪</button>
      </header>

      <section className="battle-layout">
        <aside className="event-panel panel">
          <div className="panel-heading chat-heading"><span>채팅</span><div className="chat-tabs"><button className={chatChannel === "public" ? "active" : ""} onClick={() => setChatChannel("public")}>공개</button><button className={chatChannel === "alliance" ? "active" : ""} onClick={() => setChatChannel("alliance")}>동맹</button></div></div>
          <div className="chat-stream">
            {chatMessages.filter((message) => message.channel === chatChannel).length === 0 ? <p className="chat-empty">{chatChannel === "public" ? <>모두에게 메시지를 보냅니다.<br/><code>-3 야</code> → 3번에게 귓말<br/><code>/a 작전</code> → 동맹챗</> : <>현재 동맹에게만 보이는 채팅입니다.<br/>동맹 추가/파기는 우하단 스킬을 사용하세요.</>}</p> : chatMessages.filter((message) => message.channel === chatChannel).map((message) => {
              const sender = players.find((player) => player.id === message.from);
              return <p className={message.channel} key={message.id}><b>{message.channel === "alliance" ? "◇ 동맹 · " : ""}{message.from}번 {sender?.name}</b><span>{message.text}</span></p>;
            })}
          </div>
          <form className="chat-form" onSubmit={sendChat}><input aria-label="채팅 메시지" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder={chatChannel === "public" ? "전체 채팅 · -번호 귓말 · /a 동맹챗" : "동맹에게 메시지 보내기"} maxLength={160}/><button>전송</button></form>
          <div className="panel-heading event-subheading"><span>전장 기록</span><button>전체</button></div>
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
              <strong>{players.length}</strong><small>플레이어</small>
            </div>
            {players.map((player, index) => {
              const rotatedSeatIndex = (index - mySeatIndex + players.length) % players.length;
              const angle = Math.PI / 2 + (rotatedSeatIndex * Math.PI * 2) / players.length;
              const left = 50 + Math.cos(angle) * 43;
              const top = 47 + Math.sin(angle) * 42;
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
                  <span className="seat-pointer" /><span className="seat-number">{player.id}</span>
                  <span className="portrait">{player.announced === "미공표" && player.alive ? <span className="unknown-portrait">?</span> : <span className="portrait-art" style={portraitStyle(player.alive ? player.announced : player.role)} />}{!player.alive && <b>☠</b>}</span>
                  <span className="player-copy"><strong>{player.name}{player.isMe && <em>YOU</em>}</strong><small>공표 · <b className={`${factionOf(player.announced)}-text`}>{player.announced}</b></small>{!player.alive && <small className={`revealed-role ${factionOf(player.role)}-text`}>실제 · {player.role}</small>}</span>
                  <span className={`life-state ${player.alive ? "" : "down"}`}>{player.alive ? "생존" : "사망 · 직업 공개"}</span>
                  {alliances.includes(player.id) && <span className="alliance-mark">동맹</span>}
                </button>
              );
            })}
          </div>
          {whisperBubble && <div className="whisper-cloud"><small>TO {whisperBubble.to} · PRIVATE</small><strong>{whisperBubble.from}번 플레이어</strong><p>{whisperBubble.text}</p></div>}
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
          {availableSkills.map((skill) => (
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
