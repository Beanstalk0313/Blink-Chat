// Nicknames are display labels, never identities. A community nickname and a
// private friend nickname both live on the owner's own user document
// (`communityNicknames` and `friendNicknames` maps), which keeps the account
// display name, @mentions, friend lookup and existing security rules untouched.

export const NICKNAME_MAX_LENGTH = 32;

// Collapses runs of whitespace so a nickname cannot be padded with spaces or
// span lines in a message header, and caps the length to keep headers readable.
export function cleanNickname(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NICKNAME_MAX_LENGTH);
}

// The nickname `user` has chosen for themselves inside one community.
export function communityNicknameOf(user, communityId) {
  if (!user || !communityId) return '';
  return cleanNickname(user.communityNicknames?.[communityId]);
}

// The nickname the viewer has given someone else; private to the viewer.
export function friendNicknameOf(viewerProfile, otherUid) {
  if (!viewerProfile || !otherUid) return '';
  if (viewerProfile.uid === otherUid) return '';
  return cleanNickname(viewerProfile.friendNicknames?.[otherUid]);
}

// "Nickname (Real Name)" when a nickname is set, otherwise just the real name.
export function nicknameWithFallback(nickname, fallback) {
  const label = cleanNickname(nickname) || fallback || '';
  return label;
}
