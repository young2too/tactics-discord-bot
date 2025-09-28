import { getSessionByChannel, addMana,isAlive ,endSession,listPlayers } from "./sessionService.js";
import { teamOfRole,isAttackerRole,isEnemyFaction,isAnyAliveWithRole,
  isSameFaction,  isLeaderRole, getRoleSkillsFromGame, findTeamKeyByRole
 } from "../util/skillMeta.js";
import game from "../data/game.json" with { type: "json" };
import { EmbedBuilder } from "discord.js";
const MANA_TICK = 20;
const MANA_INTERVAL = 3 * 60 * 1000; // 5분

export function startManaRegen(vcId, client) {
  const s = getSessionByChannel(vcId);
  if (!s) return;

  if (s._manaInterval) clearInterval(s._manaInterval);

  s._manaInterval = setInterval(async () => {
    // 세션이 이미 끝났으면 인터벌 종료
    const cur = getSessionByChannel(vcId);
    if (!cur) {
      clearInterval(s._manaInterval);
      return;
    }

    for (const uid of cur.players) {
      addMana(vcId, uid, MANA_TICK);
    }
    console.log(`[마나틱] ${vcId}: 모든 플레이어 +${MANA_TICK}`);

    // ✅ 퍼블릭 알림
    try {
      if (cur.textChannelId && client) {
        const ch = await client.channels.fetch(cur.textChannelId).catch(() => null);
        if (ch?.isTextBased?.()) {
          await ch.send(`🔄 마나 보급! 모든 플레이어 +${MANA_TICK} 회복`);
        }
      }
    } catch (err) {
      console.error("ManaTick 방송 실패:", err);
    }
  }, MANA_INTERVAL);
}

/**
 * 승패 판정 (공통 호출):
 * - 마피아 대부 사망 → 후계자 살아있으면 속행, 아니면 시민 승리
 * - 경찰반장 사망 → 마피아 승리
 * - **공격권자 전멸** 판정 (팀별 공격권자 alive 수가 0이면 상대 승)
 * 반환값:
 *  - { ended: false }  // 계속 진행
 *  - { ended: true, publicMsg }  // 종료, 방송 메시지 포함
 */
// ✅ 굳이 client 받지 않게(전송은 밖에서)
export function checkVictory(vcId) {
  const s = getSessionByChannel(vcId);
  if (!s) return { ended: false };
  if (s.gameOver) {
    return {
      ended: true,
      publicMsg: s.publicMsg ?? `🏁 게임 종료! **${labelOf(s.winner)} 승리** (사유: ${s.reason ?? "종료"})`,
    };
  }

  const entries = [...s.roles.entries()];
  const aliveEntries = entries.filter(([pid]) => isAlive(vcId, pid));

  const mafiaBoss = entries.find(([, role]) => role === "마피아대부");
  const citizenLeader = entries.find(([, role]) => role === "경찰반장");
  const mafiaBossAlive = mafiaBoss ? isAlive(vcId, mafiaBoss[0]) : false;
  const citizenLeaderAlive = citizenLeader ? isAlive(vcId, citizenLeader[0]) : false;

  if (citizenLeader && !citizenLeaderAlive) {
    return endGameState(vcId, "mafia", "경찰반장 사망");
  }

  if (mafiaBoss && !mafiaBossAlive) {
    const succAlive = s.successor && isAlive(vcId, s.successor);
    if (!succAlive) {
      return endGameState(vcId, "citizen", "마피아 대부 사망(후계자 없음/사망)");
    }
  }

  const mafiaAttackersAlive = aliveEntries
    .filter(([, role]) => teamOfRole(role) === "mafia" && isAttackerRole(role)).length;
  const citizenAttackersAlive = aliveEntries
    .filter(([, role]) => teamOfRole(role) === "citizen" && isAttackerRole(role)).length;

  if (mafiaAttackersAlive === 0) {
    return endGameState(vcId, "citizen", "마피아 공격권자 전멸");
  }
  if (citizenAttackersAlive === 0) {
    return endGameState(vcId, "mafia", "시민 공격권자 전멸");
  }

  return { ended: false };
}

// ✅ 여기서 '전송'하지 말고, 메시지 만들어 세션에 저장 + 반환만
export function endGameState(vcId, winner, reason) {
  const s = getSessionByChannel(vcId);
  if (!s) return { ended: false };

  s.gameOver = true;
  s.winner = winner;
  s.reason = reason;
  s.endedAt = Date.now();

  const publicMsg = `🏁 게임 종료! **${labelOf(winner)} 승리** (사유: ${reason})`;
  s.publicMsg = publicMsg;


  return { ended: true, publicMsg };
}



export async function stopAndSummarize(vcId, client, invokerId = null) {
  const s = getSessionByChannel(vcId);
  if (!s) return;

  const lines = [];
  for (const pid of listPlayers(vcId)) {
    const role = s.roles.get(pid) ?? "???";
    const revealed = s.revealed.get(pid)?.role ?? "미공표";
    const mana = s.mana.get(pid) ?? 0;
    const alive = isAlive(vcId, pid) ? "🟢 생존" : "⚰️ 사망";

    // ✅ 종료시 직업 전체 공개
    lines.push(
      `<@${pid}> → 직업: **${role}** | 공표: ${revealed} | 마나: ${mana}/200 | 상태: ${alive}`
    );
  }

  const embed = new EmbedBuilder()
    .setTitle("📋 게임 최종 요약")
    .setDescription(lines.join("\n"))
    .addFields(
      s.gameOver
        ? [
            { name: "승리 팀", value: labelOf(s.winner), inline: true },
            { name: "종료 사유", value: s.reason ?? "알 수 없음", inline: true },
          ]
        : []
    )
    .setColor("Red")
    .setTimestamp(new Date());

  const channel = client?.channels?.cache?.get(s.textChannelId); // ✅ 안전접근
  if (channel) {
    await channel.send({
      content: s.gameOver
        ? `🏁 **${labelOf(s.winner)} 승리!** (사유: ${s.reason})`
        : `🛑 게임이 강제로 종료되었습니다.`,
      embeds: [embed],
    });
  }

  endSession(vcId);
}

function labelOf(key) {
  return key === "mafia" ? "마피아 팀" : "시민 팀";
}