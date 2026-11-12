import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { firestore } from '../firebase/data';

// Privacy levels, in the order the settings UI shows them.
export const FRIEND_REQUEST_PRIVACY_OPTIONS = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'friendsOfFriends', label: 'Friends of friends' },
  { value: 'nobody', label: 'Nobody' }
];

export const MESSAGE_PRIVACY_OPTIONS = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'friendsOfFriends', label: 'Friends of friends' },
  { value: 'friends', label: 'Friends only' },
  { value: 'nobody', label: 'Nobody' }
];

// Private message privacy lives on users/{uid}.privateMessagePrivacy. Legacy
// profiles only have the boolean blockPrivateMessages, so it is treated as the
// "nobody" level rather than silently reverting to "everyone".
export function messagePrivacyOf(profile) {
  const level = profile?.privateMessagePrivacy;
  if (MESSAGE_PRIVACY_OPTIONS.some(option => option.value === level)) return level;
  return profile?.blockPrivateMessages ? 'nobody' : 'everyone';
}

export function friendRequestPrivacyOf(profile) {
  const level = profile?.friendRequestPrivacy;
  return FRIEND_REQUEST_PRIVACY_OPTIONS.some(option => option.value === level) ? level : 'everyone';
}

export function hasBlocked(profile, uid) {
  return Array.isArray(profile?.blockedUsers) && profile.blockedUsers.includes(uid);
}

export function friendshipId(firstUid, secondUid) {
  return [firstUid, secondUid].sort().join('_');
}

export function friendRequestId(fromUid, toUid) {
  return `${fromUid}_${toUid}`;
}

