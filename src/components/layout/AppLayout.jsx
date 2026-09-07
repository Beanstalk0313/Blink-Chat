import { useEffect, useRef, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '../../firebase/data';
import Sidebar from './Sidebar';
import { useCall } from '../../contexts/CallContext';
import CallOverlay from '../common/CallOverlay';
import RulesModal from '../common/RulesModal';
import Tutorial from '../common/Tutorial';
import GlobalBannedScreen from '../common/GlobalBannedScreen';
import Modal from '../common/Modal';
import styles from './AppLayout.module.css';
import pkg from '../../../package.json';
import { useTheme } from '../../contexts/ThemeContext';
import { getCommunity } from '../../services/db';

// The call surface lives inside the main content column so it persists across
// every route but is clipped to the app's chrome. Keyed per call session so a
// brand-new call starts with fresh window state; leaving the app ends the call.
function CallWindow() {
  const { callSeq, endCall } = useCall();
  const endCallRef = useRef(endCall);
  useEffect(() => { endCallRef.current = endCall; }, [endCall]);
  useEffect(() => () => endCallRef.current(), []);
  return <CallOverlay key={`call-${callSeq}`} />;
}

const AppLayout = () => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const currentVersion = pkg.version;
  const { applyTheme } = useTheme();

  useEffect(() => {
    if (!firestore) return undefined;
    // Listen for version changes in Firestore
    const unsub = onSnapshot(doc(firestore, 'app', 'metadata'), (snap) => {
      if (snap.exists()) {
        const latestVersion = snap.data().latestVersion;
        if (latestVersion && latestVersion !== currentVersion) {
          setShowUpdateModal(true);
        }
      }
    }, (error) => {
      console.warn('App metadata listener error:', error);
    });
    return () => unsub();
  }, [currentVersion]);

  useEffect(() => {
    const pathParts = location.pathname.split('/');
    const communityId = pathParts[2];
    if (!communityId || (!location.pathname.startsWith('/channels/') && !location.pathname.startsWith('/community-settings/'))) {
      applyTheme(currentUser?.profile?.theme || 'default');
      return undefined;
    }
    let cancelled = false;
    getCommunity(communityId).then(community => {
      if (!cancelled) applyTheme(community?.theme || currentUser?.profile?.theme || 'default');
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [location.pathname, currentUser?.profile?.theme, applyTheme]);

  if (currentUser?.profile?.isBanned) {
    return <GlobalBannedScreen />;
  }

  return (
    <div className={styles.appContainer}>
      <RulesModal />
      <Tutorial />
      
      <Modal 
        isOpen={showUpdateModal} 
        onClose={() => {}} // Force update
        title="New Version Available"
        footer={(
          <button 
            className={styles.updateBtn} 
            onClick={() => window.location.reload()}
          >
            Refresh to Update
          </button>
        )}
      >
        <div style={{ textAlign: 'center', padding: '1rem' }}>
          <p className="text-body-md">A new version of Blink Chat is available. Please refresh to get the latest features and fixes!</p>
          <p className="text-label-sm text-tertiary" style={{ marginTop: '1rem' }}>
            Current: v{currentVersion}
          </p>
        </div>
      </Modal>
      
      {/* Mobile Top App Bar */}
      <div className={styles.mobileTopBar}>
        <div className={styles.brandName}>BLINK</div>
        <div className={styles.topBarActions}>
          <Link to="/profile">
            <span className="material-symbols-outlined">account_circle</span>
          </Link>
        </div>
      </div>

      <div className={styles.mainLayout}>
        <Sidebar />
        
        {/* Main Content Area (Chat, Discover, etc.) */}
        <main className={styles.mainContent}>
          <Outlet />
          <CallWindow />
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className={styles.mobileBottomNav}>
        <Link to="/" className={styles.bottomNavItem}>
          <span className="material-symbols-outlined">home</span>
          <span className="text-label-sm">Home</span>
        </Link>
        <Link to="/communities" className={styles.bottomNavItem}>
          <span className="material-symbols-outlined">grid_view</span>
          <span className="text-label-sm">Communities</span>
        </Link>
        <Link to="/discover" className={styles.bottomNavItem}>
          <span className="material-symbols-outlined">explore</span>
          <span className="text-label-sm">Discover</span>
        </Link>
        <Link to="/messages" className={styles.bottomNavItem}>
          <span className="material-symbols-outlined">forum</span>
          <span className="text-label-sm">Messages</span>
        </Link>
        <Link to="/settings" className={styles.bottomNavItem}>
          <span className="material-symbols-outlined">settings</span>
          <span className="text-label-sm">Settings</span>
        </Link>
      </nav>
    </div>
  );
};

export default AppLayout;

