import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Sidebar from './Sidebar';
import RulesModal from '../common/RulesModal';
import Tutorial from '../common/Tutorial';
import GlobalBannedScreen from '../common/GlobalBannedScreen';
import styles from './AppLayout.module.css';

const AppLayout = () => {
  const { currentUser } = useAuth();

  if (currentUser?.profile?.isBanned) {
    return <GlobalBannedScreen />;
  }

  return (
    <div className={styles.appContainer}>
      <RulesModal />
      <Tutorial />
      
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
    </div>
  );
};

export default AppLayout;

