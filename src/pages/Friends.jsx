import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import UserAvatar from '../components/common/UserAvatar';
import { findUserByExactDisplayName, getUserProfile, isUserOnline, setFriendNickname, subscribeToCommunityPresence } from '../services/db';
import { cleanNickname, friendNicknameOf, NICKNAME_MAX_LENGTH } from '../services/nicknames';
import Modal from '../components/common/Modal';
import {
  blockUser,
  messagePrivacyOf,
  canSendFriendRequest,
  cancelFriendRequest,
  friendRequestPrivacyOf,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
  subscribeToFriends,
  subscribeToIncomingFriendRequests,
  subscribeToOutgoingFriendRequests,
  unblockUser
} from '../services/friends';
import styles from './Friends.module.css';

const TABS = [
  { id: 'friends', label: 'Friends', icon: 'group' },
  { id: 'requests', label: 'Requests', icon: 'person_add' },
  { id: 'add', label: 'Add friend', icon: 'search' }
];

function presenceLine(presenceEntry, profile) {
  // A stale heartbeat is not "online": presence decays after ~90s without one.
  if (!isUserOnline(presenceEntry)) return { text: 'Offline', playing: false };
  const game = presenceEntry?.game;
  if (game?.name) return { text: `Playing ${game.name}`, playing: true };
  return { text: profile?.status || 'Online', playing: false };
}

