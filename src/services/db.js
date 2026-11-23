import { firestore, db } from '../firebase/data';
import { canSendPrivateMessage } from './friends';
import { buildMemberPermissions, migrateLegacyCommunity, normalizeRoleIds } from './permissions';
import { mentionsUser } from './utils';
import { cleanNickname } from './nicknames';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  arrayUnion,
  arrayRemove,
  deleteDoc,
  onSnapshot,
  deleteField,
  serverTimestamp as firestoreServerTimestamp,
  runTransaction
} from 'firebase/firestore';
import {
  ref,
  push,
  set,
  update,
  remove,
  onValue,
  onChildChanged,
  onChildRemoved,
  onDisconnect,
  query as rtdbQuery,
  limitToLast,
  orderByChild,
  startAt,
  endAt,
  get,
  serverTimestamp,
  runTransaction as runDatabaseTransaction
} from 'firebase/database';


const sessionCache = new Map();
const pendingCacheLoads = new Map();
const SESSION_CACHE_TTL = 30000;

function cached(key, loader) {
  const entry = sessionCache.get(key);
  if (entry && entry.expiresAt > Date.now()) return Promise.resolve(entry.value);
  if (entry) sessionCache.delete(key);
  const pending = pendingCacheLoads.get(key);
  if (pending) return pending;
  const load = Promise.resolve().then(loader).then(value => {
    // A read marker can invalidate an in-flight load. Do not let that stale
    // result repopulate the cache after the marker has been written.
    if (pendingCacheLoads.get(key) === load) {
      sessionCache.set(key, { value, expiresAt: Date.now() + SESSION_CACHE_TTL });
    }
    return value;
  }).finally(() => {
    if (pendingCacheLoads.get(key) === load) pendingCacheLoads.delete(key);
  });
  pendingCacheLoads.set(key, load);
  return load;
}

export function clearSessionCache(prefix = '') {
  for (const key of sessionCache.keys()) {
    if (!prefix || key.startsWith(prefix)) sessionCache.delete(key);
  }
  for (const key of pendingCacheLoads.keys()) {
    if (!prefix || key.startsWith(prefix)) pendingCacheLoads.delete(key);
  }
  // Message bodies are intentionally memory-only, but must not survive an
  // account switch in the same browser session.
  if (!prefix) messagesCache.clear();
}

function cacheValue(key, value) {
  sessionCache.set(key, { value, expiresAt: Date.now() + SESSION_CACHE_TTL });
  return value;
}

// Communities
export async function createCommunity(name, description, isPrivate, iconBase64, adminUid, customInviteCode = null) {
  const newCommunityRef = doc(collection(firestore, 'communities'));
  const inviteCode = isPrivate ? (customInviteCode || Math.random().toString(36).substring(2, 10).toUpperCase()) : null;

  await setDoc(newCommunityRef, {
    name,
    description,
    iconBase64,
    isPrivate,
    inviteCode,
    adminUid,
    roles: {},
    memberRoles: {},
    memberPermissions: {},
    theme: 'default',
    createdAt: new Date().toISOString()
  });

  await joinCommunity(adminUid, newCommunityRef.id);
  await createChannel(newCommunityRef.id, 'general', 'text');
  clearSessionCache();
  return { id: newCommunityRef.id, inviteCode };
}

export async function joinCommunity(uid, communityId) {
  const userRef = doc(firestore, 'users', uid);
  await updateDoc(userRef, { joinedCommunities: arrayUnion(communityId) });
  clearSessionCache(`community:${communityId}`);
  // Best-effort "X joined the community" system message (admin-configured channel).
  const profile = await getUserProfile(uid).catch(() => null);
  logCommunitySystemMessage(communityId, uid, profile?.displayName, 'join');
}

export async function getPublicCommunities() {
  return cached('public-communities', async () => {
    const q = query(collection(firestore, 'communities'), where('isPrivate', '==', false));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
  });
}

export async function getCommunity(communityId) {
  return cached(`community:${communityId}`, async () => {
    const docSnap = await getDoc(doc(firestore, 'communities', communityId));
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
  });
}

export async function updateCommunity(communityId, data) {
  await updateDoc(doc(firestore, 'communities', communityId), data);
  clearSessionCache(`community:${communityId}`);
}

// Channels
export async function createChannel(communityId, name, type = 'text', options = {}) {
  const newChannelRef = doc(collection(firestore, 'channels'));
  const existingChannels = Number.isFinite(options.position) ? [] : await getChannels(communityId);
  const nextPosition = Number.isFinite(options.position)
    ? options.position
    : existingChannels.reduce((highest, channel) => Math.max(highest, Number(channel.position) || 0), -1) + 1;
  await setDoc(newChannelRef, {
    communityId,
    name: name.trim(),
    type,
    allowedRoles: options.allowedRoles || [],
    isLocked: Boolean(options.isLocked),
    slowModeSeconds: Number(options.slowModeSeconds) || 0,
    joinMode: options.joinMode || 'everyone',
    joinRoles: options.joinRoles || [],
    inviteRoles: options.inviteRoles || [],
    invitedUids: options.invitedUids || {},
    position: nextPosition,
    createdAt: new Date().toISOString(),
    lastActivity: firestoreServerTimestamp()
  });
  clearSessionCache(`channels:${communityId}`);
  return newChannelRef.id;
}

export async function updateChannel(channelId, data) {
  const channelSnap = await getDoc(doc(firestore, 'channels', channelId));
  await updateDoc(doc(firestore, 'channels', channelId), data);
  if (channelSnap.exists()) clearSessionCache(`channels:${channelSnap.data().communityId}`);
}

export async function deleteChannel(channelId) {
  const ref = doc(firestore, 'channels', channelId);
  const channelSnap = await getDoc(ref);
  await updateDoc(ref, { deleted: true });
  if (channelSnap.exists()) clearSessionCache(`channels:${channelSnap.data().communityId}`);
}

// Converting a text channel into a voice room removes its history: this clears
// the RTDB message path and the session cache in one go.
export async function clearChannelMessages(channelId) {
  if (!db) return;
  await remove(ref(db, `messages/${channelId}`));
  messagesCache.delete(channelId);
}

// Deletes a community and everything under it a client may remove: every
// channel (with its RTDB history), then the community document, then the
// owner's own membership and pin entries. Other members' stale ids simply
// resolve to a missing community.
export async function deleteCommunity(communityId, ownerUid) {
  if (!communityId) return;
  const channels = await getChannels(communityId).catch(() => []);
  // Channels are removed first: their delete rule resolves permission through
  // the community document, which must still exist at that point.
  await Promise.all(channels.map(async channel => {
    await clearChannelMessages(channel.id).catch(() => {});
    await deleteDoc(doc(firestore, 'channels', channel.id)).catch(() => {});
  }));
  await deleteDoc(doc(firestore, 'communities', communityId));
  if (ownerUid) {
    await updateDoc(doc(firestore, 'users', ownerUid), {
      joinedCommunities: arrayRemove(communityId),
      pinnedCommunities: arrayRemove(communityId)
    }).catch(() => {});
  }
  clearSessionCache();
}

