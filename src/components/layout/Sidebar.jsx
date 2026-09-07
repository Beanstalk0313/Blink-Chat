import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import UserAvatar from '../common/UserAvatar';
import { getColor, readStoredValue, writeStoredValue } from '../../services/utils';
import { clearSessionCache, getCommunity, getUnreadCounts, getUnreadMentionCountsByCommunity, leaveCommunity, markAllChannelsRead, setCommunityMuted, subscribeToPrivateConversations, togglePinCommunity } from '../../services/db';
import styles from './Sidebar.module.css';

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const [joinedCommunities, setJoinedCommunities] = useState([]);
  const [recentIds, setRecentIds] = useState(() => {
    try { return JSON.parse(readStoredValue('blink-recent-communities', '[]')); } catch { return []; }
  });
  const [unreadCommunities, setUnreadCommunities] = useState({});
  const [privateConversations, setPrivateConversations] = useState([]);
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(() => readStoredValue('sidebarPinned') === 'true');
  const [contextMenu, setContextMenu] = useState(null); // { x, y, community }
  const [unreadMentionCounts, setUnreadMentionCounts] = useState({});

  const pinnedIds = currentUser?.profile?.pinnedCommunities || [];
  const pinnedSet = new Set(pinnedIds.slice(0, 3));
  const pinnedCommunities = joinedCommunities.filter(community => pinnedSet.has(community.id));
  const recentCommunities = joinedCommunities
    .filter(community => !pinnedSet.has(community.id))
    .sort((first, second) => {
      const firstIndex = recentIds.indexOf(first.id);
      const secondIndex = recentIds.indexOf(second.id);
      if (firstIndex === -1 && secondIndex === -1) return new Date(second.createdAt || 0) - new Date(first.createdAt || 0);
      if (firstIndex === -1) return 1;
      if (secondIndex === -1) return -1;
      return firstIndex - secondIndex;
    })
    .slice(0, 3);
  const unreadPrivateCount = privateConversations.filter(conversation => conversation.lastSenderUid && conversation.lastSenderUid !== currentUser?.uid && conversation.updatedAt > (conversation.lastReadAt || 0)).length;
  const unreadPrivateBadgeCount = privateConversations.filter(conversation => !conversation.muted && conversation.lastSenderUid && conversation.lastSenderUid !== currentUser?.uid && conversation.updatedAt > (conversation.lastReadAt || 0)).length;

  useEffect(() => {
    const currentCommunityId = location.pathname.match(/^\/channels\/([^/]+)/)?.[1];
    if (!currentCommunityId) return undefined;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setRecentIds(previous => {
        const next = [currentCommunityId, ...previous.filter(id => id !== currentCommunityId)].slice(0, 12);
        writeStoredValue('blink-recent-communities', JSON.stringify(next));
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [location.pathname]);

  const loadJoinedCommunities = useCallback(() => {
    const joinedIds = currentUser?.profile?.joinedCommunities || [];
    if (!joinedIds.length) return Promise.resolve({ communities: [], unread: {} });
    return Promise.all([
      Promise.all(joinedIds.map(id => getCommunity(id))),
      getUnreadCounts(currentUser.uid, joinedIds)
    ]).then(([communities, unread]) => ({ communities: communities.filter(Boolean), unread }));
  }, [currentUser]);

  useEffect(() => {
    let cancelled = false;
    const joinedIds = currentUser?.profile?.joinedCommunities || [];
    Promise.all(joinedIds.map(id => getCommunity(id))).then(communities => {
      if (!cancelled) setJoinedCommunities(communities.filter(Boolean));
    }).catch(() => {});
    loadJoinedCommunities().then(({ unread }) => {
      if (!cancelled) setUnreadCommunities(unread);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [loadJoinedCommunities, currentUser?.profile?.joinedCommunities]);

  useEffect(() => {
    const handleUnreadChanged = () => {
      clearSessionCache(`unread:${currentUser?.uid}`);
      loadJoinedCommunities().then(({ unread }) => setUnreadCommunities(unread)).catch(() => {});
    };
    window.addEventListener('blink:unread-changed', handleUnreadChanged);
    window.addEventListener('blink:message-received', handleUnreadChanged);
    return () => {
      window.removeEventListener('blink:unread-changed', handleUnreadChanged);
      window.removeEventListener('blink:message-received', handleUnreadChanged);
    };
  }, [loadJoinedCommunities, currentUser?.uid]);

  useEffect(() => {
    if (!currentUser?.uid) return undefined;
    let cancelled = false;
    const refreshMentionBadge = () => {
      clearSessionCache(`unread-mentions:${currentUser?.uid}`);
      getUnreadMentionCountsByCommunity(currentUser.uid, currentUser?.profile?.joinedCommunities || [])
        .then(counts => { if (!cancelled) setUnreadMentionCounts(counts); })
        .catch(() => {});
    };
    refreshMentionBadge();
    window.addEventListener('blink:unread-changed', refreshMentionBadge);
    window.addEventListener('blink:message-received', refreshMentionBadge);
    const handleVisibility = () => { if (document.visibilityState === 'visible') refreshMentionBadge(); };
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener('blink:unread-changed', refreshMentionBadge);
      window.removeEventListener('blink:message-received', refreshMentionBadge);
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentUser?.uid, currentUser?.profile?.joinedCommunities]);

  // Reflect unread mentions + private messages in the browser tab title.
  useEffect(() => {
    const unreadMentionCount = Object.values(unreadMentionCounts).reduce((sum, count) => sum + count, 0);
    const unreadTotal = unreadMentionCount + unreadPrivateBadgeCount;
    document.title = unreadTotal > 0 ? `(${unreadTotal > 99 ? '99+' : unreadTotal}) Blink Chat` : 'Blink Chat';
  }, [unreadMentionCounts, unreadPrivateBadgeCount]);

  useEffect(() => {
    if (!currentUser?.uid) {
      Promise.resolve().then(() => {
        setJoinedCommunities([]);
        setPrivateConversations([]);
        setUnreadCommunities({});
        setUnreadMentionCounts({});
      });
      return undefined;
    }
    return subscribeToPrivateConversations(currentUser.uid, setPrivateConversations);
  }, [currentUser?.uid]);

  const togglePin = () => {
    const next = !isPinned;
    setIsPinned(next);
    writeStoredValue('sidebarPinned', String(next));
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  const navItems = [
    { icon: 'home', label: 'Home', to: '/' },
    { icon: 'grid_view', label: 'Communities', to: '/communities' },
    { icon: 'explore', label: 'Discover', to: '/discover' },
    { icon: 'admin_panel_settings', label: 'Admin', to: '/admin' }
  ];
  const isExpanded = isHovered || isPinned;
  const openContextMenu = (event, community) => {
    event.preventDefault();
    const menuWidth = 232;
    const menuHeight = 248;
    const x = Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8));
    const y = Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8));
    setContextMenu({ x, y, community });
  };

  const isCommunityMuted = communityId => Boolean(currentUser?.profile?.notificationPreferences?.communityMuted?.[communityId]);

  const handleContextMenuAction = async (action, community) => {
    const communityId = community.id;
    try {
      if (action === 'mute') {
        await setCommunityMuted(currentUser.uid, communityId, !isCommunityMuted(communityId));
      } else if (action === 'pin') {
        await togglePinCommunity(currentUser.uid, communityId);
      } else if (action === 'markRead') {
        await markAllChannelsRead(currentUser.uid, communityId);
      } else if (action === 'leave') {
        await leaveCommunity(currentUser.uid, communityId);
        if (location.pathname.startsWith(`/channels/${communityId}`)) navigate('/');
      }
      loadJoinedCommunities().then(({ communities, unread }) => {
        setJoinedCommunities(communities);
        setUnreadCommunities(unread);
      }).catch(() => {});
    } catch (error) {
      window.alert(error.message || 'Something went wrong.');
    }
    setContextMenu(null);
  };

  useEffect(() => {
    if (!contextMenu) return undefined;
    const handleKeyDown = event => { if (event.key === 'Escape') setContextMenu(null); };
    const handleScroll = () => setContextMenu(null);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [contextMenu]);

  const communityLink = community => {
    const mentionCount = unreadMentionCounts[community.id] || 0;
    const hasRegularUnread = unreadCommunities[community.id]?.channels?.length > 0;
    return <div key={community.id} className={styles.communityLinkWrap} onContextMenu={event => openContextMenu(event, community)}><Link to={`/channels/${community.id}`} className={`${styles.navItem} ${location.pathname === `/channels/${community.id}` || location.pathname.startsWith(`/channels/${community.id}/`) ? styles.active : ''}`}><div className={styles.communityIconWrapper}>{community.iconBase64 ? <img src={community.iconBase64} alt={community.name} className={styles.communityIcon} /> : <div className={styles.communityFallback} style={{ backgroundColor: getColor(community.name) }}>{community.name.charAt(0).toUpperCase()}</div>}</div><span className={styles.navLabel}>{community.name}</span>{mentionCount > 0 ? <span className={styles.unreadDot} title={`${mentionCount} unread mention${mentionCount === 1 ? '' : 's'}`}>{mentionCount > 99 ? '99+' : mentionCount}</span> : hasRegularUnread ? <span className={styles.unreadDotOnly} title="Unread messages" /> : null}<span className={styles.tooltip}>{community.name}</span></Link></div>;
  };

  return <nav className={`${styles.sidebar} ${isExpanded ? styles.expanded : ''}`} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
    <div className={styles.topSection}>
      <div className={styles.brandRow}><Link to="/" className={styles.navItem} style={{ marginBottom: '0.5rem' }}><div className={styles.iconWrapper}><img src="/logo.svg" alt="Blink Logo" style={{ width: '28px', height: '28px', display: 'block', objectFit: 'contain' }} /></div><span className={styles.navLabel} style={{ fontWeight: 800 }}>Blink Chat</span></Link><button className={`${styles.pinButton} ${isPinned ? styles.active : ''}`} onClick={togglePin} title={isPinned ? 'Unpin sidebar' : 'Pin sidebar'}><span className="material-symbols-outlined">{isPinned ? 'keep' : 'keep_off'}</span></button></div>
      <Link to="/profile" className={styles.profileWrapper}><div className={styles.iconWrapper}><UserAvatar user={currentUser?.profile?.displayName ? currentUser.profile : currentUser} size="2.5rem" /></div><span className={styles.navLabel}>{currentUser?.profile?.displayName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User'}</span><span className={styles.tooltip}>Profile</span></Link>
      <div className={styles.divider} />
      <Link to="/messages" className={`${styles.navItem} ${location.pathname === '/messages' ? styles.active : ''}`}><div className={styles.iconWrapper}><span className="material-symbols-outlined">forum</span></div><span className={styles.navLabel}>Private Messages</span>{unreadPrivateCount > 0 && <span className={styles.unreadDot} title="Unread private messages">{unreadPrivateCount > 9 ? '9+' : unreadPrivateCount}</span>}<span className={styles.tooltip}>Private Messages</span></Link>
      <div className={styles.divider} />
      {pinnedCommunities.length > 0 && <><div className={styles.pinnedLabel}><div className={styles.iconWrapper} style={{ background: 'transparent', border: 'none' }}><span className="material-symbols-outlined">push_pin</span></div><span className={styles.navLabel}>Pinned communities</span></div>{pinnedCommunities.map(communityLink)}<div className={styles.divider} /></>}
      {recentCommunities.length > 0 && <>{recentCommunities.map(communityLink)}<div className={styles.divider} /></>}
      {navItems.map(item => <Link key={item.label} to={item.to} className={`${styles.navItem} ${location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to)) ? styles.active : ''}`}><div className={styles.iconWrapper}><span className="material-symbols-outlined">{item.icon}</span></div><span className={styles.navLabel}>{item.label}</span>{item.to === '/communities' && Object.values(unreadMentionCounts).some(count => count > 0) && <span className={styles.unreadDot}>{(() => { const count = Object.values(unreadMentionCounts).reduce((sum, value) => sum + value, 0); return count > 99 ? '99+' : count; })()}</span>}<span className={styles.tooltip}>{item.label}</span></Link>)}
      <button className={styles.navItem} onClick={() => navigate('/create-community')}><div className={styles.iconWrapper}><span className="material-symbols-outlined">add</span></div><span className={styles.navLabel}>Create</span><span className={styles.tooltip}>Create Community</span></button>
    </div>
    <div className={styles.bottomSection}><Link to="/settings" className={`${styles.navItem} ${location.pathname === '/settings' ? styles.active : ''}`}><div className={styles.iconWrapper}><span className="material-symbols-outlined">settings</span></div><span className={styles.navLabel}>Settings</span><span className={styles.tooltip}>Settings</span></Link><button className={`${styles.navItem} ${styles.logoutBtn}`} onClick={handleLogout}><div className={styles.iconWrapper}><span className="material-symbols-outlined">logout</span></div><span className={styles.navLabel}>Logout</span><span className={styles.tooltip}>Logout</span></button></div>
    {contextMenu && createPortal(<>
      <div className={styles.contextMenuBackdrop} onClick={() => setContextMenu(null)} onContextMenu={event => { event.preventDefault(); setContextMenu(null); }} />
      <div className={styles.contextMenu} style={{ top: contextMenu.y, left: contextMenu.x }}>
        <div className={styles.contextMenuTitle}><span className="material-symbols-outlined">groups</span><span>{contextMenu.community.name}</span></div>
        <button className={styles.contextMenuItem} onClick={() => handleContextMenuAction('mute', contextMenu.community)}><span className="material-symbols-outlined">{isCommunityMuted(contextMenu.community.id) ? 'notifications_off' : 'notifications'}</span><span>{isCommunityMuted(contextMenu.community.id) ? 'Unmute notifications' : 'Mute notifications'}</span></button>
        <button className={styles.contextMenuItem} onClick={() => handleContextMenuAction('pin', contextMenu.community)}><span className="material-symbols-outlined">push_pin</span><span>{(currentUser?.profile?.pinnedCommunities || []).includes(contextMenu.community.id) ? 'Unpin community' : 'Pin community'}</span></button>
        <button className={styles.contextMenuItem} onClick={() => handleContextMenuAction('markRead', contextMenu.community)}><span className="material-symbols-outlined">done_all</span><span>Mark all as read</span></button>
        <button className={`${styles.contextMenuItem} ${styles.contextDanger}`} onClick={() => handleContextMenuAction('leave', contextMenu.community)}><span className="material-symbols-outlined">logout</span><span>Leave community</span></button>
      </div>
    </>, document.body)}
  </nav>;
};

export default Sidebar;
