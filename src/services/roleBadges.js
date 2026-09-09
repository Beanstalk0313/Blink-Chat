export const ROLE_BADGE_PRESETS = ['spark','star','crown','shield','heart','bolt','flame','leaf','gem','trophy','rocket','sun','moon','cloud','music','camera','gamepad','book','coffee','pizza','cat','dog','butterfly','flower','planet','diamond','key','anchor','compass','bell','megaphone','wrench'];
export function roleBadgeUrl(badge) { return ROLE_BADGE_PRESETS.includes(badge) ? `/role-badges/${badge}.svg` : null; }
export function primaryRoleForMember(community, uid) {
  const ids = Array.isArray(community?.memberRoles?.[uid]) ? community.memberRoles[uid] : [community?.memberRoles?.[uid]];
  return ids.map(id => community?.roles?.[id]).find(Boolean) || null;
}