export async function getChannels(communityId) {
  return cached(`channels:${communityId}`, async () => {
    const q = query(collection(firestore, 'channels'), where('communityId', '==', communityId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs
      .map(snapshot => ({ id: snapshot.id, ...snapshot.data() }))
      .filter(channel => !channel.deleted)
      .sort((a, b) => {
        const positionA = a.position ?? (Date.parse(a.createdAt || '') || 0);
        const positionB = b.position ?? (Date.parse(b.createdAt || '') || 0);
        return positionA - positionB;
      });
  });
}

// Members and presence
export async function getCommunityMembers(communityId) {
  return cached(`members:${communityId}`, async () => {
    const q = query(collection(firestore, 'users'), where('joinedCommunities', 'array-contains', communityId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(snapshot => ({ uid: snapshot.id, ...snapshot.data() }));
  });
}

export function subscribeToCommunityMembers(communityId, callback, onError) {
  const q = query(collection(firestore, 'users'), where('joinedCommunities', 'array-contains', communityId));
  return onSnapshot(
    q,
    snapshot => {
      const members = snapshot.docs.map(snapshotDoc => ({ uid: snapshotDoc.id, ...snapshotDoc.data() }));
      cacheValue(`members:${communityId}`, members);
      callback(members);
    },
    error => {
      console.warn('Community members subscription error:', error);
      onError?.(error);
    }
  );
}

export function subscribeToPresence(uid, callback) {
  if (!db) return () => {};
  return onValue(ref(db, `presence/${uid}`), snapshot => {
    const value = snapshot.val();
    callback(Boolean(value?.online), value || null);
  });
}

export function subscribeToCommunityPresence(callback) {
  if (!db) return () => {};
  return onValue(ref(db, 'presence'), snapshot => callback(snapshot.val() || {}));
}

export async function joinVoiceChannel(channelId, uid, participant) {
  if (!db) return;
  const participantRef = ref(db, `voiceParticipants/${channelId}/${uid}`);
  await onDisconnect(participantRef).set(null);
  await set(participantRef, {
    uid,
    displayName: participant.displayName || 'User',
    avatarBase64: participant.avatarBase64 || '',
    joinedAt: Date.now()
  });
}

export async function leaveVoiceChannel(channelId, uid) {
  if (!db) return;
  await set(ref(db, `voiceParticipants/${channelId}/${uid}`), null);
}

// ---- private call ringing --------------------------------------------------
// A ring is a small RTDB record: the caller does not open the call surface
// until the callee flips the invite to `accepted`, and either side can drop it.
export const CALL_RING_TIMEOUT_MS = 45000;

export async function createCallInvite({ callerUid, callerName, callerAvatar, calleeUid, calleeName, calleeAvatar, roomId, type = 'voice' }) {
  if (!db) throw new Error('Calls are unavailable while Firebase is offline.');
  const inviteRef = push(ref(db, 'callInvites'));
  await set(inviteRef, {
    callerUid,
    callerName: callerName || 'Someone',
    callerAvatar: callerAvatar || '',
    calleeUid,
    calleeName: calleeName || 'Someone',
    calleeAvatar: calleeAvatar || '',
    roomId,
    type,
    status: 'ringing',
    createdAt: Date.now()
  });
  return inviteRef.key;
}

export function subscribeToCallInvite(inviteId, callback) {
  if (!db || !inviteId) return () => {};
  return onValue(ref(db, `callInvites/${inviteId}`), snapshot => callback(snapshot.val() || null));
}

export function subscribeToIncomingCalls(uid, callback) {
  if (!db || !uid) return () => {};
  return onValue(ref(db, 'callInvites'), snapshot => {
    const oldest = Date.now() - CALL_RING_TIMEOUT_MS;
    const rings = Object.entries(snapshot.val() || {})
      .map(([id, invite]) => ({ id, ...invite }))
      .filter(invite => invite.calleeUid === uid && invite.status === 'ringing' && Number(invite.createdAt) > oldest)
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    callback(rings[0] || null);
  });
}

export async function respondToCallInvite(inviteId, status) {
  if (!db) return;
  await update(ref(db, `callInvites/${inviteId}`), { status });
}

export async function cancelCallInvite(inviteId) {
  if (!db) return;
  await remove(ref(db, `callInvites/${inviteId}`));
}

export function subscribeToVoiceParticipants(callback) {
  if (!db) return () => {};
  return onValue(ref(db, 'voiceParticipants'), snapshot => callback(snapshot.val() || {}));
}

// Presence is a heartbeat, not a socket state: onDisconnect covers a clean exit,
// but a crashed client, a killed laptop or a dead network leaves online:true
// behind forever. A write only counts as online while it is recent, so a stale
// entry decays to offline on its own.
const PRESENCE_HEARTBEAT_MS = 30000;
const PRESENCE_STALE_AFTER_MS = PRESENCE_HEARTBEAT_MS * 3;

export function isUserOnline(entry) {
  if (!entry || entry.online !== true) return false;
  const lastSeen = Number(entry.lastSeen) || 0;
  return Date.now() - lastSeen <= PRESENCE_STALE_AFTER_MS;
}

export function startPresence(uid) {
  if (!db || typeof window === 'undefined') return () => {};
  const connectedRef = ref(db, '.info/connected');
  const presenceRef = ref(db, `presence/${uid}`);
  const markOnline = () => update(presenceRef, { online: true, lastSeen: Date.now() }).catch(() => {});
  const markOffline = () => update(presenceRef, { online: false, lastSeen: Date.now() }).catch(() => {});
  const connectedUnsubscribe = onValue(connectedRef, snapshot => {
    if (snapshot.val() !== true) return;
    onDisconnect(presenceRef).set({ online: false, lastSeen: Date.now() });
    // update(), not set(): the game activity written by gamePresence lives on
    // the same node and must survive the online/lastSeen writes.
    markOnline();
  });
  const heartbeat = window.setInterval(markOnline, PRESENCE_HEARTBEAT_MS);
  // A backgrounded tab can miss several beats, and a closing tab gets one last
  // chance to clear itself before the socket drops.
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') markOnline();
  };
  const handlePageHide = () => markOffline();
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('pagehide', handlePageHide);
  return () => {
    window.clearInterval(heartbeat);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('pagehide', handlePageHide);
    connectedUnsubscribe();
    markOffline();
  };
}

// Kicks remove membership on the community document (kickedUsers), not the
// target's profile: Firestore rules only let users edit their own profile, so
// a moderator writing users/{uid}.joinedCommunities is always denied. The
// kicked user's own client performs the profile cleanup when it sees the entry.
export async function kickUser(communityId, uid) {
  const communityRef = doc(firestore, 'communities', communityId);
  const communitySnap = await getDoc(communityRef);
  if (communitySnap.exists()) {
    const kicked = communitySnap.data().kickedUsers || {};
    if (!kicked[uid]) {
      try {
        await updateDoc(communityRef, { [`kickedUsers.${uid}`]: Date.now() });
      } catch (error) {
        // Older deployed rules may not accept kickedUsers yet. The client-side
        // guards degrade gracefully without it, so do not fail the kick.
        console.warn('Could not record kickedUsers entry:', error);
      }
    }
  }
  clearSessionCache(`members:${communityId}`);
}

export async function banUser(communityId, uid, durationMinutes = -1) {
  const expirationTime = durationMinutes === -1 ? -1 : Date.now() + (durationMinutes * 60000);
  await kickUser(communityId, uid);
  await updateDoc(doc(firestore, 'communities', communityId), { [`bannedUsers.${uid}`]: expirationTime });
  clearSessionCache(`community:${communityId}`);
}

export async function leaveCommunity(uid, communityId) {
  const userRef = doc(firestore, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    const data = userSnap.data();
    const joined = data.joinedCommunities || [];
    const updates = {
      joinedCommunities: joined.filter(id => id !== communityId),
      pinnedCommunities: (data.pinnedCommunities || []).filter(id => id !== communityId),
      [`notificationPreferences.communityMuted.${communityId}`]: deleteField()
    };
    await updateDoc(userRef, updates);
  }
  clearSessionCache(`members:${communityId}`);
  clearSessionCache(`community:${communityId}`);
  sessionCache.delete(`user:${uid}`);
  // Best-effort "X left the community" system message (admin-configured channel).
  // This also runs when a kicked user's own client performs its cleanup.
  logCommunitySystemMessage(communityId, uid, userSnap.exists() ? userSnap.data().displayName : undefined, 'leave');
}

// Posts an admin-configured "joined/left" system message to the community's
// chosen channel. Fully optional: nothing is written unless the community has
// systemMessages enabled and a channel selected. Best-effort by design.
async function logCommunitySystemMessage(communityId, uid, displayName, type) {
  if (!db) return;
  try {
    const community = await getCommunity(communityId);
    const settings = community?.systemMessages || {};
    const enabled = type === 'join' ? settings.joinEnabled === true : settings.leaveEnabled === true;
    const channelId = settings.channelId;
    if (!enabled || !channelId) return;
    await set(push(ref(db, `messages/${channelId}`)), {
      authorUid: uid,
      system: type,
      name: displayName || 'User',
      timestamp: Date.now(),
      isPinned: false
    });
  } catch (error) {
    console.warn('Could not log community system message:', error);
  }
}

export async function unbanUser(communityId, uid) {
  const commRef = doc(firestore, 'communities', communityId);
  const commSnap = await getDoc(commRef);
  if (commSnap.exists()) {
    const updatedBans = { ...(commSnap.data().bannedUsers || {}) };
    delete updatedBans[uid];
    await updateDoc(commRef, { bannedUsers: updatedBans });
  }
  clearSessionCache(`community:${communityId}`);
}

export async function timeoutUser(communityId, uid, durationMinutes) {
  const expiration = Date.now() + (durationMinutes * 60000);
  await updateDoc(doc(firestore, 'communities', communityId), { [`timedOutUsers.${uid}`]: expiration });
  clearSessionCache(`community:${communityId}`);
}

export async function clearTimeoutUser(communityId, uid) {
  await updateDoc(doc(firestore, 'communities', communityId), { [`timedOutUsers.${uid}`]: deleteField() });
  clearSessionCache(`community:${communityId}`);
}

export async function setMemberRoles(communityId, uid, roleIds = [], roles = null) {
  const nextRoleIds = normalizeRoleIds(roleIds);
  let roleMap = roles;
  if (!roleMap) {
    const communitySnap = await getDoc(doc(firestore, 'communities', communityId));
    roleMap = communitySnap.exists() ? communitySnap.data().roles || {} : {};
  }
  const memberPermissions = buildMemberPermissions(roleMap, { [uid]: nextRoleIds })[uid] || {};
  await updateDoc(doc(firestore, 'communities', communityId), {
    [`memberRoles.${uid}`]: nextRoleIds.length ? nextRoleIds : deleteField(),
    [`memberPermissions.${uid}`]: Object.keys(memberPermissions).length ? memberPermissions : deleteField()
  });
  clearSessionCache(`community:${communityId}`);
}

export async function setMemberRole(communityId, uid, roleId) {
  return setMemberRoles(communityId, uid, roleId ? [roleId] : []);
}

export async function migrateCommunityPermissions(communityId, community) {
  const migration = migrateLegacyCommunity(community);
  if (!migration) return community;
  const updates = {
    roles: migration.roles,
    memberRoles: migration.memberRoles,
    memberPermissions: migration.memberPermissions
  };
  if (migration.removeLegacyCoAdmins) updates.coAdmins = deleteField();
  await updateDoc(doc(firestore, 'communities', communityId), updates);
  clearSessionCache(`community:${communityId}`);
  return { ...community, ...migration, coAdmins: undefined };
}

export async function reorderChannels(communityId, channelIds = []) {
  await Promise.all(channelIds.map((channelId, position) => updateDoc(doc(firestore, 'channels', channelId), { position })));
  clearSessionCache(`channels:${communityId}`);
}

export async function togglePinCommunity(uid, communityId) {
  const userRef = doc(firestore, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;
  const pinned = userSnap.data().pinnedCommunities || [];
  const isPinned = pinned.includes(communityId);
  if (!isPinned && pinned.length >= 3) throw new Error('Maximum 3 pinned communities allowed');
  const nextPinned = isPinned ? pinned.filter(id => id !== communityId) : [...pinned, communityId];
  await updateDoc(userRef, { pinnedCommunities: nextPinned });
  clearSessionCache(`user:${uid}`);
}

// Messages
export async function sendMessage(channelId, text, authorUid, attachment = null, options = {}) {
  if (!db) throw new Error('Realtime Database is not configured');
  const messagesRef = ref(db, `messages/${channelId}`);
  const newMessageRef = push(messagesRef);
  const message = {
    id: newMessageRef.key,
    text: text?.trim() || '',
    authorUid,
    // The sender's clock cannot be trusted: a few minutes of drift put a
    // person's messages after everyone else's. The server stamps it instead.
    timestamp: serverTimestamp(),
    attachment: attachment || null,
    isPinned: false
  };
  if (options.replyTo) message.replyTo = options.replyTo;
  if (options.poll) message.poll = options.poll;
  if (options.game) message.game = { ...options.game, status: options.game.status || 'pending', moves: {} };
  await set(newMessageRef, message);
  // Best-effort metadata only: the message is already stored in RTDB, so a
  // Firestore hiccup here must not make the UI report the message as failed.
  updateDoc(doc(firestore, 'channels', channelId), { lastActivity: firestoreServerTimestamp() }).catch(error => {
    console.warn('Could not update channel activity:', error);
  });
  return newMessageRef;
}

export async function submitGameMove(channelId, messageId, uid, cell, mark) {
  if (!db || !channelId || !messageId || !uid) return;
  const moveRef = push(ref(db, `messages/${channelId}/${messageId}/game/moves`));
  await set(moveRef, { uid, cell, mark, timestamp: Date.now() });
}

export async function acceptGameChallenge(channelId, messageId) {
  if (!db || !channelId || !messageId) return;
  await update(ref(db, `messages/${channelId}/${messageId}/game`), { status: 'active' });
}

export async function declineGameChallenge(channelId, messageId) {
  if (!db || !channelId || !messageId) return;
  await update(ref(db, `messages/${channelId}/${messageId}/game`), { status: 'declined' });
}

export async function editMessage(channelId, messageId, newText) {
  const result = await set(ref(db, `messages/${channelId}/${messageId}/text`), newText.trim());
  updateDoc(doc(firestore, 'channels', channelId), { lastActivity: firestoreServerTimestamp() }).catch(error => {
    console.warn('Could not update channel activity:', error);
  });
  return result;
}

export async function deleteMessage(channelId, messageId) {
  return set(ref(db, `messages/${channelId}/${messageId}`), null);
}

export async function togglePinMessage(channelId, messageId, currentStatus) {
  return set(ref(db, `messages/${channelId}/${messageId}/isPinned`), !currentStatus);
}

export async function toggleReaction(channelId, messageId, emoji, uid, currentlyReacted) {
  if (!db) return;
  // Optimistic client-side toggle: the caller already knows its own reaction
  // state from the message object, so no read is needed (one write only).
  await set(ref(db, `messages/${channelId}/${messageId}/reactions/${emoji}/${uid}`), currentlyReacted ? null : true);
}

// Polls: one vote per user across options; voting another option moves the vote.
export async function votePoll(channelId, messageId, optionId, uid, currentVoteOptionId) {
  if (!db) return;
  const updates = {};
  if (currentVoteOptionId && currentVoteOptionId !== optionId) {
    updates[`poll/votes/${currentVoteOptionId}/${uid}`] = null;
  }
  updates[`poll/votes/${optionId}/${uid}`] = currentVoteOptionId === optionId ? null : true;
  await update(ref(db, `messages/${channelId}/${messageId}`), updates);
}

// Typing indicators: write once when a typing burst starts, clear on idle/send,
// and clear automatically when the tab closes via onDisconnect. Readers prune
// stale entries client-side, so the writer never has to poll.
const typingDisconnectRegistered = new Set();

export async function setTyping(channelId, uid, displayName) {
  if (!db) return;
  const typingRef = ref(db, `typing/${channelId}/${uid}`);
  const key = `${channelId}:${uid}`;
  if (!typingDisconnectRegistered.has(key)) {
    typingDisconnectRegistered.add(key);
    onDisconnect(typingRef).set(null);
  }
  await set(typingRef, { name: displayName || 'User', startedAt: Date.now() });
}

export async function clearTyping(channelId, uid) {
  if (!db) return;
  await set(ref(db, `typing/${channelId}/${uid}`), null);
}

export function subscribeToTyping(channelId, callback, onError) {
  if (!db) return () => {};
  return onValue(ref(db, `typing/${channelId}`), snapshot => {
    callback(snapshot.val() || {});
  }, error => {
    console.warn('Typing subscription error:', error);
    onError?.(error);
  });
}

export async function getSingleMessage(channelId, messageId) {
  if (!db || !channelId || !messageId) return null;
  const snapshot = await get(ref(db, `messages/${channelId}/${messageId}`));
  return snapshot.exists() ? { id: messageId, ...snapshot.val() } : null;
}

// Full-text search within a channel: instant results from the session cache,
// widened by one bounded fetch of the 500 most recent messages (no live
// subscription, so it costs nothing when idle). Sorted by push ID for stability.
export async function searchChannelMessages(channelId, query) {
  if (!db) return [];
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) return [];
  const cached = getCachedMessages(channelId);
  let fresh = [];
  try {
    const snapshot = await get(rtdbQuery(ref(db, `messages/${channelId}`), orderByChild('timestamp'), limitToLast(500)));
    if (snapshot.exists()) {
      fresh = Object.entries(snapshot.val()).map(([id, message]) => ({ id, ...message }));
    }
  } catch (error) {
    console.warn('Search fetch failed:', error);
  }
  const merged = mergeMessagesById(fresh, cached);
  return merged
    .filter(message => message?.text?.toLowerCase().includes(normalized))
    .slice(-60);
}

// Session-scoped cache of channel messages so reopening a channel does not re-read everything.
const messagesCache = new Map(); // channelId -> { messages, oldestTimestamp, newestTimestamp, lastLimit }

// Compares whole messages, not just a hand-picked list of fields. Games change
// through nested children (game/moves, game/status), and polls, reactions and
// reply metadata change without touching text or timestamp. Comparing only
// those old fields made every such update look identical, so the callback was
// suppressed and the UI only caught up after a remount (which is why a game
// board needed a page switch to show the other player's move).
function messagesAreEqual(firstMessages, secondMessages) {
  if (firstMessages.length !== secondMessages.length) return false;
  return firstMessages.every((message, index) => JSON.stringify(message) === JSON.stringify(secondMessages[index]));
}

// Push IDs embed the generation time in their first 8 characters (base-64,
// most significant first). The SDK generates them from server-normalized time
// (Date.now() + serverTimeOffset), which can disagree with the raw client
// clock we store as the message timestamp when the offset is stale.
const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

function pushIdTimestamp(pushId) {
  if (typeof pushId !== 'string' || pushId.length < 8) return 0;
  let value = 0;
  for (let i = 0; i < 8; i += 1) {
    const digit = PUSH_CHARS.indexOf(pushId[i]);
    if (digit === -1) return 0;
    value = value * 64 + digit;
  }
  return value;
}

// A stored timestamp can be minutes off when the sender's clock is wrong or
// its server-offset estimate went stale. Push IDs are generated from the
// server-corrected time, so they are the reliable clock; large disagreements
// between the two mean the stored timestamp should not decide the order.
const TIMESTAMP_SKEW_TOLERANCE_MS = 2 * 60 * 1000;

// Messages are ordered by their stored timestamp, with the push ID as the
// tie-breaker (same-millisecond writes), the fallback when a timestamp is
// missing, and the tie-breaker of last resort when the timestamp is clearly
// wrong for that push ID.
export function compareMessages(first, second) {
  const firstTime = messageSortTime(first);
  const secondTime = messageSortTime(second);
  if (firstTime !== secondTime) return firstTime - secondTime;
  return String(first.id).localeCompare(String(second.id));
}

function messageSortTime(message) {
  const stored = Number(message?.timestamp) || 0;
  const pushed = pushIdTimestamp(message?.id);
  if (!pushed) return stored;
  if (!stored) return pushed;
  return Math.abs(stored - pushed) > TIMESTAMP_SKEW_TOLERANCE_MS ? pushed : stored;
}

function mergeMessagesById(...groups) {
  const byId = new Map();
  for (const group of groups) {
    for (const message of group) {
      if (message && message.id) byId.set(message.id, message);
    }
  }
  return [...byId.values()].sort(compareMessages);
}

export function subscribeToMessages(channelId, callback, limitCount = 50) {
  if (!db) throw new Error('Realtime Database is not configured');
  const messagesRef = ref(db, `messages/${channelId}`);
  const entry = messagesCache.get(channelId);
  const cachedMessages = entry?.messages || [];

  let q;
  if (!cachedMessages.length) {
    // First visit this session: read the most recent messages.
    q = rtdbQuery(messagesRef, orderByChild('timestamp'), limitToLast(limitCount));
  } else if (limitCount > (entry.lastLimit || 0)) {
    // "Load older messages": fetch up to limitCount messages ending just before the oldest cached one.
    // Include equal timestamps: different devices can write in the same millisecond.
    q = rtdbQuery(messagesRef, orderByChild('timestamp'), endAt(entry.oldestTimestamp || 0), limitToLast(limitCount));
  } else {
    // Already cached this session: only read messages newer than what we have.
    q = rtdbQuery(messagesRef, orderByChild('timestamp'), startAt(entry.newestTimestamp || 0));
  }

  let deliveredCachedMessages = false;
  const unsubscribe = onValue(q, snapshot => {
    const data = snapshot.val();
    const fresh = data
      ? Object.entries(data).map(([id, message]) => ({ id, ...message }))
      : [];
    // Merge against the live cache, not the closure snapshot: deletions are
    // applied to the cache by the child-removed listener below, and merging
    // against a stale closure would resurrect deleted messages.
    const base = messagesCache.get(channelId)?.messages || cachedMessages;
    const merged = mergeMessagesById(base, fresh);
    const previousMessages = base;
    messagesCache.set(channelId, {
      messages: merged,
      oldestTimestamp: merged.length ? merged[0].timestamp || 0 : 0,
      newestTimestamp: merged.length ? merged[merged.length - 1].timestamp || 0 : 0,
      lastLimit: Math.max(entry?.lastLimit || 0, limitCount)
    });
    if (!deliveredCachedMessages || !messagesAreEqual(previousMessages, merged)) callback(merged);
  });

  // Watch for changes on the whole message path: the bounded value query above
  // only reports messages inside its window, so pin toggles, edits, reactions
  // and game moves on OLDER messages would never surface until a reload.
  const changeUnsubscribe = onChildChanged(messagesRef, snapshot => {
    const changed = snapshot.val();
    if (!changed || typeof changed !== 'object') return;
    const changedMessage = { id: snapshot.key, ...changed };
    const current = messagesCache.get(channelId)?.messages || cachedMessages;
    const index = current.findIndex(message => message.id === changedMessage.id);
    if (index === -1) return; // not inside our loaded window — nothing to update
    const next = [...current];
    next[index] = changedMessage;
    next.sort(compareMessages);
    messagesCache.set(channelId, {
      messages: next,
      oldestTimestamp: next.length ? next[0].timestamp || 0 : 0,
      newestTimestamp: next.length ? next[next.length - 1].timestamp || 0 : 0,
      lastLimit: Math.max(entry?.lastLimit || 0, limitCount)
    });
    if (!messagesAreEqual(current, next)) callback(next);
  });

  // Watch for deletions on the whole message path: the bounded value query
  // above only reports messages inside its window, so a deletion would never
  // surface as "missing" and the removed message would survive in the merged
  // cache until a reload.
  const removeUnsubscribe = onChildRemoved(messagesRef, snapshot => {
    const removedId = snapshot.key;
    const current = messagesCache.get(channelId)?.messages || cachedMessages;
    const next = current.filter(message => message.id !== removedId);
    if (next.length === current.length) return;
    messagesCache.set(channelId, {
      messages: next,
      oldestTimestamp: next.length ? next[0].timestamp || 0 : 0,
      newestTimestamp: next.length ? next[next.length - 1].timestamp || 0 : 0,
      lastLimit: Math.max(entry?.lastLimit || 0, limitCount)
    });
    callback(next);
  });

  if (cachedMessages.length) {
    deliveredCachedMessages = true;
    callback(cachedMessages);
  }
  return () => {
    unsubscribe();
    changeUnsubscribe();
    removeUnsubscribe();
  };
}

export function getCachedMessages(channelId) {
  return messagesCache.get(channelId)?.messages || [];
}

// Keeps a lightweight listener on every joined text channel so notifications
// do not depend on the user currently having that channel open.
export function subscribeToUserChannelMessages(uid, communityIds = [], callback, onError) {
  if (!db || !uid || !communityIds.length) return () => {};
  let disposed = false;
  const unsubscribers = [];

  Promise.all(communityIds.map(communityId => getChannels(communityId)))
    .then(channelGroups => {
      if (disposed) return;
      const channels = channelGroups.flat().filter(channel => channel.type !== 'voice');
      channels.forEach(channel => {
        const seen = new Set();
        const messagesQuery = rtdbQuery(
          ref(db, `messages/${channel.id}`),
          orderByChild('timestamp'),
          limitToLast(50)
        );
        let initialized = false;
        const unsubscribe = onValue(messagesQuery, snapshot => {
          const data = snapshot.val() || {};
          const messages = Object.entries(data).map(([id, message]) => ({ id, ...message }));
          if (!initialized) {
            messages.forEach(message => seen.add(message.id));
            initialized = true;
            return;
          }
          messages.forEach(message => {
            if (seen.has(message.id)) return;
            seen.add(message.id);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('blink:message-received', {
                detail: { channelId: channel.id, communityId: channel.communityId, message }
              }));
            }
            callback({ ...message, channelId: channel.id, communityId: channel.communityId, channelName: channel.name });
          });
        }, error => {
          console.warn('Channel notification subscription error:', error);
          onError?.(error);
        });
        unsubscribers.push(unsubscribe);
      });
    })
    .catch(error => {
      console.warn('Channel notification setup failed:', error);
      onError?.(error);
    });

  return () => {
    disposed = true;
    unsubscribers.forEach(unsubscribe => unsubscribe());
  };
}

// Unread tracking.
//
// Writes are serialised per channel. The chat view (message arrives / scroll)
// and the global interaction listener can ask to mark the same channel read
// milliseconds apart, and two overlapping Firestore transactions on one
// document make the SDK reject and retry commits ("already-exists" /
// "failed-precondition" in the console). Queueing them keeps the marker
// monotonic and means one write instead of a retry storm.
const lastReadQueues = new Map();

async function writeLastRead(uid, channelId, readThroughTimestamp) {
  const readRef = doc(collection(doc(firestore, 'users', uid), 'lastRead'), channelId);
  await runTransaction(firestore, async transaction => {
    const snapshot = await transaction.get(readRef);
    const previousTimestamp = Number(snapshot.data()?.timestamp || 0);
    const timestamp = Math.max(previousTimestamp, Number(readThroughTimestamp) || Date.now());
    transaction.set(readRef, { timestamp }, { merge: true });
  });
  clearSessionCache(`unread:${uid}`);
  clearSessionCache(`unread-mentions:${uid}`);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('blink:unread-changed', { detail: { uid, channelId } }));
  }
}

