import type { FormEvent } from "react";
import type { Faction, GameResult, Player, Skill } from "../game/types";

export function RoleChoiceModal({ skill, target, roles, onResolve, onCancel }: { skill: Skill; target: Player | null; roles: { name: string; faction: Faction }[]; onResolve: (role: string) => void; onCancel: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}><section className="role-modal" role="dialog" aria-modal="true" aria-label="직업 선택" onMouseDown={(event) => event.stopPropagation()}>
    <header><span>{skill.icon}</span><div><small>{skill.name}</small><h2>{target ? `${target.name}의 직업을 지정하세요` : "공표할 직업을 선택하세요"}</h2></div><button onClick={onCancel}>×</button></header>
    {target && <div className="target-summary"><span>선택 대상</span><strong>{target.name}</strong><small>공표 · {target.announced}</small></div>}
    <div className="role-grid">{roles.map((role) => <button className={`role-choice ${role.faction}`} key={role.name} onClick={() => onResolve(role.name)}>{role.name}<small>{role.faction === "mafia" ? "마피아 진영" : "시민 진영"}</small></button>)}</div>
    <footer><span>격발 전까지 마나가 소모되지 않습니다.</span><button onClick={onCancel}>취소</button></footer>
  </section></div>;
}

export function ProclamationModal({ text, setText, onSubmit, onCancel }: { text: string; setText: (text: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}><section className="role-modal proclamation-modal" role="dialog" aria-modal="true" aria-label="공문 작성" onMouseDown={(event) => event.stopPropagation()}>
    <header><span>✉</span><div><small>공무원 전용 스킬</small><h2>전체 플레이어에게 보낼 공문을 작성하세요</h2></div><button onClick={onCancel}>×</button></header>
    <form onSubmit={onSubmit}><textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} maxLength={200} placeholder="공문 내용 (최대 200자)"/><div><small>{text.length} / 200</small><button type="submit" disabled={!text.trim()}>공문 발송</button></div></form>
  </section></div>;
}

export function GameOverModal({ result, players }: { result: Exclude<GameResult, null>; players: Player[] }) {
  return <div className="game-over-backdrop"><section className={`game-over-panel ${result.winner}`} role="dialog" aria-modal="true" aria-label="게임 종료 결과">
    <span className="result-kicker">GAME OVER</span><h1>{result.winner === "mafia" ? "마피아 진영 승리" : "시민 진영 승리"}</h1><p>{result.reason}</p>
    <div className="final-roster">{players.map((player) => <div className={player.faction} key={player.id}><span>{player.alive ? "생존" : "사망"}</span><strong>{player.name}</strong><b>{player.role}</b><small>공표 · {player.announced}</small></div>)}</div>
    <button onClick={() => window.location.reload()}>프로토타입 다시 시작</button>
  </section></div>;
}
