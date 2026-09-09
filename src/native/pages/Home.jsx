import { useEffect, useState } from 'react';
import { Navbar, NavLeft, NavTitle, Page, PageContent } from 'framework7-react';
import { useAuth } from '../../contexts/AuthContext';
import { getCommunity, getUnreadCounts } from '../../services/db';
import { navigateTo } from '../navigation';
import MenuButton from '../components/MenuButton';
import UserAvatar from '../../components/common/UserAvatar';
import { getColor } from '../../services/utils';
import styles from './Home.module.css';

export default function Home() {
  const { currentUser } = useAuth();
  const [unreadData, setUnreadData] = useState({});
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);

  const displayName = currentUser?.profile?.displayName || currentUser?.displayName || 'there';

  useEffect(() => {
    let cancelled = false;
    const joinedIds = currentUser?.profile?.joinedCommunities || [];
    if (!currentUser?.uid) return undefined;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      return Promise.all([
        getUnreadCounts(currentUser.uid, joinedIds),
        Promise.all(joinedIds.map(id => getCommunity(id)))
      ]).then(([unread, joined]) => {
        if (cancelled) return;
        setUnreadData(unread);
        setCommunities(joined.filter(Boolean).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 6));
      }).finally(() => { if (!cancelled) setLoading(false); });
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [currentUser?.uid, currentUser?.profile?.joinedCommunities]);

  const unreadCommunities = Object.entries(unreadData).filter(([, data]) => data.channels?.length > 0);

  return (
    <Page className={styles.page}>
      <Navbar large backLink={false} transparent>
        <NavLeft>
          <MenuButton />
        </NavLeft>
        <NavTitle large sliding>
          <span className={styles.hello}>Welcome back,</span><br />
          {displayName}
        </NavTitle>
        <a href="#/profile/" slot="right" className={styles.profileLink}>
          <UserAvatar user={currentUser?.profile || currentUser} size="2rem" />
        </a>
      </Navbar>

      <PageContent className={styles.content}>
        <section>
          <h2 className={styles.sectionTitle}>Unread messages</h2>
          {loading && <p className={styles.loadingText}>Loading updates...</p>}
          {!loading && unreadCommunities.length === 0 && (
            <div className={styles.empty}>
              <span className="material-symbols-outlined">done_all</span>
              <p>You&apos;re all caught up.</p>
            </div>
          )}
          {!loading && unreadCommunities.map(([communityId, data]) => (
            <div key={communityId} className={styles.groupCard}>
              <h3>{data.name || 'Community'}</h3>
              {data.channels.map(channel => (
                <a key={channel.id} href={`#/channels/${communityId}/${channel.id}/`} className={styles.channelRow} onClick={() => navigateTo(`/channels/${communityId}/${channel.id}/`)}>
                  <span className="material-symbols-outlined">tag</span>
                  <span className={styles.channelName}>{channel.name}</span>
                  <span className={styles.badge}>New</span>
                </a>
              ))}
            </div>
          ))}
        </section>

        <section>
          <h2 className={styles.sectionTitle}>Your communities</h2>
          {loading && <p className={styles.loadingText}>Loading communities...</p>}
          {!loading && communities.length === 0 && (
            <div className={styles.empty}>
              <p>Join a community to see it here.</p>
              <a href="#/discover/" className={styles.discoverBtn}>Discover communities</a>
            </div>
          )}
          {!loading && communities.length > 0 && (
            <div className={styles.commGrid}>
              {communities.map(community => (
                <a key={community.id} href={`#/channels/${community.id}/`} className={styles.commCard} onClick={() => navigateTo(`/channels/${community.id}/`)}>
                  {community.iconBase64
                    ? <img src={community.iconBase64} alt="" className={styles.commIcon} />
                    : <span className={styles.commFallback} style={{ background: getColor(community.name) }}>{community.name.charAt(0).toUpperCase()}</span>}
                  <span className={styles.commName}>{community.name}</span>
                  {unreadData[community.id]?.channels?.length > 0 && <span className={styles.commUnread}>{unreadData[community.id].channels.length} unread</span>}
                </a>
              ))}
            </div>
          )}
        </section>
      </PageContent>
    </Page>
  );
}