export function updateLastRead(uid, channelId, readThroughTimestamp = Date.now()) {
  const key = `${uid}:${channelId}`;
  const previous = lastReadQueues.get(key) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => writeLastRead(uid, channelId, readThroughTimestamp));
  lastReadQueues.set(key, next);
  next
    .catch(() => {})
    .then(() => {
      if (lastReadQueues.get(key) === next) lastReadQueues.delete(key);
    });
  return next;
}

export async function getUnreadCounts(uid, communityIds = []) {
  return cached(`unread:${uid}:${communityIds.join(',')}`, async () => {
    const communityResults = await Promise.all(communityIds.map(async communityId => {
      const [community, channels] = await Promise.all([getCommunity(communityId), getChannels(communityId)]);
      const textChannels = channels.filter(channel => channel.type !== 'voice');
      const readResults = await Promise.all(textChannels.map(channel => getDoc(doc(firestore, 'users', uid, 'lastRead', channel.id))));
      const latestMessages = db
        ? await Promise.all(textChannels.map(channel => get(
          rtdbQuery(ref(db, `messages/${channel.id}`), orderByChild('timestamp'), limitToLast(1))
        )))
        : [];
      const userSnap = await getDoc(doc(firestore, 'users', uid));
      const notificationPreferences = userSnap.exists() ? (userSnap.data().notificationPreferences || {}) : {};
      const unreadChannels = textChannels.filter((channel, index) => {
        // Per-channel "nothing" mode suppresses the unread dot for that channel.
        if (notificationPreferences.channelModes?.[channel.id] === 'none') return false;
        const lastReadTime = readResults[index].exists() ? readResults[index].data().timestamp : 0;
        const latestMessage = latestMessages[index]?.exists() ? Object.values(latestMessages[index].val() || {})[0] : null;
        // Compare against the newest message's own timestamp, never the
        // channel's lastActivity: lastActivity is also bumped by edits and
        // pins made on other devices and is written with the writer's clock,
        // so a skewed clock could keep a channel unread forever even after it
        // was opened. lastActivity is only the fallback for empty channels.
        const latestActivity = Number(latestMessage?.timestamp) || Number(channel.lastActivity) || 0;
        return latestActivity > lastReadTime;
      }).map(channel => ({ id: channel.id, name: channel.name, count: 'New' }));
      return [communityId, { name: community?.name, channels: unreadChannels }];
    }));
    const counts = Object.fromEntries(communityResults);
    return counts;
  });
}

