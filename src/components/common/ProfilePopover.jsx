
import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import UserAvatar from './UserAvatar';
import styles from './ProfilePopover.module.css';

export default function ProfilePopover({ user, isOwnProfile, onClose }) {
  const navigate = useNavigate();
  const popoverRef = useRef(null);

  useEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;
    const trigger = popover.closest('[data-profile-trigger]');
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const popoverWidth = popover.offsetWidth || 288;
    const margin = 8;
    let top = rect.top;
    let left = rect.right + margin;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = rect.left - popoverWidth - margin;
    }
    if (top + popover.offsetHeight > window.innerHeight - margin) {
      top = window.innerHeight - popover.offsetHeight - margin;
    }
    if (top < margin) top = margin;
    popover.style.position = 'fixed';
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }, []);

  if (!user) return null;

  const handleMessage = () => {
    onClose?.();
    navigate(`/messages?user=${user.uid}`);
  };

  return (
    <div ref={popoverRef} className={styles.popover} data-profile-popover role="dialog" aria-label={`${user.displayName || 'User'} profile`}>
      <div className={styles.header}>
        <UserAvatar user={user} size="3.5rem" />
        <div>
          <strong>{user.displayName || 'User'}</strong>
          <span>{user.status || 'Online'}</span>
        </div>
      </div>
      {user.isPrivateProfile && !isOwnProfile ? (
        <p className={styles.bio}>This profile is private.</p>
      ) : (
        <>
          {user.aboutMe && <p className={styles.bio}>{user.aboutMe}</p>}
          {!isOwnProfile && (
            user.blockPrivateMessages ? (
              <div className={styles.pmBlocked}>
                <span className="material-symbols-outlined">block</span>
                <span>Direct messages disabled</span>
              </div>
            ) : (
              <button type="button" className={styles.messageBtn} onClick={handleMessage}>
                <span className="material-symbols-outlined">chat</span>
                <span>Message</span>
              </button>
            )
          )}
          <div className={styles.footer}>
            <Link className={styles.profileLink} to={`/profile/${user.uid}`} onClick={onClose}>
              {isOwnProfile ? 'View profile' : 'Open full profile'}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
