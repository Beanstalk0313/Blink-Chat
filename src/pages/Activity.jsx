import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getCommunity } from '../services/db';
import styles from './Activity.module.css';

export default function Activity() {
  const { currentUser } = useAuth();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadActivity() {
      if (currentUser?.profile?.joinedCommunities) {
        const coms = await Promise.all(
          currentUser.profile.joinedCommunities.map(id => getCommunity(id))
        );
        const joinActivities = coms.filter(c => c !== null).map(c => ({
          id: `join-${c.id}`,
          type: 'join',
          content: `You joined the ${c.name} community.`,
          time: 'Recently'
        }));
        setActivities(joinActivities);
      }
      setLoading(false);
    }
    loadActivity();
  }, [currentUser]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className="text-display-xl">Activity</h1>
        <p className="text-body-lg text-tertiary">Your recent community interactions.</p>
      </div>

      <div className={styles.list}>
        {activities.map(act => (
          <div key={act.id} className={styles.item}>
            <div className={styles.icon}>
              <span className="material-symbols-outlined">
                {act.type === 'join' ? 'person_add' : 'notifications'}
              </span>
            </div>
            <div className={styles.info}>
              <p className="text-body-md">{act.content}</p>
              <p className="text-label-sm text-tertiary">{act.time}</p>
            </div>
          </div>
        ))}
        {!loading && activities.length === 0 && (
          <div className={styles.empty}>
            <p>No recent activity to show.</p>
          </div>
        )}
      </div>
    </div>
  );
}