// Count unread @ mentions separately so the UI can show a number for mentions
// and only a dot for ordinary unread channel activity.
// Shared mention-count core: returns { channelId: { count, communityId } } for
// every text channel with unread mentions of the current user, respecting
// mute preferences and per-channel notification modes.
async function unreadMentionCountsPerChannel(uid, communityIds) {
  if (!uid || !communityIds.length || !db) return {};
  const userSnap = await getDoc(doc(firestore, 'users', uid));
  const profile = userSnap.exists() ? userSnap.data() : {};
  const preferences = profile.notificationPreferences || {};
  const currentDisplayName = (profile.displayName || '').trim().toLowerCase();
  const communityChannels = await Promise.all(communityIds
    .filter(communityId => !preferences.communityMuted?.[communityId])
    .map(getChannels));
  const channels = communityChannels.flat().filter(channel => channel.type !== 'voice');
  const results = await Promise.all(channels.map(async channel => {
    const mode = preferences.channelModes?.[channel.id] || 'mentions';
    if (mode === 'none') return 0;
    const lastReadSnap = await getDoc(doc(firestore, 'users', uid, 'lastRead', channel.id));
    const lastReadTime = lastReadSnap.exists() ? lastReadSnap.data().timestamp : 0;
    const messagesSnap = await get(rtdbQuery(ref(db, `messages/${channel.id}`), orderByChild('timestamp'), startAt(lastReadTime + 1), limitToLast(300)));
    const messages = messagesSnap.exists() ? Object.values(messagesSnap.val()) : [];
    return messages.filter(message => {
      if (!message || message.authorUid === uid) return false;
      // Replies to you count exactly like an @mention: they put a number on the
      // unread badge and are announced.
      return mentionsUser(message.text, currentDisplayName) || message.replyTo?.authorUid === uid;
    }).length;
  }));
  const perChannel = {};
  channels.forEach((channel, index) => {
    if (results[index] > 0) perChannel[channel.id] = { count: results[index], communityId: channel.communityId };
  });
  return perChannel;
}