export async function getFriendship(firstUid, secondUid) {
  if (!firstUid || !secondUid || firstUid === secondUid) return null;
  const snapshot = await getDoc(doc(firestore, 'friendships', friendshipId(firstUid, secondUid)));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function areFriends(firstUid, secondUid) {
  return Boolean(await getFriendship(firstUid, secondUid));
}

// A friend-of-friend shares at least one mutual friend with you. Reads are
// capped so a very social account cannot turn one message send into hundreds
// of document reads.
export async function haveMutualFriend(firstUid, secondUid) {
  if (!firstUid || !secondUid || firstUid === secondUid) return false;
  try {
    const snapshot = await getDocs(query(
      collection(firestore, 'friendships'),
      where('memberUids', 'array-contains', firstUid),
      limit(30)
    ));
    const friendUids = snapshot.docs
      .map(entry => (entry.data().memberUids || []).find(uid => uid !== firstUid))
      .filter(Boolean)
      .slice(0, 20);
    const checks = await Promise.all(friendUids.map(async friendUid => {
      try {
        return (await getDoc(doc(firestore, 'friendships', friendshipId(friendUid, secondUid)))).exists();
      } catch {
        return false;
      }
    }));
    return checks.some(Boolean);
  } catch (error) {
    console.warn('Mutual friend check failed:', error);
    return false;
  }
}

// Single decision point for "may A open a conversation with B". Used by the
// send path and by the UI (which shows the reason instead of a Message button).
export async function canSendPrivateMessage(senderUid, recipientUid, { recipientProfile, senderProfile } = {}) {
  if (!senderUid || !recipientUid) return { allowed: false, reason: 'unknown' };
  if (senderUid === recipientUid) return { allowed: true, reason: 'self' };
  if (hasBlocked(recipientProfile, senderUid)) return { allowed: false, reason: 'blocked' };
  if (hasBlocked(senderProfile, recipientUid)) return { allowed: false, reason: 'youBlocked' };
  const privacy = messagePrivacyOf(recipientProfile);
  if (privacy === 'everyone') return { allowed: true, reason: 'everyone' };
  if (privacy === 'nobody') return { allowed: false, reason: 'privacy', privacy };
  if (await areFriends(senderUid, recipientUid)) return { allowed: true, reason: 'friends', privacy };
  if (privacy === 'friends') return { allowed: false, reason: 'privacy', privacy };
  if (await haveMutualFriend(senderUid, recipientUid)) return { allowed: true, reason: 'friendsOfFriends', privacy };
  return { allowed: false, reason: 'privacy', privacy };
}

export async function canSendFriendRequest(fromUid, targetUid, { targetProfile, fromProfile } = {}) {
  if (!fromUid || !targetUid) return { allowed: false, reason: 'unknown' };
  if (fromUid === targetUid) return { allowed: false, reason: 'self' };
  if (hasBlocked(targetProfile, fromUid)) return { allowed: false, reason: 'blocked' };
  if (hasBlocked(fromProfile, targetUid)) return { allowed: false, reason: 'youBlocked' };
  if (await areFriends(fromUid, targetUid)) return { allowed: false, reason: 'friends' };
  const pending = await readFriendRequest(fromUid, targetUid);
  if (pending?.status === 'pending') return { allowed: false, reason: 'pending' };
  const privacy = friendRequestPrivacyOf(targetProfile);
  if (privacy === 'everyone') return { allowed: true, reason: 'everyone' };
  if (privacy === 'nobody') return { allowed: false, reason: 'privacy', privacy };
  if (await haveMutualFriend(fromUid, targetUid)) return { allowed: true, reason: 'friendsOfFriends', privacy };
  return { allowed: false, reason: 'privacy', privacy };
}

// Reads one friend request, treating a denial as "no request". The read rule
// inspects the document, so Firestore denies reads of documents that do not
// exist yet; without this, a first-ever request looked like a failure.
async function readFriendRequest(fromUid, toUid) {
  try {
    const snapshot = await getDoc(doc(firestore, 'friendRequests', friendRequestId(fromUid, toUid)));
    return snapshot.exists() ? snapshot.data() : null;
  } catch {
    return null;
  }
}

// Relationship snapshot for a profile card: friends / request sent / request
// received / nothing. At most three reads, once per card open.
export async function getRelationship(uid, otherUid) {
  if (!uid || !otherUid) return { state: 'unknown' };
  if (uid === otherUid) return { state: 'self' };
  const [friendship, outgoing, incoming] = await Promise.all([
    getFriendship(uid, otherUid).catch(() => null),
    readFriendRequest(uid, otherUid),
    readFriendRequest(otherUid, uid)
  ]);
  if (friendship) return { state: 'friends' };
  if (outgoing?.status === 'pending') return { state: 'pendingOut' };
  if (incoming?.status === 'pending') return { state: 'pendingIn' };
  return { state: 'none' };
}

export function subscribeToIncomingFriendRequests(uid, callback, onError) {
  if (!uid) return () => {};
  const requestsQuery = query(
    collection(firestore, 'friendRequests'),
    where('to', '==', uid),
    where('status', '==', 'pending')
  );
  return onSnapshot(requestsQuery, snapshot => {
    const requests = snapshot.docs
      .map(entry => ({ id: entry.id, ...entry.data() }))
      .sort((first, second) => String(second.createdAt || '').localeCompare(String(first.createdAt || '')));
    callback(requests);
  }, error => {
    console.warn('Friend request subscription error:', error);
    onError?.(error);
  });
}

export function subscribeToOutgoingFriendRequests(uid, callback, onError) {
  if (!uid) return () => {};
  const requestsQuery = query(
    collection(firestore, 'friendRequests'),
    where('from', '==', uid),
    where('status', '==', 'pending')
  );
  return onSnapshot(requestsQuery, snapshot => {
    callback(snapshot.docs.map(entry => ({ id: entry.id, ...entry.data() })));
  }, error => {
    console.warn('Outgoing friend request subscription error:', error);
    onError?.(error);
  });
}

export function subscribeToFriends(uid, callback, onError) {
  if (!uid) return () => {};
  const friendshipsQuery = query(collection(firestore, 'friendships'), where('memberUids', 'array-contains', uid));
  return onSnapshot(friendshipsQuery, snapshot => {
    const friendUids = snapshot.docs
      .map(entry => (entry.data().memberUids || []).find(memberUid => memberUid !== uid))
      .filter(Boolean);
    callback(friendUids, snapshot.docs.map(entry => ({ id: entry.id, ...entry.data() })));
  }, error => {
    console.warn('Friends subscription error:', error);
    onError?.(error);
  });
}

export async function sendFriendRequest(fromUid, toUid) {
  const now = new Date().toISOString();
  await setDoc(doc(firestore, 'friendRequests', friendRequestId(fromUid, toUid)), {
    from: fromUid,
    to: toUid,
    status: 'pending',
    createdAt: now
  });
}

export async function cancelFriendRequest(fromUid, toUid) {
  await deleteDoc(doc(firestore, 'friendRequests', friendRequestId(fromUid, toUid)));
}

export async function respondToFriendRequest(request, accept) {
  if (!request?.from || !request?.to) return;
  await updateDoc(doc(firestore, 'friendRequests', request.id), {
    status: accept ? 'accepted' : 'declined',
    resolvedAt: new Date().toISOString()
  });
  if (!accept) return;
  await setDoc(doc(firestore, 'friendships', friendshipId(request.from, request.to)), {
    memberUids: [request.from, request.to].sort(),
    createdAt: new Date().toISOString(),
    createdBy: request.to
  }, { merge: true });
}

export async function removeFriend(firstUid, secondUid) {
  await deleteDoc(doc(firestore, 'friendships', friendshipId(firstUid, secondUid)));
}

export async function setFriendRequestPrivacy(uid, level) {
  const value = FRIEND_REQUEST_PRIVACY_OPTIONS.some(option => option.value === level) ? level : 'everyone';
  await updateDoc(doc(firestore, 'users', uid), { friendRequestPrivacy: value });
}

export async function setMessagePrivacy(uid, level) {
  const value = MESSAGE_PRIVACY_OPTIONS.some(option => option.value === level) ? level : 'everyone';
  // blockPrivateMessages is kept in sync for older clients and for the profile
  // card's "Direct messages disabled" line.
  await updateDoc(doc(firestore, 'users', uid), {
    privateMessagePrivacy: value,
    blockPrivateMessages: value === 'nobody'
  });
}

// Blocking ends the friendship and withdraws every pending request in either
// direction, so neither side keeps an open channel to the other.
export async function blockUser(uid, targetUid) {
  await setUserBlocked(uid, targetUid, true);
  await Promise.all([
    removeFriend(uid, targetUid),
    cancelFriendRequest(uid, targetUid),
    deleteDoc(doc(firestore, 'friendRequests', friendRequestId(targetUid, uid))).catch(() => {})
  ]);
}

export async function unblockUser(uid, targetUid) {
  await setUserBlocked(uid, targetUid, false);
}

export async function setUserBlocked(uid, targetUid, blocked) {
  const userRef = doc(firestore, 'users', uid);
  const snapshot = await getDoc(userRef);
  const current = Array.isArray(snapshot.data()?.blockedUsers) ? snapshot.data().blockedUsers : [];
  const next = blocked
    ? [...new Set([...current, targetUid])]
    : current.filter(blockedUid => blockedUid !== targetUid);
  await updateDoc(userRef, { blockedUsers: next });
}
