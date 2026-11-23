import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { getUserProfile, updateUserProfile } from '../services/db';
import { createGuardianCode, linkGuardian, setCommunityCreationBlocked, subscribeToChildControls, subscribeToGuardianLink, unlinkGuardian } from '../services/parental';
import { FRIEND_REQUEST_PRIVACY_OPTIONS, MESSAGE_PRIVACY_OPTIONS, friendRequestPrivacyOf, messagePrivacyOf, setFriendRequestPrivacy as saveFriendRequestPrivacy, setMessagePrivacy as saveMessagePrivacy } from '../services/friends';
import Modal from '../components/common/Modal';
import Dropdown from '../components/common/Dropdown';
import styles from './Settings.module.css';
import ThemeSelect from '../components/common/ThemeSelect';
import { useTheme } from '../contexts/ThemeContext';
import { Link } from 'react-router-dom';
import { APP_VERSION } from '../version';

export default function Settings() {
  const { currentUser, logout, updateEmail, updatePassword, resetPassword } = useAuth();
  const { settings: notifySettings, setSettings: setNotifySettings, notificationPermission, requestNotificationPermission } = useNotifications();
  const { themes, globalTheme, setTheme, addCustomTheme, removeCustomTheme, reducedMotion, setReducedMotion, highContrast, setHighContrast } = useTheme();
  const [activeTab, setActiveTab] = useState('account');
  
  // Account States
  const [newEmail, setNewEmail] = useState(currentUser?.email || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Profile States
  const [displayName, setDisplayName] = useState(currentUser?.profile?.displayName || '');
  const [aboutMe, setAboutMe] = useState(currentUser?.profile?.aboutMe || '');
  
  // Privacy States
  const [isPrivate, setIsPrivate] = useState(currentUser?.profile?.isPrivateProfile || false);
  const [friendRequestPrivacy, setFriendRequestPrivacy] = useState(friendRequestPrivacyOf(currentUser?.profile));
  const [messagePrivacy, setMessagePrivacy] = useState(messagePrivacyOf(currentUser?.profile));
  const [gameActivity, setGameActivity] = useState(currentUser?.profile?.gameActivity !== false);
  const [status, setStatus] = useState(currentUser?.profile?.status || 'Online');

  // Custom themes: a name plus the three colours the palette builder derives
  // every other token from.
  const [customThemeDraft, setCustomThemeDraft] = useState({ label: '', primary: '#4b8eff', accent: '#2563eb', base: '#0f1117' });
  const [savingCustomTheme, setSavingCustomTheme] = useState(false);

  // Parental controls: `ownControls` is set when this account has a guardian;
  // `guardianLink` is set when this account is guarding a child.
  const [ownControls, setOwnControls] = useState(null);
  const [guardianLink, setGuardianLink] = useState(null);
  const [linkedChildControls, setLinkedChildControls] = useState(null);
  const [guardianProfile, setGuardianProfile] = useState(null);
  const [childProfile, setChildProfile] = useState(null);
  const [pairingCode, setPairingCode] = useState(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingError, setPairingError] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [parentalBusy, setParentalBusy] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Sync form fields when the account changes, and once more when its profile
  // first arrives, using render-time adjustment (an effect here would clobber
  // unsaved form edits on every profile snapshot with stale values while the
  // user was typing). Keying on "uid:profile-loaded" matters because the
  // profile document loads a moment after sign-in: keying on uid alone synced
  // the defaults first, then refused to sync again, so saved settings (privacy
  // levels, status, private profile) showed up as default on every visit.
  const [syncedKey, setSyncedKey] = useState(null);
  const profileSyncKey = `${currentUser?.uid || ''}:${currentUser?.profileLoaded ? 'loaded' : 'pending'}`;
  if (syncedKey !== profileSyncKey) {
    setSyncedKey(profileSyncKey);
    const profile = currentUser?.profile || {};
    setNewEmail(currentUser?.email || profile.email || '');
    setDisplayName(profile.displayName || currentUser?.displayName || '');
    setAboutMe(profile.aboutMe || '');
    setIsPrivate(Boolean(profile.isPrivateProfile));
    setFriendRequestPrivacy(friendRequestPrivacyOf(profile));
    setMessagePrivacy(messagePrivacyOf(profile));
    setGameActivity(profile.gameActivity !== false);
    setStatus(profile.status || 'Online');
  }

  const handleUpdateAccount = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      if (newEmail !== currentUser.email) {
        await updateEmail(newEmail);
        await updateUserProfile(currentUser.uid, { email: newEmail });
      }
      if (newPassword) {
        if (newPassword !== confirmPassword) throw new Error("Passwords do not match");
        await updatePassword(newPassword);
      }
      setMessage({ type: 'success', text: 'Account updated successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
    setLoading(false);
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateUserProfile(currentUser.uid, {
        displayName,
        aboutMe,
        status
      });
      setMessage({ type: 'success', text: 'Profile updated!' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to update profile' });
    }
    setLoading(false);
  };

  const handlePrivacyToggle = async (val) => {
    setIsPrivate(val);
    try {
      await updateUserProfile(currentUser.uid, { isPrivateProfile: val });
    } catch {
      setMessage({ type: 'error', text: 'Failed to update privacy settings' });
    }
  };

  const handleFriendRequestPrivacy = async (val) => {
    setFriendRequestPrivacy(val);
    try {
      await saveFriendRequestPrivacy(currentUser.uid, val);
    } catch {
      setMessage({ type: 'error', text: 'Failed to update privacy settings' });
    }
  };

  const handleMessagePrivacy = async (val) => {
    setMessagePrivacy(val);
    try {
      await saveMessagePrivacy(currentUser.uid, val);
    } catch {
      setMessage({ type: 'error', text: 'Failed to update privacy settings' });
    }
  };

  const handleGameActivityToggle = async (val) => {
    setGameActivity(val);
    try {
      await updateUserProfile(currentUser.uid, { gameActivity: val });
    } catch {
      setMessage({ type: 'error', text: 'Failed to update game activity' });
    }
  };

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 1024) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!currentUser?.uid) return undefined;
    const unsubscribeControls = subscribeToChildControls(currentUser.uid, setOwnControls);
    const unsubscribeLink = subscribeToGuardianLink(currentUser.uid, setGuardianLink);
    return () => {
      unsubscribeControls();
      unsubscribeLink();
    };
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!guardianLink?.childUid) return undefined;
    const unsubscribe = subscribeToChildControls(guardianLink.childUid, setLinkedChildControls);
    let cancelled = false;
    getUserProfile(guardianLink.childUid)
      .then(profile => { if (!cancelled) setChildProfile(profile); })
      .catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [guardianLink?.childUid]);

  useEffect(() => {
    if (!ownControls?.parentUid) return undefined;
    let cancelled = false;
    getUserProfile(ownControls.parentUid)
      .then(profile => { if (!cancelled) setGuardianProfile(profile); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ownControls?.parentUid]);

  const handleCreatePairingCode = async () => {
    setPairingError('');
    setPairingBusy(true);
    try {
      setPairingCode(await createGuardianCode(currentUser.uid));
    } catch (error) {
      setPairingError(error?.message || 'Could not create a pairing code.');
    } finally {
      setPairingBusy(false);
    }
  };

  const handleLinkGuardian = async event => {
    event.preventDefault();
    setPairingError('');
    setParentalBusy(true);
    try {
      await linkGuardian(currentUser.uid, codeInput);
      setCodeInput('');
      setMessage({ type: 'success', text: 'Guardian account linked.' });
    } catch (error) {
      setPairingError(error?.message || 'That account could not be linked.');
    } finally {
      setParentalBusy(false);
    }
  };

  const handleCreationBlockToggle = async value => {
    if (!guardianLink?.childUid) return;
    try {
      await setCommunityCreationBlocked(guardianLink.childUid, value);
    } catch {
      setPairingError('That setting could not be saved.');
    }
  };

  const handleUnlinkGuardian = async () => {
    if (!guardianLink?.childUid) return;
    try {
      await unlinkGuardian(currentUser.uid, guardianLink.childUid);
    } catch {
      setPairingError('That account could not be unlinked.');
    }
  };

  const handleAddCustomTheme = async () => {
    if (!customThemeDraft.label.trim()) {
      setMessage({ type: 'error', text: 'Give your theme a name first.' });
      return;
    }
    setSavingCustomTheme(true);
    try {
      await addCustomTheme(customThemeDraft);
      setCustomThemeDraft({ label: '', primary: '#4b8eff', accent: '#2563eb', base: '#0f1117' });
      setMessage({ type: 'success', text: 'Custom theme saved.' });
    } catch {
      setMessage({ type: 'error', text: 'That theme could not be saved.' });
    } finally {
      setSavingCustomTheme(false);
    }
  };

  const handleRemoveCustomTheme = async themeId => {
    try {
      await removeCustomTheme(themeId);
    } catch {
      setMessage({ type: 'error', text: 'That theme could not be removed.' });
    }
  };

  const handleResetPassword = async () => {
    try {
      await resetPassword(currentUser.email);
      setIsResetModalOpen(true);
    } catch {
      setMessage({ type: 'error', text: 'Failed to send reset email' });
    }
  };

  const customThemeEntries = Object.entries(themes).filter(([themeId]) => themeId.startsWith('custom-'));

  const tabs = [
    { id: 'account', label: 'My Account', icon: 'person' },
    { id: 'profile', label: 'Profile', icon: 'badge' },
    { id: 'notifications', label: 'Notifications', icon: 'notifications' },
    { id: 'privacy', label: 'Privacy & Safety', icon: 'shield' },
    { id: 'parental', label: 'Parental Controls', icon: 'family_restroom' },
    { id: 'appearance', label: 'Appearance', icon: 'palette' },
    { id: 'about', label: 'About', icon: 'info' },
  ];

  return (
    <div className={styles.page}>
      {/* Mobile Sidebar Backdrop */}
      {isSidebarOpen && window.innerWidth <= 1024 && (
        <div className={styles.sidebarBackdrop} onClick={() => setIsSidebarOpen(false)} />
      )}

      <div className={`${styles.sidebar} ${!isSidebarOpen ? styles.closed : ''}`}>
        <div className={styles.sidebarHeader}>
          <span className="text-label-sm text-tertiary">USER SETTINGS</span>
        </div>
        {tabs.map(tab => (
          <button 
            key={tab.id}
            className={`${styles.tabBtn} ${activeTab === tab.id ? styles.activeTab : ''}`}
            onClick={() => {
              setActiveTab(tab.id);
              setMessage({ type: '', text: '' });
              if (window.innerWidth <= 1024) setIsSidebarOpen(false);
            }}
          >
            <span className="material-symbols-outlined">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
        <div className={styles.divider} />
        <button className={styles.logoutBtn} onClick={logout}>
          <span className="material-symbols-outlined">logout</span>
          <span>Logout</span>
        </button>
      </div>

      <div className={styles.content}>
        <header className={styles.mobileHeader}>
          <button className={styles.menuToggle} onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            <span className="material-symbols-outlined">menu</span>
          </button>
          <h2 className="text-headline-md">Settings</h2>
        </header>

        <div className={styles.contentInner}>
          {message.text && (
            <div className={`${styles.alert} ${styles[message.type]}`}>
              {message.text}
            </div>
          )}

          {activeTab === 'account' && (
            <div className={styles.section}>
              <h1 className="text-display-xl">My Account</h1>
              <form onSubmit={handleUpdateAccount} className={styles.form}>
                <div className={styles.inputGroup}>
                  <label className="text-label-md">EMAIL ADDRESS</label>
                  <input 
                    type="email" 
                    value={newEmail} 
                    onChange={(e) => setNewEmail(e.target.value)} 
                    className={styles.input}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label className="text-label-md">NEW PASSWORD</label>
                  <input 
                    type="password" 
                    value={newPassword} 
                    onChange={(e) => setNewPassword(e.target.value)} 
                    className={styles.input}
                    placeholder="Leave blank to keep current"
                  />
                </div>
                {newPassword && (
                  <div className={styles.inputGroup}>
                    <label className="text-label-md">CONFIRM NEW PASSWORD</label>
                    <input 
                      type="password" 
                      value={confirmPassword} 
                      onChange={(e) => setConfirmPassword(e.target.value)} 
                      className={styles.input}
                    />
                  </div>
                )}
                <div className={styles.actionRow}>
                  <button type="submit" className={styles.submitBtn} disabled={loading}>
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button type="button" className={styles.linkBtn} onClick={handleResetPassword}>
                    Forgot password?
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className={styles.section}>
              <h1 className="text-display-xl">Profile</h1>
              <form onSubmit={handleUpdateProfile} className={styles.form}>
                <div className={styles.inputGroup}>
                  <label className="text-label-md">DISPLAY NAME</label>
                  <input 
                    type="text" 
                    value={displayName} 
                    onChange={(e) => setDisplayName(e.target.value)} 
                    className={styles.input}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label className="text-label-md">ABOUT ME</label>
                  <textarea 
                    value={aboutMe} 
                    onChange={(e) => setAboutMe(e.target.value)} 
                    className={styles.textarea}
                    placeholder="Tell us about yourself..."
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label className="text-label-md">STATUS</label>
                  <Dropdown value={status} onChange={setStatus} options={[{ value: 'Online', label: 'Online' }, { value: 'Away', label: 'Away' }, { value: 'Do Not Disturb', label: 'Do Not Disturb' }, { value: 'Invisible', label: 'Invisible' }]} />
                </div>
                <button type="submit" className={styles.submitBtn} disabled={loading}>
                  {loading ? 'Saving...' : 'Update Profile'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className={styles.section}>
              <h1 className="text-display-xl">Notifications</h1>
              <p className="text-body-md text-tertiary">These preferences control alerts while Blink is open or running in the background.</p>
              {notificationPermission === 'default' && (
                <div className={styles.settingCard}>
                  <div className={styles.settingInfo}>
                    <span className="text-label-md">ENABLE THIS DEVICE</span>
                    <p className="text-body-md text-tertiary">Allow notifications here so Blink can alert you while you are in another channel or the browser tab is in the background.</p>
                  </div>
                  <button type="button" className={styles.submitBtn} onClick={() => requestNotificationPermission().catch(() => {})}>Enable</button>
                </div>
              )}
              {notificationPermission === 'denied' && (
                <p className="text-body-md text-tertiary">Notifications are blocked for this device. Allow them in Safari or the device notification settings, then reload Blink.</p>
              )}
              <div className={styles.settingCard}>
                <div className={styles.settingInfo}>
                  <span className="text-label-md">ALLOW NOTIFICATIONS</span>
                  <p className="text-body-md text-tertiary">Turn this off to stop local and background push notifications.</p>
                </div>
                <label className={styles.switch}>
                  <input type="checkbox" checked={notifySettings.enabled} onChange={(e) => setNotifySettings(prev => ({ ...prev, enabled: e.target.checked }))} />
                  <span className={styles.slider}></span>
                </label>
              </div>
              <div className={styles.settingCard}>
                <div className={styles.settingInfo}>
                  <span className="text-label-md">SOUND EFFECTS</span>
                  <p className="text-body-md text-tertiary">Play a sound when you receive a message.</p>
                </div>
                <label className={styles.switch}>
                  <input 
                    type="checkbox" 
                    checked={notifySettings.sound} 
                    onChange={(e) => setNotifySettings(prev => ({ ...prev, sound: e.target.checked }))} 
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
              <div className={styles.settingCard}>
                <div className={styles.settingInfo}>
                  <span className="text-label-md">DESKTOP NOTIFICATIONS</span>
                  <p className="text-body-md text-tertiary">Show a system notification when you receive a message.</p>
                </div>
                <label className={styles.switch}>
                  <input 
                    type="checkbox" 
                    checked={notifySettings.desktop} 
                    onChange={(e) => setNotifySettings(prev => ({ ...prev, desktop: e.target.checked }))} 
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className={styles.section}>
              <h1 className="text-display-xl">Privacy & Safety</h1>
              <div className={styles.settingCard}>
                <div className={styles.settingInfo}>
                  <span className="text-label-md">PRIVATE PROFILE</span>
                  <p className="text-body-md text-tertiary">When enabled, your profile page is hidden from other users.</p>
                </div>
                <label className={styles.switch}>
                  <input type="checkbox" checked={isPrivate} onChange={(e) => handlePrivacyToggle(e.target.checked)} />
                  <span className={styles.slider}></span>
                </label>
              </div>
              <div className={styles.settingCard}>
                <div className={styles.settingInfo}>
                  <span className="text-label-md">WHO CAN SEND YOU FRIEND REQUESTS</span>
                  <p className="text-body-md text-tertiary">Friends of friends means someone who already shares a mutual friend with you.</p>
                </div>
                <Dropdown
                  value={friendRequestPrivacy}
                  onChange={handleFriendRequestPrivacy}
                  options={FRIEND_REQUEST_PRIVACY_OPTIONS}
                  ariaLabel="Who can send you friend requests"
                />
              </div>
              <div className={styles.settingCard}>
                <div className={styles.settingInfo}>
                  <span className="text-label-md">WHO CAN SEND YOU PRIVATE MESSAGES</span>
                  <p className="text-body-md text-tertiary">Applies to new direct messages. People you already talk to keep their conversation.</p>
                </div>
                <Dropdown
                  value={messagePrivacy}
                  onChange={handleMessagePrivacy}
                  options={MESSAGE_PRIVACY_OPTIONS}
                  ariaLabel="Who can send you private messages"
                />
              </div>
              <div className={styles.settingCard}>
                <div className={styles.settingInfo}>
                  <span className="text-label-md">SHOW GAME ACTIVITY</span>
                  <p className="text-body-md text-tertiary">Desktop app only: shows the game you are playing on your profile and to your friends. Blink never sees games you have not told it to look for.</p>
                </div>
                <label className={styles.switch}>
                  <input type="checkbox" checked={gameActivity} onChange={(e) => handleGameActivityToggle(e.target.checked)} />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'parental' && (
            <div className={styles.section}>
              <h1 className="text-display-xl">Parental Controls</h1>
              <p className="text-body-md text-tertiary">
                A guardian can see which communities this account belongs to, read those messages, block communities, and turn off community creation. Controls attach only with a one-time code generated on the child&apos;s own account, so nobody can add them to an account without permission.
              </p>
              {pairingError && <p className={styles.error}>{pairingError}</p>}

              {ownControls ? (
                <div className={styles.settingCard}>
                  <div className={styles.settingInfo}>
                    <span className="text-label-md">YOUR GUARDIAN</span>
                    <p className="text-body-md text-tertiary">
                      {guardianProfile?.displayName
                        ? `${guardianProfile.displayName} can see this account's communities and messages.`
                        : 'A guardian can see this account’s communities and messages.'}
                    </p>
                    <p className={styles.parentalMeta}>
                      {ownControls.blockCommunityCreation ? 'Creating communities is turned off.' : 'You can create communities.'}
                      {' · '}
                      {(ownControls.blockedCommunities || []).length
                        ? `${ownControls.blockedCommunities.length} communit${ownControls.blockedCommunities.length === 1 ? 'y is' : 'ies are'} blocked.`
                        : 'No communities are blocked.'}
                    </p>
                    <p className={styles.parentalMeta}>Only your guardian can disconnect this account.</p>
                  </div>
                </div>
              ) : (
                <div className={styles.parentalCard}>
                  <span className="text-label-md">PAIR WITH A GUARDIAN</span>
                  <p className="text-body-md text-tertiary">Generate a one-time code on this account and give it to your parent. It expires after 15 minutes and works once.</p>
                  {pairingCode && (
                    <div className={styles.pairingCodeRow}>
                      <code className={styles.pairingCode}>{pairingCode.code}</code>
                      <span className={styles.parentalMeta}>Expires {new Date(pairingCode.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}
                  <button type="button" className={styles.submitBtn} onClick={handleCreatePairingCode} disabled={pairingBusy || Boolean(guardianLink)}>
                    {pairingBusy ? 'Creating…' : pairingCode ? 'Generate a new code' : 'Generate pairing code'}
                  </button>
                </div>
              )}

              {guardianLink ? (
                <div className={styles.parentalCard}>
                  <span className="text-label-md">YOU ARE GUARDING</span>
                  <p className="text-body-md text-tertiary">
                    {childProfile?.displayName ? `You are guarding ${childProfile.displayName}'s account.` : 'Linked account.'}
                    {' '}Open the guardian dashboard to see their communities, read their messages and block communities.
                  </p>
                  <div className={styles.parentalActions}>
                    <Link to="/guardian" className={styles.submitBtn}>Open guardian dashboard</Link>
                    <button type="button" className={styles.ghostBtn} onClick={handleUnlinkGuardian}>Unlink account</button>
                  </div>
                  <div className={styles.settingCardInner}>
                    <div className={styles.settingInfo}>
                      <span className="text-label-md">BLOCK CREATING COMMUNITIES</span>
                      <p className="text-body-md text-tertiary">Stops this account from creating new communities.</p>
                    </div>
                    <label className={styles.switch}>
                      <input type="checkbox" checked={Boolean(linkedChildControls?.blockCommunityCreation)} onChange={event => handleCreationBlockToggle(event.target.checked)} />
                      <span className={styles.slider}></span>
                    </label>
                  </div>
                </div>
              ) : (
                <div className={styles.parentalCard}>
                  <span className="text-label-md">I AM A GUARDIAN</span>
                  <p className="text-body-md text-tertiary">Enter the pairing code from your child&apos;s account. There is no way to add controls without a code, so this cannot be used on someone else&apos;s account.</p>
                  <form className={styles.parentalForm} onSubmit={handleLinkGuardian}>
                    <input
                      className={styles.input}
                      value={codeInput}
                      onChange={event => setCodeInput(event.target.value.toUpperCase())}
                      placeholder="Pairing code"
                      maxLength={12}
                      aria-label="Pairing code"
                    />
                    <button type="submit" className={styles.submitBtn} disabled={parentalBusy || codeInput.trim().length < 6}>
                      {parentalBusy ? 'Linking…' : 'Link account'}
                    </button>
                  </form>
                  <p className={styles.parentalMeta}>One guarded account per guardian account.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className={styles.section}>
              <h1 className="text-display-xl">Appearance</h1>
              <p className="text-body-lg text-tertiary">Customize how Blink looks for you.</p>
              <div className={styles.settingCard}>
                <div className={styles.settingInfo}>
                  <span className="text-label-md">APP THEME</span>
                  <p className="text-body-md text-tertiary">Your theme follows you across Blink.</p>
                </div>
                <ThemeSelect value={globalTheme} onChange={setTheme} label="" />
              </div>
              <div className={styles.parentalCard}>
                <span className="text-label-md">CUSTOM THEMES</span>
                <p className="text-body-md text-tertiary">Build a theme from three colours: the main accent, the highlight, and the background. Every surface follows them.</p>
                <div className={styles.themeBuilder}>
                  <input
                    className={styles.themeNameInput}
                    value={customThemeDraft.label}
                    onChange={event => setCustomThemeDraft(previous => ({ ...previous, label: event.target.value }))}
                    placeholder="Theme name"
                    maxLength={32}
                    aria-label="Custom theme name"
                  />
                  <label className={styles.colorField}>
                    <span>Accent</span>
                    <input type="color" className={styles.colorInput} value={customThemeDraft.primary} onChange={event => setCustomThemeDraft(previous => ({ ...previous, primary: event.target.value }))} />
                  </label>
                  <label className={styles.colorField}>
                    <span>Highlight</span>
                    <input type="color" className={styles.colorInput} value={customThemeDraft.accent} onChange={event => setCustomThemeDraft(previous => ({ ...previous, accent: event.target.value }))} />
                  </label>
                  <label className={styles.colorField}>
                    <span>Background</span>
                    <input type="color" className={styles.colorInput} value={customThemeDraft.base} onChange={event => setCustomThemeDraft(previous => ({ ...previous, base: event.target.value }))} />
                  </label>
                  <button type="button" className={styles.submitBtn} onClick={handleAddCustomTheme} disabled={savingCustomTheme}>
                    {savingCustomTheme ? 'Saving…' : 'Save theme'}
                  </button>
                </div>
                {customThemeEntries.length > 0 && (
                  <div className={styles.customThemeList}>
                    {customThemeEntries.map(([themeId, theme]) => (
                      <div key={themeId} className={styles.customThemeRow}>
                        <span className={styles.customThemeSwatches} aria-hidden="true">
                          <i style={{ background: theme.primary }} />
                          <i style={{ background: theme.accent }} />
                          <i style={{ background: theme.base }} />
                        </span>
                        <span className={styles.customThemeName}>{theme.label}</span>
                        <button type="button" className={styles.themeDeleteBtn} onClick={() => handleRemoveCustomTheme(themeId)}>Delete</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.settingCard}>
                <div className={styles.settingInfo}>
                  <span className="text-label-md">REDUCED MOTION</span>
                  <p className="text-body-md text-tertiary">Turns off animations and transitions across Blink.</p>
                </div>
                <label className={styles.switch}>
                  <input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} />
                  <span className={styles.slider}></span>
                </label>
              </div>
              <div className={styles.settingCard}>
                <div className={styles.settingInfo}>
                  <span className="text-label-md">HIGH CONTRAST</span>
                  <p className="text-body-md text-tertiary">Stronger text, borders and surface separation for readability.</p>
                </div>
                <label className={styles.switch}>
                  <input type="checkbox" checked={highContrast} onChange={(e) => setHighContrast(e.target.checked)} />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className={styles.section}>
              <h1 className="text-display-xl">About Blink</h1>
              <div className={styles.aboutCard}>
                <div className={styles.brand}>
                  <span className="material-symbols-outlined">bubble_chart</span>
                  <span className="text-display-xl">BLINK</span>
                </div>
                <p className="text-body-lg">The future of real-time communication.</p>
                <div className={styles.versionInfo}>
                  <p className="text-label-md">Version {APP_VERSION}</p>
                  <p className="text-label-sm text-tertiary">Built with React & Firebase</p>
                  <Link to="/whats-new" className="text-label-md" style={{ color: 'var(--color-primary)' }}>What&apos;s new</Link>
                </div>
                <p className="text-body-md">Developed with ❤️ for the future of chat.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal 
        isOpen={isResetModalOpen} 
        onClose={() => setIsResetModalOpen(false)}
        title="Check Your Email"
        footer={<button className={styles.submitBtn} onClick={() => setIsResetModalOpen(false)}>Got it</button>}
      >
        <p className="text-body-md">We've sent a password reset link to <strong>{currentUser.email}</strong>. Please check your inbox and follow the instructions.</p>
      </Modal>
    </div>
  );
}
