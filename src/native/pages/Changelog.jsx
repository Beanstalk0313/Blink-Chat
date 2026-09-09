import { Navbar, Page } from 'framework7-react';
import { APP_VERSION } from '../../version';
import { CHANGELOG } from '../../changelog';
import MenuButton from '../components/MenuButton';
import styles from './Changelog.module.css';

// "What's new" screen: the versioned changelog. The shell opens this page
// automatically the first time a given app version is opened on a device, and
// it can always be reached from the side panel.
export default function Changelog() {
  return (
    <Page className={styles.page}>
      <Navbar backLink="Back" backLinkShowText={false} title="What's new" large transparent>
        <MenuButton slot="left" />
        <span slot="right" className={styles.versionLabel}>v{APP_VERSION}</span>
      </Navbar>

      <div className={styles.intro}>
        <img src="/logo.svg" alt="" className={styles.logo} />
        <p>Here&apos;s what changed since you last visited. Every new version opens this page once.</p>
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
    </Page>
  );
}
