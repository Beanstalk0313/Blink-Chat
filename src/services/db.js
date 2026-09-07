import { firestore, db } from '../firebase/data';
import { buildMemberPermissions, migrateLegacyCommunity, normalizeRoleIds } from './permissions';
import { mentionsUser } from './utils';
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
  onSnapshot,
  deleteField,
  runTransaction
} from 'firebase/firestore';
import {
  ref,
  push,
  set,
  update,
  remove,
  onValue,
  onDisconnect,
  query as rtdbQuery,
  limitToLast,
  orderByChild,
  startAt,
  endAt,
  get,
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
    position: nextPosition,
    createdAt: new Date().toISOString(),
    lastActivity: Date.now()
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

export function subscribeToVoiceParticipants(callback) {
  if (!db) return () => {};
  return onValue(ref(db, 'voiceParticipants'), snapshot => callback(snapshot.val() || {}));
}

export function startPresence(uid) {
  if (!db || typeof window === 'undefined') return () => {};
  const connectedRef = ref(db, '.info/connected');
  const presenceRef = ref(db, `presence/${uid}`);
  const connectedUnsubscribe = onValue(connectedRef, snapshot => {
    if (snapshot.val() !== true) return;
    onDisconnect(presenceRef).set({ online: false, lastSeen: Date.now() });
    set(presenceRef, { online: true, lastSeen: Date.now() });
  });
  const heartbeat = window.setInterval(() => {
    set(presenceRef, { online: true, lastSeen: Date.now() }).catch(() => {});
  }, 60000);
  return () => {
    window.clearInterval(heartbeat);
    connectedUnsubscribe();
    set(presenceRef, { online: false, lastSeen: Date.now() }).catch(() => {});
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
export async function sendMessage(channelId, text, authorUid, attachment = null) {
  if (!db) throw new Error('Realtime Database is not configured');
  const messagesRef = ref(db, `messages/${channelId}`);
  const newMessageRef = push(messagesRef);
  const timestamp = Date.now();
  const message = {
    id: newMessageRef.key,
    text: text?.trim() || '',
    authorUid,
    timestamp,
    attachment: attachment || null,
    isPinned: false
  };
  await set(newMessageRef, message);
  // Best-effort metadata only: the message is already stored in RTDB, so a
  // Firestore hiccup here must not make the UI report the message as failed.
  updateDoc(doc(firestore, 'channels', channelId), { lastActivity: timestamp }).catch(error => {
    console.warn('Could not update channel activity:', error);
  });
  return newMessageRef;
}

export async function editMessage(channelId, messageId, newText) {
  const result = await set(ref(db, `messages/${channelId}/${messageId}/text`), newText.trim());
  updateDoc(doc(firestore, 'channels', channelId), { lastActivity: Date.now() }).catch(error => {
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

// Session-scoped cache of channel messages so reopening a channel does not re-read everything.
const messagesCache = new Map(); // channelId -> { messages, oldestTimestamp, newestTimestamp, lastLimit }

function messagesAreEqual(firstMessages, secondMessages) {
  if (firstMessages.length !== secondMessages.length) return false;
  return firstMessages.every((message, index) => {
    const other = secondMessages[index];
    return message.id === other.id
      && message.text === other.text
      && message.timestamp === other.timestamp
      && message.authorUid === other.authorUid
      && message.isPinned === other.isPinned
      && JSON.stringify(message.attachment || null) === JSON.stringify(other.attachment || null);
  });
}

function mergeMessagesById(...groups) {
  const byId = new Map();
  for (const group of groups) {
    for (const message of group) {
      if (message && message.id) byId.set(message.id, message);
    }
  }
  // RTDB push IDs contain a millisecond timestamp plus a monotonic/random
  // suffix, and are the only ordering key shared consistently by devices.
  return [...byId.values()].sort((first, second) => String(first.id).localeCompare(String(second.id)));
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
    const merged = mergeMessagesById(cachedMessages, fresh);
    const previousMessages = messagesCache.get(channelId)?.messages || cachedMessages;
    messagesCache.set(channelId, {
      messages: merged,
      oldestTimestamp: merged.length ? merged[0].timestamp || 0 : 0,
      newestTimestamp: merged.length ? merged[merged.length - 1].timestamp || 0 : 0,
      lastLimit: Math.max(entry?.lastLimit || 0, limitCount)
    });
    if (!deliveredCachedMessages || !messagesAreEqual(previousMessages, merged)) callback(merged);
  });

  if (cachedMessages.length) {
    deliveredCachedMessages = true;
    callback(cachedMessages);
  }
  return unsubscribe;
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

// Unread tracking
export async function updateLastRead(uid, channelId, readThroughTimestamp = Date.now()) {
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
      const unreadChannels = textChannels.filter((channel, index) => {
        const lastReadTime = readResults[index].exists() ? readResults[index].data().timestamp : 0;
        const latestMessage = latestMessages[index]?.exists() ? Object.values(latestMessages[index].val() || {})[0] : null;
        const latestActivity = Math.max(channel.lastActivity || 0, latestMessage?.timestamp || 0);
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
export async function getUnreadMentionCountsByCommunity(uid, communityIds = []) {
  if (!uid || !communityIds.length) return {};
  return cached(`unread-mentions:${uid}:by-community:${communityIds.join(',')}`, async () => {
    const userSnap = await getDoc(doc(firestore, 'users', uid));
    const profile = userSnap.exists() ? userSnap.data() : {};
    const preferences = profile.notificationPreferences || {};
    const currentDisplayName = (profile.displayName || '').trim().toLowerCase();
    if (!db) return {};
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
        return mentionsUser(message.text, currentDisplayName);
      }).length;
    }));
    const byCommunity = {};
    channels.forEach((channel, index) => {
      const communityId = channel.communityId;
      byCommunity[communityId] = (byCommunity[communityId] || 0) + results[index];
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
  const timestamp = Date.now();
  await Promise.all(channels
    .filter(channel => channel.type !== 'voice')
    .map(channel => setDoc(doc(collection(doc(firestore, 'users', uid), 'lastRead'), channel.id), { timestamp }, { merge: true })));
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

export function privateConversationId(firstUid, secondUid) {
  return [firstUid, secondUid].sort().join('_');
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
        const snap = await get(ref(db, `privateConversations/${id}`));
        return snap.exists() ? { id, ...snap.val(), lastReadAt: indexData[id]?.lastReadAt || 0 } : null;
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
  return onValue(messagesRef, snapshot => {
    const data = snapshot.val();
    const messages = data
      ? Object.entries(data).map(([id, message]) => ({ id, ...message }))
      : [];
    messages.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    callback(messages);
  }, error => {
    console.warn('Private messages subscription error:', error);
    onError?.(error);
  });
}

export async function sendPrivateMessage(conversationId, senderUid, recipientUid, text, participants = {}) {
  const trimmedText = text.trim();
  if (!trimmedText) return;

  const recipientProfile = await getUserProfile(recipientUid);
  if (recipientProfile?.blockPrivateMessages) {
    throw new Error('This user has disabled private messages.');
  }

  if (!db) throw new Error('Realtime Database is not configured');

  const sortedMembers = [senderUid, recipientUid].sort();
  const timestamp = Date.now();

  const conversationRef = ref(db, `privateConversations/${conversationId}`);
  // Update conversation metadata without replacing the existing messages
  // collection. A root-level set() here used to erase the conversation history.
  await update(conversationRef, {
    members: { [sortedMembers[0]]: true, [sortedMembers[1]]: true },
    participants,
    lastMessage: trimmedText,
    lastSenderUid: senderUid,
    updatedAt: timestamp
  });

  const messageRef = push(ref(db, `privateConversations/${conversationId}/messages`));
  await set(messageRef, { senderUid, text: trimmedText, timestamp });

  await update(ref(db, `privateConversationsByUser/${senderUid}/${conversationId}`), { lastReadAt: timestamp });
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

export async function deletePrivateMessage(conversationId, messageId) {
  if (!db) return;
  await remove(ref(db, `privateConversations/${conversationId}/messages/${messageId}`));
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

export async function getUserProfile(uid) {
  if (!uid) return null;
  return cached(`user:${uid}`, async () => {
    const docSnap = await getDoc(doc(firestore, 'users', uid));
    return docSnap.exists() ? { uid: docSnap.id, ...docSnap.data() } : null;
  });
}
