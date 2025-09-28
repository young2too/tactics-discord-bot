// commands/stop.js
import { SlashCommandBuilder } from "discord.js";
import { stopAndSummarize } from "../services/gameService.js";

export const data = new SlashCommandBuilder()
  .setName("stop")
  .setNameLocalizations({
    ko: "종료",    // 한국어 클라이언트에서 보이는 이름
  })
  .setDescription("현재 게임 세션을 종료합니다.");

export async function execute(interaction) {
  const vc = interaction.member.voice.channel;
  if (!vc) {
    return interaction.reply({ content: "❌ 음성 채널에 접속한 상태여야 합니다.", ephemeral: true });
  }
  await stopAndSummarize(vc.id, interaction.client, interaction.user.id);
  return interaction.reply({ content: "🛑 게임 종료 처리 완료!", ephemeral: true });
}
