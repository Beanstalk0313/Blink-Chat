import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { updateUserProfile } from '../services/db';
import Modal from '../components/common/Modal';
import styles from './Settings.module.css';

export default function Settings() {
  const { currentUser, logout, updateEmail, updatePassword, resetPassword } = useAuth();
  const { settings: notifySettings, setSettings: setNotifySettings } = useNotifications();
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
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

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
        aboutMe
      });
      setMessage({ type: 'success', text: 'Profile updated!' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to update profile' });
    }
    setLoading(false);
  };

  const handlePrivacyToggle = async (val) => {
    setIsPrivate(val);
    try {
      await updateUserProfile(currentUser.uid, { isPrivateProfile: val });
    } catch (err) {
      console.error(err);
    }
  };

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);

  React.useEffect(() => {
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

  const handleResetPassword = async () => {
    try {
      await resetPassword(currentUser.email);
      setIsResetModalOpen(true);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to send reset email' });
    }
  };

  const tabs = [
    { id: 'account', label: 'My Account', icon: 'person' },
    { id: 'profile', label: 'Profile', icon: 'badge' },
    { id: 'notifications', label: 'Notifications', icon: 'notifications' },
    { id: 'privacy', label: 'Privacy & Safety', icon: 'shield' },
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
                <button type="submit" className={styles.submitBtn} disabled={loading}>
                  {loading ? 'Saving...' : 'Update Profile'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className={styles.section}>
              <h1 className="text-display-xl">Notifications</h1>
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
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className={styles.section}>
              <h1 className="text-display-xl">Appearance</h1>
              <p className="text-body-lg text-tertiary">Customize how Blink looks for you.</p>
              <div className={styles.comingSoon}>
                <span className="material-symbols-outlined">auto_awesome</span>
                <p>Themes and accessibility options coming soon!</p>
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
                  <p className="text-label-md">Version 2.2.0</p>
                  <p className="text-label-sm text-tertiary">Built with React & Firebase</p>
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
