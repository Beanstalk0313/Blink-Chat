import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUnreadCounts } from '../services/db';
import styles from './Home.module.css';
import { Link } from 'react-router-dom';

export default function Home() {
  const { currentUser } = useAuth();
  const [unreadData, setUnreadData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUnreads() {
      if (currentUser?.profile?.joinedCommunities) {
        const data = await getUnreadCounts(currentUser.uid, currentUser.profile.joinedCommunities);
        setUnreadData(data);
      }
      setLoading(false);
    }
    fetchUnreads();
  }, [currentUser]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className="text-display-xl">Welcome back, {currentUser?.displayName}</h1>
        <p className="text-body-lg text-tertiary">Here's what's happening in your communities.</p>
      </div>

      <div className={styles.content}>
        <section className={styles.section}>
          <h2 className="text-headline-md">Unread Messages</h2>
          {loading ? (
            <p>Loading updates...</p>
          ) : Object.keys(unreadData).length > 0 ? (
            <div className={styles.unreadList}>
              {Object.entries(unreadData).map(([commId, data]) => (
                data.channels.length > 0 && (
                  <div key={commId} className={styles.communityGroup}>
                    <h3 className="text-label-md">{data.name}</h3>
                    <div className={styles.channels}>
                      {data.channels.map(channel => (
                        <Link 
                          to={`/channels/${commId}/${channel.id}`} 
                          key={channel.id} 
                          className={styles.channelLink}
                        >
                          <span className="material-symbols-outlined">tag</span>
                          <span className={styles.channelName}>{channel.name}</span>
                          <span className={styles.badge}>New</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )
              ))}
              {Object.values(unreadData).every(d => d.channels.length === 0) && (
                <div className={styles.emptyState}>
                  <span className="material-symbols-outlined" style={{ fontSize: '48px' }}>auto_awesome</span>
                  <p>You're all caught up!</p>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>You haven't joined any communities yet.</p>
              <Link to="/discover" className={styles.discoverBtn}>Explore Communities</Link>
            </div>
          )}
        </section>

        <section className={styles.section}>
          <h2 className="text-headline-md">Quick Actions</h2>
          <div className={styles.actionsGrid}>
            <Link to="/create-community" className={styles.actionCard}>
              <span className="material-symbols-outlined">add_circle</span>
              <span>Create Community</span>
            </Link>
            <Link to="/discover" className={styles.actionCard}>
              <span className="material-symbols-outlined">explore</span>
              <span>Find Communities</span>
            </Link>
            <Link to="/settings" className={styles.actionCard}>
              <span className="material-symbols-outlined">settings</span>
              <span>Settings</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
