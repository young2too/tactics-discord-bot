"use client";

import { useEffect, useMemo, useState } from "react";
import { botNames, formations, initialPlayers, MANA_INTERVAL_SECONDS, MANA_MAX, MANA_TICK, roleSkillIds, skillCatalog } from "../game/catalog";
import { checkVictory, factionOf, shuffle } from "../game/rules";
import type { ChatMessage, GameResult, Player, PrivateLog, PublicEffect, Skill } from "../game/types";
import { CommunicationPanel, DebugLobby, MobilePanelDock, PrivateRolePanel, SkillDeck, type MobilePanel } from "../components/game-panels";
import { Battlefield } from "../components/battlefield";
import { GameOverModal, ProclamationModal, RoleChoiceModal } from "../components/game-modals";
import { ModeLobby, MultiplayerLobby } from "../components/multiplayer-lobby";
import { FirstVisitPrompt, TrainingCenter } from "../components/tutorial";

export function GameBoard() {
  const [entryMode, setEntryMode] = useState<"choose" | "debug" | "multiplayer" | "tutorial">("choose");
  const [firstVisit, setFirstVisit] = useState<boolean | null>(null);
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
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [whisperBubble, setWhisperBubble] = useState<{ from: number; to: number; text: string } | null>(null);
  const [alliances, setAlliances] = useState<number[]>([]);
  const [usedOnce, setUsedOnce] = useState<Record<string, boolean>>({});
  const [lowAttackFails, setLowAttackFails] = useState(0);
  const [successorId, setSuccessorId] = useState<number | null>(null);
  const [snipeAuthorized, setSnipeAuthorized] = useState(false);
  const [skillText, setSkillText] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<Player | null>(null);
  const [effectTarget, setEffectTarget] = useState<PublicEffect>(null);
  const [localVerdict, setLocalVerdict] = useState<{ id: number; title: string; success: boolean; message: string } | null>(null);
  const [notice, setNoticeState] = useState("상급 공격을 준비하려면 우하단 스킬을 선택하세요.");
  const [privateLogs, setPrivateLogs] = useState<PrivateLog[]>([]);
  const [logs, setLogs] = useState([
    { time: "21:05", icon: "+", text: "마나 보급 · 모든 플레이어 +20", tone: "mana" },
    { time: "21:07", icon: "🔍", text: "누군가 민준을 살피고 있습니다.", tone: "scan" },
    { time: "21:08", icon: "⚑", text: "윤서가 경찰반장을 공표했습니다.", tone: "plain" },
  ]);

  const me = players.find((player) => player.isMe)!;
  const mySeatIndex = players.findIndex((player) => player.isMe);
  const manaTickLabel = `${String(Math.floor(manaTickSeconds / 60)).padStart(2, "0")}:${String(manaTickSeconds % 60).padStart(2, "0")}`;
  const availableSkills = useMemo(() => [skillCatalog.announce, ...(roleSkillIds[me.role] ?? []).map((id) => skillCatalog[id]), skillCatalog["ally-add"], skillCatalog["ally-remove"]].map((skill, index) => ({ ...skill, key: ["Q", "W", "E", "R", "T", "Y"][index] ?? String(index + 1) })), [me.role]);

  useEffect(() => {
    setFirstVisit(!localStorage.getItem("tactics-onboarding-dismissed") && !localStorage.getItem("tactics-tutorial-complete"));
  }, []);

  useEffect(() => {
    if (!selectedSkill) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setSelectedSkill(null); setSelectedTarget(null); setSkillText("");
      setNoticeState("행동을 취소했습니다.");
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedSkill]);

  function finishOnboarding(nextMode: "choose" | "tutorial") {
    localStorage.setItem("tactics-onboarding-dismissed", "true");
    setFirstVisit(false);
    setEntryMode(nextMode);
  }

  function setNotice(message: string) {
    setNoticeState(message);
    if (started) setPrivateLogs((current) => [...current.slice(-29), { time: "지금", text: message }]);
  }

  function remainingThreats(currentPlayers: Player[]): [boolean, boolean, boolean] {
    const alive = (role: string) => currentPlayers.find((player) => player.alive && player.role === role);
    const captain = alive("경찰반장");
    const boss = alive("마피아대부");
    const hitman = alive("히트맨");
    const captainArrestAvailable = Boolean(captain && (!captain.isMe || !usedOnce.arrest));
    const commandAvailable = Boolean(boss && (!boss.isMe || !usedOnce["snipe-command"]));
    const snipePotential = Boolean(hitman && (!hitman.isMe || !usedOnce.snipe) && (snipeAuthorized || commandAvailable));
    const revengePotential = currentPlayers.some((player) => player.alive && ["남자연인", "여자연인"].includes(player.role) && (!player.isMe || !usedOnce.revenge));
    return [captainArrestAvailable, snipePotential, revengePotential];
  }

  function showVerdict(title: string, success: boolean, message: string) {
    const verdict = { id: Date.now(), title, success, message };
    setLocalVerdict(verdict);
    window.setTimeout(() => setLocalVerdict((current) => current?.id === verdict.id ? null : current), 3000);
  }

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
    setLogs((current) => [...current, { time: "지금", icon: "+", text: `마나 보급 · 모든 플레이어 +${MANA_TICK}`, tone: "mana" }]);
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
        setLogs((current) => [...current, { time: "지금", icon: "⚑", text: `${actor.name}이(가) ${claim}을(를) 공표했습니다.`, tone: "plain" }]);
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
          const result = checkVictory(nextPlayers, successorId, ...remainingThreats(nextPlayers));
          setPlayers(nextPlayers);
          setLogs((current) => [...current, { time: "지금", icon: "✦", text: `${actor.role}이(가) ${target.role}을(를) 처치했습니다.`, tone: "danger" }]);
          if (result) { setGameResult(result); setNotice(`게임 종료 · ${result.reason}`); }
        } else {
          setLogs((current) => [...current, { time: "지금", icon: "↗", text: `${actor.role}이(가) 누군가를 ${guessedRole}(으)로 공격했으나 실패했습니다.`, tone: "danger" }]);
        }
        return;
      }

      const inspectTargets = players.filter((player) => player.alive && player.id !== actor.id && player.announced !== "미공표");
      if (currentMana >= 5 && inspectTargets.length > 0) {
        const target = inspectTargets[Math.floor(Math.random() * inspectTargets.length)];
        const effectType = ["히트맨", "마피아후계자", "사립탐정"].includes(actor.role) ? "scan" : "inspect";
        setBotMana((current) => ({ ...current, [actor.id]: (current[actor.id] ?? 20) - 5 }));
        setEffectTarget({ id: target.id, type: effectType });
        window.setTimeout(() => setEffectTarget(null), 1400);
        setLogs((current) => [...current, { time: "지금", icon: "🔍", text: `누군가 ${target.name}을 살피고 있습니다.`, tone: "scan" }]);
      }
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [started, gameResult, players, botMana]);
  const modalRoles = useMemo(() => {
    if (!selectedSkill) return [];
    const currentFormation = formations[players.length].map((role) => ({ name: role, faction: factionOf(role) }));
    if (selectedSkill.id === "announce") return currentFormation;
    const livingRoles = new Set(players.filter((player) => player.alive).map((player) => player.role));
    const availableFormation = currentFormation.filter((item) => livingRoles.has(item.name));
    if (selectedSkill.id === "ally-scan" || selectedSkill.id === "leadership") return availableFormation.filter((item) => item.faction === me.faction);
    if (selectedSkill.id === "advanced-scan") return availableFormation.filter((item) => item.name !== "경찰반장");
    if (selectedSkill.id === "enemy-scan") return availableFormation.filter((item) => item.faction !== me.faction && item.name !== "마피아대부" && item.name !== "경찰반장");
    return availableFormation.filter((item) => item.faction !== me.faction);
  }, [selectedSkill, players, me.faction]);

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
    setLocalVerdict(null);
    setChatMessages([]);
    setChatInput("");
    setWhisperBubble(null);
    setAlliances([]);
    setUsedOnce({});
    setLowAttackFails(0);
    setSuccessorId(null);
    setSnipeAuthorized(false);
    setSkillText("");
    setLogs([{ time: "지금", icon: "◆", text: `${playerCount}인 디버그 게임이 시작되었습니다.`, tone: "plain" }]);
    setPrivateLogs([{ time: "지금", text: "직업이 배정되었습니다. 먼저 직업을 공표하세요." }]);
    setNotice("직업이 배정되었습니다. 먼저 직업을 공표하세요.");
    setStarted(true);
  }

  function chooseSkill(skill: Skill) {
    if (gameResult) return;
    if (selectedSkill?.id === skill.id) { cancelTargeting(); return; }
    if ((cooldowns[skill.id] ?? 0) > 0) return;
    if (["leadership", "successor", "snipe-command", "arrest", "snipe", "revenge"].includes(skill.id) && usedOnce[skill.id]) {
      setNotice(`${skill.name}은(는) 게임 중 1회만 사용할 수 있습니다.`);
      return;
    }
    if (skill.id === "leadership" && me.announced !== me.role) {
      setNotice("리더쉽은 실제 직업을 진명 공표한 뒤 사용할 수 있습니다.");
      return;
    }
    if (skill.id === "revenge") {
      const partnerRole = me.role === "남자연인" ? "여자연인" : "남자연인";
      const partner = players.find((player) => player.role === partnerRole);
      if (!partner || partner.alive) { setNotice("상대 연인이 사망한 뒤에만 복수귀가 활성화됩니다."); return; }
    }
    if (skill.id === "snipe" && !snipeAuthorized) { setNotice("마피아대부의 저격명령을 받은 뒤 저격을 사용할 수 있습니다."); return; }
    if (skill.id === "deception") { setNotice("기만은 패시브입니다. 시민 직업을 공표하면 시민의 아군 확인을 속입니다."); return; }
    setMobilePanel(null);
    setSelectedTarget(null);
    setSelectedSkill(skill);
    setNotice(skill.target ? `${skill.name}: 게임판에서 대상을 선택하세요.` : skill.needsText ? `${skill.name}: 내용을 입력하세요.` : `${skill.name}: 직업을 선택하세요.`);
    if (!skill.target && !skill.needsRole && !skill.needsText) resolveSkill(skill, null);
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
    if (skill.id === "betrayal") return alliances.includes(player.id);
    return true;
  }

  function sendChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    const incomingWhisper = text.match(/^\+(\d+)\s+(.+)$/s);
    if (incomingWhisper) {
      const senderId = Number(incomingWhisper[1]);
      const sender = players.find((player) => player.id === senderId);
      if (!sender || sender.id === me.id) {
        setNotice("귓말을 보낼 봇의 번호를 확인하세요. 예: +3 야");
        return;
      }
      setWhisperBubble({ from: senderId, to: me.id, text: incomingWhisper[2] });
      setNotice(`${senderId}번 ${sender.name}에게서 귓말이 도착했습니다.`);
      setChatInput("");
      window.setTimeout(() => setWhisperBubble(null), 5500);
      return;
    }
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
    // Debug solo mode intentionally does not consume mana.
    if (["upper-attack", "lower-attack"].includes(skill.id) && guessedRole === "경찰반장" && players.some((player) => player.alive && player.role === "순찰경찰")) {
      setSelectedSkill(null); setSelectedTarget(null);
      setNotice("공격 불가 · 순찰경찰이 살아 있어 경찰반장으로 공격할 수 없습니다.");
      showVerdict("공격 불가", false, "순찰경찰이 살아 있어 경찰반장으로 공격할 수 없습니다.");
      return;
    }
    const oneUseSkills = ["leadership", "successor", "snipe-command", "arrest", "snipe", "revenge"];
    if (!oneUseSkills.includes(skill.id)) setCooldowns((current) => ({ ...current, [skill.id]: skill.cooldown }));
    setSelectedSkill(null);
    setSelectedTarget(null);

    if (skill.id === "announce" && guessedRole) {
      const announceGain = guessedRole === me.role ? 10 : 5;
      setMana((current) => Math.min(MANA_MAX, current + announceGain));
      setPlayers((current) => current.map((player) => player.isMe ? { ...player, announced: guessedRole } : player));
      setLogs((current) => [...current, { time: "지금", icon: "⚑", text: `내가 ${guessedRole}을 공표했습니다.`, tone: "plain" }]);
      const message = `${guessedRole} 공표 완료 · 마나 +${announceGain} · 진명 여부와 보상량은 비공개입니다.`;
      setNotice(message); showVerdict("공표 완료", true, message);
      return;
    }

    if (skill.id === "leadership" && guessedRole) {
      const match = players.find((player) => player.alive && player.role === guessedRole);
      setUsedOnce((current) => ({ ...current, leadership: true }));
      const message = match ? `${guessedRole}은(는) ${match.id}번 ${match.name}입니다.` : `생존한 ${guessedRole}은(는) 없습니다.`;
      setNotice(`리더쉽 결과 · ${message}`); showVerdict("리더십 서치", Boolean(match), message);
      return;
    }

    if (!target) return;
    const inspectSkills = ["ally-scan", "advanced-scan", "enemy-scan", "ally-check", "enemy-check", "boss-check", "detective-check"];
    const attackSkills = ["upper-attack", "lower-attack", "snipe", "revenge", "arrest"];
    const publicEffectType = inspectSkills.includes(skill.id) ? "inspect" : attackSkills.includes(skill.id) ? "attack" : null;
    if (publicEffectType) { setEffectTarget({ id: target.id, type: publicEffectType }); window.setTimeout(() => setEffectTarget(null), 1400); }

    if (skill.id === "ally-scan" || skill.id === "advanced-scan" || skill.id === "enemy-scan") {
      const hit = guessedRole === target.role;
      setLogs((current) => [...current, { time: "지금", icon: "🔍", text: `누군가 ${target.name}을 살피고 있습니다.`, tone: "scan" }]);
      setNotice(hit ? `스캔 성공 · ${target.name}은(는) ${target.role}입니다.` : `스캔 실패 · ${target.name}은(는) ${guessedRole}이(가) 아닙니다.`);
      showVerdict("스캔 판정", hit, hit ? `${target.name}은(는) ${target.role}입니다.` : `${target.name}은(는) ${guessedRole}이(가) 아닙니다.`);
      return;
    }

    if (skill.id === "upper-attack" || skill.id === "lower-attack") {
      const hit = guessedRole === target.role;
      if (hit) {
        const nextPlayers = players.map((player) => player.id === target.id ? { ...player, alive: false } : player);
        const result = checkVictory(nextPlayers, successorId, ...remainingThreats(nextPlayers));
        setPlayers(nextPlayers);
        showVerdict("공격 판정", true, `${target.name} 공격 명중 · 실제 직업은 ${target.role}입니다.`);
        if (result) {
          setGameResult(result);
          setLogs((current) => [...current, { time: "지금", icon: "✦", text: `${me.role}이 ${target.role}을 처치했습니다.`, tone: "danger" }, { time: "지금", icon: "🏁", text: `게임 종료 · ${result.winner === "mafia" ? "마피아" : "시민"} 진영 승리`, tone: "danger" }]);
          setNotice(`게임 종료 · ${result.reason}`);
          return;
        }
        setLogs((current) => [...current, { time: "지금", icon: "✦", text: `${me.role}이 ${target.role}을 처치했습니다.`, tone: "danger" }]);
        setNotice(`공격 명중 · ${target.name}의 실제 직업은 ${target.role}이었습니다.`);
      } else {
        if (skill.id === "lower-attack") {
          const failures = lowAttackFails + 1;
          setLowAttackFails(failures);
          if (failures >= 2) {
            const nextPlayers = players.map((player) => player.isMe ? { ...player, alive: false } : player);
            const result = checkVictory(nextPlayers, successorId, ...remainingThreats(nextPlayers));
            setPlayers(nextPlayers);
            setLogs((current) => [...current, { time: "지금", icon: "☠", text: `${me.role}이 하급 공격을 2회 실패하여 사망했습니다.`, tone: "danger" }]);
            setNotice("하급 공격 2회 누적 실패 · 자멸했습니다.");
            showVerdict("공격 판정", false, "하급공격 실패 2/2 · 누적 실패로 자멸했습니다.");
            if (result) setGameResult(result);
            return;
          }
        }
        setLogs((current) => [...current, { time: "지금", icon: "↗", text: `${me.role}이 누군가를 ${guessedRole}(으)로 공격했으나 실패했습니다.`, tone: "danger" }]);
        const failureMessage = `공격 실패 · ${target.name}은(는) ${guessedRole}이(가) 아닙니다.${skill.id === "lower-attack" ? ` (누적 ${lowAttackFails + 1}/2)` : ""}`;
        setNotice(failureMessage);
        showVerdict("공격 판정", false, failureMessage);
      }
      return;
    }

    if (skill.id === "boss-check" || skill.id === "detective-check") {
      const expectedRole = skill.id === "boss-check" ? "마피아대부" : "사립탐정";
      const hit = target.role === expectedRole;
      const message = `${target.name}은(는) ${expectedRole}${hit ? "이 맞습니다" : "이 아닙니다"}.`;
      setNotice(message); showVerdict("직업 확인", hit, message);
      return;
    }

    if (skill.id === "support") {
      setBotMana((current) => ({ ...current, [target.id]: Math.min(MANA_MAX, (current[target.id] ?? 20) + 30) }));
      setLogs((current) => [...current, { time: "지금", icon: "+", text: `공무원이 ${target.name}에게 마나를 지원했습니다.`, tone: "mana" }]);
      const message = `${target.name}에게 마나 30을 지원했습니다.`;
      setNotice(message); showVerdict("지원 완료", true, message);
      return;
    }

    if (skill.id === "successor") {
      setUsedOnce((current) => ({ ...current, successor: true }));
      const hit = target.role === "마피아후계자";
      if (target.role === "마피아후계자") {
        setSuccessorId(target.id);
        setNotice(`후계자 지정 성공 · ${target.id}번 ${target.name}이 후계자로 등록되었습니다.`);
        setLogs((current) => [...current, { time: "지금", icon: "♚", text: "마피아대부가 후계자를 지정했습니다.", tone: "plain" }]);
      } else {
        setNotice(`후계자 지정 실패 · ${target.name}은(는) 마피아후계자가 아닙니다.`);
        setLogs((current) => [...current, { time: "지금", icon: "!", text: "마피아대부의 후계자 지정이 실패했습니다.", tone: "danger" }]);
      }
      showVerdict("후계자 지정", hit, hit ? `${target.id}번 ${target.name}이 후계자로 등록되었습니다.` : `${target.name}은(는) 마피아후계자가 아닙니다.`);
      return;
    }

    if (skill.id === "snipe-command") {
      setUsedOnce((current) => ({ ...current, "snipe-command": true }));
      const hit = target.role === "히트맨";
      if (target.role === "히트맨") {
        setSnipeAuthorized(true);
        setNotice(`저격명령 성공 · ${target.id}번 ${target.name}의 저격이 활성화되었습니다.`);
        setLogs((current) => [...current, { time: "지금", icon: "⚑", text: "마피아대부의 저격명령이 성공했습니다.", tone: "danger" }]);
      } else {
        setNotice(`저격명령 실패 · ${target.name}은(는) 히트맨이 아닙니다.`);
        setLogs((current) => [...current, { time: "지금", icon: "⚑", text: "마피아대부의 저격명령이 실패했습니다.", tone: "danger" }]);
      }
      showVerdict("저격명령", hit, hit ? `${target.name}의 저격을 활성화했습니다.` : `${target.name}은(는) 히트맨이 아닙니다.`);
      return;
    }

    if (skill.id === "arrest") {
      setUsedOnce((current) => ({ ...current, arrest: true }));
      if (target.role !== "마피아대부") {
        setGameResult({ winner: "mafia", reason: "경찰반장의 검거 실패" });
        setNotice("검거 실패 · 시민 진영 패배"); showVerdict("검거 판정", false, `${target.name}은(는) 마피아대부가 아닙니다.`);
        return;
      }
      const nextPlayers = players.map((player) => player.id === target.id ? { ...player, alive: false } : player);
      setPlayers(nextPlayers);
      const successorAlive = successorId !== null && nextPlayers.some((player) => player.id === successorId && player.alive);
      if (successorAlive) {
        setNotice("검거 성공 · 살아있는 후계자가 있어 게임이 계속됩니다."); showVerdict("검거 판정", true, `${target.name} 검거 성공 · 후계자가 생존해 있습니다.`);
      } else {
        setGameResult({ winner: "citizen", reason: "마피아대부 검거 성공" });
        setNotice("검거 성공 · 시민 진영 승리"); showVerdict("검거 판정", true, `${target.name} 검거에 성공했습니다.`);
      }
      return;
    }

    if (skill.id === "snipe" || skill.id === "revenge") {
      setUsedOnce((current) => ({ ...current, [skill.id]: true }));
      if (skill.id === "snipe") setSnipeAuthorized(false);
      const nextPlayers = players.map((player) => player.id === target.id ? { ...player, alive: false } : player);
      setPlayers(nextPlayers);
      setLogs((current) => [...current, { time: "지금", icon: "☠", text: `${skill.name} 발동 · ${target.name}(${target.role}) 사망`, tone: "danger" }]);
      const result = checkVictory(nextPlayers, successorId, ...remainingThreats(nextPlayers));
      if (result) setGameResult(result);
      const message = `${skill.name} 성공 · ${target.name}을(를) 즉사시켰습니다.`;
      setNotice(message); showVerdict(`${skill.name} 완료`, true, message);
      return;
    }

    if (skill.id === "ally-add") {
      setAlliances((current) => [...new Set([...current, target.id])]);
      const message = `${target.id}번 ${target.name}과(와) 동맹을 맺었습니다.`;
      setNotice(message); showVerdict("동맹 체결", true, message);
      return;
    }

    if (skill.id === "ally-remove") {
      setAlliances((current) => current.filter((id) => id !== target.id));
      const message = `${target.id}번 ${target.name}과(와)의 동맹을 파기했습니다.`;
      setNotice(message); showVerdict("동맹 파기", true, message);
      return;
    }

    if (skill.id === "betrayal") {
      const nextPlayers = players.map((player) => player.id === target.id ? { ...player, alive: false } : player);
      const result = checkVictory(nextPlayers, successorId, ...remainingThreats(nextPlayers));
      setPlayers(nextPlayers); setLogs((current) => [...current, { time: "지금", icon: "🗡", text: `${target.name}이(가) 배신으로 사망했습니다. 직업은 ${target.role}입니다.`, tone: "danger" }]);
      setNotice(`배신 성공 · ${target.name}을(를) 즉시 처치했습니다.`); showVerdict("배신 성공", true, `${target.name}의 실제 직업은 ${target.role}입니다.`); if (result) setGameResult(result); return;
    }

    setLogs((current) => [...current, { time: "지금", icon: "🔍", text: `누군가 ${target.name}을 살피고 있습니다.`, tone: "scan" }]);
    const spyFooled = skill.id === "ally-check" && target.role === "스파이" && target.faction === "mafia" && factionOf(target.announced) === "citizen" && me.faction === "citizen";
    const hit = spyFooled || target.announced === target.role;
    const message = `${target.name}의 공표는 ${hit ? "진명" : "가명"}입니다.`;
    setNotice(message); showVerdict("공표 확인", hit, message);
  }

  function sendProclamation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = skillText.trim().slice(0, 200);
    if (!text || selectedSkill?.id !== "proclamation") return;
    setCooldowns((current) => ({ ...current, proclamation: skillCatalog.proclamation.cooldown }));
    setChatMessages((current) => [...current.slice(-30), { id: Date.now(), from: 0, anonymous: true, text: `[공문] ${text}`, channel: "public" }]);
    setLogs((current) => [...current, { time: "지금", icon: "✉", text: `익명 공문 · ${text}`, tone: "plain" }]);
    setNotice("신원을 숨기고 공문을 전체 플레이어에게 발송했습니다.");
    showVerdict("익명 공문 발송", true, "번호와 닉네임을 공개하지 않고 발송했습니다.");
    setSkillText(""); setSelectedSkill(null); setChatChannel("public");
  }

  function cancelTargeting() {
    setSelectedSkill(null);
    setSelectedTarget(null);
    setSkillText("");
    setNotice("행동을 취소했습니다.");
  }

  if (!started) {
    if (firstVisit === null) return <main className="welcome-gate loading"><span>TACTICS</span></main>;
    if (firstVisit) return <FirstVisitPrompt onTutorial={() => finishOnboarding("tutorial")} onSkip={() => finishOnboarding("choose")} />;
    if (entryMode === "tutorial") return <TrainingCenter onExit={() => setEntryMode("choose")} />;
    if (entryMode === "choose") return <ModeLobby onDebug={() => setEntryMode("debug")} onMultiplayer={() => setEntryMode("multiplayer")} onTutorial={() => setEntryMode("tutorial")} />;
    if (entryMode === "multiplayer") return <MultiplayerLobby />;
    return <DebugLobby playerCount={playerCount} debugRole={debugRole} setPlayerCount={setPlayerCount} setDebugRole={setDebugRole} onStart={startDebugGame} />;
  }

  return (
    <main className={`game-shell size-${players.length} mobile-panel-${mobilePanel ?? "closed"}`}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">T</span><div><strong>TACTICS</strong><small>실시간 마피아 전술전</small></div></div>
        <div className="room-status"><span className="live-dot" /> DEBUG ROOM <b>{players.length} / {players.length}</b></div>
        <div className="supply"><span>디버그 마나</span><strong>∞</strong><div className="supply-track"><i style={{ width: "100%" }} /></div></div>
        <button className="sound-button" aria-label="소리 설정">♪</button>
      </header>

      <section className="battle-layout">
        <CommunicationPanel players={players} messages={chatMessages} channel={chatChannel} setChannel={setChatChannel} input={chatInput} setInput={setChatInput} onSubmit={sendChat} logs={logs} privateLogs={privateLogs} />

        <Battlefield players={players} mySeatIndex={mySeatIndex} selectedSkill={selectedSkill} notice={notice} effectTarget={effectTarget} alliances={alliances} whisper={whisperBubble} onCancel={cancelTargeting} onTarget={chooseTarget} onWhisperPrefill={(player) => { setChatChannel("public"); setChatInput(`-${player.id} `); setMobilePanel("chat"); }} isTargetable={isTargetable} />

        <PrivateRolePanel me={me} notice={notice} logs={privateLogs} />
      </section>

      <SkillDeck me={me} notice={notice} skills={availableSkills} selectedSkill={selectedSkill} cooldowns={cooldowns} usedOnce={usedOnce} gameResult={gameResult} onChoose={chooseSkill} disabledSkills={!snipeAuthorized ? ["snipe"] : []} />
      <MobilePanelDock open={mobilePanel} setOpen={setMobilePanel}/>

      {selectedSkill?.needsRole && (selectedTarget || !selectedSkill.target) && <RoleChoiceModal skill={selectedSkill} target={selectedTarget} roles={modalRoles} onResolve={(role) => resolveSkill(selectedSkill, selectedTarget, role)} onCancel={cancelTargeting} />}

      {selectedSkill?.needsText && <ProclamationModal text={skillText} setText={setSkillText} onSubmit={sendProclamation} onCancel={cancelTargeting} />}

      {localVerdict && <div className={`verdict-popup ${localVerdict.success ? "success" : "failure"}`} key={localVerdict.id} role="button" tabIndex={0} onClick={() => setLocalVerdict(null)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setLocalVerdict(null); }}><span>{localVerdict.title}</span><strong>{localVerdict.success ? "성공" : "실패"}</strong><p>{localVerdict.message}</p></div>}

      {gameResult && <GameOverModal result={gameResult} players={players} />}
    </main>
  );
}
