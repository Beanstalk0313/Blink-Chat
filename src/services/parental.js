import { deleteDoc, doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { firestore } from '../firebase/data';

// Parental controls, without a server.
//
// The only way to attach a guardian to an account is a short-lived pairing code
// that the child's own signed-in account generates. Nothing (and nobody) can
// add controls to an account that did not hand out a code, which is what keeps
// this from being a way to take over someone else's account.
//
// Documents:
//   parentalCodes/{code}          { childUid, createdAt, expiresAt }
//   parentalLinks/{parentUid}     { parentUid, childUid, code, createdAt }
//   parentalControls/{childUid}   { childUid, parentUid, blockedCommunities, blockCommunityCreation, updatedAt }
//
// A guardian account guards one child at a time; a child has one guardian. The
// Firestore rules enforce both, along with the code requirement and the blocks
// themselves (joining a blocked community and creating communities).
export const PAIRING_CODE_TTL_MS = 15 * 60 * 1000;

// No 0/O/1/I so a code can be read aloud without ambiguity.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomPairingCode(length = 8) {
  const values = new Uint32Array(length);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
  } else {
    for (let index = 0; index < length; index += 1) values[index] = Math.floor(Math.random() * 0xffffffff);
  }
  return Array.from(values, value => CODE_ALPHABET[value % CODE_ALPHABET.length]).join('');
}

export async function createGuardianCode(childUid) {
  if (!childUid) throw new Error('Sign in before creating a pairing code.');
  const code = randomPairingCode();
  const expiresAt = Date.now() + PAIRING_CODE_TTL_MS;
  await setDoc(doc(firestore, 'parentalCodes', code), {
    childUid,
    createdAt: Date.now(),
    expiresAt
  });
  return { code, expiresAt };
}

// Parent side: claim a code the child generated on their own account.
export async function linkGuardian(parentUid, rawCode) {
  if (!parentUid) throw new Error('Sign in before linking an account.');
  const code = String(rawCode || '').trim().toUpperCase();
  if (code.length < 6) throw new Error('Enter the full pairing code.');
  const codeRef = doc(firestore, 'parentalCodes', code);
  const codeSnap = await getDoc(codeRef);
  if (!codeSnap.exists()) throw new Error('That code is not valid. Ask for a fresh one.');
  const data = codeSnap.data();
  if (Number(data.expiresAt) < Date.now()) throw new Error('That code has expired. Ask for a fresh one.');
  if (data.childUid === parentUid) throw new Error('You cannot set up parental controls on your own account.');

  const existingControls = await getDoc(doc(firestore, 'parentalControls', data.childUid)).catch(() => null);
  if (existingControls?.exists()) throw new Error('That account already has a guardian.');

  const existingLink = await getDoc(doc(firestore, 'parentalLinks', parentUid)).catch(() => null);
  if (existingLink?.exists()) throw new Error('This account is already guarding someone. Unlink that account first.');

  // Order matters: the rules create the link first, and only then allow the
  // controls document that points at it. If the second write fails, remove the
  // half-made link so the guardian is not left in a broken state.
  await setDoc(doc(firestore, 'parentalLinks', parentUid), {
    parentUid,
    childUid: data.childUid,
    code,
    createdAt: Date.now()
  });
  try {
    await setDoc(doc(firestore, 'parentalControls', data.childUid), {
      childUid: data.childUid,
      parentUid,
      blockedCommunities: [],
      blockCommunityCreation: false,
      updatedAt: Date.now()
    });
  } catch (error) {
    await deleteDoc(doc(firestore, 'parentalLinks', parentUid)).catch(() => {});
    throw error;
  }
  // Best-effort: the code is useless once claimed.
  await deleteDoc(codeRef).catch(() => {});
  return { childUid: data.childUid };
}

export async function unlinkGuardian(parentUid, childUid) {
  if (!parentUid || !childUid) return;
  await Promise.all([
    deleteDoc(doc(firestore, 'parentalLinks', parentUid)).catch(() => {}),
    deleteDoc(doc(firestore, 'parentalControls', childUid)).catch(() => {})
  ]);
}

export function subscribeToChildControls(childUid, callback) {
  if (!childUid) return () => {};
  return onSnapshot(doc(firestore, 'parentalControls', childUid), snapshot => {
    callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
  }, error => {
    console.warn('Parental controls subscription error:', error);
    callback(null);
  });
}

export function subscribeToGuardianLink(parentUid, callback) {
  if (!parentUid) return () => {};
  return onSnapshot(doc(firestore, 'parentalLinks', parentUid), snapshot => {
    callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
  }, error => {
    console.warn('Guardian link subscription error:', error);
    callback(null);
  });
}

export async function setCommunityCreationBlocked(childUid, blocked) {
  if (!childUid) return;
  await updateDoc(doc(firestore, 'parentalControls', childUid), {
    blockCommunityCreation: Boolean(blocked),
    updatedAt: Date.now()
  });
}

export async function setCommunityBlocked(childUid, communityId, blocked) {
  if (!childUid || !communityId) return;
  const snapshot = await getDoc(doc(firestore, 'parentalControls', childUid));
  if (!snapshot.exists()) throw new Error('Parental controls are no longer set up for this account.');
  const current = Array.isArray(snapshot.data().blockedCommunities) ? snapshot.data().blockedCommunities : [];
  const next = blocked
    ? [...new Set([...current, communityId])]
    : current.filter(id => id !== communityId);
  await updateDoc(doc(firestore, 'parentalControls', childUid), {
    blockedCommunities: next,
    updatedAt: Date.now()
  });
}
