// src/commands/announce.js
import { SlashCommandBuilder } from "discord.js";
import { useAnnounce } from "../services/announceService.js";
import { getSessionByChannel } from "../services/sessionService.js";

export const data = new SlashCommandBuilder()
  .setName("announce")
  .setDescription("직업을 공표합니다.")
  .setNameLocalizations({
    ko: "공표",    // 한국어 클라이언트에서 보이는 이름
  })
  .addStringOption(o =>
    o.setName("job").setDescription("공표할 직업").setRequired(true).setAutocomplete(true)
  );

export async function execute(interaction) {
  const vc = interaction.member.voice.channel;
  if (!vc) return interaction.reply({ content: "❌ 음성 채널에 들어와야 합니다.", ephemeral: true });

  const uid = interaction.user.id;
  const job = interaction.options.getString("job", true);

  const result = useAnnounce(vc.id, uid, job);
  if (!result.ok) {
    return interaction.reply({ content: result.error, ephemeral: true });
  }
  return interaction.reply({ content: result.message });
}

export async function autocomplete(interaction) {
  const vc = interaction.member.voice.channel;
  const s = getSessionByChannel(vc?.id);

  if (!s) return interaction.respond([]);

  // 현재 세션에 배정된 직업만 choices로 보여주기
  const roles = Array.from(s.roles.values());
  const focused = interaction.options.getFocused().toLowerCase();

  const filtered = roles.filter(r => r.toLowerCase().includes(focused));
  await interaction.respond(
    filtered.map(r => ({ name: r, value: r }))
  );
}
