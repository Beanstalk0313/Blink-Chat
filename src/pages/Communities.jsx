import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getCommunity } from '../services/db';
import styles from './Communities.module.css';
import { Link } from 'react-router-dom';

export default function Communities() {
  const { currentUser } = useAuth();
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCommunities() {
      if (currentUser?.profile?.joinedCommunities) {
        const coms = await Promise.all(
          currentUser.profile.joinedCommunities.map(id => getCommunity(id))
        );
        setCommunities(coms.filter(c => c !== null));
      }
      setLoading(false);
    }
    loadCommunities();
  }, [currentUser]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className="text-display-xl">Your Communities</h1>
        <p className="text-body-lg text-tertiary">All the places you belong.</p>
      </div>

      {loading ? (
        <p>Loading communities...</p>
      ) : (
        <div className={styles.grid}>
          {communities.map(comm => (
            <Link to={`/channels/${comm.id}`} key={comm.id} className={styles.card}>
              <div className={styles.iconWrapper}>
                {comm.iconBase64 ? (
                  <img src={comm.iconBase64} alt={comm.name} className={styles.icon} />
                ) : (
                  <div className={styles.iconPlaceholder}>
                    <span className="material-symbols-outlined">groups</span>
                  </div>
                )}
              </div>
              <div className={styles.info}>
                <h3 className="text-headline-md">{comm.name}</h3>
                <p className="text-body-md text-tertiary">{comm.description?.substring(0, 80)}...</p>
              </div>
              <div className={styles.actions}>
                <button 
                  className={styles.shareBtn} 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const url = `http://blink.chats.cf/join/${comm.id}`;
                    navigator.clipboard.writeText(url);
                    alert('Community link copied to clipboard!');
                  }}
                  title="Copy Community Link"
                >
                  <span className="material-symbols-outlined">share</span>
                </button>
                <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>arrow_forward</span>
              </div>
            </Link>
          ))}
          {communities.length === 0 && (
            <div className={styles.empty}>
              <p>You haven't joined any communities yet.</p>
              <Link to="/discover" className={styles.discoverBtn}>Discover Communities</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