export async function getUnreadMentionCountsByCommunity(uid, communityIds = []) {
  if (!uid || !communityIds.length) return {};
  return cached(`unread-mentions:${uid}:by-community:${communityIds.join(',')}`, async () => {
    const perChannel = await unreadMentionCountsPerChannel(uid, communityIds);
    const byCommunity = {};
    Object.values(perChannel).forEach(({ count, communityId }) => {
      byCommunity[communityId] = (byCommunity[communityId] || 0) + count;
    });
    return byCommunity;
  });
}

export async function getUnreadMentionCounts(uid, communityIds = []) {
  const byCommunity = await getUnreadMentionCountsByCommunity(uid, communityIds);
  return Object.values(byCommunity).reduce((sum, count) => sum + count, 0);
}

// Marks every text channel in a community as read for the user.
export async function markAllChannelsRead(uid, communityId) {
  const channels = await getChannels(communityId);
  const textChannels = channels.filter(channel => channel.type !== 'voice');
  // The marker has to cover the newest message actually in each channel, not
  // just this device's clock: a message written by a device running ahead would
  // otherwise stay unread after "mark all as read".
  const latestTimestamps = db
    ? await Promise.all(textChannels.map(channel => get(
      rtdbQuery(ref(db, `messages/${channel.id}`), orderByChild('timestamp'), limitToLast(1))
    ).then(snapshot => {
      const latest = snapshot.exists() ? Object.values(snapshot.val() || {})[0] : null;
      return Number(latest?.timestamp) || 0;
    }).catch(() => 0)))
    : [];
  const timestamp = Date.now();
  await Promise.all(textChannels.map((channel, index) => setDoc(
    doc(collection(doc(firestore, 'users', uid), 'lastRead'), channel.id),
    { timestamp: Math.max(timestamp, latestTimestamps[index] || 0) },
    { merge: true }
  )));
  clearSessionCache(`unread:${uid}`);
  clearSessionCache(`unread-mentions:${uid}`);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('blink:unread-changed', { detail: { uid, communityId } }));
  }
}

