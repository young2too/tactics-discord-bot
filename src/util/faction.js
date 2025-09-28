export function getFactionColor(role) {
  const mafiaRoles = ["마피아대부","히트맨","마피아일원","마피아후계자","스파이"];
  if (mafiaRoles.includes(role)) return "red";
  return "blue"; // 시민
}

export function getFactionEmoji(role) {
  return getFactionColor(role) === "red" ? "🔴" : "🔵";
}

export function formatRoleWithFaction(role) {
  if (!role || role === "미공표") return "미공표";
  return `${getFactionEmoji(role)} ${role}`;

}

export function getFaction(role) {
  const MAFIA_ROLES = new Set(["마피아대부","히트맨","마피아일원","마피아후계자","스파이"]);
  
  return MAFIA_ROLES.has(role) ? "mafia" : "citizen";
}

export function isCitizenFaction(role) {
 return getFaction(role) === "citizen";
}
