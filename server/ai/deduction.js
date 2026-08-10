import { factionOf, formations } from "../game-config.js";

const reliable = (value) => (value?.confidence ?? 0) >= .8;

function canMatch(players, candidates, fixedPlayerId = null, fixedRole = null) {
  const roleOwner = new Map();
  const ordered = [...players].sort((left, right) => candidates[left.id].size - candidates[right.id].size);
  const visit = (player, seen) => {
    const roles = fixedPlayerId === player.id ? [fixedRole] : candidates[player.id];
    for (const role of roles) {
      if (!role || seen.has(role) || !candidates[player.id].has(role)) continue;
      seen.add(role);
      const owner = roleOwner.get(role);
      if (!owner || (owner.id !== fixedPlayerId && visit(owner, seen))) { roleOwner.set(role, player); return true; }
    }
    return false;
  };
  if (fixedPlayerId !== null) {
    const fixed = players.find((player) => player.id === fixedPlayerId);
    if (!fixed || !candidates[fixedPlayerId].has(fixedRole)) return false;
    roleOwner.set(fixedRole, fixed);
  }
  return ordered.every((player) => player.id === fixedPlayerId || visit(player, new Set()));
}

export function deriveCandidates(room, actor) {
  const memory = actor.aiMemory ?? {};
  const living = room.players.filter((player) => player.alive);
  const deadRoles = new Set(room.players.filter((player) => !player.alive).map((player) => player.role));
  const remainingRoles = formations[room.totalPlayers].filter((role) => !deadRoles.has(role));
  const candidates = {};

  for (const player of living) {
    let roles = new Set(remainingRoles);
    const known = memory.knowledge?.[player.id];
    const claim = memory.claims?.[player.id];
    if (player.id === actor.id) roles = new Set([actor.role]);
    else if (known?.role && reliable(known)) roles = new Set([known.role]);
    else if (claim?.role && (memory.trust?.[player.id] ?? claim.trust ?? 0) >= .8) roles = new Set([claim.role]);
    else {
      for (const excluded of known?.excluded ?? []) roles.delete(excluded);
      if (known?.faction && reliable(known)) roles = new Set([...roles].filter((role) => factionOf(role) === known.faction));
    }
    candidates[player.id] = roles;
  }

  if (!canMatch(living, candidates)) return { candidates, certain: {}, contradiction: true };
  const feasible = {};
  const certain = {};
  for (const player of living) {
    feasible[player.id] = new Set([...candidates[player.id]].filter((role) => canMatch(living, candidates, player.id, role)));
    if (feasible[player.id].size === 1) certain[player.id] = [...feasible[player.id]][0];
  }
  return { candidates: feasible, certain, contradiction: false };
}

export function refreshDeductions(room, actor) {
  actor.aiMemory ??= {};
  const result = deriveCandidates(room, actor);
  actor.aiMemory.candidateRoles = Object.fromEntries(Object.entries(result.candidates).map(([id, roles]) => [id, [...roles]]));
  actor.aiMemory.deductions = result.certain;
  actor.aiMemory.deductionContradiction = result.contradiction;
  actor.aiMemory.knowledge ??= {};
  for (const [id, role] of Object.entries(result.certain)) {
    if (Number(id) === actor.id) continue;
    const known = actor.aiMemory.knowledge[id] ?? { excluded: [] };
    if (!known.role || (known.confidence ?? 0) < .8) actor.aiMemory.knowledge[id] = { ...known, role, faction: factionOf(role), confidence: .8, source: "소거법 확정" };
  }
  return result;
}

export function livingFactionComplete(room, actor, faction) {
  const result = deriveCandidates(room, actor);
  if (result.contradiction) return false;
  const livingRoles = formations[room.totalPlayers].filter((role) => factionOf(role) === faction && room.players.some((player) => player.alive && player.role === role));
  const certainRoles = new Set(Object.values(result.certain).filter((role) => factionOf(role) === faction));
  return livingRoles.every((role) => certainRoles.has(role));
}
