import React, { useEffect, useState } from 'react';
import { getPublicCommunities, joinCommunity } from '../services/db';
import { useAuth } from '../contexts/AuthContext';
import styles from './Discover.module.css';
import { useNavigate } from 'react-router-dom';

export default function Discover() {
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    async function loadCommunities() {
      const data = await getPublicCommunities();
      setCommunities(data);
      setLoading(false);
    }
    loadCommunities();
  }, []);

  const handleJoin = async (communityId) => {
    try {
      await joinCommunity(currentUser.uid, communityId);
      navigate(`/channels/${communityId}`);
    } catch (err) {
      console.error(err);
      alert('Failed to join community');
    }
  };

  return (
    <div className={styles.discoverContainer}>
      <div className={styles.header}>
        <h1 className="text-display-xl">Discover</h1>
        <p className="text-body-lg text-tertiary">Find your next favorite community.</p>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading communities...</div>
      ) : (
        <div className={styles.grid}>
          {communities.map((comm) => {
            const hasJoined = currentUser?.profile?.joinedCommunities?.includes(comm.id);
            return (
              <div key={comm.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  {comm.iconBase64 ? (
                    <img src={comm.iconBase64} alt={comm.name} className={styles.icon} />
                  ) : (
                    <div className={styles.iconPlaceholder}>
                      <span className="material-symbols-outlined">groups</span>
                    </div>
                  )}
                  <div>
                    <h3 className="text-headline-md">{comm.name}</h3>
                    <p className="text-label-sm text-tertiary">Public Community</p>
                  </div>
                </div>
                <p className={`${styles.description} text-body-md`}>{comm.description}</p>
                <div className={styles.cardActions}>
                  <button 
                    onClick={() => hasJoined ? navigate(`/channels/${comm.id}`) : handleJoin(comm.id)}
                    className={styles.joinBtn}
                  >
                    {hasJoined ? 'Go to Community' : 'Join'}
                  </button>
                  <button 
                    className={styles.shareBtn}
                    onClick={() => {
                      const url = `http://blink.chats.cf/join/${comm.id}`;
                      navigator.clipboard.writeText(url);
                      alert('Community link copied to clipboard!');
                    }}
                    title="Copy Community Link"
                  >
                    <span className="material-symbols-outlined">share</span>
                  </button>
                </div>
              </div>
            );
          })}
          {communities.length === 0 && (
            <div className={styles.emptyState}>No public communities found.</div>
          )}
        </div>
      )}
    </div>
  );
}