export default function Friends() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('friends');
  const [friendUids, setFriendUids] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [presence, setPresence] = useState({});
  // Exact-name lookup, not search: one name in, at most one person out.
  const [lookupName, setLookupName] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupState, setLookupState] = useState('idle'); // idle | searching | found | empty
  const [busyUid, setBusyUid] = useState(null);
  const [error, setError] = useState('');
  const [nicknameTarget, setNicknameTarget] = useState(null);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);

  const blockedUsers = currentUser?.profile?.blockedUsers || [];
  // A string key so the profile-fetch effect below does not re-run on every
  // render just because the array was rebuilt.
  const blockedKey = blockedUsers.join(',');

  useEffect(() => {
    if (!uid) return undefined;
    return subscribeToFriends(uid, nextFriends => setFriendUids(nextFriends));
  }, [uid]);

  useEffect(() => {
    if (!uid) return undefined;
    return subscribeToIncomingFriendRequests(uid, setIncoming);
  }, [uid]);

  useEffect(() => {
    if (!uid) return undefined;
    return subscribeToOutgoingFriendRequests(uid, setOutgoing);
  }, [uid]);

  useEffect(() => subscribeToCommunityPresence(setPresence), []);

  // Profiles of friends, request senders and blocked users, fetched once per
  // uid and cached by the data service.
  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    const wanted = [...new Set([
      ...friendUids,
      ...incoming.map(request => request.from),
      ...(blockedKey ? blockedKey.split(',') : [])
    ])].filter(needed => needed && !profiles[needed]);
    if (!wanted.length) return undefined;
    Promise.all(wanted.map(async friendUid => [friendUid, await getUserProfile(friendUid).catch(() => null)]))
      .then(entries => {
        if (cancelled) return;
        const next = Object.fromEntries(entries.filter(([, profile]) => profile));
        if (Object.keys(next).length) setProfiles(previous => ({ ...previous, ...next }));
      });
    return () => { cancelled = true; };
  }, [uid, friendUids, incoming, blockedKey, profiles]);

  const friendSet = new Set(friendUids);
  const outgoingSet = new Set(outgoing.map(request => request.to));
  const blockedSet = new Set(blockedUsers);

  // A display name has to match in full (ignoring case and surrounding
  // spaces). Substring search made it far too easy to find and bother people
  // you had never spoken to.
  const handleLookup = async event => {
    event?.preventDefault?.();
    const name = lookupName.trim();
    if (!name || !uid) return;
    setLookupState('searching');
    setLookupResult(null);
    setError('');
    try {
      const found = await findUserByExactDisplayName(name, uid);
      if (!found) {
        setLookupState('empty');
        return;
      }
      setLookupResult(found);
      setLookupState('found');
    } catch (lookupError) {
      setLookupState('idle');
      setError(lookupError?.message || 'That name could not be looked up.');
    }
  };

  const handleAddFriend = async targetProfile => {
    if (!uid || !targetProfile?.uid) return;
    setBusyUid(targetProfile.uid);
    setError('');
    try {
      const decision = await canSendFriendRequest(uid, targetProfile.uid, {
        targetProfile,
        fromProfile: currentUser?.profile || {}
      });
      if (!decision.allowed) {
        setError(decision.reason === 'privacy'
          ? `${targetProfile.displayName || 'This user'} only accepts friend requests from ${friendRequestPrivacyOf(targetProfile) === 'nobody' ? 'nobody' : 'friends of friends'}.`
          : decision.reason === 'pending'
            ? 'You already have a pending request with this person.'
            : decision.reason === 'blocked'
              ? 'This person is not accepting requests from you.'
              : 'You cannot send a friend request to this person.');
        return;
      }
      await sendFriendRequest(uid, targetProfile.uid);
    } catch (requestError) {
      setError(requestError?.message || 'The friend request could not be sent.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleRespond = async (request, accept) => {
    setBusyUid(request.from);
    setError('');
    try {
      await respondToFriendRequest(request, accept);
    } catch (responseError) {
      setError(responseError?.message || 'That request could not be answered.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleRemove = async friendUid => {
    if (!uid) return;
    setBusyUid(friendUid);
    try {
      await removeFriend(uid, friendUid);
    } catch (removeError) {
      setError(removeError?.message || 'Could not remove this friend.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleCancel = async request => {
    setBusyUid(request.to);
    try {
      await cancelFriendRequest(uid, request.to);
    } catch (cancelError) {
      setError(cancelError?.message || 'Could not cancel that request.');
    } finally {
      setBusyUid(null);
    }
  };

  // Blocking also ends the friendship and clears any request either way, so
  // neither side keeps a channel through which to reach the other.
  const handleBlock = async targetUid => {
    if (!uid || !targetUid) return;
    setBusyUid(targetUid);
    setError('');
    try {
      await blockUser(uid, targetUid);
    } catch (blockError) {
      setError(blockError?.message || 'Could not block this user.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleUnblock = async targetUid => {
    if (!uid || !targetUid) return;
    setBusyUid(targetUid);
    setError('');
    try {
      await unblockUser(uid, targetUid);
    } catch (unblockError) {
      setError(unblockError?.message || 'Could not unblock this user.');
    } finally {
      setBusyUid(null);
    }
  };

  const openNicknameEditor = profile => {
    setNicknameTarget(profile);
    setNicknameDraft(friendNicknameOf(currentUser?.profile, profile?.uid));
    setError('');
  };

  const handleSaveNickname = async (clear = false) => {
    const targetUid = nicknameTarget?.uid;
    if (!uid || !targetUid) return;
    setSavingNickname(true);
    try {
      await setFriendNickname(uid, targetUid, clear ? '' : nicknameDraft);
      setNicknameTarget(null);
    } catch (nicknameError) {
      setError(nicknameError?.message || 'That nickname could not be saved.');
    } finally {
      setSavingNickname(false);
    }
  };

  const renderPerson = (profile, { key, meta, actions, nickname }) => (
    <article key={key} className={styles.personCard}>
      <UserAvatar user={profile} size="2.75rem" />
      <div className={styles.personInfo}>
        <strong>{nickname || profile?.displayName || 'User'}</strong>
        {nickname && <em className={styles.realName}>{profile?.displayName}</em>}
        <span className={meta?.playing ? styles.playingLine : ''}>{meta?.text || ''}</span>
      </div>
      <div className={styles.personActions}>{actions}</div>
    </article>
  );

  const friends = friendUids.map(friendUid => profiles[friendUid]).filter(Boolean);
  const blockedProfiles = blockedUsers.map(blockedUid => profiles[blockedUid] || { uid: blockedUid, displayName: 'Blocked user' });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>YOUR PEOPLE</p>
          <h1 className="text-display-xl">Friends</h1>
          <p className="text-body-lg text-tertiary">People you can count on for a game or a chat.</p>
        </div>
        <div className={styles.tabs}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`${styles.tab} ${activeTab === tab.id ? styles.activeTab : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="material-symbols-outlined">{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.id === 'requests' && incoming.length > 0 && <span className={styles.tabBadge}>{incoming.length}</span>}
            </button>
          ))}
        </div>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      {activeTab === 'friends' && (
        <section className={styles.section}>
          {friends.length ? friends.map(profile => {
            const meta = presenceLine(presence[profile.uid], profile);
            return renderPerson(profile, {
              key: profile.uid,
              meta,
              nickname: friendNicknameOf(currentUser?.profile, profile.uid),
              actions: (
                <>
                  <button type="button" className={styles.primaryBtn} onClick={() => navigate(`/messages?user=${profile.uid}`)}>
                    <span className="material-symbols-outlined">chat</span>
                    <span>Message</span>
                  </button>
                  <button type="button" className={styles.ghostBtn} onClick={() => openNicknameEditor(profile)}>
                    Nickname
                  </button>
                  <button type="button" className={styles.ghostBtn} disabled={busyUid === profile.uid} onClick={() => handleRemove(profile.uid)}>
                    Remove
                  </button>
                  <button type="button" className={styles.ghostBtn} disabled={busyUid === profile.uid} onClick={() => handleBlock(profile.uid)}>
                    Block
                  </button>
                </>
              )
            });
          }) : <p className={styles.empty}>No friends yet. Use <strong>Add friend</strong> to find someone.</p>}

          {outgoing.length > 0 && (
            <div className={styles.subsection}>
              <h2 className="text-label-sm">PENDING REQUESTS YOU SENT</h2>
              {outgoing.map(request => (
                <article key={request.id} className={styles.pendingRow}>
                  <span>{profiles[request.to]?.displayName || 'Someone'}</span>
                  <button type="button" className={styles.ghostBtn} disabled={busyUid === request.to} onClick={() => handleCancel(request)}>Cancel</button>
                </article>
              ))}
            </div>
          )}

          {blockedProfiles.length > 0 && (
            <div className={styles.subsection}>
              <h2 className="text-label-sm">BLOCKED</h2>
              {blockedProfiles.map(profile => (
                <article key={`blocked-${profile.uid}`} className={styles.pendingRow}>
                  <span>{profile.displayName || 'Blocked user'}</span>
                  <button type="button" className={styles.ghostBtn} disabled={busyUid === profile.uid} onClick={() => handleUnblock(profile.uid)}>Unblock</button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'requests' && (
        <section className={styles.section}>
          {incoming.length ? incoming.map(request => {
            const profile = profiles[request.from] || { uid: request.from, displayName: 'Someone' };
            return renderPerson(profile, {
              key: request.id,
              meta: { text: 'Wants to be friends' },
              actions: (
                <>
                  <button type="button" className={styles.primaryBtn} disabled={busyUid === request.from} onClick={() => handleRespond(request, true)}>Accept</button>
                  <button type="button" className={styles.ghostBtn} disabled={busyUid === request.from} onClick={() => handleRespond(request, false)}>Decline</button>
                  <button type="button" className={styles.ghostBtn} disabled={busyUid === request.from} onClick={() => handleBlock(request.from)}>Block</button>
                </>
              )
            });
          }) : <p className={styles.empty}>No pending requests.</p>}
        </section>
      )}

      {activeTab === 'add' && (
        <section className={styles.section}>
          <form className={styles.searchBox} onSubmit={handleLookup}>
            <span className="material-symbols-outlined">badge</span>
            <input
              value={lookupName}
              onChange={event => {
                setLookupName(event.target.value);
                setLookupState('idle');
                setLookupResult(null);
              }}
              placeholder="Enter their exact display name"
              aria-label="Exact display name"
            />
            <button type="submit" className={styles.primaryBtn} disabled={!lookupName.trim() || lookupState === 'searching'}>
              {lookupState === 'searching' ? 'Looking…' : 'Find'}
            </button>
          </form>
          <p className={styles.hint}>
            Names have to match exactly, so ask your friend how their name is spelled. This keeps random people from finding you.
          </p>

          <div className={styles.results}>
            {lookupResult && (() => {
              const result = lookupResult;
              const isFriend = friendSet.has(result.uid);
              const isPending = outgoingSet.has(result.uid);
              const isBlocked = blockedSet.has(result.uid);
              const closedToRequests = friendRequestPrivacyOf(result) === 'nobody';
              return renderPerson(result, {
                key: result.uid,
                meta: { text: isFriend ? 'Friend' : messagePrivacyOf(result) === 'everyone' ? 'Open to messages' : 'Message privacy is limited' },
                actions: (
                  <>
                    {isFriend ? (
                      <span className={styles.tag}>Friends</span>
                    ) : isPending ? (
                      <span className={styles.tag}>Request sent</span>
                    ) : isBlocked ? (
                      <span className={styles.tag}>Blocked</span>
                    ) : closedToRequests ? (
                      <span className={styles.tag}>Not accepting requests</span>
                    ) : (
                      <button type="button" className={styles.primaryBtn} disabled={busyUid === result.uid} onClick={() => handleAddFriend(result)}>
                        Add friend
                      </button>
                    )}
                    {isBlocked ? (
                      <button type="button" className={styles.ghostBtn} disabled={busyUid === result.uid} onClick={() => handleUnblock(result.uid)}>Unblock</button>
                    ) : (
                      <button type="button" className={styles.ghostBtn} disabled={busyUid === result.uid} onClick={() => handleBlock(result.uid)}>Block</button>
                    )}
                  </>
                )
              });
            })()}
            {lookupState === 'empty' && (
              <p className={styles.empty}>
                No Blink user is called exactly “{lookupName.trim()}”. Check the spelling with your friend.
              </p>
            )}
            {lookupState === 'idle' && (
              <p className={styles.empty}>Type a full display name to find that one person.</p>
            )}
          </div>
        </section>
      )}

      <Modal
        isOpen={Boolean(nicknameTarget)}
        onClose={() => setNicknameTarget(null)}
        title="Private nickname"
        footer={(
          <>
            <button type="button" className={styles.ghostBtn} onClick={() => handleSaveNickname(true)} disabled={savingNickname}>Clear</button>
            <button type="button" className={styles.primaryBtn} onClick={() => handleSaveNickname()} disabled={savingNickname || !cleanNickname(nicknameDraft)}>
              {savingNickname ? 'Saving...' : 'Save nickname'}
            </button>
          </>
        )}
      >
        <div className={styles.nicknameForm}>
          <label htmlFor="friend-nickname">WHAT YOU CALL THEM</label>
          <input
            id="friend-nickname"
            value={nicknameDraft}
            onChange={event => setNicknameDraft(event.target.value)}
            placeholder={nicknameTarget?.displayName || 'Their display name'}
            maxLength={NICKNAME_MAX_LENGTH}
            autoFocus
          />
          <p className={styles.hint}>Only you see this, in your friends list and private messages. Their profile keeps their real name.</p>
        </div>
      </Modal>
    </div>
  );
}
