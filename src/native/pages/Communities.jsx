import { useCallback, useEffect, useState } from 'react';
import { f7, Navbar, Page, PageContent } from 'framework7-react';
import { useAuth } from '../../contexts/AuthContext';
import { clearSessionCache, getCommunity, getUnreadCounts, getUnreadMentionCountsByCommunity, leaveCommunity, setCommunityMuted } from '../../services/db';
import { navigateTo } from '../navigation';
import MenuButton from '../components/MenuButton';
import styles from './Communities.module.css';

export default function Communities() {
  const { currentUser } = useAuth();
  const [communities, setCommunities] = useState([]);
  const [unreadByCommunity, setUnreadByCommunity] = useState({});
  const [mentionCounts, setMentionCounts] = useState({});
  const [loading, setLoading] = useState(true);

  const loadCommunityData = useCallback(async () => {
    const currentUid = currentUser?.uid;
    const joinedIds = currentUser?.profile?.joinedCommunities || [];
    if (!currentUid) return;
    try {
      const [coms, unread, mentions] = await Promise.all([
        Promise.all(joinedIds.map(id => getCommunity(id))),
        getUnreadCounts(currentUid, joinedIds),
        getUnreadMentionCountsByCommunity(currentUid, joinedIds)
      ]);
      setCommunities(coms.filter(Boolean));
      setUnreadByCommunity(unread);
      setMentionCounts(mentions);
    } catch (error) {
      console.error('Failed to load communities:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.uid, currentUser?.profile?.joinedCommunities]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => { if (!cancelled) loadCommunityData().catch(() => {}); });
    const refresh = () => {
      clearSessionCache(`unread:${currentUser?.uid}`);
      clearSessionCache(`unread-mentions:${currentUser?.uid}`);
      loadCommunityData().catch(() => {});
    };
    window.addEventListener('blink:message-received', refresh);
    window.addEventListener('blink:unread-changed', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('blink:message-received', refresh);
      window.removeEventListener('blink:unread-changed', refresh);
    };
  }, [loadCommunityData, currentUser?.uid]);

  const handleMute = async community => {
    const current = Boolean(currentUser?.profile?.notificationPreferences?.communityMuted?.[community.id]);
    try {
      await setCommunityMuted(currentUser.uid, community.id, !current);
      loadCommunityData().catch(() => {});
    } catch (error) {
      f7.dialog.alert(error.message || 'Failed to update notifications.');
    }
  };

  const handleLeave = community => {
    f7.dialog.confirm(`Leave "${community.name}"?`, 'Leave community', async () => {
      try {
        await leaveCommunity(currentUser.uid, community.id);
        loadCommunityData().catch(() => {});
        navigateTo('/communities/', { reloadCurrent: true });
      } catch (error) {
        f7.dialog.alert(error.message || 'Failed to leave community.');
      }
    });
  };

  const handleShare = community => {
    const url = `${window.location.origin}/join/${community.id}`;
    if (navigator.share) {
      navigator.share({ title: community.name, text: `Join ${community.name} on Blink`, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => f7.toast.create({ text: 'Community link copied', closeTimeout: 1600 }).open()).catch(() => {});
    }
  };

  return (
    <Page className={styles.page}>
      <Navbar title="Communities" large transparent backLink={false}>
        <MenuButton slot="left" />
        <a href="#/create-community/" slot="right" className={styles.navIcon}><span className="material-symbols-outlined">add</span></a>
      </Navbar>

      <PageContent>
        {loading && <p className={styles.loading}>Loading communities...</p>}
        {!loading && communities.map(community => {
          const unreadChannels = unreadByCommunity[community.id]?.channels || [];
          const mentionCount = mentionCounts[community.id] || 0;
          return (
            <div key={community.id} className={styles.card}>
              <a href={`#/channels/${community.id}/`} className={styles.mainRow} onClick={() => navigateTo(`/channels/${community.id}/`)}>
                {community.iconBase64
                  ? <img src={community.iconBase64} alt="" className={styles.icon} />
                  : <span className={styles.iconFallback}><span className="material-symbols-outlined">groups</span></span>}
                <span className={styles.info}>
                  <strong>{community.name}</strong>
                  <small>{community.description?.substring(0, 80) || 'No description'}</small>
                  {(mentionCount > 0 || unreadChannels.length > 0) && (
                    <span className={styles.unreadRow}>
                      {mentionCount > 0
                        ? <span className={styles.mentionBadge}>{mentionCount > 99 ? '99+' : mentionCount} mention{mentionCount === 1 ? '' : 's'}</span>
                        : <span className={styles.dotRow}><span className={styles.unreadDot} />Unread activity</span>}
                      {unreadChannels.length > 0 && <small>{unreadChannels.slice(0, 3).map(channel => `#${channel.name}`).join(', ')}{unreadChannels.length > 3 ? '…' : ''}</small>}
                    </span>
                  )}
                </span>
                <span className="material-symbols-outlined" style={{ color: '#4b8eff' }}>chevron_right</span>
              </a>
              <div className={styles.actions}>
                <button type="button" onClick={() => handleShare(community)}><span className="material-symbols-outlined">share</span>Share</button>
                <button type="button" onClick={() => handleMute(community)}>
                  <span className="material-symbols-outlined">
                    {currentUser?.profile?.notificationPreferences?.communityMuted?.[community.id] ? 'notifications_off' : 'notifications'}
                  </span>
                  {currentUser?.profile?.notificationPreferences?.communityMuted?.[community.id] ? 'Unmute' : 'Mute'}
                </button>
                <button type="button" className={styles.danger} onClick={() => handleLeave(community)}><span className="material-symbols-outlined">logout</span>Leave</button>
              </div>
            </div>
          );
        })}
        {!loading && communities.length === 0 && (
          <div className={styles.empty}>
            <p>You haven&apos;t joined any communities yet.</p>
            <a href="#/discover/" className={styles.discoverBtn}>Discover Communities</a>
          </div>
        )}
      </PageContent>
    </Page>
  );
}
