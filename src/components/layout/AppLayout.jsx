import React, { useEffect, useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '../../firebase/firebase';
import Sidebar from './Sidebar';
import RulesModal from '../common/RulesModal';
import Tutorial from '../common/Tutorial';
import GlobalBannedScreen from '../common/GlobalBannedScreen';
import Modal from '../common/Modal';
import styles from './AppLayout.module.css';
import pkg from '../../../package.json';

const AppLayout = () => {
  const { currentUser } = useAuth();
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const currentVersion = pkg.version;

  useEffect(() => {
    // Listen for version changes in Firestore
    const unsub = onSnapshot(doc(firestore, 'app', 'metadata'), (snap) => {
      if (snap.exists()) {
        const latestVersion = snap.data().latestVersion;
        if (latestVersion && latestVersion !== currentVersion) {
          setShowUpdateModal(true);
        }
      }
    });
    return () => unsub();
  }, [currentVersion]);

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
          <Link to="/activity">
            <span className="material-symbols-outlined">notifications</span>
          </Link>
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
          <span className="text-label-sm">Comms</span>
        </Link>
        <Link to="/discover" className={styles.bottomNavItem}>
          <span className="material-symbols-outlined">explore</span>
          <span className="text-label-sm">Discover</span>
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

