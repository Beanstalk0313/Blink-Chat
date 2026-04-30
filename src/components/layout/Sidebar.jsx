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
  const { currentUser } = useAuth();
  const [pinnedCommunities, setPinnedCommunities] = useState([]);

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
        {/* User Profile / Account */}
        <Link to="/profile" className={styles.profileWrapper}>
          <UserAvatar user={currentUser?.profile} size="3rem" />
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
        <button className={styles.navItem} style={{ background: 'transparent', border: 'none' }} onClick={() => navigate('/create-community')}>
          <span className="material-symbols-outlined">add</span>
          <span className={styles.tooltip}>Create Community</span>
        </button>
      </div>

      {/* Footer Tab */}
      <Link to="/settings" className={`${styles.navItem} ${location.pathname === '/settings' ? styles.active : ''}`}>
        <span className="material-symbols-outlined" style={{ fontVariationSettings: location.pathname === '/settings' ? "'FILL' 1" : "'FILL' 0" }}>settings</span>
        <span className={styles.tooltip}>Settings</span>
      </Link>
    </nav>
  );
};

export default Sidebar;
