import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { app } from '../firebase/firebase';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

let authToolsPromise;
let firestoreToolsPromise;

function getAuthTools() {
  if (!authToolsPromise) authToolsPromise = import('firebase/auth');
  return authToolsPromise;
}

function getFirestoreTools() {
  if (!firestoreToolsPromise) {
    firestoreToolsPromise = Promise.all([
      import('firebase/firestore'),
      import('../firebase/data')
    ]).then(([firestoreModule, dataModule]) => ({
      doc: firestoreModule.doc,
      setDoc: firestoreModule.setDoc,
      getDoc: firestoreModule.getDoc,
      onSnapshot: firestoreModule.onSnapshot,
      firestore: dataModule.firestore
    }));
  }
  return firestoreToolsPromise;
}

export async function createProfile(user, displayName, email) {
  const safeName = (displayName || user.displayName || email?.split('@')[0] || 'User').trim().slice(0, 40) || 'User';
  const { doc, setDoc, firestore } = await getFirestoreTools();
  await setDoc(doc(firestore, 'users', user.uid), {
    displayName: safeName,
    email: email || user.email || '',
    aboutMe: '',
    avatarBase64: '',
    joinedCommunities: [],
    pinnedCommunities: [],
    isBanned: false,
    hasAcceptedRules: false,
    hasSeenTutorial: false,
    theme: 'default',
    status: 'Online',
    createdAt: new Date().toISOString()
  });
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const authRef = useRef(null);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    let disposed = false;
    let profileUnsubscribe;
    const startupTimeout = window.setTimeout(() => setLoading(false), 8000);
    let stopPresence;

    getAuthTools().then(({ getAuth, onAuthStateChanged }) => {
      if (disposed) return;
      const auth = getAuth(app);
      authRef.current = auth;
      unsubscribeRef.current = onAuthStateChanged(auth, async user => {
        profileUnsubscribe?.();
        profileUnsubscribe = null;
        stopPresence?.();
        stopPresence = null;

        import('../services/db').then(({ clearSessionCache }) => clearSessionCache()).catch(() => {});

        if (!user) {
          setCurrentUser(null);
          setLoading(false);
          return;
        }

        setCurrentUser({
          ...user,
          displayName: user.displayName || user.email?.split('@')[0] || '',
          profile: {
            displayName: user.displayName || user.email?.split('@')[0] || '',
            email: user.email || ''
          },
          profileLoaded: false
        });
        setLoading(false);
        import('../services/db').then(({ startPresence }) => {
          if (!disposed) stopPresence = startPresence(user.uid);
        }).catch(() => {});

        try {
          const { doc, onSnapshot, getDoc, firestore } = await getFirestoreTools();
          if (disposed) return;
          const userDocRef = doc(firestore, 'users', user.uid);

          try {
            const initialSnap = await getDoc(userDocRef);
            if (!initialSnap.exists() && !disposed) {
              await createProfile(user, user.displayName, user.email);
            }
          } catch (err) {
            console.warn('Initial profile check failed:', err);
          }

          if (disposed) return;
          profileUnsubscribe = onSnapshot(userDocRef, snapshot => {
            if (snapshot.exists()) {
              setCurrentUser(previous => ({
                ...user,
                ...(previous?.uid === user.uid ? previous : {}),
                profile: snapshot.data(),
                profileLoaded: true
              }));
            } else {
              createProfile(user, user.displayName, user.email).catch(() => {});
              setCurrentUser(previous => ({
                ...user,
                ...(previous?.uid === user.uid ? previous : {}),
                profile: {
                  displayName: user.displayName || user.email?.split('@')[0] || 'User',
                  email: user.email || ''
                },
                profileLoaded: true
              }));
            }
          }, error => console.warn('Profile fetch failed:', error));
        } catch (error) {
          console.warn('Profile listener unavailable:', error);
        }
      }, error => {
        console.warn('Auth state unavailable:', error);
        setCurrentUser(null);
        setLoading(false);
      });
    }).catch(error => {
      console.warn('Firebase Auth unavailable:', error);
      setCurrentUser(null);
      setLoading(false);
    });

    return () => {
      disposed = true;
      window.clearTimeout(startupTimeout);
      unsubscribeRef.current?.();
      profileUnsubscribe?.();
      stopPresence?.();
    };
  }, []);

  const getCurrentAuth = async () => {
    const { getAuth } = await getAuthTools();
    return authRef.current || getAuth(app);
  };

  const login = async (email, password) => {
    const { signInWithEmailAndPassword } = await getAuthTools();
    return signInWithEmailAndPassword(await getCurrentAuth(), email, password);
  };

  const register = async (email, password, displayName) => {
    const { createUserWithEmailAndPassword, updateProfile } = await getAuthTools();
    const userCredential = await createUserWithEmailAndPassword(await getCurrentAuth(), email, password);
    await updateProfile(userCredential.user, { displayName });
    await createProfile(userCredential.user, displayName, email);
    return userCredential;
  };

  const loginWithGoogle = async () => {
    const { GoogleAuthProvider, signInWithPopup } = await getAuthTools();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(await getCurrentAuth(), provider);
    const { doc, getDoc, firestore } = await getFirestoreTools();
    const docRef = doc(firestore, 'users', result.user.uid);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) await createProfile(result.user, result.user.displayName, result.user.email);
    return result;
  };

  const logout = async () => {
    const { signOut } = await getAuthTools();
    return signOut(await getCurrentAuth());
  };

  const resetPassword = async email => {
    const { sendPasswordResetEmail } = await getAuthTools();
    return sendPasswordResetEmail(await getCurrentAuth(), email);
  };

  const updateEmail = async newEmail => {
    const { updateEmail: updateAuthEmail } = await getAuthTools();
    // Firebase Auth requires the User object, not the Auth service instance.
    const auth = await getCurrentAuth();
    if (!auth?.currentUser) throw new Error('You must be signed in to update your email.');
    return updateAuthEmail(auth.currentUser, newEmail);
  };

  const updatePassword = async newPassword => {
    const { updatePassword: updateAuthPassword } = await getAuthTools();
    const auth = await getCurrentAuth();
    if (!auth?.currentUser) throw new Error('You must be signed in to update your password.');
    return updateAuthPassword(auth.currentUser, newPassword);
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, login, register, logout, loginWithGoogle, resetPassword, updateEmail, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}
