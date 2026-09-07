import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { clearSessionCache, getCommunity, getUnreadCounts, getUnreadMentionCountsByCommunity, leaveCommunity, setCommunityMuted } from '../services/db';
import styles from './Communities.module.css';
import { Link } from 'react-router-dom';

const ContextMenu = ({ x, y, onClose, items }) => {
  useEffect(() => {
    const handleClick = () => onClose();
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);
  if (!items || items.length === 0) return null;
  return (
    <div
      className={styles.contextMenuBackdrop}
      onClick={onClose}
      style={{ top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <div
        className={styles.contextMenu}
        style={{ top: y, left: x }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((item, i) => (
          <button
            key={i}
            className={`${styles.contextMenuItem} ${item.danger ? styles.contextDanger : ''}`}
            onClick={(e) => { e.stopPropagation(); item.onClick(); onClose(); }}
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default function Communities() {
  const { currentUser } = useAuth();
  const [communities, setCommunities] = useState([]);
  const [unreadByCommunity, setUnreadByCommunity] = useState({});
  const [mentionCounts, setMentionCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState(null);
  const currentUid = currentUser?.uid;
  const joinedCommunityIds = useMemo(() => currentUser?.profile?.joinedCommunities || [], [currentUser?.profile?.joinedCommunities]);

  const loadCommunityData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [coms, unread, mentions] = await Promise.all([
        Promise.all(joinedCommunityIds.map(id => getCommunity(id))),
        getUnreadCounts(currentUid, joinedCommunityIds),
        getUnreadMentionCountsByCommunity(currentUid, joinedCommunityIds)
      ]);
      setCommunities(coms.filter(Boolean));
      setUnreadByCommunity(unread);
      setMentionCounts(mentions);
    } catch (error) {
      console.error('Failed to load communities:', error);
      setCommunities([]);
      setUnreadByCommunity({});
      setMentionCounts({});
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [currentUid, joinedCommunityIds]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (cancelled) return;
      const uid = currentUser?.uid;
      clearSessionCache(`unread:${uid}`);
      clearSessionCache(`unread-mentions:${uid}`);
      loadCommunityData().catch(() => {});
    };
    Promise.resolve().then(() => loadCommunityData(true)).catch(() => {});
    window.addEventListener('blink:message-received', refresh);
    window.addEventListener('blink:unread-changed', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('blink:message-received', refresh);
      window.removeEventListener('blink:unread-changed', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [currentUser?.uid, loadCommunityData]);

  const openContextMenu = (e, community) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, communityId: community.id, name: community.name });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleToggleMute = async () => {
    const { communityId } = contextMenu;
    if (!currentUser?.uid) return;
    const current = currentUser.profile?.notificationPreferences?.communityMuted?.[communityId] || false;
    try {
      await setCommunityMuted(currentUser.uid, communityId, !current);
      setContextMenu(null);
    } catch (error) {
      console.error('Failed to update community notifications:', error);
      alert(error.message || 'Failed to update notifications.');
    }
  };

  const handleLeave = async () => {
    const { communityId, name } = contextMenu;
    if (!currentUser?.uid) return;
    if (!window.confirm(`Leave "${name}"?`)) return;
    try {
      await leaveCommunity(currentUser.uid, communityId);
      window.location.reload();
    } catch (error) {
      console.error('Failed to leave community:', error);
      alert(error.message || 'Failed to leave community.');
    }
  };

  const contextMenuItems = contextMenu ? [
    {
      icon: 'notifications',
      label: contextMenu.communityId &&
        (currentUser?.profile?.notificationPreferences?.communityMuted?.[contextMenu.communityId] ? 'Unmute notifications' : 'Mute notifications'),
      onClick: handleToggleMute,
    },
    {
      icon: 'logout',
      label: `Leave "${contextMenu.name}"`,
      onClick: handleLeave,
      danger: true,
    },
  ] : [];

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
          {communities.map(comm => {
            const unreadChannels = unreadByCommunity[comm.id]?.channels || [];
            const mentionCount = mentionCounts[comm.id] || 0;
            return (
            <Link to={`/channels/${comm.id}`} key={comm.id} className={styles.card} onContextMenu={(e) => openContextMenu(e, comm)}>
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
                {(mentionCount > 0 || unreadChannels.length > 0) && <div className={styles.unreadSummary}>
                  {mentionCount > 0 ? <span className={styles.mentionBadge}>{mentionCount > 99 ? '99+' : mentionCount} mention{mentionCount === 1 ? '' : 's'}</span> : <span className={styles.regularUnread}><span className={styles.unreadDot} />Unread activity</span>}
                  {unreadChannels.length > 0 && <span className={styles.unreadChannels}>{unreadChannels.slice(0, 3).map(channel => `#${channel.name}`).join(', ')}{unreadChannels.length > 3 ? '…' : ''}</span>}
                </div>}
              </div>
              <div className={styles.actions}>
                <button 
                  className={styles.shareBtn} 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const url = `${window.location.origin}/join/${comm.id}`;
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
            );
          })}
          {communities.length === 0 && (
            <div className={styles.empty}>
              <p>You haven't joined any communities yet.</p>
              <Link to="/discover" className={styles.discoverBtn}>Discover Communities</Link>
            </div>
          )}
        </div>
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
