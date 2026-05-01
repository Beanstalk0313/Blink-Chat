import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile,
  updateEmail as firebaseUpdateEmail,
  updatePassword as firebaseUpdatePassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { auth } from '../firebase/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { firestore } from '../firebase/firebase';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function register(email, password, displayName) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName });
    
    // Create user profile in Firestore
    await setDoc(doc(firestore, 'users', userCredential.user.uid), {
      displayName: displayName,
      email: email,
      aboutMe: '',
      avatarBase64: '',
      joinedCommunities: [],
      pinnedCommunities: [],
      isBanned: false,
      hasAcceptedRules: false,
      hasSeenTutorial: false,
      createdAt: new Date().toISOString()
    });

    return userCredential;
  }

  function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  function logout() {
    return signOut(auth);
  }

  async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Check if user profile exists
    const docRef = doc(firestore, 'users', user.uid);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      await setDoc(docRef, {
        displayName: user.displayName,
        email: user.email,
        aboutMe: '',
        avatarBase64: '',
        joinedCommunities: [],
        pinnedCommunities: [],
        isBanned: false,
        hasAcceptedRules: false,
        hasSeenTutorial: false,
        createdAt: new Date().toISOString()
      });
    }
    return result;
  }

  function resetPassword(email) {
    return sendPasswordResetEmail(auth, email);
  }

  function updateEmail(newEmail) {
    return firebaseUpdateEmail(auth.currentUser, newEmail);
  }

  function updatePassword(newPassword) {
    return firebaseUpdatePassword(auth.currentUser, newPassword);
  }

  useEffect(() => {
    let profileUnsubscribe = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }

      if (user) {
        const docRef = doc(firestore, 'users', user.uid);
        // Real-time listener for profile changes (including bans)
        import('firebase/firestore').then(({ onSnapshot }) => {
          profileUnsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
              setCurrentUser({ ...user, profile: docSnap.data() });
            } else {
              // Fallback if doc doesn't exist yet (e.g. during registration)
              setCurrentUser({ ...user, profile: {} });
            }
            setLoading(false);
          }, (err) => {
            console.warn("Profile fetch failed (check security rules):", err);
            // Still set the user so the app doesn't hang, but without profile data
            setCurrentUser(user);
            setLoading(false);
          });
        });
      } else {
        setCurrentUser(null);
        setLoading(false);
      }
    });

    // Zero-Trust: Force token refresh every 60 seconds
    const interval = setInterval(() => {
      if (auth.currentUser) {
        auth.currentUser.getIdToken(true).catch(() => {
          // If token refresh fails (user disabled/deleted), log them out
          signOut(auth);
        });
      }
    }, 60000);

    return () => {
      unsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
      clearInterval(interval);
    };
  }, []);

  const value = {
    currentUser,
    login,
    register,
    logout,
    loginWithGoogle,
    resetPassword,
    updateEmail,
    updatePassword
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
