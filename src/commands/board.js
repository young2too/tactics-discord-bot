import { SlashCommandBuilder } from "discord.js";
import { getSessionByChannel } from "../services/sessionService.js";
import { makeBoardEmbed } from "../util/boardStatus.js";

export const data = new SlashCommandBuilder()
  .setName("board")
  .setDescription("현재 공표 현황을 표시합니다")
  .setNameLocalizations({
    ko: "현황판",    // 한국어 클라이언트에서 보이는 이름
  });

export async function execute(interaction) {
  const vc = interaction.member.voice.channel;
  const s = getSessionByChannel(vc?.id);
  if (!s) {
    return interaction.reply({ content: "게임이 시작되지 않았습니다.", ephemeral: true });
  }

  const embed = makeBoardEmbed(vc.id, s);
  return interaction.reply({ embeds: [embed] });
}
