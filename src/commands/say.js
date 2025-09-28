// src/commands/gongmun.js
import { SlashCommandBuilder } from "discord.js";
import { getSessionByChannel, isAlive } from "../services/sessionService.js";
import { useSkill } from "../services/skillService.js";
import { getSkillsForPlayer } from "../util/skillMeta.js";

export const data = new SlashCommandBuilder()
  .setName("say")
  .setNameLocalizations({
    ko: "공문",    // 한국어 클라이언트에서 보이는 이름 
  })
  .setDescription("공문 스킬로 안내 메시지를 전송합니다.")
  .addStringOption(o =>
    o.setName("text")
      .setDescription("보낼 내용 (최대 200자)")
      .setRequired(true)
      .setMaxLength(200)
  );

export async function execute(interaction) {
  const vc = interaction.member?.voice?.channel;
  const s = getSessionByChannel(vc?.id);

  if (!vc || !s) {
    return interaction.reply({ content: "⚠️ 게임이 시작되지 않았습니다.", ephemeral: true });
  }

  const uid = interaction.user.id;
  // 보유 스킬 확인 (테스트모드에서도 체크는 해두자)
  const mySkills = getSkillsForPlayer(vc.id, uid);
  const hasGongmun = mySkills.some(sk => sk.name === "공문");
  if (!hasGongmun) {
    return interaction.reply({ content: "❌ 공문 스킬을 보유하고 있지 않습니다.", ephemeral: true });
  }

  if (!isAlive(vc.id,uid)) {
    return interaction.reply({ content: "⚰️ 사망자는 행동할 수 없습니다.", ephemeral: true });
  }



  const textRaw = interaction.options.getString("text", true).trim();
  if (!textRaw) {
    return interaction.reply({ content: "❌ 보낼 내용이 비어있습니다.", ephemeral: true });
  }
  const text = textRaw.slice(0, 200);

  // 스킬 사용 (마나/쿨타임/제한은 useSkill에서 처리)
  const res = useSkill(vc.id, uid, "공문", { contents: text } , interaction.client);

  if (!res?.ok) {
    return interaction.reply({ content: res?.error ?? "⚠️ 공문 처리 중 오류가 발생했습니다.", ephemeral: true });
  }

  // 에페메럴 개인 확인
  await interaction.reply({
    content: res.privateMsg ?? "📜 공문 발송 완료.",
    ephemeral: true
  });

  // 공개 방송 (멘션 오남용 방지: allowedMentions 비활성화)
  if (res.publicMsg) {
    await interaction.channel.send({
      content: res.publicMsg,
      allowedMentions: { parse: [] } // @everyone/@here 무시
    });
  }
}
