import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Sidebar from './Sidebar';
import RulesModal from '../common/RulesModal';
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
      
      {/* Mobile Top App Bar */}
      <div className={styles.mobileTopBar}>
        <div className={styles.brandName}>BLINK</div>
        <div className={styles.topBarActions}>
          <span className="material-symbols-outlined">notifications</span>
          <span className="material-symbols-outlined">account_circle</span>
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

