import { Link } from 'react-router-dom';
import { APP_VERSION } from '../version';
import { CHANGELOG } from '../changelog';
import styles from './WhatsNew.module.css';

// Web "What's new" screen: the versioned changelog, ported from the native
// app. Entries come from src/changelog.md, which is edited by hand.
export default function WhatsNew() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>What&apos;s new</h1>
        <span className={styles.versionLabel}>v{APP_VERSION}</span>
      </div>

      <div className={styles.intro}>
        <img src="/logo.svg" alt="" className={styles.logo} />
        <p>Here&apos;s what changed since you last visited.</p>
      </div>

      {CHANGELOG.map((entry, index) => (
        <div key={entry.version} className={`${styles.entry} ${index === 0 ? styles.current : ''}`}>
          <h3>
            {entry.title || `Version ${entry.version}`}
            {index === 0 && <span className={styles.newBadge}>NEW</span>}
          </h3>
          <p className={styles.meta}>Version {entry.version} · {entry.date}</p>
          <ul>
            {(entry.notes || []).map((note, noteIndex) => <li key={noteIndex}>{note}</li>)}
          </ul>
        </div>
      ))}

      {!CHANGELOG.length && (
        <div className={styles.empty}>
          <p>No changelog entries yet.</p>
        </div>
      )}

      <p style={{ textAlign: 'center' }}>
        <Link to="/settings" className="text-label-sm text-tertiary">Back to Blink</Link>
      </p>
    </div>
  );
}
