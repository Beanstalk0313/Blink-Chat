import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getDoc, doc } from 'firebase/firestore';
import { firestore } from '../../firebase/firebase';
import UserAvatar from '../common/UserAvatar';
import { getColor } from '../../services/utils';
import styles from './Sidebar.module.css';

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const [pinnedCommunities, setPinnedCommunities] = useState([]);
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(localStorage.getItem('sidebarPinned') === 'true');

  const togglePin = () => {
    const newState = !isPinned;
    setIsPinned(newState);
    localStorage.setItem('sidebarPinned', newState);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error("Failed to log out:", err);
    }
  };

  useEffect(() => {
    async function loadPinned() {
      const pinnedIds = currentUser?.profile?.pinnedCommunities;
      if (pinnedIds && pinnedIds.length > 0) {
        try {
          const comms = await Promise.all(
            pinnedIds.slice(0, 5).map(async (id) => {
              const snap = await getDoc(doc(firestore, 'communities', id));
              return snap.exists() ? { id, ...snap.data() } : null;
            })
          );
          setPinnedCommunities(comms.filter(c => c !== null));
        } catch (err) {
          console.error("Error loading pinned communities:", err);
        }
      } else {
        setPinnedCommunities([]);
      }
    }
    loadPinned();
  }, [currentUser?.profile?.pinnedCommunities]);

  const navItems = [
    { icon: 'home', label: 'Home', to: '/' },
    { icon: 'grid_view', label: 'Communities', to: '/communities' },
    { icon: 'explore', label: 'Discover', to: '/discover' },
    { icon: 'admin_panel_settings', label: 'Admin', to: '/admin' },
    { icon: 'pulse_alert', label: 'Activity', to: '/activity' },
  ];

  const isExpanded = isHovered || isPinned;

  return (
    <nav 
      className={`${styles.sidebar} ${isExpanded ? styles.expanded : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={styles.topSection}>
        {/* Logo / Brand */}
        <div className={styles.brandRow}>
          <Link to="/" className={styles.navItem} style={{ marginBottom: '0.5rem', flex: 1 }}>
            <div className={styles.iconWrapper}>
              <img src="/logo.svg" alt="Blink Logo" style={{ width: '28px', height: '28px' }} />
            </div>
            <span className={styles.navLabel} style={{ fontWeight: 800, letterSpacing: '-0.02em' }}>Blink Chat</span>
          </Link>
          <button 
            className={`${styles.pinButton} ${isPinned ? styles.active : ''}`}
            onClick={togglePin}
            title={isPinned ? "Unpin Sidebar" : "Pin Sidebar"}
          >
            <span className="material-symbols-outlined">
              {isPinned ? 'keep' : 'keep_off'}
            </span>
          </button>
        </div>

        {/* User Profile / Account */}
        <Link to="/profile" className={styles.profileWrapper}>
          <div className={styles.iconWrapper}>
            <UserAvatar user={currentUser?.profile} size="2.5rem" />
          </div>
          <span className={styles.navLabel}>{currentUser?.profile?.displayName || 'Profile'}</span>
          <span className={styles.tooltip}>Profile</span>
        </Link>

        <div className={styles.divider} />

        {/* Pinned Communities */}
        {pinnedCommunities.length > 0 && (
          <>
            <div className={styles.pinnedLabel}>
              <div className={styles.iconWrapper} style={{ background: 'transparent', border: 'none' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>push_pin</span>
              </div>
              <span className={styles.navLabel}>Pinned</span>
            </div>
            {pinnedCommunities.map(comm => (
              <Link 
                key={comm.id} 
                to={`/channels/${comm.id}`} 
                className={`${styles.navItem} ${location.pathname.includes(comm.id) ? styles.active : ''}`}
              >
                <div className={styles.communityIconWrapper}>
                  {comm.iconBase64 ? (
                    <img src={comm.iconBase64} alt={comm.name} className={styles.communityIcon} />
                  ) : (
                    <div className={styles.communityFallback} style={{ backgroundColor: getColor(comm.name) }}>
                      {comm.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <span className={styles.navLabel}>{comm.name}</span>
                <span className={styles.tooltip}>{comm.name}</span>
              </Link>
            ))}
            <div className={styles.divider} />
          </>
        )}

        {/* Navigation Items */}
        {navItems.map((item) => {
          const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));
          return (
            <Link 
              key={item.label} 
              to={item.to} 
              className={`${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <div className={styles.iconWrapper}>
                <span className="material-symbols-outlined" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                  {item.icon}
                </span>
              </div>
              <span className={styles.navLabel}>{item.label}</span>
              <span className={styles.tooltip}>{item.label}</span>
            </Link>
          );
        })}

        {/* Add Community Button */}
        <button className={styles.navItem} onClick={() => navigate('/create-community')}>
          <div className={styles.iconWrapper}>
            <span className="material-symbols-outlined">add</span>
          </div>
          <span className={styles.navLabel}>Create</span>
          <span className={styles.tooltip}>Create Community</span>
        </button>
      </div>

      {/* Bottom Section */}
      <div className={styles.bottomSection}>
        <Link to="/settings" className={`${styles.navItem} ${location.pathname === '/settings' ? styles.active : ''}`}>
          <div className={styles.iconWrapper}>
            <span className="material-symbols-outlined" style={{ fontVariationSettings: location.pathname === '/settings' ? "'FILL' 1" : "'FILL' 0" }}>settings</span>
          </div>
          <span className={styles.navLabel}>Settings</span>
          <span className={styles.tooltip}>Settings</span>
        </Link>
        
        <button className={`${styles.navItem} ${styles.logoutBtn}`} onClick={handleLogout}>
          <div className={styles.iconWrapper}>
            <span className="material-symbols-outlined">logout</span>
          </div>
          <span className={styles.navLabel}>Logout</span>
          <span className={styles.tooltip}>Logout</span>
        </button>
      </div>
    </nav>
  );
};

export default Sidebar;
