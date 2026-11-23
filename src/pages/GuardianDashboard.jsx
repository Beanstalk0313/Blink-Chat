import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import UserAvatar from '../components/common/UserAvatar';
import { clearSessionCache, getChannels, getCommunity, getUserProfile, subscribeToMessages } from '../services/db';
import { setCommunityBlocked, setCommunityCreationBlocked, subscribeToChildControls, subscribeToGuardianLink } from '../services/parental';
import { getColor } from '../services/utils';
import styles from './GuardianDashboard.module.css';

// A read-only window into the guarded account: which communities it belongs
// to, every channel in them, and the messages. The guardian does not join the
// community; Firestore lets a guardian read the child's channels and RTDB
// channel messages are already readable by signed-in accounts, so nothing is
// mirrored or copied.
export default function GuardianDashboard() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const [link, setLink] = useState(null);
  const [linkLoaded, setLinkLoaded] = useState(false);
  const [controls, setControls] = useState(null);
  const [childProfile, setChildProfile] = useState(null);
  const [communityList, setCommunityList] = useState([]);
  // Channel and message feeds carry the id they belong to, so switching panes
  // shows a clean slate without an effect resetting state.
  const [channelFeed, setChannelFeed] = useState({ communityId: null, list: [] });
  const [messageFeed, setMessageFeed] = useState({ channelId: null, list: [] });
  const [selectedCommunityId, setSelectedCommunityId] = useState(null);
  const [selectedChannelId, setSelectedChannelId] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!uid) return undefined;
    return subscribeToGuardianLink(uid, nextLink => {
      setLink(nextLink);
      setLinkLoaded(true);
    });
  }, [uid]);

  useEffect(() => {
    if (!link?.childUid) return undefined;
    return subscribeToChildControls(link.childUid, setControls);
  }, [link?.childUid]);

  useEffect(() => {
    const childUid = link?.childUid;
    if (!childUid) return undefined;
    let cancelled = false;
    getUserProfile(childUid)
      .then(profile => { if (!cancelled) setChildProfile(profile); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [link?.childUid]);

  useEffect(() => {
    const joined = childProfile?.joinedCommunities;
    if (!Array.isArray(joined) || !joined.length) return undefined;
    let cancelled = false;
    Promise.all(joined.map(communityId => getCommunity(communityId).catch(() => null)))
      .then(list => {
        if (cancelled) return;
        setCommunityList(list
          .filter(Boolean)
          .sort((first, second) => String(first.name).localeCompare(String(second.name))));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [childProfile]);

  // Only show the list while the profile actually belongs to communities; a
  // child who left them all sees an empty pane instead of a stale one.
  const communities = useMemo(
    () => (Array.isArray(childProfile?.joinedCommunities) && childProfile.joinedCommunities.length ? communityList : []),
    [childProfile, communityList]
  );
  const activeCommunityId = communities.some(community => community.id === selectedCommunityId)
    ? selectedCommunityId
    : communities[0]?.id || null;

  useEffect(() => {
    if (!activeCommunityId) return undefined;
    let cancelled = false;
    getChannels(activeCommunityId)
      .then(list => {
        if (!cancelled) setChannelFeed({ communityId: activeCommunityId, list });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeCommunityId]);

  const channels = useMemo(
    () => (channelFeed.communityId === activeCommunityId ? channelFeed.list : []),
    [channelFeed, activeCommunityId]
  );
  const activeChannelId = channels.some(channel => channel.id === selectedChannelId)
    ? selectedChannelId
    : channels[0]?.id || null;
  const selectedChannel = useMemo(
    () => channels.find(channel => channel.id === activeChannelId) || null,
    [channels, activeChannelId]
  );

  useEffect(() => {
    if (!activeChannelId) return undefined;
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeToMessages(
        activeChannelId,
        list => setMessageFeed({ channelId: activeChannelId, list }),
        80
      );
    } catch {
      // Firebase unavailable: the pane stays empty.
    }
    return () => unsubscribe();
  }, [activeChannelId]);

  const messages = useMemo(
    () => (messageFeed.channelId === activeChannelId ? messageFeed.list : []),
    [messageFeed, activeChannelId]
  );

  // Channel messages carry the author's uid only, so the pane resolves names.
  useEffect(() => {
    const missing = [...new Set(messages.map(message => message.authorUid).filter(Boolean))]
      .filter(authorUid => !profiles[authorUid]);
    if (!missing.length) return undefined;
    let cancelled = false;
    Promise.all(missing.map(async authorUid => [authorUid, await getUserProfile(authorUid).catch(() => null)]))
      .then(entries => {
        if (cancelled) return;
        const next = Object.fromEntries(entries.filter(([, profile]) => profile));
        if (Object.keys(next).length) setProfiles(previous => ({ ...previous, ...next }));
      });
    return () => { cancelled = true; };
  }, [messages, profiles]);

  const blockedList = controls?.blockedCommunities || [];

  const refreshChild = async () => {
    if (!link?.childUid) return;
    setError('');
    clearSessionCache(`user:${link.childUid}`);
    const profile = await getUserProfile(link.childUid).catch(() => null);
    if (profile) setChildProfile(profile);
  };

  const toggleBlock = async communityId => {
    if (!link?.childUid) return;
    setError('');
    try {
      await setCommunityBlocked(link.childUid, communityId, !blockedList.includes(communityId));
    } catch (blockError) {
      setError(blockError?.message || 'That block could not be saved.');
    }
  };

  const toggleCreation = async blocked => {
    if (!link?.childUid) return;
    setError('');
    try {
      await setCommunityCreationBlocked(link.childUid, blocked);
    } catch {
      setError('That setting could not be saved.');
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>PARENTAL CONTROLS</p>
          <h1 className="text-display-xl">Guardian dashboard</h1>
          <p className="text-body-lg text-tertiary">
            {childProfile?.displayName
              ? `Seeing ${childProfile.displayName}'s communities and messages.`
              : 'Loading the guarded account…'}
          </p>
        </div>
        <Link to="/settings" className={styles.backLink}>
          <span className="material-symbols-outlined">settings</span>
          <span>Settings</span>
        </Link>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      {linkLoaded && !link ? (
        <div className={styles.empty}>
          <span className="material-symbols-outlined">family_restroom</span>
          <h2>No account is being guarded</h2>
          <p>Pair a child&apos;s account with a code they generate in Settings → Parental Controls.</p>
          <Link to="/settings" className={styles.backLink}>Set up parental controls</Link>
        </div>
      ) : (
        <div className={styles.grid}>
          <aside className={styles.communityPane}>
            <div className={styles.paneHeader}>
              <span className="text-label-sm text-tertiary">COMMUNITIES</span>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={refreshChild}
                title="Refresh communities"
                aria-label="Refresh communities"
              >
                <span className="material-symbols-outlined">refresh</span>
              </button>
            </div>
            {communities.length ? communities.map(community => {
              const blocked = blockedList.includes(community.id);
              return (
                <div key={community.id} className={`${styles.communityRow} ${community.id === activeCommunityId ? styles.selected : ''}`}>
                  <button type="button" className={styles.communitySelect} onClick={() => setSelectedCommunityId(community.id)}>
                    {community.iconBase64
                      ? <img src={community.iconBase64} alt="" className={styles.communityIcon} />
                      : <span className={styles.communityFallback} style={{ backgroundColor: getColor(community.name) }}>{community.name.charAt(0).toUpperCase()}</span>}
                    <span>{community.name}</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.blockBtn} ${blocked ? styles.blocked : ''}`}
                    onClick={() => toggleBlock(community.id)}
                    title={blocked ? `Unblock ${community.name}` : `Block ${community.name}`}
                  >
                    {blocked ? 'Unblock' : 'Block'}
                  </button>
                </div>
              );
            }) : <p className={styles.hint}>No communities to show yet.</p>}

            <div className={styles.creationRow}>
              <div>
                <span>Block creating communities</span>
                <small>Stops this account from making new ones.</small>
              </div>
              <label className={styles.switch}>
                <input type="checkbox" checked={Boolean(controls?.blockCommunityCreation)} onChange={event => toggleCreation(event.target.checked)} />
                <span className={styles.slider}></span>
              </label>
            </div>
          </aside>

          <section className={styles.channelPane}>
            <div className={styles.paneHeader}>
              <span className="text-label-sm text-tertiary">CHANNELS</span>
            </div>
            {channels.length ? channels.map(channel => (
              <button
                key={channel.id}
                type="button"
                className={`${styles.channelRow} ${channel.id === activeChannelId ? styles.selected : ''}`}
                onClick={() => setSelectedChannelId(channel.id)}
              >
                <span className="material-symbols-outlined">{channel.type === 'voice' ? 'volume_up' : 'tag'}</span>
                <span>{channel.name}</span>
              </button>
            )) : <p className={styles.hint}>Choose a community first.</p>}
          </section>

          <section className={styles.messagePane}>
            {activeChannelId ? (
              <>
                <div className={styles.paneHeader}>
                  <span className="text-label-sm text-tertiary">#{selectedChannel?.name || 'channel'}</span>
                  <span className={styles.readOnly}>READ ONLY</span>
                </div>
                <div className={styles.messages}>
                  {messages.length ? messages.map(message => (
                    <article key={message.id} className={styles.message}>
                      <UserAvatar user={profiles[message.authorUid] || { displayName: 'Member' }} size="2rem" />
                      <div className={styles.messageBody}>
                        <div className={styles.messageMeta}>
                          <strong>{profiles[message.authorUid]?.displayName || 'Member'}</strong>
                          <time>{message.timestamp ? new Date(message.timestamp).toLocaleString() : ''}</time>
                        </div>
                        {message.text ? <p>{message.text}</p> : null}
                        {message.attachment?.url && (
                          <a href={message.attachment.url} target="_blank" rel="noreferrer">{message.attachment.name || 'Attachment'}</a>
                        )}
                      </div>
                    </article>
                  )) : <p className={styles.hint}>No messages in this channel yet.</p>}
                </div>
              </>
            ) : <p className={styles.hint}>Pick a channel to read its messages.</p>}
          </section>
        </div>
      )}
    </div>
  );
}
