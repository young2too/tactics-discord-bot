import { factionOf, portraitStyle } from "../game/rules";
import type { Player, PublicEffect, Skill } from "../game/types";

export function Battlefield({ players, mySeatIndex, selectedSkill, notice, effectTarget, alliances, whisper, onCancel, onTarget, isTargetable }: {
  players: Player[]; mySeatIndex: number; selectedSkill: Skill | null; notice: string; effectTarget: PublicEffect; alliances: number[];
  whisper: { from: number; to: number; text: string } | null; onCancel: () => void; onTarget: (player: Player) => void; isTargetable: (player: Player, skill: Skill) => boolean;
}) {
  return <section className={`board-area ${selectedSkill?.target ? "targeting" : ""}`}>
    <div className="mode-banner"><span>{selectedSkill ? (selectedSkill.target ? "TARGETING MODE" : "SELECT ROLE") : "BATTLE IN PROGRESS"}</span><strong>{selectedSkill ? notice : "공표를 읽고, 적의 정체를 추적하세요"}</strong>{selectedSkill && <button onClick={onCancel}>ESC 취소</button>}</div>
    <div className="arena"><div className="table-core"><div className="core-rings"><i /><i /><i /></div><span className="round-label">실시간 진행 중</span><strong>{players.length}</strong><small>플레이어</small></div>
      {players.map((player, index) => {
        const rotatedSeatIndex = (index - mySeatIndex + players.length) % players.length;
        const angle = Math.PI / 2 + (rotatedSeatIndex * Math.PI * 2) / players.length;
        const selectable = Boolean(selectedSkill?.target && isTargetable(player, selectedSkill));
        const untargetable = Boolean(selectedSkill?.target && !selectable);
        return <button className={`player-seat ${player.alive ? "alive" : "dead"} ${player.isMe ? "me" : ""} ${selectable ? "selectable" : ""} ${untargetable ? "untargetable" : ""} ${effectTarget?.id === player.id ? `${effectTarget.type}-effect` : ""}`} style={{ left: `${50 + Math.cos(angle) * 43}%`, top: `${47 + Math.sin(angle) * 42}%` }} key={player.id} onClick={() => onTarget(player)} disabled={Boolean(selectedSkill?.target) && !selectable}>
          <span className="seat-pointer"/><span className="seat-number">{player.id}</span>{effectTarget?.id === player.id && effectTarget.type !== "attack" && <span className="public-action-effect" aria-label="살펴지는 중"><b>🔍</b><i/><i/></span>}
          <span className="portrait"><span className="portrait-art" style={portraitStyle(player.role)}/>{!player.alive && <b>☠</b>}</span>
          <span className="player-copy"><strong>{player.name}{player.isMe && <em>YOU</em>}</strong><small>공표 · <b className={`${factionOf(player.announced)}-text`}>{player.announced}</b></small><small className={`revealed-role ${factionOf(player.role)}-text`}>실제 · {player.role}</small></span>
          <span className={`life-state ${player.alive ? "" : "down"}`}>{player.alive ? "생존" : "사망 · 직업 공개"}</span>{alliances.includes(player.id) && <span className="alliance-mark">동맹</span>}
        </button>;
      })}
    </div>
    {whisper && <div className="whisper-cloud"><small>TO {whisper.to} · PRIVATE</small><strong>{whisper.from}번 플레이어</strong><p>{whisper.text}</p></div>}
  </section>;
}
