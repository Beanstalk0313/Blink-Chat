import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUnreadCounts, getCommunity, getPublicCommunities } from '../services/db';
import styles from './Home.module.css';
import { Link } from 'react-router-dom';

export default function Home() {
  const { currentUser } = useAuth();
  const [unreadData, setUnreadData] = useState({});
  const [recentCommunities, setRecentCommunities] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        if (currentUser?.profile?.joinedCommunities) {
          // Fetch unreads
          const uData = await getUnreadCounts(currentUser.uid, currentUser.profile.joinedCommunities);
          setUnreadData(uData);

          // Fetch details for all joined communities
          const allJoinedData = await Promise.all(
            currentUser.profile.joinedCommunities.map(id => getCommunity(id))
          );
          
          // Sort by last activity (mocking or using createdAt for now as a fallback)
          // Ideally we'd have a 'lastAccessed' field in the user's community list
          const sorted = allJoinedData
            .filter(c => c !== null)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Temporary sort by creation
          
          setRecentCommunities(sorted.slice(0, 4));
        }

        // Fetch recommendations (public communities not joined)
        const publicComms = await getPublicCommunities();
        const joinedIds = currentUser?.profile?.joinedCommunities || [];
        const recs = publicComms
          .filter(c => !joinedIds.includes(c.id))
          .slice(0, 4);
        setRecommendations(recs);

      } catch (err) {
        console.error("Error fetching home data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [currentUser]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className="text-display-xl">Welcome back, {currentUser?.displayName || currentUser?.profile?.displayName}</h1>
        <p className="text-body-lg text-tertiary">Here's what's happening in your digital world.</p>
      </div>

      <div className={styles.content}>
        <div className={styles.topGrid}>
          {/* Left Column: Unread Messages */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>mail</span>
              <h2 className="text-headline-sm">Unread Messages</h2>
            </div>
            
            {loading ? (
              <p>Loading updates...</p>
            ) : Object.values(unreadData).some(d => d.channels.length > 0) ? (
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
              </div>
            ) : (
              <div className={styles.emptyState}>
                <span className="material-symbols-outlined" style={{ fontSize: '48px', opacity: 0.5 }}>auto_awesome</span>
                <p>You're all caught up!</p>
              </div>
            )}
          </section>

          {/* Right Column: Recent Communities */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-secondary)' }}>schedule</span>
              <h2 className="text-headline-sm">Recent Communities</h2>
            </div>

            {loading ? (
              <p>Loading...</p>
            ) : recentCommunities.length > 0 ? (
              <div className={styles.communitiesGrid}>
                {recentCommunities.map(comm => (
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
                <p>Join a community to see it here.</p>
                <Link to="/discover" className={styles.discoverBtn}>Discover</Link>
              </div>
            )}
          </section>
        </div>

        <div className={styles.divider} />

        {/* Bottom Section: Recommended Communities */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className="material-symbols-outlined" style={{ color: 'var(--color-tertiary)' }}>explore</span>
            <h2 className="text-headline-sm">Recommended Communities</h2>
          </div>

          {loading ? (
            <p>Loading recommendations...</p>
          ) : (
            <div className={styles.recommendationsGrid}>
              {recommendations.map(comm => (
                <Link to={`/join/${comm.id}`} key={comm.id} className={styles.recommendationCard}>
                  <div className={styles.recHeader}>
                    {comm.iconBase64 ? (
                      <img src={comm.iconBase64} alt={comm.name} className={styles.recIcon} />
                    ) : (
                      <div className={styles.recIcon} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', color: 'var(--color-primary)' }}>
                        {comm.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className={styles.recInfo}>
                      <span className={styles.recName}>{comm.name}</span>
                      <p className={styles.recDesc}>{comm.description || 'No description provided.'}</p>
                    </div>
                  </div>
                  <div className={styles.joinLink}>
                    View Community <span className="material-symbols-outlined">arrow_forward</span>
                  </div>
                </Link>
              ))}
              {recommendations.length === 0 && (
                <div className={styles.emptyState} style={{ gridColumn: '1 / -1' }}>
                  <p>Check back later for more recommendations!</p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
