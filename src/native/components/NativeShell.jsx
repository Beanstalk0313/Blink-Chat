import { useEffect, useRef, useState } from 'react';
import { f7, View } from 'framework7-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { firestore } from '../../firebase/data';
import { getChannels, getCommunity, subscribeToPrivateConversations } from '../../services/db';
import { APP_VERSION, checkAndMarkSeenVersion } from '../../version';
import UserAvatar from '../../components/common/UserAvatar';
import RulesModal from '../../components/common/RulesModal';
import Tutorial from '../../components/common/Tutorial';
import GlobalBannedScreen from '../../components/common/GlobalBannedScreen';
import Login from '../pages/Login';
import { SETTINGS_SECTIONS, SETTINGS_SECTION_LABELS } from '../pages/Settings';
import { COMMUNITY_SETTINGS_TAB_LABELS } from '../pages/CommunitySettings';
import styles from './NativeShell.module.css';

const SETTINGS_ICONS = {
  account: 'account_circle',
  profile: 'person',
  notifications: 'notifications',
  privacy: 'lock',
  appearance: 'palette',
  about: 'info',
};

const CS_TAB_ICONS = {
  general: 'tune',
  channels: 'tag',
  members: 'group',
  roles: 'badge',
};

// One app-level left sidebar serves the whole native app. It is a plain React
// component (not Framework7's Panel API, which proved unreliable in production
// builds) with a MODULAR design: the main navigation is always present, and a
// contextual section is added depending on the current route - the channels of
// the community you are inside, the Settings sections while on /settings/, or
// the Community Settings sections while on /community-settings/.
export default function NativeShell() {
  const { currentUser, loading, logout } = useAuth();
  const { applyTheme } = useTheme();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [panelCommunity, setPanelCommunity] = useState(null);
  const [panelChannels, setPanelChannels] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [settingsTab, setSettingsTab] = useState('account');
  const [isSettingsRoute, setIsSettingsRoute] = useState(false);
  const [communitySettingsInfo, setCommunitySettingsInfo] = useState(null);
  const [communitySettingsTab, setCommunitySettingsTab] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const changelogChecked = useRef(false);
  const currentUid = currentUser?.uid;

  // "New version available" metadata listener, same as the web app.
  useEffect(() => {
    if (!firestore || !currentUid) return undefined;
    const unsubscribe = onSnapshot(doc(firestore, 'app', 'metadata'), snapshot => {
      if (!snapshot.exists()) return;
      const latestVersion = snapshot.data().latestVersion;
      if (latestVersion && latestVersion !== APP_VERSION) setUpdateAvailable(true);
    }, error => console.warn('App metadata listener error:', error));
    return () => unsubscribe();
  }, [currentUid]);

  useEffect(() => {
    if (!updateAvailable) return;
    f7.dialog.alert(
      'A new version of Blink Chat is available. Reload to get the latest features and fixes.',
      'New Version Available',
      () => window.location.reload(),
    );
  }, [updateAvailable]);

  // Changelog: on the first run of every new version, open /changelog/ once.
  useEffect(() => {
    if (loading || !currentUid || changelogChecked.current) return;
    changelogChecked.current = true;
    if (checkAndMarkSeenVersion()) {
      window.setTimeout(() => {
        f7?.views?.main?.router?.navigate('/changelog/');
      }, 600);
    }
  }, [loading, currentUid]);

  // Community themes while inside channel routes (mirrors web AppLayout).
  // The F7 router is the source of truth for the current route; pushState
  // navigation never touches location.hash, so hashchange alone would leave
  // the panel stuck on stale community/channel state.
  useEffect(() => {
    let cancelled = false;
    const applyFromRoute = () => {
      // Navigating anywhere closes the sidebar (route change = internal link
      // was followed, matching the old F7 panel behavior).
      setPanelOpen(false);
      const router = f7?.views?.main?.router;
      const rawPath = router?.currentRoute?.path || (window.location.hash || '#/').replace(/^#/, '');
      const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
      const communityId = path.match(/^\/channels\/([^/]+)/)?.[1];
      const isSettings = /^\/settings\/?$/.test(path);
      const communitySettingsMatch = path.match(/^\/community-settings\/([^/]+)/);
      setActiveChannelId(path.match(/^\/channels\/[^/]+\/([^/?]+)/)?.[1] || null);
      const query = router?.currentRoute?.query || {};
      setIsSettingsRoute(isSettings);
      setSettingsTab(isSettings && SETTINGS_SECTIONS.includes(query.tab) ? query.tab : 'account');
      setCommunitySettingsTab(communitySettingsMatch && typeof query.tab === 'string' ? query.tab : null);
      setCommunitySettingsInfo(communitySettingsMatch ? (window.__blinkCommunitySettings || null) : null);
      if (!communityId) {
        setPanelCommunity(null);
        setPanelChannels([]);
        applyTheme(currentUser?.profile?.theme || 'default');
        return;
      }
      Promise.all([getCommunity(communityId), getChannels(communityId).catch(() => [])]).then(([community, channels]) => {
        if (cancelled) return;
        setPanelCommunity(community);
        setPanelChannels(channels);
        applyTheme(community?.theme || currentUser?.profile?.theme || 'default');
      }).catch(() => {});
    };
    const router = f7?.views?.main?.router;
    router?.on?.('routeChange', applyFromRoute);
    // Fallback for the early-startup hash navigation path.
    window.addEventListener('hashchange', applyFromRoute);
    applyFromRoute();
    return () => {
      cancelled = true;
      router?.off?.('routeChange', applyFromRoute);
      window.removeEventListener('hashchange', applyFromRoute);
    };
  }, [applyTheme, currentUser?.profile?.theme]);

  // CommunitySettings publishes its allowed sections (permission-dependent);
  // the sidebar reads them so the modular section matches the page exactly.
  useEffect(() => {
    const sync = () => setCommunitySettingsInfo(window.__blinkCommunitySettings || null);
    window.addEventListener('blink:community-settings-updated', sync);
    return () => window.removeEventListener('blink:community-settings-updated', sync);
  }, []);

  useEffect(() => {
    if (!currentUid) return undefined;
    return subscribeToPrivateConversations(currentUid, setConversations);
  }, [currentUid]);

  // The navbar menu buttons and the global hash-link navigator talk to this
  // sidebar through a direct imperative handle plus a window event (no F7
  // panel APIs). Both are idempotent, so sending both is harmless.
  useEffect(() => {
    window.__blinkSidebar = {
      open: () => setPanelOpen(true),
      close: () => setPanelOpen(false),
    };
    const onOpen = () => setPanelOpen(true);
    const onClose = () => setPanelOpen(false);
    window.addEventListener('blink:panel-open', onOpen);
    window.addEventListener('blink:panel-close', onClose);
    return () => {
      delete window.__blinkSidebar;
      window.removeEventListener('blink:panel-open', onOpen);
      window.removeEventListener('blink:panel-close', onClose);
    };
  }, []);

  const handleLogout = async () => {
    try {
      setPanelOpen(false);
      await logout();
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  if (loading) return null;

  const displayName = currentUser?.profile?.displayName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User';
  const unreadPrivateCount = conversations.filter(conversation =>
    conversation.lastSenderUid && conversation.lastSenderUid !== currentUid && conversation.updatedAt > (conversation.lastReadAt || 0)
  ).length;

  const closePanel = () => setPanelOpen(false);

  return (
    <>
      <div className={`${styles.sidebar}${panelOpen ? ` ${styles.sidebarOpen}` : ''}`} aria-hidden={!panelOpen}>
        <div className={styles.panelInner}>
          <div className={styles.brandRow}>
            <img src="/logo.svg" alt="Blink" className={styles.brandLogo} />
            <span className={styles.brandName}>Blink Chat</span>
          </div>

          <a href="#/profile/" className={styles.profileRow} onClick={closePanel}>
            <UserAvatar user={currentUser?.profile || currentUser} size="2.5rem" />
            <span className={styles.profileText}>
              <strong>{displayName}</strong>
              <small>View profile</small>
            </span>
          </a>

          <a href="#/messages/" className={styles.navRow} onClick={closePanel}>
            <span className="material-symbols-outlined">forum</span>
            <span className={styles.navLabel}>Private Messages</span>
            {unreadPrivateCount > 0 && <span className={styles.badge}>{unreadPrivateCount > 9 ? '9+' : unreadPrivateCount}</span>}
          </a>

          <div className={styles.divider} />

          {/* Contextual section: channels of the community you are inside. */}
          {panelCommunity && (
            <>
              <div className={styles.communityHead}>
                {panelCommunity.iconBase64
                  ? <img src={panelCommunity.iconBase64} alt="" className={styles.communityIcon} />
                  : <span className={styles.communityFallback}>{String(panelCommunity.name || '?').charAt(0).toUpperCase()}</span>}
                <span className={styles.panelHeadText}>
                  <strong>{panelCommunity.name}</strong>
                  <small>{panelChannels.length} channel{panelChannels.length === 1 ? '' : 's'}</small>
                </span>
              </div>
              <div className={styles.channelList}>
                {panelChannels.map(channel => (
                  <a key={channel.id} href={`#/channels/${panelCommunity.id}/${channel.id}/`} onClick={closePanel} className={`${styles.navRow} ${channel.id === activeChannelId ? styles.active : ''}`}>
                    <span className="material-symbols-outlined">{channel.type === 'voice' ? 'graphic_eq' : 'tag'}</span>
                    <span className={styles.navLabel}>{channel.name}</span>
                  </a>
                ))}
                {!panelChannels.length && <p className={styles.panelHint}>No channels yet.</p>}
              </div>
              <div className={styles.divider} />
            </>
          )}

          {/* Contextual section: Settings sub-sections. */}
          {isSettingsRoute && (
            <>
              <div className={styles.sectionLabel}>Settings</div>
              {SETTINGS_SECTIONS.map(section => (
                <a key={section} href={`#/settings/?tab=${section}`} className={`${styles.navRow} ${settingsTab === section ? styles.active : ''}`} onClick={closePanel}>
                  <span className="material-symbols-outlined">{SETTINGS_ICONS[section]}</span>
                  <span className={styles.navLabel}>{SETTINGS_SECTION_LABELS[section]}</span>
                </a>
              ))}
              <div className={styles.divider} />
            </>
          )}

          {/* Contextual section: Community Settings sub-sections. */}
          {communitySettingsInfo && (
            <>
              <div className={styles.sectionLabel}>{communitySettingsInfo.communityName}</div>
              {communitySettingsInfo.tabs.map(tab => (
                <a key={tab} href={`#/community-settings/${communitySettingsInfo.communityId}/?tab=${tab}`} className={`${styles.navRow} ${communitySettingsTab === tab ? styles.active : ''}`} onClick={closePanel}>
                  <span className="material-symbols-outlined">{CS_TAB_ICONS[tab] || 'tune'}</span>
                  <span className={styles.navLabel}>{COMMUNITY_SETTINGS_TAB_LABELS[tab] || tab}</span>
                </a>
              ))}
              <div className={styles.divider} />
            </>
          )}

          <a href="#/" className={styles.navRow} onClick={closePanel}><span className="material-symbols-outlined">home</span><span className={styles.navLabel}>Home</span></a>
          <a href="#/communities/" className={styles.navRow} onClick={closePanel}><span className="material-symbols-outlined">grid_view</span><span className={styles.navLabel}>Communities</span></a>
          <a href="#/discover/" className={styles.navRow} onClick={closePanel}><span className="material-symbols-outlined">explore</span><span className={styles.navLabel}>Discover</span></a>
          <a href="#/create-community/" className={styles.navRow} onClick={closePanel}><span className="material-symbols-outlined">add</span><span className={styles.navLabel}>Create community</span></a>

          <div className={styles.spacer} />

          <a href="#/settings/" className={styles.navRow} onClick={closePanel}><span className="material-symbols-outlined">settings</span><span className={styles.navLabel}>Settings</span></a>
          <a href="#/changelog/" className={styles.navRow} onClick={closePanel}>
            <span className="material-symbols-outlined">history</span>
            <span className={styles.navLabel}>What&apos;s new</span>
            <small className={styles.versionLabel}>v{APP_VERSION}</small>
          </a>
          <button type="button" className={styles.logoutRow} onClick={handleLogout}>
            <span className="material-symbols-outlined">logout</span>
            <span className={styles.navLabel}>Logout</span>
          </button>
        </div>
      </div>

      {panelOpen && <div className={styles.backdrop} onClick={closePanel} />}

      <View main url="/" />

      {!currentUser && (
        <div className={styles.authOverlay}>
          <Login />
        </div>
      )}

      {currentUser?.profile?.isBanned && <GlobalBannedScreen />}

      <RulesModal />
      <Tutorial />
    </>
  );
}