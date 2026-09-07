import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getCommunity, getUnreadCounts } from '../services/db';
import styles from './Home.module.css';

export default function Home() {
  const { currentUser } = useAuth();
  const [unreadData, setUnreadData] = useState({});
  const [recentCommunities, setRecentCommunities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const joinedIds = currentUser?.profile?.joinedCommunities || [];
    if (!currentUser?.uid) return undefined;

    Promise.all([
      getUnreadCounts(currentUser.uid, joinedIds),
      Promise.all(joinedIds.map(id => getCommunity(id)))
    ]).then(([nextUnread, joinedCommunities]) => {
      if (cancelled) return;
      setUnreadData(nextUnread);
      setRecentCommunities(joinedCommunities.filter(Boolean).sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0)).slice(0, 6));
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [currentUser?.uid, currentUser?.profile?.joinedCommunities]);

  const unreadCommunities = Object.entries(unreadData).filter(([, data]) => data.channels.length > 0);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <p className={styles.eyebrow}>YOUR SPACE</p>
        <h1 className="text-display-xl">Welcome back, {currentUser?.profile?.displayName || currentUser?.displayName || 'there'}</h1>
        <p className="text-body-lg text-tertiary">Pick up where you left off.</p>
      </div>
      <div className={styles.content}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}><span className="material-symbols-outlined">mark_email_unread</span><h2 className="text-headline-sm">Unread messages</h2></div>
          {loading ? <p className={styles.loadingText}>Loading updates...</p> : unreadCommunities.length ? <div className={styles.unreadList}>{unreadCommunities.map(([communityId, data]) => <div key={communityId} className={styles.communityGroup}><h3>{data.name}</h3><div className={styles.channels}>{data.channels.map(channel => <Link to={`/channels/${communityId}/${channel.id}`} key={channel.id} className={styles.channelLink}><span className="material-symbols-outlined">tag</span><span className={styles.channelName}>{channel.name}</span><span className={styles.badge}>New</span></Link>)}</div></div>)}</div> : <div className={styles.emptyState}><span className="material-symbols-outlined">done_all</span><p>You're all caught up.</p></div>}
        </section>
        <section className={styles.section}>
          <div className={styles.sectionHeader}><span className="material-symbols-outlined">history</span><h2 className="text-headline-sm">Your communities</h2></div>
          {loading ? <p className={styles.loadingText}>Loading communities...</p> : recentCommunities.length ? <div className={styles.communitiesGrid}>{recentCommunities.map(community => <Link to={`/channels/${community.id}`} key={community.id} className={styles.communityCard}><div className={styles.commIconWrapper}>{community.iconBase64 ? <img src={community.iconBase64} alt={community.name} /> : <span>{community.name.charAt(0).toUpperCase()}</span>}</div><span className="text-label-md">{community.name}</span>{unreadData[community.id]?.channels.length > 0 && <span className={styles.communityUnread}>{unreadData[community.id].channels.length} unread</span>}</Link>)}</div> : <div className={styles.emptyState}><p>Join a community to see it here.</p><Link to="/discover" className={styles.discoverBtn}>Discover communities</Link></div>}
        </section>
      </div>
    </div>
  );
}
