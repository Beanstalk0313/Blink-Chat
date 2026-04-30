import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { firestore } from '../firebase/firebase';
import styles from './Admin.module.css';
import { Link } from 'react-router-dom';

export default function Admin() {
  const { currentUser } = useAuth();
  const [managedCommunities, setManagedCommunities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadManaged() {
      const q = query(collection(firestore, 'communities'), where('adminUid', '==', currentUser.uid));
      const snap = await getDocs(q);
      setManagedCommunities(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }
    loadManaged();
  }, [currentUser]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className="text-display-xl">Admin Dashboard</h1>
        <p className="text-body-lg text-tertiary">Manage the communities you've created.</p>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className={styles.list}>
          {managedCommunities.map(comm => (
            <div key={comm.id} className={styles.adminCard}>
              <div className={styles.commInfo}>
                <h3 className="text-headline-md">{comm.name}</h3>
                <p className="text-label-sm text-primary">Invite Code: {comm.inviteCode || 'Public'}</p>
              </div>
              <div className={styles.actions}>
                <Link to={`/admin/${comm.id}/settings`} className={styles.btnSecondary}>Settings</Link>
                <Link to={`/channels/${comm.id}`} className={styles.btnPrimary}>View</Link>
              </div>
            </div>
          ))}
          {managedCommunities.length === 0 && (
            <p className={styles.empty}>You don't admin any communities yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
