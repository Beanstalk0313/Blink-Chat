import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import UserAvatar from '../components/common/UserAvatar';
import {
  getPrivateConversations,
  getUserProfile,
  markPrivateConversationRead,
  privateConversationId,
  searchUsers,
  sendPrivateMessage,
  subscribeToPrivateConversations,
  subscribeToPrivateMessages,
  subscribeToCommunityPresence,
  deletePrivateMessage
} from '../services/db';
import styles from './PrivateMessages.module.css';

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
  const messagesListRef = useRef(null);
  const messagesEndRef = useRef(null);
  const initialLoad = useRef(true);
  const handledUserParam = useRef(false);

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
        markPrivateConversationRead(uid, selectedConversationId, latestMessageTimestamp || undefined).catch(() => {});
      }
    });
  }, [selectedConversationId, uid]);

  useEffect(() => {
    if (!selectedConversationId || !uid) return undefined;
    const markReadOnRefocus = () => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
      markPrivateConversationRead(uid, selectedConversationId).catch(() => {});
    };
    window.addEventListener('focus', markReadOnRefocus);
    document.addEventListener('visibilitychange', markReadOnRefocus);
    return () => {
      window.removeEventListener('focus', markReadOnRefocus);
      document.removeEventListener('visibilitychange', markReadOnRefocus);
    };
  }, [selectedConversationId, uid]);

  useEffect(() => {
    if (!selectedConversationId || !uid) return undefined;
    const handleInteraction = event => {
      if (event.type === 'keydown' && event.isComposing) return;
      if (document.visibilityState !== 'visible') return;
      const latestMessageTimestamp = messages.reduce((latest, message) => Math.max(latest, Number(message.timestamp) || 0), 0);
      markPrivateConversationRead(uid, selectedConversationId, latestMessageTimestamp || undefined).catch(() => {});
    };
    const interactionEvents = ['pointerdown', 'touchstart', 'keydown', 'click'];
    interactionEvents.forEach(eventName => document.addEventListener(eventName, handleInteraction, true));
    return () => interactionEvents.forEach(eventName => document.removeEventListener(eventName, handleInteraction, true));
  }, [messages, selectedConversationId, uid]);

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

  const selectUser = user => {
    const conversationId = privateConversationId(uid, user.uid);
    setConversations(previous => previous.some(conversation => conversation.id === conversationId)
      ? previous
      : [{ id: conversationId, members: { [uid]: true, [user.uid]: true }, participants: { [uid]: currentUser.profile || currentUser, [user.uid]: user } }, ...previous]);
    setSelectedConversationId(conversationId);
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

  const handleSend = async event => {
    event.preventDefault();
    if (!selectedConversationId || !recipient?.uid || !messageText.trim()) return;
    setSendError('');
    const participants = {
      [uid]: { uid, displayName: currentUser.profile?.displayName || currentUser.displayName || 'User', avatarBase64: currentUser.profile?.avatarBase64 || '' },
      [recipient.uid]: { uid: recipient.uid, displayName: recipient.displayName || 'User', avatarBase64: recipient.avatarBase64 || '' }
    };
    try {
      await sendPrivateMessage(selectedConversationId, uid, recipient.uid, messageText, participants);
      setMessageText('');
    } catch (err) {
      setSendError(err.message || 'Failed to send message.');
    }
  };

  const handleConversationClick = conversationId => {
    setSelectedConversationId(conversationId);
    if (window.innerWidth <= 1024) setIsSidebarOpen(false);
  };

  const recipientOnline = recipient?.uid ? Boolean(presence[recipient.uid]) : false;

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
            const isOnline = user?.uid ? Boolean(presence[user.uid]) : false;
            return (
              <button key={conversation.id} className={`${styles.conversationItem} ${conversation.id === selectedConversationId ? styles.active : ''}`} onClick={() => handleConversationClick(conversation.id)}>
                <div className={styles.avatarWrapper}>
                  <UserAvatar user={user} size="2.5rem" />
                  <span className={`${styles.statusDot} ${isOnline ? styles.online : styles.offline}`} />
                </div>
                <div className={styles.conversationInfo}>
                  <strong>{user.displayName || 'User'}</strong>
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
              <span>{currentUser.profile?.status || 'Online'}</span>
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
              <UserAvatar user={recipient} size="2rem" />
              <h1>{recipient.displayName || 'User'}</h1>
            </div>
            <div className={styles.headerActions}>
              <button className={`${styles.iconBtn} ${styles.active}`} title="Private conversation">
                <span className="material-symbols-outlined">lock</span>
              </button>
            </div>
          </header>

          <div ref={messagesListRef} className={styles.messageList}>
            {messages.length ? messages.map(message => {
              const isMe = message.senderUid === uid;
              return (
                <article key={message.id} className={`${styles.messageItem} ${isMe ? styles.sent : ''} ${isMe && animatedMessageIds.has(message.id) ? styles.justSent : ''}`}>
                  <button className={styles.messageAvatar}>
                    <UserAvatar user={isMe ? (currentUser.profile || currentUser) : recipient} size="2.5rem" />
                  </button>
                  <div className={styles.messageContent}>
                    <div className={styles.messageHeader}>
                      <span className={styles.authorButton}>{isMe ? (currentUser.profile?.displayName || 'You') : (recipient.displayName || 'User')}</span>
                      <time>{message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</time>
                      {isMe && <div className={styles.messageActions}><button className={styles.msgActionBtn} onClick={async () => { try { await deletePrivateMessage(selectedConversationId, message.id); } catch (err) { console.error('Failed to delete message:', err); } }} title="Delete message"><span className="material-symbols-outlined">delete</span></button></div>}
                    </div>
                    <p className={styles.messageBubble}>{message.text}</p>
                  </div>
                </article>
              );
            }) : <p className={styles.emptyThread}>No messages yet. Say hello.</p>}
            <div ref={messagesEndRef} />
          </div>

          {sendError && <p style={{ padding: '0 1.25rem', color: '#f44336', fontSize: '0.85rem' }}>{sendError}</p>}

          <div className={styles.inputArea}>
            <form className={styles.inputContainer} onSubmit={handleSend}>
              <input className={styles.textInput} value={messageText} onChange={event => setMessageText(event.target.value)} placeholder={`Message ${recipient.displayName || 'user'}`} />
              <button className={styles.inputAction} type="submit" disabled={!messageText.trim()} title="Send private message">
                <span className="material-symbols-outlined">send</span>
              </button>
            </form>
          </div>
        </> : <div className={styles.emptyThread}><button className={styles.emptyMenuToggle} onClick={() => setIsSidebarOpen(true)} title="Open conversations" aria-label="Open conversations"><span className="material-symbols-outlined">menu</span></button><span className="material-symbols-outlined">forum</span><h2>Your private messages</h2><p>Search for a person to begin a conversation.</p></div>}
      </section>

      {selectedConversationId && recipient?.uid && (
        <aside className={styles.memberListSidebar}>
          <p className="text-label-sm text-tertiary">MEMBER</p>
          <button className={styles.memberItem}>
            <UserAvatar user={recipient} size="2rem" />
            <span>{recipient.displayName || 'User'}</span>
            <span className={`${styles.statusDot} ${recipientOnline ? styles.online : styles.offline}`} />
          </button>
        </aside>
      )}
    </div>
  );
}
