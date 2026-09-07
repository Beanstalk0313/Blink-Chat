import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import { app, firebaseConfig } from './firebase';

let firestore = null;
let db = null;

try {
  if (app) firestore = getFirestore(app);
  if (app && firebaseConfig.databaseURL) db = getDatabase(app);
} catch (error) {
  console.warn('Firebase data services are unavailable:', error);
}

export { firestore, db };
