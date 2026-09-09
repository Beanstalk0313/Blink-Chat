import { useState } from 'react';
import { f7, Navbar, Page, PageContent, Toggle } from 'framework7-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useTheme } from '../../contexts/ThemeContext';
import { updateUserProfile } from '../../services/db';
import { APP_VERSION } from '../../version';
import { getOsOverride } from '../device';
import MenuButton from '../components/MenuButton';
import ThemeSelect from '../../components/common/ThemeSelect';
import styles from './Settings.module.css';

// Settings sections live in the app sidebar (modular sidebar); the sidebar
// navigates to /settings/?tab=<section> and the query drives the active tab.
export const SETTINGS_SECTIONS = ['account', 'profile', 'notifications', 'privacy', 'appearance', 'about'];
export const SETTINGS_SECTION_LABELS = {
  account: 'My Account',
  profile: 'Profile',
  notifications: 'Notifications',
  privacy: 'Privacy & Safety',
  appearance: 'Appearance',
  about: 'About',
};

export default function Settings({ f7route }) {
  const { currentUser, logout, updateEmail, updatePassword, resetPassword } = useAuth();
  const {
    settings: notifySettings = { enabled: true, sound: true, desktop: true },
    setSettings: setNotifySettings = () => {},
    notificationPermission = 'unsupported',
    requestNotificationPermission = async () => false
  } = useNotifications() || {};
  const { setTheme } = useTheme();
  const queryTab = f7route?.query?.tab;
  const [activeTab, setActiveTab] = useState(SETTINGS_SECTIONS.includes(queryTab) ? queryTab : 'account');

  // Keep in sync when the sidebar navigates to /settings/?tab=<section>.
  // Adjusting state during render (React's documented pattern) avoids both
  // effects and stale state when the query changes on an existing instance.
  const [lastQueryTab, setLastQueryTab] = useState(queryTab);
  if (queryTab !== lastQueryTab) {
    setLastQueryTab(queryTab);
    if (SETTINGS_SECTIONS.includes(queryTab)) setActiveTab(queryTab);
  }

  const [newEmail, setNewEmail] = useState(currentUser?.email || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState(currentUser?.profile?.displayName || '');
  const [aboutMe, setAboutMe] = useState(currentUser?.profile?.aboutMe || '');
  const [status, setStatus] = useState(currentUser?.profile?.status || 'Online');
  const [isPrivate, setIsPrivate] = useState(Boolean(currentUser?.profile?.isPrivateProfile));
  const [blockPMs, setBlockPMs] = useState(Boolean(currentUser?.profile?.blockPrivateMessages));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const handleUpdateAccount = async event => {
    event.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      if (newEmail !== currentUser.email) {
        await updateEmail(newEmail);
        await updateUserProfile(currentUser.uid, { email: newEmail });
      }
      if (newPassword) {
        if (newPassword !== confirmPassword) throw new Error('Passwords do not match');
        await updatePassword(newPassword);
      }
      setMessage({ type: 'success', text: 'Account updated successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
    setLoading(false);
  };

  const handleUpdateProfile = async event => {
    event.preventDefault();
    setLoading(true);
    try {
      await updateUserProfile(currentUser.uid, { displayName, aboutMe, status });
      setMessage({ type: 'success', text: 'Profile updated!' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to update profile' });
    }
    setLoading(false);
  };

  const handlePrivacyToggle = async value => {
    setIsPrivate(value);
    try {
      await updateUserProfile(currentUser.uid, { isPrivateProfile: value });
    } catch {
      setMessage({ type: 'error', text: 'Failed to update privacy settings' });
    }
  };

  const handleBlockPMsToggle = async value => {
    setBlockPMs(value);
    try {
      await updateUserProfile(currentUser.uid, { blockPrivateMessages: value });
    } catch {
      setMessage({ type: 'error', text: 'Failed to update privacy settings' });
    }
  };

  const handleResetPassword = async () => {
    try {
      await resetPassword(currentUser.email);
      f7.dialog.alert('Password reset email sent!', 'Check your inbox');
    } catch {
      setMessage({ type: 'error', text: 'Failed to send reset email' });
    }
  };

  return (
    <Page className={styles.page}>
      <Navbar title="Settings" large transparent backLink={false}>
        <MenuButton slot="left" />
      </Navbar>

      <PageContent className={styles.content}>
        {message.text && <div className={`${styles.alert} ${message.type === 'error' ? styles.alertError : styles.alertSuccess}`}>{message.text}</div>}

        {activeTab === 'account' && (
          <form onSubmit={handleUpdateAccount} className={styles.form}>
            <div className={styles.field}><label>EMAIL ADDRESS</label><input type="email" value={newEmail} onChange={event => setNewEmail(event.target.value)} /></div>
            <div className={styles.field}><label>NEW PASSWORD</label><input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="Leave blank to keep current" /></div>
            {newPassword && <div className={styles.field}><label>CONFIRM NEW PASSWORD</label><input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></div>}
            <button type="submit" className={styles.primaryBtn} disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button>
            <button type="button" className={styles.linkBtn} onClick={handleResetPassword}>Forgot password?</button>
          </form>
        )}

        {activeTab === 'profile' && (
          <form onSubmit={handleUpdateProfile} className={styles.form}>
            <div className={styles.field}><label>DISPLAY NAME</label><input type="text" value={displayName} onChange={event => setDisplayName(event.target.value)} /></div>
            <div className={styles.field}><label>ABOUT ME</label><textarea rows={3} value={aboutMe} onChange={event => setAboutMe(event.target.value)} placeholder="Tell us about yourself..." /></div>
            <div className={styles.field}>
              <label>STATUS</label>
              <select value={status} onChange={event => setStatus(event.target.value)}>
                <option>Online</option><option>Away</option><option>Do Not Disturb</option><option>Invisible</option>
              </select>
            </div>
            <button type="submit" className={styles.primaryBtn} disabled={loading}>{loading ? 'Saving...' : 'Update Profile'}</button>
          </form>
        )}

        {activeTab === 'notifications' && (
          <div className={styles.form}>
            <p className={styles.hint}>These preferences control alerts while Blink is open or running in the background.</p>
            <div className={styles.toggleRow}>
              <div><strong>Enable notifications</strong><small>Master switch for alerts.</small></div>
              <Toggle checked={notifySettings.enabled} onToggleChange={value => setNotifySettings(previous => ({ ...previous, enabled: value }))} />
            </div>
            <div className={styles.toggleRow}>
              <div><strong>Sound</strong><small>Play a sound with alerts.</small></div>
              <Toggle checked={notifySettings.sound} onToggleChange={value => setNotifySettings(previous => ({ ...previous, sound: value }))} />
            </div>
            <div className={styles.toggleRow}>
              <div><strong>Desktop notifications</strong><small>System notifications when supported.</small></div>
              <Toggle checked={notifySettings.desktop} onToggleChange={value => setNotifySettings(previous => ({ ...previous, desktop: value }))} />
            </div>
            {notificationPermission === 'default' && (
              <button type="button" className={styles.primaryBtn} onClick={requestNotificationPermission}>Enable system notifications</button>
            )}
            {notificationPermission === 'denied' && <p className={styles.hint}>System notifications are blocked in your browser settings.</p>}
            <p className={styles.hint}>Note: when Blink is fully closed, notifications are not delivered on iOS Home Screen installs.</p>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className={styles.form}>
            <div className={styles.toggleRow}>
              <div><strong>Private profile</strong><small>Hide your about me from others.</small></div>
              <Toggle checked={isPrivate} onToggleChange={handlePrivacyToggle} />
            </div>
            <div className={styles.toggleRow}>
              <div><strong>Block direct messages</strong><small>Others cannot start PMs with you.</small></div>
              <Toggle checked={blockPMs} onToggleChange={handleBlockPMsToggle} />
            </div>
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className={styles.form}>
            <ThemeSelect value={currentUser?.profile?.theme || 'default'} onChange={themeId => setTheme(themeId).catch(() => {})} />
            <p className={styles.hint}>The native app follows your Blink theme colors inside Framework7&apos;s iOS/Android components.</p>
            <div className={styles.toggleRow}>
              <div><strong>Platform preview</strong><small>Force the iOS or Android theme for testing on this device. Reset to follow the real platform.</small></div>
            </div>
            <div className={styles.field}>
              <label>PLATFORM</label>
              <select
                value={getOsOverride() || ''}
                onChange={event => {
                  const value = event.target.value;
                  try {
                    if (value) localStorage.setItem('blink-native-os', value);
                    else localStorage.removeItem('blink-native-os');
                  } catch { /* Storage may be blocked. */ }
                  window.location.reload();
                }}
              >
                <option value="">Auto</option>
                <option value="ios">iOS</option>
                <option value="android">Android</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'about' && (
          <div className={styles.form}>
            <div className={styles.aboutCard}>
              <img src="/logo.svg" alt="Blink" />
              <strong>Blink Chat</strong>
              <span>Version {APP_VERSION}</span>
            </div>
            <button type="button" className={styles.linkBtn} onClick={() => { const router = f7?.views?.main?.router; if (router) router.navigate('/changelog/'); else window.location.hash = '#/changelog/'; }}>What&apos;s new</button>
            <button type="button" className={styles.dangerBtn} onClick={logout}>Logout</button>
          </div>
        )}
      </PageContent>
    </Page>
  );
}
