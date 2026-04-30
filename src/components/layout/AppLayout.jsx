import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import styles from './AppLayout.module.css';

const AppLayout = () => {
  return (
    <div className={styles.appContainer}>
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