export async function searchUsers(searchTerm, currentUid) {
  const users = await cached('users:directory', async () => {
    const snapshot = await getDocs(collection(firestore, 'users'));
    return snapshot.docs.map(userDoc => ({ uid: userDoc.id, ...userDoc.data() }));
  });
  const normalizedTerm = searchTerm.trim().toLowerCase();
  if (!normalizedTerm) return [];
  return users
    .filter(user => user.uid !== currentUid)
    .filter(user => user.displayName?.toLowerCase().includes(normalizedTerm) || user.email?.toLowerCase().includes(normalizedTerm))
    .slice(0, 8);
}

// Exact-name lookup used for friend requests: the display name has to match in
// full (case and surrounding spaces ignored). Substring search made it easy to
// enumerate people you had never spoken to, so friend requests no longer get a
// fuzzy match to work from.
export async function findUserByExactDisplayName(displayName, currentUid) {
  const normalized = String(displayName || '').trim().toLowerCase();
  if (!normalized) return null;
  const users = await cached('users:directory', async () => {
    const snapshot = await getDocs(collection(firestore, 'users'));
    return snapshot.docs.map(userDoc => ({ uid: userDoc.id, ...userDoc.data() }));
  });
  return users.find(user => user.uid !== currentUid && String(user.displayName || '').trim().toLowerCase() === normalized) || null;
}

export function privateConversationId(firstUid, secondUid) {
  return [firstUid, secondUid].sort().join('_');
}

