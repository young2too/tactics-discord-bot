// src/handlers/skillHandler.js
import { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder  } from "discord.js";
import roles from "../data/roles.json" with { type: "json" };
import { getSessionByChannel ,isAlive  } from "../services/sessionService.js";
import { useSkill } from "../services/skillService.js";
import { makeBoardEmbed } from "../util/boardStatus.js";
import { getSkillsForPlayer, isLeaderRole } from "../util/skillMeta.js";
import { checkVictory, stopAndSummarize } from "../services/gameService.js"; // ✅


/**
 * 커스텀 아이디 포맷:
 *  1차: "skill_select"
 *  2차: "skill|<uid>|<skillName>|<argType>"  // argType: "target" | "role" 등
 */
function buildArgCustomId(uid, skillName, argType) {
  return `skill|${uid}|${skillName}|${argType}`;
}
function parseArgCustomId(customId) {
  // "skill|<uid>|<skillName>|<argType>"
  const [prefix, uid, skillName, argType] = customId.split("|");
  return { prefix, uid, skillName, argType };
}





function buildAlivePlayerOptions(vc, s) {
  const pids = Array.from(s.roles.keys()).filter(pid => isAlive(vc.id, pid));
  return pids.map(pid => {
    const member = vc.members.get(pid);
    return { label: member?.displayName ?? pid, value: pid };
  });
}


/**
 * 1) 스킬 드롭다운 선택
 *    - 필요 인자(대상/직업 등)가 있으면 2차 드롭다운을 띄우고
 *    - 없으면 즉시 useSkill 실행
 */
