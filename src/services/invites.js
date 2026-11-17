// Invite links and invite codes.
//
// A private community's link carries the code (`/join/<id>?joincode=ABC123`) so
// someone you trust can join without typing it. A wrong or missing code must
// never let anyone in, so both the link builder and the join page use these
// helpers instead of comparing strings in two places.

export function normalizeInviteCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

// Public communities accept everyone. A private community accepts only its own
// code, and a private community without a stored code cannot be joined by link.
export function inviteCodeMatches(community, code) {
  if (!community?.isPrivate) return true;
  const expected = normalizeInviteCode(community.inviteCode);
  if (!expected) return false;
  return normalizeInviteCode(code) === expected;
}

export function inviteLinkFor({ origin, communityId, community }) {
  const base = `${origin}/join/${communityId}`;
  const code = community?.isPrivate ? normalizeInviteCode(community.inviteCode) : '';
  return code ? `${base}?joincode=${encodeURIComponent(code)}` : base;
}