// A brand-new private conversation has no RTDB node until the first message is
// sent, and reading messages of a non-existent conversation is denied by the
// rules. Call this when a new PM is opened so the members/participants
// metadata exists before the messages subscription attaches. The transaction
// writes nothing when the conversation already exists (keeps lastMessage and
// friends intact), and the fallback below merges member flags only, so an
// existing conversation cannot be overwritten even if its index entry is
// missing.
export async function ensurePrivateConversation(conversationId, firstUid, secondUid, participants = {}) {
  if (!db) return;
  const sortedMembers = [firstUid, secondUid].sort();
  const conversationRef = ref(db, `privateConversations/${conversationId}`);
  const freshConversation = {
    members: { [sortedMembers[0]]: true, [sortedMembers[1]]: true },
    participants,
    updatedAt: 0
  };

  try {
    await runDatabaseTransaction(conversationRef, current => {
      if (current) return undefined; // already exists — leave it alone
      return freshConversation;
    });
    return;
  } catch (error) {
    // A brand-new conversation has no node yet, and the RTDB rules only let a
    // member read an existing conversation, so the transaction's read is
    // denied by design. Fall through to a direct create below; only that
    // permission denial is recoverable, everything else is a real failure.
    if (error?.code !== 'PERMISSION_DENIED') throw error;
  }

  // The per-user index is readable by its owner and is absent for a brand-new
  // conversation, so it is a safe check before creating.
  const indexRef = ref(db, `privateConversationsByUser/${firstUid}/${conversationId}`);
  const indexSnap = await get(indexRef).catch(() => null);
  if (indexSnap?.exists()) return;

  // Merge, never set. `update` writes each member flag and each participant
  // entry as its own child path, so this can never wipe a conversation that
  // exists but whose index entry was missing (a stale index, a failed index
  // write, or a second client racing us): lastMessage, updatedAt, messages and
  // the other participant's profile stay exactly as they were. `set` here would
  // have replaced the whole node with the empty template above.
  const patch = {
    [`members/${sortedMembers[0]}`]: true,
    [`members/${sortedMembers[1]}`]: true
  };
  for (const [uid, profile] of Object.entries(participants || {})) {
    if (uid !== sortedMembers[0] && uid !== sortedMembers[1]) continue;
    patch[`participants/${uid}`] = profile;
  }

  try {
    await update(conversationRef, patch);
  } catch (error) {
    // A concurrent writer created it first; its metadata wins.
    if (error?.code !== 'PERMISSION_DENIED') throw error;
  }
}

export async function getPrivateConversations(uid) {
  return cached(`private-conversations:${uid}`, async () => {
    if (!db) return [];
    const indexSnap = await get(ref(db, `privateConversationsByUser/${uid}`));
    const conversationIds = indexSnap.exists() ? Object.keys(indexSnap.val()) : [];
    if (!conversationIds.length) return [];
    const indexData = indexSnap.val() || {};
    const conversations = await Promise.all(
      conversationIds.map(async id => {
        try {
          const snap = await get(ref(db, `privateConversations/${id}`));
          return snap.exists() ? { id, ...snap.val(), lastReadAt: indexData[id]?.lastReadAt || 0 } : null;
        } catch {
          // A stale index entry whose conversation is gone (or a conversation
          // this account is no longer a member of) must not fail the whole
          // list: skip that row instead of throwing permission_denied.
          return null;
        }
      })
    );
    const filtered = conversations.filter(Boolean);
    filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return filtered;
  });
}

export function subscribeToPrivateConversations(uid, callback, onError) {
  if (!db) return () => {};
  const activeSubscriptions = new Map();

  const cleanup = () => {
    activeSubscriptions.forEach(entry => entry.unsub?.());
    activeSubscriptions.clear();
  };

  const indexRef = ref(db, `privateConversationsByUser/${uid}`);
  const unsubscribe = onValue(indexRef, snapshot => {
    const indexData = snapshot.val() || {};
    const currentIds = new Set(Object.keys(indexData));

    activeSubscriptions.forEach((unsub, id) => {
      if (!currentIds.has(id)) {
        unsub.unsub?.();
        activeSubscriptions.delete(id);
      }
    });

    const conversations = [];
    let pending = currentIds.size;

    if (pending === 0) {
      cacheValue(`private-conversations:${uid}`, []);
      callback([]);
      return;
    }

    const checkDone = () => {
      pending -= 1;
      if (pending === 0) {
        conversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        cacheValue(`private-conversations:${uid}`, conversations);
        callback(conversations);
      }
    };

    currentIds.forEach(id => {
      if (activeSubscriptions.has(id)) {
        const existingEntry = activeSubscriptions.get(id);
        if (existingEntry.lastData) conversations.push({ id, ...existingEntry.lastData, lastReadAt: indexData[id]?.lastReadAt || 0 });
        checkDone();
        return;
      }

      const convRef = ref(db, `privateConversations/${id}`);
      const subscription = { unsub: null, lastData: null };
      activeSubscriptions.set(id, subscription);
      const unsub = onValue(convRef, snap => {
        if (snap.exists()) {
          const data = snap.val();
          subscription.lastData = data;
        } else {
          activeSubscriptions.delete(id);
        }
        const updated = [];
        activeSubscriptions.forEach((entry, convId) => {
          if (entry.lastData) updated.push({ id: convId, ...entry.lastData, lastReadAt: indexData[convId]?.lastReadAt || 0 });
        });
        updated.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        cacheValue(`private-conversations:${uid}`, updated);
        callback(updated);
      });
      subscription.unsub = unsub;
    });
  }, error => {
    console.warn('Private conversations subscription error:', error);
    onError?.(error);
  });

  return () => {
    unsubscribe();
    cleanup();
  };
}

export function subscribeToPrivateMessages(conversationId, callback, onError) {
  if (!db) return () => {};
  const messagesRef = ref(db, `privateConversations/${conversationId}/messages`);
  let unsubscribe = null;
  let retryTimer = null;
  let attempts = 0;
  let active = true;
  const listen = () => {
    if (!active) return;
    unsubscribe = onValue(messagesRef, snapshot => {
      attempts = 0;
    const data = snapshot.val();
    const messages = data
      ? Object.entries(data).map(([id, message]) => ({ id, ...message }))
      : [];
    messages.sort(compareMessages);
      callback(messages);
    }, error => {
      if (!active) return;
      // A newly-created PM is selected before its metadata write completes.
      // Retry quietly until the conversation becomes readable instead of
      // surfacing a transient permission_denied error to users.
      if (error?.code === 'PERMISSION_DENIED' && attempts < 12) {
        unsubscribe?.();
        unsubscribe = null;
        attempts += 1;
        retryTimer = window.setTimeout(listen, 500);
        return;
      }
      console.warn('Private messages subscription error:', error);
      onError?.(error);
    });
  };
  listen();
  return () => {
    active = false;
    if (retryTimer) window.clearTimeout(retryTimer);
    unsubscribe?.();
  };
}

