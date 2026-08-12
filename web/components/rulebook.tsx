"use client";

import { useMemo, useState } from "react";
import { guideSections, roleGuide, skillGuide } from "../game/guide-data";

export function RulebookLauncher() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"rules" | "roles" | "skills">("rules");
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const roles = useMemo(() => roleGuide.filter((role) => `${role.name} ${role.summary}`.toLowerCase().includes(needle)), [needle]);
  const skills = useMemo(() => skillGuide.filter((skill) => `${skill.name} ${skill.description} ${skill.condition ?? ""} ${skill.warning ?? ""}`.toLowerCase().includes(needle)), [needle]);
  return <>
    <button className="rulebook-launcher" onClick={() => setOpen(true)}>룰북 <span>?</span></button>
    {open && <div className="rulebook-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><section className="rulebook-panel" role="dialog" aria-modal="true" aria-label="TACTICS 룰북">
      <header><div><small>TACTICS FIELD MANUAL</small><h1>전술 룰북</h1></div><button onClick={() => setOpen(false)} aria-label="룰북 닫기">×</button></header>
      <div className="rulebook-tools"><nav>{([['rules','핵심 규칙'],['roles','직업 도감'],['skills','스킬 도감']] as const).map(([id,label]) => <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id)}>{label}</button>)}</nav><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="직업·스킬·규칙 검색" /></div>
      <div className="rulebook-content">
        {tab === "rules" && guideSections.map((section) => <article className="rule-section" key={section.id}><h2>{section.title}</h2><p>{section.summary}</p><div>{section.items.filter((item) => `${item[0]} ${item[1]}`.toLowerCase().includes(needle)).map((item) => <section key={item[0]}><strong>{item[0]}</strong><p>{item[1]}</p></section>)}</div></article>)}
        {tab === "roles" && <div className="guide-card-grid">{roles.map((role) => <article className={role.faction} key={role.name}><small>{role.faction === "mafia" ? "마피아 진영" : "시민 진영"}</small><h2>{role.name}</h2><p>{role.summary}</p><footer>{role.skills.map((id) => <span key={id}>{skillGuide.find((skill) => skill.id === id)?.name}</span>)}</footer></article>)}</div>}
        {tab === "skills" && <div className="guide-card-grid skills">{skills.map((skill) => {
          const oneUse = ["leadership", "successor", "snipe-command", "arrest", "snipe", "revenge"].includes(skill.id);
          const costLabel = skill.id === "upper-attack" ? "마나 40 · 11인 이상 30" : skill.cost ? `마나 ${skill.cost}` : "무료";
          return <article className={skill.tone} key={skill.id}><small>{costLabel} · {skill.cooldown === 0 ? "지속 효과" : oneUse ? "게임당 1회" : `쿨타임 ${skill.cooldown}초`}</small><h2>{skill.icon} {skill.name}</h2><p>{skill.description}</p>{skill.condition && <p><b>조건</b> {skill.condition}</p>}{skill.warning && <p className="guide-warning"><b>주의</b> {skill.warning}</p>}</article>;
        })}</div>}
      </div>
    </section></div>}
  </>;
}
