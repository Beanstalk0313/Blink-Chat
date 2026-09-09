import { useEffect, useState } from 'react';
import { f7, Navbar, Page, PageContent } from 'framework7-react';
import { getPublicCommunities, joinCommunity } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { navigateTo } from '../navigation';
import MenuButton from '../components/MenuButton';
import styles from './Discover.module.css';

export default function Discover() {
  const { currentUser } = useAuth();
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getPublicCommunities().then(data => {
      if (!cancelled) setCommunities(data);
    }).catch(error => {
      console.error('Failed to load public communities:', error);
      if (!cancelled) setCommunities([]);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleJoin = community => {
    const hasJoined = currentUser?.profile?.joinedCommunities?.includes(community.id);
    if (hasJoined) {
      navigateTo(`/channels/${community.id}/`);
      return;
    }
    joinCommunity(currentUser.uid, community.id)
      .then(() => navigateTo(`/channels/${community.id}/`))
      .catch(error => f7.dialog.alert(error.message || 'Failed to join community'));
  };

  const handleShare = community => {
    const url = `${window.location.origin}/join/${community.id}`;
    if (navigator.share) navigator.share({ title: community.name, url }).catch(() => {});
    else navigator.clipboard.writeText(url).then(() => f7.toast.create({ text: 'Community link copied', closeTimeout: 1600 }).open()).catch(() => {});
  };

  return (
    <Page className={styles.page}>
      <Navbar title="Discover" large transparent backLink={false}>
        <MenuButton slot="left" />
      </Navbar>
      <PageContent>
        {loading && <p className={styles.loading}>Loading communities...</p>}
        {!loading && communities.map(community => {
          const hasJoined = currentUser?.profile?.joinedCommunities?.includes(community.id);
          return (
            <div key={community.id} className={styles.card}>
              <div className={styles.header}>
                {community.iconBase64
                  ? <img src={community.iconBase64} alt="" className={styles.icon} />
                  : <span className={styles.iconFallback}><span className="material-symbols-outlined">groups</span></span>}
                <div className={styles.titleBlock}>
                  <strong>{community.name}</strong>
                  <small>Public Community</small>
                </div>
              </div>
              <p className={styles.description}>{community.description}</p>
              <div className={styles.actions}>
                <button type="button" className={styles.joinBtn} onClick={() => handleJoin(community)}>
                  {hasJoined ? 'Go to Community' : 'Join'}
                </button>
                <button type="button" className={styles.shareBtn} onClick={() => handleShare(community)} title="Copy Community Link">
                  <span className="material-symbols-outlined">share</span>
                </button>
              </div>
            </div>
          );
        })}
        {!loading && communities.length === 0 && (
          <div className={styles.empty}><p>No public communities found.</p></div>
        )}
      </PageContent>
    </Page>
  );
}
