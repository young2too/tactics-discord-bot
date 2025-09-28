 import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
 import { getSessionByChannel, getMana, isAlive, getCooldown, getLimit, getPartner } from "../services/sessionService.js";
 import roleData from "../data/roleSkills.json" with { type: "json" };
import { getSkillMeta } from "../util/skillMeta.js";
 import { formatRoleWithFaction } from "../util/faction.js";

 export const data = new SlashCommandBuilder()
   .setName("mana")
   .setNameLocalizations({
    ko: "마나",    // 한국어 클라이언트에서 보이는 이름
  })
   .setDescription("내 직업 / 상태 / 마나 / 스킬 정보를 확인합니다.");

 export async function execute(interaction) {
   const vc = interaction.member.voice.channel;
   const s = getSessionByChannel(vc?.id);
   if (!s) return interaction.reply({ content: "게임이 시작되지 않았습니다.", ephemeral: true });

   const uid = interaction.user.id;
   const mana = getMana(vc.id, uid);
   const alive = isAlive(vc.id, uid) ? "🟢 생존" : "⚰️ 사망";
   const role = s.roles.get(uid) ?? "???";

  // 세션 저장된 카운터(하급공격 실패 누적 등)
  const counters = s.counters?.get(uid) ?? {};
  const lowAttackMiss = counters.lowAttackMiss ?? 0;

   const skills = roleData[role] ?? [];

  const skillLines = skills.map(sk => {
    const meta = getSkillMeta(role, sk.name) || {};
    const cost = meta.cost ?? sk.cost ?? 0;
    const cdMs = meta.cooldownMs ?? null;                 // game.json: cooldownSec * 1000
    const limitFromMeta = meta.limit ?? null;             // 초기 제한(있다면)
    const cdKey = `skill_${sk.name}`;
    const cdLeftMs = Math.max(0, (getCooldown(vc.id, uid, cdKey) || 0) - Date.now());
    const cdLeftSec = Math.ceil(cdLeftMs / 1000);
    const limitLeft = getLimit(vc.id, uid, sk.name);      // 세션에 기록된 잔여(없으면 null)

    const pieces = [
      `**${sk.name}** (마나 ${cost})`,
      sk.desc ? `→ ${sk.desc}` : null,
      cdMs != null ? `⏳쿨 ${Math.floor(cdMs/1000)}s` : null,
      cdLeftMs > 0 ? `(남은 ${cdLeftSec}s)` : null,
      (limitFromMeta != null || limitLeft != null)
        ? `• 잔여: ${limitLeft != null ? limitLeft : limitFromMeta}`
        : null,
      sk.name === "하급 공격" ? `• 실패 누적 ${lowAttackMiss}/2` : null,
    ].filter(Boolean);

    return pieces.join(" ");
  });

   const embed = new EmbedBuilder()
     .setTitle(`🔮 ${interaction.user.username}의 상태`)
     .addFields(
       { name: "직업", value: formatRoleWithFaction(role), inline: true },
       { name: "상태", value: alive, inline: true },
       { name: "마나", value: `${mana}/200${s.testMode ? "  *(테스트 모드)*" : ""}`, inline: true },
       { name: "보유 스킬", value: skillLines.length > 0 ? skillLines.join("\n") : "스킬 없음" }
     )
     .setColor("Blue");


     // 🔶 연인 패시브 표시: 서로의 정체를 알고 시작
  if (role === "남자연인" || role === "여자연인") {
    const partnerId = getPartner(vc.id, uid);
    if (partnerId) {
      const pRole = s.roles.get(partnerId) ?? "???";
      const pAlive = isAlive(vc.id, partnerId) ? "🟢 생존" : "⚰️ 사망";
      embed.addFields({
        name: "특수 정보",
        value: `연인: <@${partnerId}> — ${formatRoleWithFaction(pRole)} | ${pAlive}`,
      });
    } else {
      embed.addFields({ name: "특수 정보", value: "연인: (없음)" });
    }
  }

   return interaction.reply({ embeds: [embed], ephemeral: true });
 }
