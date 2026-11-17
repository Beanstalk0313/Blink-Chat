import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCall } from '../contexts/CallContext';
import UserAvatar from '../components/common/UserAvatar';
import { uploadFile } from '../services/upload';
import { friendNicknameOf } from '../services/nicknames';
import { renderRichText } from '../services/richText';
import MarkdownToolbar from '../components/common/MarkdownToolbar';
import CommunityInviteCard from '../components/common/CommunityInviteCard';
import ProfilePopover from '../components/common/ProfilePopover';
import Modal from '../components/common/Modal';
import {
  ensurePrivateConversation,
  getPrivateConversations,
  getUserProfile,
  markPrivateConversationRead,
  privateConversationId,
  searchUsers,
  sendPrivateMessage,
  subscribeToPrivateConversations,
  subscribeToPrivateMessages,
  subscribeToCommunityPresence,
  deletePrivateMessage,
  isUserOnline,
  togglePrivateReaction
} from '../services/db';
import styles from './PrivateMessages.module.css';

// Marking a PM conversation read is a transaction per write, and the page does
// it on every pointer/key event. One write per burst is enough: the marker is
// monotonic, so a trailing write covers everything that happened before it.
const PM_READ_THROTTLE_MS = 1200;
const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢'];

// Same markdown renderer as channels, pointed at this page's classes.
const MARKDOWN_CLASSES = {
  link: styles.mdLink,
  inlineCode: styles.mdInlineCode,
  codeBlock: styles.mdCodeBlock,
  codeBlockLang: styles.mdCodeBlockLang,
  quote: styles.mdQuote,
  heading: styles.mdHeading,
  list: styles.mdList
};

function otherParticipant(conversation, uid) {
  const participantEntries = Object.entries(conversation?.participants || {});
  const participant = participantEntries.find(([participantUid]) => participantUid !== uid)?.[1];
  return participant || { uid: Object.keys(conversation?.members || {}).find(memberUid => memberUid !== uid), displayName: 'Private conversation' };
}

