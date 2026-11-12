import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import UserAvatar from './UserAvatar';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToPresence } from '../../services/db';
import {
  blockUser,
  canSendFriendRequest,
  getRelationship,
  hasBlocked,
  messagePrivacyOf,
  sendFriendRequest,
  unblockUser
} from '../../services/friends';
import styles from './ProfilePopover.module.css';

// Mini profile card. It is rendered into document.body and positioned from the
// avatar that opened it, so it floats above the chat instead of joining the
// message row's flex layout (which used to shove the row's alignment around
// while the card was open).
export default function ProfilePopover({ user, isOwnProfile, onClose, anchor }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const popoverRef = useRef(null);
  const [live, setLive] = useState({ online: false, game: null });
  const [relationship, setRelationship] = useState({ state: 'unknown' });
  const [requestState, setRequestState] = useState({ busy: false, error: '' });
  const [blockBusy, setBlockBusy] = useState(false);

  const position = useCallback(() => {
    const popover = popoverRef.current;
    if (!popover || !anchor?.isConnected) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const width = popover.offsetWidth || 288;
    const height = popover.offsetHeight || 0;
    let top = rect.top;
    let left = rect.right + margin;
    if (left + width > window.innerWidth - margin) left = Math.max(margin, rect.left - width - margin);
    if (top + height > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - height - margin);
    if (top < margin) top = margin;
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }, [anchor]);

  useLayoutEffect(() => {
    position();
    const handleChange = () => position();
    window.addEventListener('scroll', handleChange, true);
    window.addEventListener('resize', handleChange);
    return () => {
      window.removeEventListener('scroll', handleChange, true);
      window.removeEventListener('resize', handleChange);
    };
  }, [position]);

  useEffect(() => {
    const handleKeyDown = event => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Live presence, including the game the desktop app reports.
  useEffect(() => {
    if (!user?.uid) return undefined;
    return subscribeToPresence(user.uid, (online, value) => {
      setLive({ online, game: value?.game || null });
    });
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || isOwnProfile || !currentUser?.uid) return undefined;
    let cancelled = false;
    getRelationship(currentUser.uid, user.uid).then(next => {
      if (!cancelled) setRelationship(next);
    });
    return () => { cancelled = true; };
  }, [user?.uid, isOwnProfile, currentUser?.uid]);

  if (!user) return null;

  const handleMessage = () => {
    onClose?.();
    navigate(`/messages?user=${user.uid}`);
  };

  const handleAddFriend = async () => {
    setRequestState({ busy: true, error: '' });
    try {
      const decision = await canSendFriendRequest(currentUser.uid, user.uid, {
        targetProfile: user,
        fromProfile: currentUser?.profile || {}
      });
      if (!decision.allowed) {
        setRequestState({
          busy: false,
          error: decision.reason === 'privacy'
            ? 'Not accepting friend requests'
            : decision.reason === 'pending'
              ? 'Request already pending'
              : 'Cannot send a friend request'
        });
        return;
      }
      await sendFriendRequest(currentUser.uid, user.uid);
      setRelationship({ state: 'pendingOut' });
      setRequestState({ busy: false, error: '' });
    } catch {
      setRequestState({ busy: false, error: 'Could not send the request' });
    }
  };

  const privacy = messagePrivacyOf(user);
  const blockedByMe = hasBlocked(currentUser?.profile, user.uid);
  const blockedByThem = hasBlocked(user, currentUser?.uid);
  const messagesClosed = blockedByMe || privacy === 'nobody' || blockedByThem || (privacy === 'friends' && relationship.state !== 'friends');

  const handleToggleBlock = async () => {
    setBlockBusy(true);
    try {
      if (blockedByMe) {
        await unblockUser(currentUser.uid, user.uid);
      } else {
        await blockUser(currentUser.uid, user.uid);
        setRelationship({ state: 'none' });
      }
      setRequestState({ busy: false, error: '' });
    } catch {
      setRequestState({ busy: false, error: 'Could not update the block' });
    } finally {
      setBlockBusy(false);
    }
  };
  const statusText = live.game?.name
    ? `Playing ${live.game.name}`
    : live.online
      ? (user.status || 'Online')
      : 'Offline';

  return createPortal(
    <div ref={popoverRef} className={styles.popover} data-profile-popover role="dialog" aria-label={`${user.displayName || 'User'} profile`}>
      <div className={styles.header}>
        <UserAvatar user={user} size="3.5rem" />
        <div>
          <strong>{user.displayName || 'User'}</strong>
          <span className={live.game?.name ? styles.playing : ''}>{statusText}</span>
        </div>
      </div>
      {user.isPrivateProfile && !isOwnProfile ? (
        <p className={styles.bio}>This profile is private.</p>
      ) : (
        <>
          {user.aboutMe && <p className={styles.bio}>{user.aboutMe}</p>}
          {!isOwnProfile && (
            <>
              {relationship.state === 'friends' ? (
                <div className={styles.pmBlocked}>
                  <span className="material-symbols-outlined">group</span>
                  <span>Friends</span>
                </div>
              ) : relationship.state === 'pendingOut' ? (
                <div className={styles.pmBlocked}>
                  <span className="material-symbols-outlined">hourglass_top</span>
                  <span>Friend request pending</span>
                </div>
              ) : relationship.state === 'pendingIn' ? (
                <Link className={styles.messageBtn} to="/friends" onClick={onClose}>
                  <span className="material-symbols-outlined">person_add</span>
                  <span>Answer friend request</span>
                </Link>
              ) : (
                <button type="button" className={styles.messageBtn} disabled={requestState.busy} onClick={handleAddFriend}>
                  <span className="material-symbols-outlined">person_add</span>
                  <span>Add friend</span>
                </button>
              )}
              {requestState.error && <p className={styles.bio}>{requestState.error}</p>}
              {messagesClosed ? (
                <div className={styles.pmBlocked}>
                  <span className="material-symbols-outlined">block</span>
                  <span>{blockedByThem ? 'Direct messages unavailable' : privacy === 'nobody' ? 'Direct messages disabled' : 'Direct messages are for friends'}</span>
                </div>
              ) : (
                <button type="button" className={styles.messageBtn} onClick={handleMessage}>
                  <span className="material-symbols-outlined">chat</span>
                  <span>Message</span>
                </button>
              )}
              <button type="button" className={styles.blockBtn} disabled={blockBusy} onClick={handleToggleBlock}>
                <span className="material-symbols-outlined">{blockedByMe ? 'undo' : 'block'}</span>
                <span>{blockedByMe ? 'Unblock' : 'Block'}</span>
              </button>
            </>
          )}
          <div className={styles.footer}>
            <Link className={styles.profileLink} to={`/profile/${user.uid}`} onClick={onClose}>
              {isOwnProfile ? 'View profile' : 'Open full profile'}
            </Link>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