export async function handleSkillSelect(interaction) {
  const vc = interaction.member?.voice?.channel;
  const uid = interaction.user.id;
  const s = getSessionByChannel(vc?.id);
  if (!vc || !s) {
    return interaction.reply({ content: "⚠️ 게임이 시작되지 않았습니다.", ephemeral: true });
  }
  const selectedSkillName = interaction.values?.[0];
  if (!selectedSkillName) {
    return interaction.reply({ content: "❌ 스킬 선택 값이 없습니다.", ephemeral: true });
  }

  // 플레이어가 가진 스킬 목록에서 스킬 정보 찾기
  const mySkills = getSkillsForPlayer(vc.id, uid);
  const skill = mySkills.find(sk => sk.name === selectedSkillName);
  if (!skill) {
    return interaction.reply({ content: "❌ 해당 스킬을 보유하지 않았습니다.", ephemeral: true });
  }
  
  if (!isAlive(vc.id, uid)) {
    return interaction.reply({ content: "⚰️ 사망자는 스킬을 사용할 수 없습니다.", flags: 64 });
  }

  // 세션에 args 임시 저장 공간
  if (!s.pending) s.pending = {};
  s.pending[uid] = { skill: selectedSkillName, args: {} };

  // 스킬별로 추가 인자 필요 여부 정의
  // - 공표: role 필요
  // - 아군 확인/적군 확인: target 필요 (공표한 사람만 대상으로 드롭다운 구성)
  // - 아군 스캔/적군 스캔/상급 공격/하급 공격: target + role 필요
  const name = skill.name;

  // ───────── 공표: 직업 선택만 필요 ─────────
  if (name === "공표") {
    const formation = roles.formations[String(s.size)];
    if (!formation) {
      return interaction.reply({ content: `⚠️ ${s.size}인 포메이션이 없습니다.`, ephemeral: true });
    }

    const roleMenu = new StringSelectMenuBuilder()
      .setCustomId(buildArgCustomId(uid, name, "role"))
      .setPlaceholder("공표할 직업 선택")
      .addOptions(formation.map(r => ({ label: r, value: r })));

    return interaction.reply({
      content: "📢 공표 — 공표할 직업을 선택하세요",
      components: [new ActionRowBuilder().addComponents(roleMenu)],
      embeds: [makeBoardEmbed(vc.id, s)],   // ✅ 현황판 함께 출력
      ephemeral: true,
    });
  }

  // ───────── 확인류: 대상 선택(공표자 중에서만) ─────────
  if (name === "아군 확인" || name === "적군 확인") {
    // 대상 후보: "직업을 공표한 사람"만
    const announcedEntries = Array.from(s.revealed.entries()); // [ [pid, {role, ts, isTrue}], ... ]
    // 🔸 생존자만
    const aliveAnnounced = announcedEntries.filter(([pid]) => isAlive(vc.id, pid));
    if (aliveAnnounced.length === 0) {
      return interaction.reply({ content: "⚠️ 현재 생존 중이며 직업을 공표한 플레이어가 없습니다.", ephemeral: true });
    }
    // 진영 필터링: 아군 확인 → 내 진영 직업 공표자 / 적군 확인 → 상대 진영 직업 공표자
    const myRole = s.roles.get(uid);
    const myFaction = getFactionSafe(myRole, myRole);

    const candidates = aliveAnnounced.filter(([pid, info]) => {
      const announcedRole = info.role;
      const targetFaction = getFactionSafe(announcedRole, s.roles.get(pid));
      return name === "아군 확인"
        ? (targetFaction === myFaction)
        : (targetFaction !== myFaction);
    });

    if (candidates.length === 0) {
      return interaction.reply({
        content: name === "아군 확인"
          ? "⚠️ 아군 직업을 공표한 대상이 없습니다."
          : "⚠️ 적군 직업을 공표한 대상이 없습니다.",
        ephemeral: true
      });
    }

    const options = candidates.map(([pid, info]) => {
      const member = vc.members.get(pid);
      const label = `${member?.displayName ?? pid} — 공표 : ${info.role} `;
      return { label, value: pid };
    });

    const targetMenu = new StringSelectMenuBuilder()
      .setCustomId(buildArgCustomId(uid, name, "target"))
      .setPlaceholder(`${name} 대상 선택`)
      .addOptions(options);

    return interaction.reply({
      content: `🔎 ${name} — 대상을 선택하세요`,
      components: [new ActionRowBuilder().addComponents(targetMenu)],
      embeds: [makeBoardEmbed(vc.id, s)],   // ✅ 현황판 함께 출력
      ephemeral: true,
    });
  }
  // ───────── 스캔/공격류: 대상 + 직업 모두 필요 ─────────
  if (["아군 스캔", "적군 스캔", "상급 공격", "하급 공격"].includes(name)) {
    const playerOptions = buildAlivePlayerOptions(vc, s);
    

    // 내 진영 계산
    const myRole = s.roles.get(uid);
    const myFaction = getFactionSafe(myRole, myRole);

   // 🔸 스킬별 허용 '생존 직업'만(진영 규칙 포함)
   const aliveRoles = Array.from(s.roles.entries())
     .filter(([pid]) => isAlive(vc.id, pid))
     .map(([, role]) => role);
   const uniqAliveRoles = [...new Set(aliveRoles)];
   const filteredRoles = uniqAliveRoles.filter(r => {
     const rFaction = getFactionSafe(r, myRole);
     if (name === "아군 스캔") return rFaction === myFaction; // 아군만
     if (name === "적군 스캔" && isLeaderRole(r)) return false; // 상대 리더는 스캔 불가
     return rFaction !== myFaction; // 적군 스캔/공격류: 적군만
  });

    if (filteredRoles.length === 0) {
      return interaction.reply({
        content: "⚠️ 선택 가능한 직업이 없습니다. 포메이션/진영 구성을 확인하세요.",
        ephemeral: true,
      });
    }

    const playerMenu = new StringSelectMenuBuilder()
      .setCustomId(buildArgCustomId(uid, name, "target"))
      .setPlaceholder("대상 플레이어 선택")
      .addOptions(playerOptions);

    const roleMenu = new StringSelectMenuBuilder()
      .setCustomId(buildArgCustomId(uid, name, "role"))
      .setPlaceholder(name.includes("공격") ? "대상 직업 선택" : "예상 직업 선택")
      .addOptions(filteredRoles.map(r => ({ label: r, value: r })));

    return interaction.reply({
      content: `🎯 ${name} — 대상을 선택하고 직업을 지정하세요`,
      components: [
        new ActionRowBuilder().addComponents(playerMenu),
        new ActionRowBuilder().addComponents(roleMenu),
      ],
      embeds: [makeBoardEmbed(vc.id, s)],   // ✅ 현황판 함께 출력
      ephemeral: true,
    });
  }

  
 // ───────── 리더쉽: 아군 직업만(생존자 기준) 선택 ─────────
 if (name === "리더쉽") {
   const myRole = s.roles.get(uid);
   const myFaction = getFactionSafe(myRole, myRole);

   // 생존자들의 실제 직업 중, 아군 진영만 모아 unique
   const aliveAllyRoles = [...new Set(
     [...s.roles.entries()]
       .filter(([pid]) => isAlive(vc.id, pid))
       .map(([, r]) => r)
       .filter(r => getFactionSafe(r, myRole) === myFaction)
   )];

   // (선택) 본인 직업은 제외 – 팀원 탐색 취지라 배제하는 편이 자연스러움
   const roleOptions = aliveAllyRoles
     .filter(r => r !== myRole)
     .map(r => ({ label: r, value: r }));

   if (roleOptions.length === 0) {
     return interaction.reply({
       content: "⚠️ 선택 가능한 아군 직업이 없습니다. (생존 중인 아군이 없거나 단독 생존)",
       flags: 64,
     });
   }

   const roleMenu = new StringSelectMenuBuilder()
     .setCustomId(buildArgCustomId(uid, name, "role"))
     .setPlaceholder("확인할 아군 직업 선택")
     .addOptions(roleOptions);

   return interaction.reply({
     content: "🧭 리더쉽 — 확인할 **아군 직업**을 선택하세요",
     components: [new ActionRowBuilder().addComponents(roleMenu)],
     embeds: [makeBoardEmbed(vc.id, s)],
     flags: 64,
   });
 }



   // ───────── 일반화: 나머지 스킬들에 대한 드롭다운 자동 생성 ─────────
 const need = neededArgsFor(name);
 if (need.length > 0) {
   const rows = [];

   // 공문(contents)은 드롭다운으로 받을 수 없음 → 안내
   if (need.includes("contents")) {
     return interaction.reply({
       content: "✉️ **공문**은 텍스트 입력이 필요합니다.\n`/say text:<내용>` 명령어로 사용해주세요.",
       ephemeral: true,
     });
   }

   // 대상 드롭다운 (target)
   if (need.includes("target")) {
     const playerOptions = buildAlivePlayerOptions(vc, s);
     const playerMenu = new StringSelectMenuBuilder()
       .setCustomId(buildArgCustomId(uid, name, "target"))
       .setPlaceholder("대상 플레이어 선택")
       .addOptions(playerOptions);
     rows.push(new ActionRowBuilder().addComponents(playerMenu));
   }

   // 직업 드롭다운 (role)
   if (need.includes("role")) {
    const aliveRoles = Array.from(s.roles.entries())
    .filter(([pid]) => isAlive(vc.id, pid))
    .map(([, role]) => role);
    const uniqAliveRoles = [...new Set(aliveRoles)];
    const roleMenu = new StringSelectMenuBuilder()
      .setCustomId(buildArgCustomId(uid, name, "role"))
      .setPlaceholder("직업 선택 (생존 중)")
      .addOptions(uniqAliveRoles.map(r => ({ label: r, value: r })));
    rows.push(new ActionRowBuilder().addComponents(roleMenu));
   }

   return interaction.reply({
     content: `🧩 ${name} — 필요한 값을 선택하세요`,
     components: rows,
     embeds: [makeBoardEmbed(vc.id, s)],
     ephemeral: true,
   });
 }


  // ───────── 추가 인자 없는 스킬은 즉시 사용 ─────────
  const res = useSkill(vc.id, uid, name, {}, interaction.client);
  return emitSkillResult(interaction, res);
}

