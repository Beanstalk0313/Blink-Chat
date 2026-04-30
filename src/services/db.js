import { firestore, db } from '../firebase/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import { ref, push, set, onValue, serverTimestamp as rtdbTimestamp } from 'firebase/database';

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
    coAdmins: [],
    createdAt: new Date().toISOString()
  });

  // Create default general channel
  await createChannel(newCommunityRef.id, 'general', 'text');

  // Add admin to community
  await joinCommunity(adminUid, newCommunityRef.id);

  return { id: newCommunityRef.id, inviteCode };
}

export async function joinCommunity(uid, communityId) {
  const userRef = doc(firestore, 'users', uid);
  await updateDoc(userRef, {
    joinedCommunities: arrayUnion(communityId)
  });
}

export async function getPublicCommunities() {
  const q = query(collection(firestore, 'communities'), where('isPrivate', '==', false));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function getCommunity(communityId) {
  const docSnap = await getDoc(doc(firestore, 'communities', communityId));
  return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
}

export async function updateCommunity(communityId, data) {
  const ref = doc(firestore, 'communities', communityId);
  await updateDoc(ref, data);
}

// Channels
export async function createChannel(communityId, name, type = 'text') {
  const newChannelRef = doc(collection(firestore, 'channels'));
  await setDoc(newChannelRef, {
    communityId,
    name,
    type,
    createdAt: new Date().toISOString(),
    lastActivity: Date.now()
  });
  return newChannelRef.id;
}

export async function updateChannel(channelId, data) {
  const ref = doc(firestore, 'channels', channelId);
  await updateDoc(ref, data);
}

export async function deleteChannel(channelId) {
  const ref = doc(firestore, 'channels', channelId);
  // Optional: Delete messages in RTDB too
  await updateDoc(ref, { deleted: true }); // Soft delete for now
}

export async function getChannels(communityId) {
  const q = query(collection(firestore, 'channels'), where('communityId', '==', communityId));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(c => !c.deleted);
}

// Members
export async function getCommunityMembers(communityId) {
  const q = query(collection(firestore, 'users'), where('joinedCommunities', 'array-contains', communityId));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
}

export async function kickUser(communityId, uid) {
  const userRef = doc(firestore, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    const joined = userSnap.data().joinedCommunities || [];
    await updateDoc(userRef, {
      joinedCommunities: joined.filter(id => id !== communityId)
    });
  }
}

export async function banUser(communityId, uid) {
  await kickUser(communityId, uid);
  const commRef = doc(firestore, 'communities', communityId);
  await updateDoc(commRef, {
    bannedUsers: arrayUnion(uid)
  });
}

// Pinned Communities
export async function togglePinCommunity(uid, communityId) {
  const userRef = doc(firestore, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    const profile = userSnap.data().profile || {};
    const pinned = profile.pinnedCommunities || [];
    const isPinned = pinned.includes(communityId);
    
    if (!isPinned && pinned.length >= 5) {
      throw new Error("Maximum 5 pinned communities allowed");
    }

    await updateDoc(userRef, {
      'profile.pinnedCommunities': isPinned 
        ? pinned.filter(id => id !== communityId) 
        : arrayUnion(communityId)
    });
  }
}

// Messages
export function sendMessage(channelId, text, authorUid, fileUrl = null, fileName = null) {
  const messagesRef = ref(db, `messages/${channelId}`);
  const newMessageRef = push(messagesRef);
  const timestamp = Date.now();
  
  set(newMessageRef, {
    id: newMessageRef.key,
    text,
    authorUid,
    timestamp,
    fileUrl,
    fileName,
    isPinned: false
  });

  updateDoc(doc(firestore, 'channels', channelId), {
    lastActivity: timestamp
  });

  return newMessageRef;
}

export async function togglePinMessage(channelId, messageId, currentStatus) {
  const messageRef = ref(db, `messages/${channelId}/${messageId}`);
  await set(ref(db, `messages/${channelId}/${messageId}/isPinned`), !currentStatus);
}

export function subscribeToMessages(channelId, callback) {
  const messagesRef = ref(db, `messages/${channelId}`);
  return onValue(messagesRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const msgs = Object.entries(data).map(([id, msg]) => ({ id, ...msg }));
      callback(msgs.sort((a, b) => a.timestamp - b.timestamp));
    } else {
      callback([]);
    }
  });
}

// Unread tracking
export async function updateLastRead(uid, channelId) {
  const userRef = doc(firestore, 'users', uid);
  await setDoc(doc(collection(userRef, 'lastRead'), channelId), {
    timestamp: Date.now()
  }, { merge: true });
}

export async function getUnreadCounts(uid, communityIds) {
  const counts = {};
  
  for (const communityId of communityIds) {
    const channels = await getChannels(communityId);
    counts[communityId] = {
      name: (await getCommunity(communityId))?.name,
      channels: []
    };

    for (const channel of channels) {
      const lastReadDoc = await getDoc(doc(firestore, 'users', uid, 'lastRead', channel.id));
      const lastReadTime = lastReadDoc.exists() ? lastReadDoc.data().timestamp : 0;
      
      if (channel.lastActivity > lastReadTime) {
        counts[communityId].channels.push({
          id: channel.id,
          name: channel.name,
          count: 'New' // RTDB query for exact count would be expensive here, so 'New' is a good compromise
        });
      }
    }
  }
  
  return counts;
}

// User Profile
export async function updateUserProfile(uid, data) {
  const userRef = doc(firestore, 'users', uid);
  await updateDoc(userRef, data);
}

export async function getUserProfile(uid) {
  const docSnap = await getDoc(doc(firestore, 'users', uid));
  return docSnap.exists() ? docSnap.data() : null;
}
