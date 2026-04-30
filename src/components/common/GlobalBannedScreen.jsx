import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import styles from './GlobalBannedScreen.module.css';

export default function GlobalBannedScreen() {
  const { logout } = useAuth();

  return (
    <div className={styles.bannedContainer}>
      <div className={styles.bannedCard}>
        <span className="material-symbols-outlined" style={{ fontSize: '4rem', color: '#EF4444' }}>
          gavel
        </span>
        <h1 className="text-display-xl" style={{ marginTop: '1rem', color: '#EF4444' }}>Account Banned</h1>
        <p className="text-body-lg" style={{ marginTop: '1rem', color: 'var(--color-tertiary)', textAlign: 'center', lineHeight: 1.6 }}>
          You've been banned from Blink for violating our usage rules.<br/><br/>
          If you believe this is a mistake, reach out to <strong style={{ color: 'white' }}>beanstalk0013@gmail.com</strong> to appeal your ban.
        </p>
        <button className={styles.logoutBtn} onClick={logout}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