/**
 * 2) 2차 드롭다운(인자) 응답
 *    - 선택들을 s.pending[uid].args 에 누적
 *    - 스킬별로 필요한 인자가 다 모이면 useSkill 실행
 */
export async function handleSkillArgs(interaction) {
  const vc = interaction.member?.voice?.channel;
  const s = getSessionByChannel(vc?.id);
  if (!vc || !s) {
    return interaction.reply({ content: "⚠️ 게임이 시작되지 않았습니다.", ephemeral: true });
  }

  const { prefix, uid, skillName, argType } = parseArgCustomId(interaction.customId);
  if (prefix !== "skill" || uid !== interaction.user.id) {
    // 다른 유저가 누른 경우 무시
    return interaction.reply({ content: "⚠️ 이 선택 메뉴는 본인만 사용할 수 있습니다.", ephemeral: true });
  }

  if (!s.pending || !s.pending[uid] || s.pending[uid].skill !== skillName) {
    return interaction.reply({ content: "⚠️ 유효하지 않은 요청입니다.", ephemeral: true });
  }

  // 눌러본 당사자 생존 체크
  if (!isAlive(vc.id, interaction.user.id)) {
    return interaction.reply({ content: "⚰️ 사망자는 스킬을 사용할 수 없습니다.", flags: 64 });
  }

  const value = interaction.values?.[0];
  if (!value) {
    return interaction.reply({ content: "❌ 선택 값이 없습니다.", ephemeral: true });
  }

  s.pending[uid].args[argType] = value;

  // 스킬별 필요 인자 완성 체크
  const need = neededArgsFor(skillName);
  const args = s.pending[uid].args;
  const ready = need.every(k => args[k] !== undefined && args[k] !== null && args[k] !== "");

  if (!ready) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate(); // 3초 규약 충족 + 배너 방지
      }
    return interaction.followUp({ content: "✅ 선택 완료. 다음 값을 선택하세요.", ephemeral: true });
  }


  // 준비 완료 → 실행
  const res = useSkill(vc.id, uid, skillName, args, interaction.client);
  delete s.pending[uid];

  return emitSkillResult(interaction, res);
}

