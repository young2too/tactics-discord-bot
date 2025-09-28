// src/commands/skill.js
import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { getSessionByChannel, getLimit } from "../services/sessionService.js";
import { getSkillsForPlayer,getSkillMeta } from "../util/skillMeta.js";

export const data = new SlashCommandBuilder()
  .setName("skill")
  .setNameLocalizations({
    ko: "스킬",    // 한국어 클라이언트에서 보이는 이름
  })
  .setDescription("스킬을 사용합니다.");

export async function execute(interaction) {
  const vc = interaction.member.voice?.channel;
  if (!vc) {
    return interaction.reply({ content: "❌ 음성 채널에 들어와야 합니다.", ephemeral: true });
  }

  const s = getSessionByChannel(vc.id);
  if (!s) {
    return interaction.reply({ content: "❌ 게임이 시작되지 않았습니다.", ephemeral: true });
  }

  const uid = interaction.user.id;

  const raw = getSkillsForPlayer(vc.id, uid); // roleSkills.json 기반
  // 사용 가능한 스킬만 노출 (테스트 모드에서는 limit 무시)
  const usable = raw.filter(sk => {
    const meta = getSkillMeta(s.roles.get(uid), sk.name);
    if (typeof meta.limit === "number") {
      const left = getLimit(vc.id, uid, sk.name);
      if (left <= 0) return false;
    }
    return true;
  });

  if (!usable.length) {
    return interaction.reply({ content: "❌ 사용할 수 있는 스킬이 없습니다.", ephemeral: true });
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId("skill_select")
    .setPlaceholder("사용할 스킬을 선택하세요")
    .addOptions(
      usable.map(sk => ({
        label: sk.name,
        value: sk.name,
        description: sk.desc?.slice(0, 90) ?? undefined,
      }))
    );

  const row = new ActionRowBuilder().addComponents(menu);

  // ✅ 반드시 reply로 응답해야 함
  return interaction.reply({
    content: "사용할 스킬을 선택하세요.",
    components: [row],
    ephemeral: true,
  });
}
