import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { startSession, setRole, setLoverPair  } from "../services/sessionService.js";
import { startManaRegen } from "../services/gameService.js";
import roles from "../data/roles.json" with { type: "json" };

export const data = new SlashCommandBuilder()
  .setName("start")
  .setDescription("게임을 시작합니다 (디버그 옵션 포함)")
  .setNameLocalizations({
    ko: "시작",    // 한국어 클라이언트에서 보이는 이름
  })
  .addIntegerOption(o =>
    o.setName("size").setDescription("플레이어 수 (테스트용)").setMinValue(8).setMaxValue(13)
  )
  .addStringOption(opt =>
    opt.setName("role")
      .setDescription("테스트용: 본인 직업 강제 지정 (예: 마피아대부)")
  );

export async function execute(interaction) {
  const vc = interaction.member.voice.channel;
  if (!vc) return interaction.reply({ content: "❌ 음성 채널에 들어와야 합니다.", ephemeral: true });

  const size = interaction.options.getInteger("size") ?? vc.members.size;
  if (size < 8) return interaction.reply({ content: "❌ 최소 8인 필요", ephemeral: true });

  const forceRole = interaction.options.getString("role")?.trim();
  const playerIds = Array.from(vc.members.filter(m => !m.user.bot).keys());
  const isTestMode = playerIds.length < size; // mock 충원 시 테스트모드
  while (playerIds.length < size) {
    playerIds.push(`mock${playerIds.length + 1}`); // 디버그용 mock
  }

  const s = startSession(vc.id, interaction.user.id, playerIds, {}, isTestMode);
  s.textChannelId = interaction.channelId; // ✅ 종료 방송 보낼 채널 기억

  // 포메이션 확보
  const formation = roles.formations[String(size)];
  if (!formation) {
    return interaction.reply({ content: `⚠️ ${size}인 포메이션이 없습니다.`, ephemeral: true });
  }

  // ===== 배정 로직 =====
  if (forceRole) {
    // 1) 요청한 직업이 이 인원수 포메이션에 존재하는지 확인
    const idx = formation.indexOf(forceRole);
    if (idx === -1) {
      return interaction.reply({
        content: `❌ ${size}인 포메이션에는 **${forceRole}** 직업이 없습니다.`,
        ephemeral: true
      });
    }

    // 2) 본인에게 강제 배정
    setRole(vc.id, interaction.user.id, forceRole);

    // 3) 남은 직업 풀 구성(요청 직업 1개 제거)
    const remainingRoles = [...formation];
    remainingRoles.splice(idx, 1);

    // 4) 나머지 플레이어에게 랜덤 배정
    const others = playerIds.filter(pid => pid !== interaction.user.id);
    shuffleInPlace(others);
    shuffleInPlace(remainingRoles);
    for (let i = 0; i < others.length; i++) {
      setRole(vc.id, others[i], remainingRoles[i]);
    }
  } else {
    // 완전 랜덤 배정
    const shuffledPlayers = [...playerIds];
    const shuffledRoles = [...formation];
    shuffleInPlace(shuffledPlayers);
    shuffleInPlace(shuffledRoles);
    for (let i = 0; i < size; i++) {
      setRole(vc.id, shuffledPlayers[i], shuffledRoles[i]);
    }
  }

  // 마나 재생 시작 
  startManaRegen(vc.id, interaction.client);

  // 테스트 모드면 자동 공표(진명/가명 랜덤) 세팅
  if (isTestMode) {
    for (const pid of playerIds) {
      const actual = s.roles.get(pid);
      const announceTrue = Math.random() < 0.5;
      const announced = announceTrue
        ? actual
        : formation[Math.floor(Math.random() * formation.length)];
      s.revealed.set(pid, {
        role: announced,
        ts: Date.now(),
        isTrue: announceTrue
      });
    }
  }

  // UI 버튼
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("status_self")
      .setLabel("내 상태 보기")
      .setStyle(ButtonStyle.Primary)
  );

  const maleLover = findByRole(s, "남자연인");
  const femaleLover = findByRole(s, "여자연인");
  if (maleLover && femaleLover) {
    setLoverPair(vc.id, maleLover, femaleLover);
  }

  const testBadge = isTestMode ? " *(테스트 모드)*" : "";
  const forcedBadge = forceRole ? `\n🧪 본인 직업 강제: **${forceRole}**` : "";
  return interaction.reply({
    content: `🎮 ${size}인 게임 시작!${testBadge}${forcedBadge}\n아래 버튼으로 언제든 자신의 상태를 확인하세요.`,
    components: [row]
  });
}

// --- 유틸: 제자리 셔플 ---
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function findByRole(s, roleName) {
  for (const [pid, role] of s.roles.entries()) {
    if (role === roleName) return pid;
  }
  return null;
}