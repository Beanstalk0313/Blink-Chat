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

  return (
    <nav className={styles.sidebar}>
      <div className={styles.topSection}>
        {/* Logo / Brand */}
        <Link to="/" className={styles.navItem} style={{ marginBottom: '0.5rem' }}>
          <img src="/logo.svg" alt="Blink Logo" style={{ width: '32px', height: '32px' }} />
          <span className={styles.tooltip}>Blink Chat</span>
        </Link>

        {/* User Profile / Account */}
        <Link to="/profile" className={styles.profileWrapper}>
          <UserAvatar user={currentUser?.profile} size="2.5rem" />
          <span className={styles.tooltip}>Profile</span>
        </Link>

        <div className={styles.divider} />

        {/* Pinned Communities */}
        {pinnedCommunities.length > 0 && (
          <>
            <div className={styles.pinnedLabel}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>push_pin</span>
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
              <span className="material-symbols-outlined" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                {item.icon}
              </span>
              <span className={styles.tooltip}>{item.label}</span>
            </Link>
          );
        })}

        {/* Add Community Button */}
        <button className={styles.navItem} onClick={() => navigate('/create-community')}>
          <span className="material-symbols-outlined">add</span>
          <span className={styles.tooltip}>Create Community</span>
        </button>
      </div>

      {/* Bottom Section */}
      <div className={styles.bottomSection}>
        <Link to="/settings" className={`${styles.navItem} ${location.pathname === '/settings' ? styles.active : ''}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: location.pathname === '/settings' ? "'FILL' 1" : "'FILL' 0" }}>settings</span>
          <span className={styles.tooltip}>Settings</span>
        </Link>
        
        <button className={`${styles.navItem} ${styles.logoutBtn}`} onClick={handleLogout}>
          <span className="material-symbols-outlined">logout</span>
          <span className={styles.tooltip}>Logout</span>
        </button>
      </div>
    </nav>
  );
};

export default Sidebar;
