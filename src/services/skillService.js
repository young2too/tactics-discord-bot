// src/services/skillService.js
import game from "../data/game.json" with { type: "json" };
import {
  getMana, addMana, getCooldown, setCooldown, getSessionByChannel,
  setAlive, isAlive, getLimit, addLimit, incCounter, getCounter
} from "./sessionService.js";
import { getFaction, isCitizenFaction } from "../util/faction.js";
import roleSkills from "../data/roleSkills.json" with { type: "json" };
import { checkVictory, endGameState } from "./gameService.js";
import { getSkillMeta, isEnemyFaction, isSameFaction, isAnyAliveWithRole, normalizeSkill,
   teamOfRole, isLeaderRole, isAttackerRole } from "../util/skillMeta.js";

export function useSkill(vcId, uid, skillName, args = {},client) {
  const s = getSessionByChannel(vcId);
  if (!s) return { ok: false, error: "게임이 시작되지 않았습니다." };

  const myRole = s.roles.get(uid);
  if (!myRole) return { ok: false, error: "직업이 배정되지 않았습니다." };
  if (!isAlive(vcId, uid)) {
    return { ok: false, error: "⚰️ 사망자는 행동할 수 없습니다." };
  }
  const mySkills = roleSkills[myRole] || [];
  const skill = mySkills.find(sk => sk.name === skillName);
  if (!skill) return { ok: false, error: "해당 스킬을 보유하지 않았습니다." };

   // 🔹 메타데이터 로드 (game.json 우선)
  const meta = getSkillMeta(myRole, skillName);
  const cost = meta.cost ?? skill.cost ?? 0;                 // game.json > roleSkills 순
  const cdMs = meta.cooldownMs ?? 10000;                     // 기본 10초 같은 디폴트
  const cdKey = `skill_${skillName}`;

  // 쿨타임 체크
  const nextUse = getCooldown(vcId, uid, cdKey);
  if (Date.now() < nextUse) {
    const remain = Math.ceil((nextUse - Date.now()) / 1000);
    return { ok: false, error: `⏳ ${skillName} 쿨타임: ${remain}s 남음` };
  }

  // 마나 체크
  if (!s.testMode) {
   const curMana = getMana(vcId, uid);
   if (curMana < cost) {
     return { ok: false, error: `마나 부족! (필요 ${cost}, 현재 ${curMana})` };
   }
  }

  let result = null;

  switch (skillName) {
    //공표스킬
    case "공표": {
      const announced = args.role;
      const actual = myRole;
      const isTrue = (announced === actual);

      const bonus = isTrue ? 10 : 5;
      const cur = addMana(vcId, uid, bonus);

      s.revealed.set(uid, { role: announced, ts: Date.now(), isTrue });

      result = {
        privateMsg: `📢 공표 처리됨: ${isTrue ? "진명" : "가명"} (+${bonus})`,
        publicMsg:  `📢 <@${uid}> 님이 **${announced}** 을(를) 공표했습니다.`,
      };
      break;
    }
    //확인류
    case "아군 확인": {
      const target = args.target;
      const targetRole = s.roles.get(target);
      const targetAnnounced = s.revealed.get(target);

      if (!targetAnnounced) {
        return { ok: false, error: "대상이 아직 직업을 공표하지 않았습니다." };
      }

      // 같은 진영만 확인 가능
      if (getFaction(myRole) !== getFaction(targetAnnounced.role)) {
        return { ok: false, error: "아군 직업을 공표한 대상만 확인할 수 있습니다."+`myRole: ${myRole} targetAnnounced.role:${targetAnnounced.role}` };
      }

      // 스파이 기만 처리
      const fooled =
        targetRole === "스파이" &&
        isCitizenFaction(targetAnnounced.role) &&
        getFaction(myRole) === "citizen";

      const verdict = fooled ? true : (targetAnnounced.role === targetRole);

      result = {
        publicMsg : `🔍누군가가 <@${target}>을 살피고 있습니다.`,
        privateMsg: verdict
          ? `🔎 <@${target}> 의 공표는 **진명**입니다`
          : `🔎 <@${target}> 의 공표는 **가명**입니다`,
      };
      break;
    }

    case "적군 확인": {
      const target = args.target;
      const targetRole = s.roles.get(target);
      const targetAnnounced = s.revealed.get(target);

      if (!targetAnnounced) {
        return { ok: false, error: "대상이 아직 직업을 공표하지 않았습니다." };
      }

      // ❌ 아군 불가 → 적군만 확인 가능
      if (getFaction(myRole) === getFaction(targetAnnounced.role)) {
        return { ok: false, error: "적군 직업을 공표한 대상만 확인할 수 있습니다."+`myRole: ${myRole} targetAnnounced.role:${targetAnnounced.role}`};
      }

      const isTrue = (targetAnnounced.role === targetRole);

      result = {
        publicMsg : `🕵️ 누군가가 <@${target}>을 살피고 있습니다.`,
        privateMsg: isTrue
          ? `🕵️ <@${target}> 의 공표는 **진명**입니다`
          : `🕵️ <@${target}> 의 공표는 **가명**입니다`,
      };
      break;
    }


    // ───────────────── 스캔류 ─────────────────
    case "아군 스캔":
    case "적군 스캔": {
      const { target, role: guessedRole } = args;
      const targetRole = s.roles.get(target);
      if (!target || !guessedRole) return { ok: false, error: "대상/직업이 누락되었습니다." };

      // (UI에서 이미 필터했지만 서버에서도 한번 더 검증)
      const guessedFactionSame = isSameFaction(myRole, guessedRole);
      if (skillName === "아군 스캔" && !guessedFactionSame)
        return { ok: false, error: "예상 직업은 아군 진영이어야 합니다." };
      if (skillName === "적군 스캔" && guessedFactionSame)
        return { ok: false, error: "예상 직업은 적군 진영이어야 합니다." };

      const hit = (guessedRole === targetRole);
      result = {
        publicMsg : `🔍누군가가 <@${target}>을 살피고 있습니다.`,
        privateMsg: hit
          ? `🔍 스캔 성공! <@${target}> 은(는) **${targetRole}** 이 맞습니다.`
          : `🔍 스캔 실패. <@${target}> 은(는) **${guessedRole}** 이 아닙니다.`,
      };
      break;
    }

    // ───────────────── 공격류 ─────────────────
    case "상급 공격": {
      const { target, role: guessedRole } = args;
      const targetRole = s.roles.get(target);
      if (!target || !guessedRole) return { ok: false, error: "대상/직업이 누락되었습니다." };

      // (UI에서 이미 적군 직업만 뜨지만 서버 검증)
      if (!isEnemyFaction(myRole, guessedRole))
        return { ok: false, error: "대상 직업 선택은 적군 직업만 가능합니다." };

      // 🔰 보호 로직: 순찰 경찰 생존 시, 경찰반장 대상의 일반 공격은 실패 처리
      const shielded =
        targetRole === "경찰반장" &&
        isAnyAliveWithRole(s, vcId, "순찰경찰"); // 하나라도 살아있으면 보호

      let hit = (guessedRole === targetRole) && !shielded;


      if (hit) {
        // ✅ 생존 상태를 false로 설정 → 사망 처리
        setAlive(vcId, target, false);
      }
      const v = checkVictory(vcId);
      result = {
        privateMsg: hit
          ? `🎯 공격 명중! <@${target}> (**${targetRole}**) 타격 성공`
          : `💨 공격 빗나감… <@${target}> 은(는) **${guessedRole}** 이 아닙니다.`,
        // publicMsg 없음(요구: 에페메럴)
        publicMsg : hit
          ? `🎯 ${myRole}이 (**${targetRole}**)을 죽였습니다`+ (v.ended ? `\n\n${v.publicMsg}` : "")
          //: `💨 ${myRole}이 (**${target}**)을 공격했으나 실패했습니다.`, //공격실패시 공격받은 대상의 닉네임을 까는 코드
          : `💨 ${myRole}이 누군가를 (**${guessedRole}**)로 공격했으나 실패했습니다.`, //공격시도한 직업을 까는 코드. 공무원의 전쳇을 통해 니가친거나다! 이게 좋을것 같긴 함
          //: `💨 ${myRole}이 공격했으나 실패했습니다.`,//공격실패만 알려주는 코드
      };
      
      break;
    } 
    case "하급 공격": {
       const { target, role: guessedRole } = args;
       const targetRole = s.roles.get(target);
        if (!target || !guessedRole) return { ok: false, error: "대상/직업이 누락되었습니다." };

        // (UI에서 이미 적군 직업만 뜨지만 서버 검증)
        if (!isEnemyFaction(myRole, guessedRole))
          return { ok: false, error: "대상 직업 선택은 적군 직업만 가능합니다." };

        // 🔰 보호 로직: 순찰 경찰 생존 시, 경찰반장 대상의 일반 공격은 실패 처리
         const shielded =
          targetRole === "경찰반장" &&
          isAnyAliveWithRole(s, vcId, "순찰경찰");
        const hit = (guessedRole === targetRole) && !shielded;

        if (hit) {
          setAlive(vcId, target, false);
          const v = checkVictory(vcId);
          result = {
            privateMsg: `🎯 하급 공격 명중! <@${target}> (**${targetRole}**) 를 죽였습니다`,
            publicMsg:  `🎯 ${myRole}이(가) ${targetRole}을(를) 죽였습니다. `+ (v.ended ? `\n\n${v.publicMsg}` : ""),
          };
        } else {
          // 실패 누적 +1
          const failCount = incCounter(vcId, uid, "lowAttackMiss", 1);

          if (failCount >= 2) {
            // 2회 누적 실패 → 공격자 즉사
            setAlive(vcId, uid, false);
            const v = checkVictory(vcId);
            result = {
              privateMsg: `☠️ 하급 공격 2회 누적 실패! 당신은 사망했습니다.`,
              publicMsg:  `☠️ ${myRole}이(가) 하급 공격을 ${failCount}회 실패하여 사망했습니다.`+(v.ended ? `\n\n${v.publicMsg}` : ""),
            };
          } else {
            result = {
              privateMsg: `💨 하급 공격 빗나감… (누적 실패 ${failCount}/2)`,
              publicMsg:  `💨 ${myRole}이(가) 누군가를 (**${guessedRole}**)로 공격했으나 실패했습니다.`,
            };
          }
        }
      break;
  }

    // ───────────────── 대상만 찍는 스킬 ─────────────────
    case "보스 확인": {
      const { target } = args;
      const targetRole = s.roles.get(target);
      if (!target) return { ok: false, error: "대상이 필요합니다." };

      const isBoss = targetRole === "마피아대부";
      result = {
        privateMsg: isBoss
          ? `👑 <@${target}> 은(는) 마피아 대부입니다!`
          : `❌ <@${target}> 은(는) 대부가 아닙니다.`,
      };
      break;
    }

    case "탐정 확인": {
      const { target } = args;
      const targetRole = s.roles.get(target);
      if (!target) return { ok: false, error: "대상이 필요합니다." };

      const isBoss = targetRole === "사립탐정";
      result = {
        privateMsg: isBoss
          ? `👑 <@${target}> 은(는) 사립탐정 입니다!`
          : `❌ <@${target}> 은(는) 사립탐정이 아닙니다.`,
      };
      break;
    }

    case "후계자 지정": {
      const { target } = args;
      const targetRole = s.roles.get(target);
      if (!target) return { ok: false, error: "후계자로 지목할 대상을 선택하세요." };

      // limit 체크
      const left = getLimit(vcId, uid, "후계자 지정");
      if (!s.testMode && left <= 0) {
        return { ok: false, error: "후계자 지정은 1회만 가능합니다." };
      }

      addLimit(vcId, uid, "후계자 지정", -1);

      if (targetRole === "마피아후계자") {
        // ✅ 올바른 후계자
        s.successor = target;
        result = {
          privateMsg: `✅ 후계자 지정 성공! <@${target}> 이(가) 마피아 후계자로 등록되었습니다.`,
          publicMsg:  `📢 마피아 대부가 후계자를 지정했습니다.`,
        };
      } else {
        // ❌ 잘못 지정 → 스킬만 날아감, 게임은 계속
        result = {
          privateMsg: `❌ 후계자 지정 실패! <@${target}> 은(는) 마피아 후계자가 아니었습니다. (스킬 소모됨)`,
          publicMsg:  `⚠️ 마피아 대부의 후계자 지정이 실패했습니다.`,
        };
      }
      break;
    }



    case "검거": {
      const { target } = args;
      const targetRole = s.roles.get(target);
      if (!target) return { ok: false, error: "검거할 대상을 선택하세요." };

      const left = getLimit(vcId, uid, "검거");
      if (left <= 0) {
        return { ok: false, error: "검거는 1회만 사용할 수 있습니다." };
      }
      addLimit(vcId, uid, "검거", -1);

      if (targetRole === "마피아대부") {
        // 대부 검거 성공
        setAlive(vcId, target, false);
        const succAlive = s.successor && isAlive(vcId, s.successor); //후계자가 지정되어 있으며, 후계자가 살아있다면?
        
        if (succAlive) {
          result = {
            privateMsg: `🚓 검거 성공! <@${target}> 은(는) 마피아대부였습니다. 그러나 후계자가 있어 게임은 속행됩니다.`,
            publicMsg: `🚓 경찰반장이 마피아대부를 검거했습니다! 그러나 후계자가 살아있어 게임은 계속됩니다.`,
          };
        } else {
          const v = checkVictory(vcId);
          
          result = {
            privateMsg: `🚓 검거 성공! <@${target}> 은(는) 마피아 대부였습니다. 시민 팀 승리!`,
            publicMsg: `🚓 경찰반장이 마피아대부를 검거했습니다. **시민 팀 승리!**` + (v.ended ? `\n\n${v.publicMsg}` : "")
          };
        }
      } else {
        // ❌ 검거 실패 → checkVictory 호출로 즉시 시민 패배 처리
        const v = checkVictory(vcId);
        s.reason = "검거 실패";
        endGameState(vcId, "mafia", "검거 실패");
        result = {
          privateMsg: `❌ 검거 실패! <@${target}> 은(는) 대부가 아니었습니다.`,
          publicMsg: `⚠️ 검거 실패! **시민 팀 패배!**` + (v.ended ? `\n\n${v.publicMsg}` : "")
        };
      }
      break;
    }


    case "지원": {
      const { target } = args;
      if (!target) return { ok: false, error: "지원할 대상을 선택하세요." };

      addMana(vcId, target, 50);
      result = {
        privateMsg: `💰 <@${target}> 에게 마나 50을 지원했습니다.`,
        publicMsg:  `📢 공무원이 <@${target}> 에게 마나를 지원했습니다.`,
      };
      break;
    }

    // ───────────────── 대상만 찍는 즉사 스킬 ─────────────────
    case "복수귀":
    case "저격": {
      const { target } = args;
      if (!target) return { ok: false, error: "대상을 선택하세요." };

      // 🔸 복수귀: 파트너 사망 조건 체크
      if (skillName === "복수귀") {
        // 내 역할 기준으로 상대 연인 역할 결정
        const partnerRole =
          myRole === "남자연인" ? "여자연인" :
          myRole === "여자연인" ? "남자연인" : null;

        if (!partnerRole) {
          return { ok: false, error: "복수귀는 연인만 사용할 수 있습니다." };
        }

        const partnerPid = findPlayerByRoleInSession(s, partnerRole);
        if (!partnerPid) {
          // 포메이션에 파트너가 없을 가능성은 거의 없지만, 방어적으로 처리
          return { ok: false, error: `상대 연인(${partnerRole})이(가) 존재하지 않습니다.` };
        }

        // ✅ 파트너 '사망'이 조건
        if (isAlive(vcId, partnerPid)) {
          return { ok: false, error: "복수귀 발동 조건 미충족: 상대 연인이 아직 살아 있습니다." };
        }
      }

      // 공용: 1회 제한 체크
      const left = getLimit(vcId, uid, skillName);
      if ( left <= 0) {
        return { ok: false, error: `${skillName}은(는) 1회만 사용할 수 있습니다.` };
      }

      // 효과 적용
      setAlive(vcId, target, false);
      addLimit(vcId, uid, skillName, -1);

      const v = checkVictory(vcId);
      result = {
        privateMsg: `☠️ ${skillName} 성공! <@${target}> 을(를) 즉사시켰습니다.`,
        publicMsg:  `☠️ ${skillName} 발동! <@${target}> 이(가) 사망했습니다.` + (v.ended ? `\n\n${v.publicMsg}` : ""),
      };
      break;
    }

    // 리더만 가능 ------------- role만 찍음

    case "리더쉽": {
    
    const leaders = new Set(["경찰반장", "마피아대부"]);
    if (!leaders.has(myRole)) {
      return { ok: false, error: "리더만 사용할 수 있는 스킬입니다." };
    }
    // 본인 진명 공표 상태 필요
    const myReveal = s.revealed.get(uid);
    if (!myReveal || myReveal.isTrue !== true) {
      return { ok: false, error: "진명을 공표한 뒤에만 사용할 수 있습니다." };
    }

    const { role: allyRole } = args || {};
    if (!allyRole) return { ok: false, error: "아군 직업이 누락되었습니다." };

    // 같은 진영 검증
    if (getFaction(myRole) !== getFaction(allyRole)) {
      return { ok: false, error: "아군 직업만 지정할 수 있습니다." };
    }

    // 남은 횟수(게임 중 1회)
    const left = getLimit(vcId, uid, "리더쉽");
    if (left <= 0) {
      return { ok: false, error: "리더쉽은 게임 중 1회만 사용할 수 있습니다." };
    }

    // 생존 중이며 해당 직업을 가진 플레이어 목록
    const matches = [...s.roles.entries()]
      .filter(([pid, r]) => r === allyRole && isAlive(vcId, pid))
      .map(([pid]) => pid);

    if (matches.length === 0) {
      return { ok: false, error: "해당 아군 직업의 생존 플레이어가 없습니다." };
    }

    // 1회 소모
    addLimit(vcId, uid, "리더쉽", -1);

    // 개인 통지: 여러 명이면 모두 보여줌
    const mentions = matches.map(pid => `<@${pid}>`).join(", ");
    result = {
      privateMsg: `🧭 리더쉽 결과: **${allyRole}** → ${mentions}`,
      // 공개 방송 없음
    };
    break;
  }
    

    // ----------------------공문 스킬임-----------------
    case "공문": {
      const { contents } = args;
      if (!contents) return { ok: false, error: "공문 내용이 필요합니다. /say 명령을 사용하세요" };

      // (선택) 길이 제한
      const text = contents.slice(0, 200);

      result = {
        privateMsg: `📜 공문 발송 완료: "${text}"`,
        publicMsg:  `📢 *[공문]* ${text}`,
      };
      break;
    }
    default:
      result = { privateMsg: `🌀 ${skillName} 사용!` };
      break;
  }

  // 마나 차감 및 쿨타임 부여
  addMana(vcId, uid, s.testMode ? 0 : -cost);
  setCooldown(vcId, uid, cdKey, cdMs);

  return { ok: true, ...result };
}


function findPlayerByRoleInSession(s, roleName) {
  for (const [pid, role] of s.roles.entries()) {
    if (role === roleName) return pid;
  }
  return null;
}