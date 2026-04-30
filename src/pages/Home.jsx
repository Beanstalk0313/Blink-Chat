import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUnreadCounts, getCommunity } from '../services/db';
import styles from './Home.module.css';
import { Link } from 'react-router-dom';

export default function Home() {
  const { currentUser } = useAuth();
  const [unreadData, setUnreadData] = useState({});
  const [joinedCommunities, setJoinedCommunities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (currentUser?.profile?.joinedCommunities) {
        // Fetch unreads
        const uData = await getUnreadCounts(currentUser.uid, currentUser.profile.joinedCommunities);
        setUnreadData(uData);

        // Fetch community details
        const cData = await Promise.all(
          currentUser.profile.joinedCommunities.map(id => getCommunity(id))
        );
        setJoinedCommunities(cData.filter(c => c !== null));
      }
      setLoading(false);
    }
    fetchData();
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
          <h2 className="text-headline-md">My Communities</h2>
          {loading ? (
            <p>Loading communities...</p>
          ) : joinedCommunities.length > 0 ? (
            <div className={styles.communitiesGrid}>
              {joinedCommunities.map(comm => (
                <Link to={`/channels/${comm.id}`} key={comm.id} className={styles.communityCard}>
                  <div className={styles.commIconWrapper}>
                    {comm.iconBase64 ? (
                      <img src={comm.iconBase64} alt={comm.name} />
                    ) : (
                      <div className={styles.commIconPlaceholder}>{comm.name.charAt(0).toUpperCase()}</div>
                    )}
                  </div>
                  <span className="text-label-md">{comm.name}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>You haven't joined any communities yet.</p>
              <Link to="/discover" className={styles.discoverBtn}>Explore Communities</Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