export default function PrivateMessages() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [animatedMessageIds, setAnimatedMessageIds] = useState(() => new Set());
  const [messageText, setMessageText] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendError, setSendError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth > 1024);
  const [presence, setPresence] = useState({});
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [reactionPickerFor, setReactionPickerFor] = useState(null);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [isCallSwitchOpen, setIsCallSwitchOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { startPrivateCall, activeCall, endCall } = useCall();
  const messagesListRef = useRef(null);
  const composerInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const initialLoad = useRef(true);
  const handledUserParam = useRef(false);
  const readMarkTimerRef = useRef(0);
  const readMarkLastWriteRef = useRef(0);
  const latestMessageTimestampRef = useRef(0);

  const flushConversationRead = useCallback(readThrough => {
    if (!uid || !selectedConversationId) return;
    if (readMarkTimerRef.current) {
      window.clearTimeout(readMarkTimerRef.current);
      readMarkTimerRef.current = 0;
    }
    readMarkLastWriteRef.current = Date.now();
    const timestamp = Number(readThrough) || latestMessageTimestampRef.current || undefined;
    markPrivateConversationRead(uid, selectedConversationId, timestamp).catch(() => {});
  }, [uid, selectedConversationId]);

  const scheduleConversationRead = useCallback(readThrough => {
    if (!uid || !selectedConversationId) return;
    const timestamp = Number(readThrough) || latestMessageTimestampRef.current || undefined;
    if (readMarkTimerRef.current) window.clearTimeout(readMarkTimerRef.current);
    const elapsed = Date.now() - readMarkLastWriteRef.current;
    readMarkTimerRef.current = window.setTimeout(
      () => flushConversationRead(timestamp),
      Math.max(0, PM_READ_THROTTLE_MS - elapsed),
    );
  }, [uid, selectedConversationId, flushConversationRead]);

  // Leaving a conversation (or the page) still marks it read, exactly once.
  useEffect(() => () => {
    if (!readMarkTimerRef.current) return;
    window.clearTimeout(readMarkTimerRef.current);
    readMarkTimerRef.current = 0;
    flushConversationRead();
  }, [flushConversationRead]);

  useEffect(() => {
    const handleResize = () => setIsSidebarOpen(window.innerWidth > 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    return subscribeToCommunityPresence(nextPresence => setPresence(nextPresence));
  }, []);

  useEffect(() => {
    if (!uid) return undefined;
    getPrivateConversations(uid).then(nextConversations => {
      setConversations(nextConversations);
      setSelectedConversationId(previous => previous || nextConversations[0]?.id || null);
      setLoading(false);
    }).catch(() => setLoading(false));
    return subscribeToPrivateConversations(uid, nextConversations => {
      setConversations(nextConversations);
      setSelectedConversationId(previous => previous || nextConversations[0]?.id || null);
    });
  }, [uid]);

  useEffect(() => {
    if (!selectedConversationId) return undefined;
    initialLoad.current = true;
    return subscribeToPrivateMessages(selectedConversationId, nextMessages => {
      const latestMessageTimestamp = nextMessages.reduce((latest, message) => Math.max(latest, Number(message.timestamp) || 0), 0);
      latestMessageTimestampRef.current = latestMessageTimestamp;
      if (!initialLoad.current) {
        const incomingIds = nextMessages.slice(-1).map(message => message.id);
        if (incomingIds.length) {
          setAnimatedMessageIds(previous => new Set([...previous, ...incomingIds]));
          window.setTimeout(() => setAnimatedMessageIds(previous => {
            const next = new Set(previous);
            incomingIds.forEach(id => next.delete(id));
            return next;
          }), 420);
        }
      }
      setMessages(nextMessages);
      initialLoad.current = false;
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        scheduleConversationRead(latestMessageTimestamp);
      }
    });
  }, [selectedConversationId, uid, scheduleConversationRead]);

  useEffect(() => {
    if (!selectedConversationId || !uid) return undefined;
    const markReadOnRefocus = () => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
      flushConversationRead();
    };
    window.addEventListener('focus', markReadOnRefocus);
    document.addEventListener('visibilitychange', markReadOnRefocus);
    return () => {
      window.removeEventListener('focus', markReadOnRefocus);
      document.removeEventListener('visibilitychange', markReadOnRefocus);
    };
  }, [selectedConversationId, uid, flushConversationRead]);

  useEffect(() => {
    if (!selectedConversationId || !uid) return undefined;
    const handleInteraction = event => {
      if (event.type === 'keydown' && event.isComposing) return;
      if (document.visibilityState !== 'visible') return;
      scheduleConversationRead();
    };
    const interactionEvents = ['pointerdown', 'touchstart', 'keydown', 'click'];
    interactionEvents.forEach(eventName => document.addEventListener(eventName, handleInteraction, true));
    return () => interactionEvents.forEach(eventName => document.removeEventListener(eventName, handleInteraction, true));
  }, [selectedConversationId, uid, scheduleConversationRead]);

  useEffect(() => {
    const query = searchText.trim();
    if (!query || !uid) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchUsers(query, uid).then(results => {
        if (!cancelled) setSearchResults(results);
      }).catch(() => {
        if (!cancelled) setSearchResults([]);
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchText, uid]);

  useEffect(() => {
    if (!messages.length) return;
    const messageList = messagesListRef.current;
    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }, [messages]);

  const selectedConversation = conversations.find(conversation => conversation.id === selectedConversationId);
  const recipient = useMemo(() => otherParticipant(selectedConversation, uid), [selectedConversation, uid]);
  // The private nickname the viewer gave this person wins over their profile name.
  const friendLabelFor = user => friendNicknameOf(currentUser?.profile, user?.uid) || user?.displayName || 'User';

  // Conversation participants are a snapshot taken at send time, so the mini
  // profile is upgraded with the live user document before it renders — the
  // channel version can rely on member docs and this cannot.
  const openProfile = async (user, anchor) => {
    if (!user?.uid) return;
    if (selectedProfile?.user?.uid === user.uid) {
      setSelectedProfile(null);
      return;
    }
    setSelectedProfile({ user, anchor });
    const live = await getUserProfile(user.uid).catch(() => null);
    if (!live) return;
    setSelectedProfile(previous => (previous?.user?.uid === user.uid ? { ...previous, user: { ...user, ...live, uid: user.uid } } : previous));
  };

  const profileUserFor = isMine => (isMine
    ? { ...(currentUser?.profile || {}), uid }
    : recipient);

  const selectUser = user => {
    const conversationId = privateConversationId(uid, user.uid);
    setConversations(previous => previous.some(conversation => conversation.id === conversationId)
      ? previous
      : [{ id: conversationId, members: { [uid]: true, [user.uid]: true }, participants: { [uid]: currentUser.profile || currentUser, [user.uid]: user } }, ...previous]);
    setSelectedConversationId(conversationId);
    // Create the RTDB node before the messages subscription attaches so the
    // rules allow the read immediately (see ensurePrivateConversation).
    ensurePrivateConversation(conversationId, uid, user.uid, { [uid]: currentUser.profile || currentUser, [user.uid]: user }).catch(() => {});
    setSearchText('');
    setSearchResults([]);
  };

  useEffect(() => {
    const targetUid = searchParams.get('user');
    if (!targetUid || !uid || loading || handledUserParam.current) return;
    handledUserParam.current = true;
    setSearchParams({}, { replace: true });
    const convId = privateConversationId(uid, targetUid);
    const existing = conversations.find(c => c.id === convId);
    if (existing) {
      queueMicrotask(() => setSelectedConversationId(convId));
      return;
    }
    getUserProfile(targetUid).then(userProfile => {
      if (userProfile) selectUser(userProfile);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, loading, searchParams]);

  const handleAttachmentPick = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsAttachMenuOpen(false);
    setIsUploading(true);
    setSendError('');
    try {
      const uploaded = await uploadFile(file);
      setPendingAttachment({ url: uploaded.url, name: uploaded.name || file.name, size: uploaded.size || file.size });
    } catch {
      setSendError('Could not upload that file. Try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // Reuses the community voice-channel call system: the same one-to-one room id
  // for both participants, and the same call surface. The call only opens once
  // the other person accepts the ring.
  const ringRecipient = async () => {
    if (!uid || !selectedConversationId || !recipient?.uid) return;
    const roomId = `pm-${selectedConversationId}`;
    const participant = {
      uid,
      channelId: roomId,
      displayName: currentUser.profile?.displayName || currentUser.displayName || 'User',
      avatarBase64: currentUser.profile?.avatarBase64 || ''
    };
    try {
      await startPrivateCall({
        roomId,
        type: 'voice',
        participant,
        calleeUid: recipient.uid,
        calleeName: friendNicknameOf(currentUser.profile, recipient.uid) || recipient.displayName || 'User',
        calleeAvatar: recipient.avatarBase64 || ''
      });
    } catch (error) {
      setSendError(error?.message || 'Could not start the call.');
    }
  };

  const handleStartCall = async () => {
    if (!uid || !selectedConversationId || !recipient?.uid) return;
    // A new call replaces the running one, so confirm before dropping it.
    if (activeCall) {
      setIsCallSwitchOpen(true);
      return;
    }
    await ringRecipient();
  };

  const handleConfirmCallSwitch = async () => {
    setIsCallSwitchOpen(false);
    endCall();
    await ringRecipient();
  };

  const handleSend = async event => {
    event.preventDefault();
    if (!selectedConversationId || !recipient?.uid) return;
    if (!messageText.trim() && !pendingAttachment) return;
    setSendError('');
    const participants = {
      [uid]: { uid, displayName: currentUser.profile?.displayName || currentUser.displayName || 'User', avatarBase64: currentUser.profile?.avatarBase64 || '' },
      [recipient.uid]: { uid: recipient.uid, displayName: recipient.displayName || 'User', avatarBase64: recipient.avatarBase64 || '' }
    };
    try {
      await sendPrivateMessage(
        selectedConversationId,
        uid,
        recipient.uid,
        messageText,
        participants,
        pendingAttachment,
        null,
        replyingTo ? { id: replyingTo.id, authorUid: replyingTo.authorUid, authorName: replyingTo.authorName, text: replyingTo.text } : null
      );
      setMessageText('');
      setPendingAttachment(null);
      setReplyingTo(null);
    } catch (err) {
      setSendError(err.message || 'Failed to send message.');
    }
  };

  const handleToggleReaction = async (message, emoji) => {
    if (!uid || !selectedConversationId) return;
    const reacted = Boolean(message.reactions?.[emoji]?.[uid]);
    try {
      await togglePrivateReaction(selectedConversationId, message.id, emoji, uid, reacted);
    } catch {
      // Raw SDK text ("PERMISSION_DENIED...") is not something to show a reader.
      setSendError('That reaction could not be saved.');
    }
  };

  const reactionsFor = message => Object.entries(message.reactions || {})
    .map(([emoji, users]) => ({ emoji, uids: Object.keys(users || {}) }))
    .filter(entry => entry.uids.length > 0);

  const handleConversationClick = conversationId => {
    setSelectedConversationId(conversationId);
    if (window.innerWidth <= 1024) setIsSidebarOpen(false);
  };

  return (
    <div className={styles.chatLayout}>
      {isSidebarOpen && window.innerWidth <= 1024 && <div className={styles.sidebarBackdrop} onClick={() => setIsSidebarOpen(false)} />}
      <aside className={`${styles.innerSidebar} ${!isSidebarOpen ? styles.closed : ''}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarHeading}>
            <h2>Private Messages</h2>
            <p>Your direct conversations</p>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <label className={styles.searchBox}>
            <span className="material-symbols-outlined">search</span>
            <input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Find someone to message" />
          </label>
          {searchResults.length > 0 && <div className={styles.searchResults}>{searchResults.map(user => <button key={user.uid} onClick={() => selectUser(user)}><UserAvatar user={user} size="2rem" /><span>{user.displayName || user.email}</span></button>)}</div>}
        </div>
        <div className={styles.conversationList}>
          <div className={styles.sectionHeader}><span className="text-label-sm text-tertiary">CONVERSATIONS</span></div>
          {loading ? <p className={styles.emptyState}>Loading messages...</p> : conversations.length ? conversations.map(conversation => {
            const user = otherParticipant(conversation, uid);
            const isOnline = user?.uid ? isUserOnline(presence[user.uid]) : false;
            return (
              <button key={conversation.id} className={`${styles.conversationItem} ${conversation.id === selectedConversationId ? styles.active : ''}`} onClick={() => handleConversationClick(conversation.id)}>
                <div className={styles.avatarWrapper}>
                  <UserAvatar user={user} size="2.5rem" />
                  <span className={`${styles.statusDot} ${isOnline ? styles.online : styles.offline}`} />
                </div>
                <div className={styles.conversationInfo}>
                  <strong>{friendLabelFor(user)}</strong>
                  <small>{conversation.lastMessage || 'Start a conversation'}</small>
                </div>
              </button>
            );
          }) : <p className={styles.emptyState}>Search for someone to start a private conversation.</p>}
        </div>
        <div className={styles.userStatus}>
          <Link to="/profile" className={styles.userInfo}>
            <div className={styles.avatarWrapper}>
              <UserAvatar user={currentUser.profile} size="2.5rem" />
              <span className={`${styles.statusDot} ${styles.online}`} />
            </div>
            <div className={styles.userDetails}>
              <strong>{currentUser.profile?.displayName || 'User'}</strong>
              <span>{isUserOnline(presence[uid]) ? (presence[uid]?.game?.name ? `Playing ${presence[uid].game.name}` : (currentUser.profile?.status || 'Online')) : 'Offline'}</span>
            </div>
          </Link>
        </div>
      </aside>

      <section className={styles.chatCanvas}>
        {selectedConversationId && recipient?.uid ? <>
          <header className={styles.chatHeader}>
            <div className={styles.headerTitle}>
              <button className={styles.menuToggle} onClick={() => setIsSidebarOpen(previous => !previous)} title="Open conversations">
                <span className="material-symbols-outlined">menu</span>
              </button>
              <button className={styles.headerAvatarBtn} onClick={event => openProfile(recipient, event.currentTarget)} title={`Open ${friendLabelFor(recipient)}'s profile`}>
                <UserAvatar user={recipient} size="2rem" />
              </button>
              <h1>{friendLabelFor(recipient)}</h1>
            </div>
            <div className={styles.headerActions}>
              <button className={styles.iconBtn} onClick={handleStartCall} title={`Start a call with ${friendLabelFor(recipient)}`} aria-label="Start a call">
                <span className="material-symbols-outlined">call</span>
              </button>
            </div>
          </header>

          <div ref={messagesListRef} className={styles.messageList}>
            {messages.length ? messages.map(message => {
              const isMe = message.senderUid === uid;
              return (
                <article key={message.id} id={`pm-message-${message.id}`} className={`${styles.messageItem} ${isMe ? styles.sent : ''} ${isMe && animatedMessageIds.has(message.id) ? styles.justSent : ''}`}>
                  <button className={styles.messageAvatar} onClick={event => openProfile(profileUserFor(isMe), event.currentTarget)} title={`Open ${isMe ? 'your' : `${friendLabelFor(recipient)}'s`} profile`}>
                    <UserAvatar user={isMe ? (currentUser.profile || currentUser) : recipient} size="2.5rem" />
                  </button>
                  <div className={styles.messageContent}>
                    <div className={styles.messageHeader}>
                      <button className={styles.authorButton} onClick={event => openProfile(profileUserFor(isMe), event.currentTarget)}>{isMe ? (currentUser.profile?.displayName || 'You') : friendLabelFor(recipient)}</button>
                      <time>{message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</time>
                      <div className={styles.messageActions}>
                        <button className={styles.msgActionBtn} onClick={() => setReplyingTo({ id: message.id, authorUid: message.senderUid, authorName: isMe ? (currentUser.profile?.displayName || 'You') : friendLabelFor(recipient), text: (message.text || '').slice(0, 200) })} title="Reply"><span className="material-symbols-outlined">reply</span></button>
                        <div className={styles.reactionWrap}>
                          <button className={styles.msgActionBtn} onClick={() => setReactionPickerFor(previous => (previous === message.id ? null : message.id))} title="Add reaction" aria-label="Add reaction"><span className="material-symbols-outlined">add_reaction</span></button>
                          {reactionPickerFor === message.id && <div className={styles.emojiPicker}>{REACTION_EMOJIS.map(emoji => <button key={emoji} type="button" className={styles.emojiChoice} onClick={() => { setReactionPickerFor(null); handleToggleReaction(message, emoji); }} aria-label={`React with ${emoji}`}>{emoji}</button>)}</div>}
                        </div>
                        {isMe && <button className={styles.msgActionBtn} onClick={async () => { try { await deletePrivateMessage(selectedConversationId, message.id); } catch (err) { console.error('Failed to delete message:', err); } }} title="Delete message"><span className="material-symbols-outlined">delete</span></button>}
                      </div>
                    </div>
                    {message.replyTo && <button type="button" className={styles.replyQuote} onClick={() => document.getElementById(`pm-message-${message.replyTo.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><span className="material-symbols-outlined">reply</span><span className={styles.replyQuoteText}><strong>{message.replyTo.authorName || 'Message'}</strong>{message.replyTo.text ? <small>{message.replyTo.text}</small> : null}</span></button>}
                    {(message.text && message.text !== message.attachment?.name && !message.invite) && <div className={styles.messageBubble}>{renderRichText(message.text, { classNames: MARKDOWN_CLASSES })}</div>}
                    {message.invite && <CommunityInviteCard invite={message.invite} />}
                    {message.attachment && <div className={styles.fileCard}><span className="material-symbols-outlined">description</span><span>{message.attachment.name || 'Attachment'}</span><a href={message.attachment.url} target="_blank" rel="noreferrer" title="Open attachment"><span className="material-symbols-outlined">download</span></a></div>}
                    {reactionsFor(message).length > 0 && <div className={styles.reactionRow}>{reactionsFor(message).map(({ emoji, uids }) => <button key={emoji} type="button" className={`${styles.reactionChip} ${uids.includes(uid) ? styles.reactionChipActive : ''}`} title={uids.map(reactionUid => (reactionUid === uid ? 'You' : friendLabelFor(recipient))).join(', ')} onClick={() => handleToggleReaction(message, emoji)}><span>{emoji}</span><span>{uids.length}</span></button>)}</div>}
                  </div>
                </article>
              );
            }) : <p className={styles.emptyThread}>No messages yet. Say hello.</p>}
            <div ref={messagesEndRef} />
          </div>

          {sendError && <p style={{ padding: '0 1.25rem', color: 'var(--color-error)', fontSize: '0.85rem' }}>{sendError}</p>}

          <div className={styles.inputArea}>
            {replyingTo && <div className={styles.replyPreview}>
              <span className="material-symbols-outlined">reply</span>
              <span className={styles.replyPreviewText}>
                <strong>Replying to {replyingTo.authorName}</strong>
                {replyingTo.text ? <small>{replyingTo.text}</small> : null}
              </span>
              <button type="button" onClick={() => setReplyingTo(null)} title="Cancel reply" aria-label="Cancel reply"><span className="material-symbols-outlined">close</span></button>
            </div>}
            <MarkdownToolbar inputRef={composerInputRef} value={messageText} onChange={setMessageText} disabled={isUploading} />
            {pendingAttachment && <div className={styles.pendingAttachment}>
              <span className="material-symbols-outlined">description</span>
              <span>{pendingAttachment.name}</span>
              <button type="button" onClick={() => setPendingAttachment(null)} title="Remove attachment">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>}
            <form className={styles.inputContainer} onSubmit={handleSend}>
              <div className={styles.attachWrap}>
                {isAttachMenuOpen && <div className={styles.attachMenu}>
                  <label className={styles.attachItem}>
                    <span className="material-symbols-outlined">{isUploading ? 'sync' : 'attach_file'}</span>
                    <span>{isUploading ? 'Uploading...' : 'Attach file'}</span>
                    <input type="file" hidden onChange={handleAttachmentPick} disabled={isUploading} />
                  </label>
                </div>}
                <button type="button" className={styles.inputAction} onClick={() => setIsAttachMenuOpen(open => !open)} title="More actions" aria-label="More actions">
                  <span className="material-symbols-outlined">{isAttachMenuOpen ? 'close' : 'add'}</span>
                </button>
              </div>
              <input ref={composerInputRef} className={styles.textInput} value={messageText} onChange={event => setMessageText(event.target.value)} placeholder={`Message ${friendLabelFor(recipient)}`} />
              <button className={styles.inputAction} type="submit" disabled={!messageText.trim() && !pendingAttachment} title="Send private message">
                <span className="material-symbols-outlined">send</span>
              </button>
            </form>
          </div>
        </> : <div className={styles.emptyThread}><button className={styles.emptyMenuToggle} onClick={() => setIsSidebarOpen(true)} title="Open conversations" aria-label="Open conversations"><span className="material-symbols-outlined">menu</span></button><span className="material-symbols-outlined">forum</span><h2>Your private messages</h2><p>Search for a person to begin a conversation.</p></div>}
      </section>

      <Modal
        isOpen={isCallSwitchOpen}
        onClose={() => setIsCallSwitchOpen(false)}
        title="Switch calls?"
        footer={(
          <>
            <button className={styles.modalCancel} onClick={() => setIsCallSwitchOpen(false)}>Stay here</button>
            <button className={styles.modalConfirm} onClick={handleConfirmCallSwitch}>Leave and call</button>
          </>
        )}
      >
        <p className="text-body-md">You’re in a call right now. Calling {friendLabelFor(recipient) || 'this person'} disconnects you from it and connects you to the new one.</p>
      </Modal>

      {selectedProfile && <ProfilePopover user={{ ...selectedProfile.user, displayName: friendLabelFor(selectedProfile.user) }} isOwnProfile={selectedProfile.user?.uid === uid} anchor={selectedProfile.anchor} onClose={() => setSelectedProfile(null)} />}
    </div>
  );
}