export async function sendPrivateMessage(conversationId, senderUid, recipientUid, text, participants = {}, attachment = null, invite = null, replyTo = null) {
  const trimmedText = text.trim();
  if (!trimmedText && !attachment?.url && !invite?.communityId) return;
  // The security rules require non-empty text on every private message, so an
  // attachment sent on its own travels under its file name (the bubble hides it
  // when it matches the attachment name).
  // `text` stays the stored fallback (rules require it), while the attachment or
  // invite object is what the UI renders in its place.
  const storedText = trimmedText || attachment?.name || (invite?.name ? `Shared ${invite.name}` : '') || 'Attachment';

  // Privacy is decided in one place (services/friends) so the Message button
  // and the send path cannot disagree. RTDB rules cannot read Firestore, so
  // this is the enforcement point, exactly like the old blockPrivateMessages
  // flag it replaces.
  const [recipientProfile, senderProfile] = await Promise.all([
    getUserProfile(recipientUid),
    getUserProfile(senderUid)
  ]);
  const privacy = await canSendPrivateMessage(senderUid, recipientUid, { recipientProfile, senderProfile });
  if (!privacy.allowed) {
    throw new Error(privacy.reason === 'blocked'
      ? 'This user is not accepting your messages.'
      : privacy.reason === 'youBlocked'
        ? 'Unblock this user before messaging them.'
        : privacy.reason === 'privacy'
          ? 'This user only accepts messages from their friends.'
          : 'You cannot message this user.');
  }

  if (!db) throw new Error('Realtime Database is not configured');

  const sortedMembers = [senderUid, recipientUid].sort();

  const conversationRef = ref(db, `privateConversations/${conversationId}`);
  // Update conversation metadata without replacing the existing messages
  // collection. A root-level set() here used to erase the conversation history.
  // updatedAt is server-stamped too: it drives the conversation list order and
  // the unread comparison, so it must not carry the sender's clock skew.
  await update(conversationRef, {
    members: { [sortedMembers[0]]: true, [sortedMembers[1]]: true },
    participants,
    lastMessage: storedText,
    lastSenderUid: senderUid,
    updatedAt: serverTimestamp()
  });

  const messageRef = push(ref(db, `privateConversations/${conversationId}/messages`));
  // Server-stamped like channel messages, so a skewed device clock cannot
  // reorder one person's private messages against the other's.
  await set(messageRef, {
    senderUid,
    text: storedText,
    timestamp: serverTimestamp(),
    ...(attachment?.url ? { attachment: { url: attachment.url, name: attachment.name || 'Attachment', size: Number(attachment.size) || 0 } } : {}),
    ...(replyTo?.id ? {
      replyTo: {
        id: String(replyTo.id),
        authorUid: String(replyTo.authorUid || ''),
        authorName: String(replyTo.authorName || '').slice(0, 64),
        text: String(replyTo.text || '').slice(0, 500)
      }
    } : {}),
    ...(invite?.communityId ? {
      invite: {
        communityId: invite.communityId,
        name: cleanNickname(invite.name || 'Community'),
        description: String(invite.description || '').slice(0, 300),
        isPrivate: Boolean(invite.isPrivate),
        joincode: invite.isPrivate ? String(invite.joincode || '') : ''
      }
    } : {})
  });

  // Same server clock as updatedAt, so the sender's own conversation cannot
  // look unread because the two were stamped by different clocks.
  await update(ref(db, `privateConversationsByUser/${senderUid}/${conversationId}`), { lastReadAt: serverTimestamp() });
  await update(ref(db, `privateConversationsByUser/${recipientUid}/${conversationId}`), { lastReadAt: 0 });

  clearSessionCache(`private-conversations:${senderUid}`);
  clearSessionCache(`private-conversations:${recipientUid}`);
}

export async function markPrivateConversationRead(uid, conversationId, readThroughTimestamp = Date.now()) {
  if (!db) return;
  const readRef = ref(db, `privateConversationsByUser/${uid}/${conversationId}/lastReadAt`);
  await runDatabaseTransaction(readRef, currentValue => Math.max(Number(currentValue || 0), Number(readThroughTimestamp) || Date.now()));
  clearSessionCache(`private-conversations:${uid}`);
}

// Reactions live on the message like channel reactions do; the rule change lets
// the recipient write only inside `reactions`, never to the message itself.
export async function togglePrivateReaction(conversationId, messageId, emoji, uid, currentlyReacted) {
  if (!db || !conversationId || !messageId || !emoji || !uid) return;
  await set(ref(db, `privateConversations/${conversationId}/messages/${messageId}/reactions/${emoji}/${uid}`), currentlyReacted ? null : true);
}

export async function editPrivateMessage(conversationId, messageId, newText) {
  if (!db || !conversationId || !messageId) return;
  const trimmed = newText.trim();
  // Only `text` is written: the conversation's members, timestamp and sender
  // stay untouched, which is what the RTDB rule for a sender edit allows.
  await set(ref(db, `privateConversations/${conversationId}/messages/${messageId}/text`), trimmed);
  // Keep the conversation list preview (and its sort key) in step when the
  // edited message is the newest one in the thread.
  try {
    const snapshot = await get(ref(db, `privateConversations/${conversationId}/messages`));
    const messages = snapshot.exists()
      ? Object.entries(snapshot.val() || {}).map(([id, message]) => ({ id, ...message }))
      : [];
    const newest = messages.sort(compareMessages).at(-1);
    if (newest?.id === messageId) {
      await update(ref(db, `privateConversations/${conversationId}`), { lastMessage: trimmed });
    }
  } catch (error) {
    console.warn('Could not refresh the conversation preview:', error);
  }
}

export async function deletePrivateMessage(conversationId, messageId) {
  if (!db) return;
  const messagesRef = ref(db, `privateConversations/${conversationId}/messages`);
  await remove(ref(db, `privateConversations/${conversationId}/messages/${messageId}`));
  // Removing the newest message used to leave its text as the conversation
  // preview (and its timestamp as updatedAt), so the sidebar and the
  // conversation list kept advertising a message that no longer existed.
  let remaining;
  try {
    const snapshot = await get(messagesRef);
    remaining = snapshot.exists() ? Object.values(snapshot.val() || {}).filter(Boolean) : [];
  } catch (error) {
    console.warn('Could not refresh the conversation preview:', error);
    return;
  }
  const newest = remaining.sort((first, second) => (Number(second?.timestamp) || 0) - (Number(first?.timestamp) || 0))[0];
  try {
    await update(ref(db, `privateConversations/${conversationId}`), {
      lastMessage: newest?.text || null,
      lastSenderUid: newest?.senderUid || null,
      updatedAt: Number(newest?.timestamp) || 0
    });
  } catch (error) {
    console.warn('Could not refresh the conversation preview:', error);
  }
}

// User Profile
export async function updateUserProfile(uid, data) {
  await updateDoc(doc(firestore, 'users', uid), data);
  sessionCache.delete(`user:${uid}`);
}

export async function setCommunityMuted(uid, communityId, muted) {
  await updateDoc(doc(firestore, 'users', uid), {
    [`notificationPreferences.communityMuted.${communityId}`]: Boolean(muted)
  });
  sessionCache.delete(`user:${uid}`);
}

export async function setChannelNotificationMode(uid, channelId, mode) {
  const validModes = ['none', 'mentions', 'all'];
  await updateDoc(doc(firestore, 'users', uid), {
    [`notificationPreferences.channelModes.${channelId}`]: validModes.includes(mode) ? mode : 'mentions'
  });
  sessionCache.delete(`user:${uid}`);
}

// Nicknames ride on the owner's own user document: `users` is already readable
// to signed-in members (that is how member lists resolve names) and the profile
// update rule allows additional fields, so no rules change is needed. A
// nickname never replaces the account display name, which is what @mentions
// match on and what friend lookup searches.
export async function setCommunityNickname(uid, communityId, nickname) {
  if (!uid || !communityId) return;
  const value = cleanNickname(nickname);
  await updateDoc(doc(firestore, 'users', uid), {
    [`communityNicknames.${communityId}`]: value || deleteField()
  });
  sessionCache.delete(`user:${uid}`);
  sessionCache.delete(`members:${communityId}`);
}

export async function setFriendNickname(uid, otherUid, nickname) {
  if (!uid || !otherUid) return;
  const value = cleanNickname(nickname);
  await updateDoc(doc(firestore, 'users', uid), {
    [`friendNicknames.${otherUid}`]: value || deleteField()
  });
  sessionCache.delete(`user:${uid}`);
}

export async function getUserProfile(uid) {
  if (!uid) return null;
  return cached(`user:${uid}`, async () => {
    const docSnap = await getDoc(doc(firestore, 'users', uid));
    return docSnap.exists() ? { uid: docSnap.id, ...docSnap.data() } : null;
  });
}
