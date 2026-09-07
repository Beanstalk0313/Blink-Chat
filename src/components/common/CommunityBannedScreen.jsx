import { useNavigate } from 'react-router-dom';
import styles from './CommunityBannedScreen.module.css';

export default function CommunityBannedScreen({ expirationTime }) {
  const navigate = useNavigate();

  const isPermanent = expirationTime === -1;
  const expirationDate = !isPermanent ? new Date(expirationTime).toLocaleString() : null;

  return (
    <div className={styles.bannedContainer}>
      <div className={styles.bannedCard}>
        <span className="material-symbols-outlined" style={{ fontSize: '4rem', color: '#EF4444' }}>
          block
        </span>
        <h1 className="text-display-xl" style={{ marginTop: '1rem', color: '#EF4444' }}>Access Denied</h1>
        <p className="text-body-lg" style={{ marginTop: '1rem', color: 'var(--color-tertiary)', textAlign: 'center', lineHeight: 1.6 }}>
          {isPermanent ? (
            <>You've been banned from this community permanently.</>
          ) : (
            <>You've been suspended from this community until <strong>{expirationDate}</strong>.</>
          )}
        </p>
        <button className={styles.backBtn} onClick={() => navigate('/communities')}>
          Back to Communities
        </button>
      </div>
    </div>
  );
}
