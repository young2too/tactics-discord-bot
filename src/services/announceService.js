// src/services/announceService.js
import { getSessionByChannel, getCooldown, setCooldown, addMana } from "./sessionService.js";

// 공표 쿨타임: 90초
const ANNOUNCE_COOLDOWN = 90_000;

export function useAnnounce(vcId, uid, job) {
  const s = getSessionByChannel(vcId);
  if (!s) return { ok: false, error: "게임 세션이 없습니다." };

  // 쿨타임 공유 키: "announce" (다른 공표 경로와 공유)
  const until = getCooldown(vcId, uid, "announce");
  if (Date.now() < until) {
    const remain = Math.ceil((until - Date.now()) / 1000);
    return { ok: false, error: `⏳ 공표 쿨타임: ${remain}초 남음` };
  }

  // 진명 여부 판정
  const actual = s.roles.get(uid);
  const isTrue = job === actual;

  // 최근 공표 기록
  s.revealed.set(uid, { role: job, ts: Date.now(), isTrue });

  // 🔧 여기! setCooldown에 "지속시간"만 넘깁니다.
  setCooldown(vcId, uid, "announce", ANNOUNCE_COOLDOWN);

  // 마나 보상(내부만 처리, 공개 메시지엔 표시 X)
  const gain = isTrue ? 10 : 5;
  addMana(vcId, uid, gain);

  // 공개 메시지엔 마나/진명 정보를 절대 노출하지 않음
  return {
    ok: true,
    message: `📢 <@${uid}> 님이 **${job}** 을(를) 공표했습니다.`
  };
}
