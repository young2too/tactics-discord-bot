// src/util/board.js
import { EmbedBuilder } from "discord.js";
import { listPlayers, isAlive } from "../services/sessionService.js";
import { formatRoleWithFaction } from "./faction.js";

export function makeBoardEmbed(vcId, s) {
  const lines = [];
  for (const pid of listPlayers(vcId)) {
    const r = s.revealed.get(pid);
    const alive = isAlive(vcId, pid) ? "🟢 생존" : "⚰️ 사망";
    const roleText = r ? formatRoleWithFaction(r.role) : "미공표";

    let line = `<@${pid}> → 공표: ${roleText} | 상태: ${alive}`;
    
    // ✅ 테스트 모드일 때만 실제 직업 노출
    if (s.testMode) {
      const actual = s.roles.get(pid);
      line += ` | 직업(디버그용): ${actual}`;
    }

    lines.push(line);
  }

  return new EmbedBuilder()
    .setTitle("🧾 현황판")
    .setDescription(lines.join("\n"))
    .setColor("Blue");
}