/* --------------------------- 내부 유틸리티 --------------------------- */

// 스킬별 요구 인자 정의
function neededArgsFor(skillName) {
  switch (skillName) {
    case "공표":       return ["role"];
    case "아군 확인":   return ["target"];
    case "적군 확인":   return ["target"];
    case "아군 스캔":   return ["target", "role"];
    case "적군 스캔":   return ["target", "role"];
    case "상급 공격":   return ["target", "role"];
    case "하급 공격":   return ["target", "role"];
    case "보스 확인":   return ["target"];
    case "탐정 확인":   return ["target"];
    case "후계자 지정":   return ["target"];
    case "검거":   return ["target"];
    case "저격":   return ["target"];
    case "복수귀":   return ["target"];
    case "리더쉽":   return ["role"];
    case "지원":   return ["target"];
    case "공문":   return ["contents"];
    default:            return []; // 인자 없음
  }
}

// 결과 메시지 방출 (private/public 분리)
// - privateMsg: 에페메럴 reply/followUp
// - publicMsg: 채널 공개 메시지
async function emitSkillResult(interaction, res) {
  if (!res || !res.ok) {
    const msg = res?.error ?? "⚠️ 스킬 처리 중 오류가 발생했습니다.";
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp({ content: msg, ephemeral: true });
    }
    return interaction.reply({ content: msg, ephemeral: true });
  }

  // 개인 에페메럴
  if (res.privateMsg) {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: res.privateMsg, ephemeral: true });
    } else {
      await interaction.reply({ content: res.privateMsg, ephemeral: true });
    }
  } else {
    // 그래도 최소 한 번은 응답해야 함
    if (!interaction.replied && !interaction.deferred) {

      await interaction.reply({ content: "✅ 처리되었습니다.", ephemeral: true });
    }
  }

  // 공개 방송
  if (res.publicMsg) {
    await interaction.channel.send(res.publicMsg);
  }


  // 🔚 게임 종료 자동 요약/정리
  try {
    const vc = interaction.member?.voice?.channel;
    const s = getSessionByChannel(vc?.id);
    if (!vc || !s) return;

   const v = checkVictory(vc.id); // 세션 플래그 확인
    if (v.ended && !s._summarized) {
      s._summarized = true; // 중복 방지
      await stopAndSummarize(vc.id, interaction.client, s.reason ?? "게임 종료");
      // stopAndSummarize 내부에서 요약 임베드+endSession까지 처리
    }
  } catch (e) {
    console.error("Auto-stop summarize failed:", e);
  }
}

// myFaction 계산 안전 보정:
// - 기본적으로는 "내 실제 직업"의 진영을 보되,
// - 본인이 공표한 직업이 있을 땐 그걸로 진영을 잡고 싶다면 (룰에 따라 선택) 아래 로직을 사용.
//   현재는 실제 직업 우선, 공표값이 있으면 보정해서 사용.
import { getFaction } from "../util/faction.js";
function getFactionSafe(primaryRole, fallbackRole) {
  try {
    return getFaction(primaryRole);
  } catch {
    return getFaction(fallbackRole);
  }
}

