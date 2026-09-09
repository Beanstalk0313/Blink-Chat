import { useEffect, useMemo, useRef, useState } from 'react';
import { Navbar, Page, PageContent, Messages, Message, MessagesTitle } from 'framework7-react';
import { useAuth } from '../../contexts/AuthContext';
import UserAvatar from '../../components/common/UserAvatar';
import MenuButton from '../components/MenuButton';
import {
  getPrivateConversations,
  markPrivateConversationRead,
  privateConversationId,
  searchUsers,
  sendPrivateMessage,
  subscribeToPrivateConversations,
  subscribeToPrivateMessages,
  subscribeToCommunityPresence,
  deletePrivateMessage
} from '../../services/db';
import { playSentSound, timeShort } from '../utils';
import styles from './Messages.module.css';

function otherParticipant(conversation, uid) {
  const participantEntries = Object.entries(conversation?.participants || {});
  const participant = participantEntries.find(([participantUid]) => participantUid !== uid)?.[1];
  return participant || { uid: Object.keys(conversation?.members || {}).find(memberUid => memberUid !== uid), displayName: 'Private conversation' };
}

// Native private messages screen. The component is named PrivateMessagesPage
// because Framework7's <Messages> list component is used inside it.
export default function PrivateMessagesPage() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendError, setSendError] = useState('');
  const [presence, setPresence] = useState({});
  const [openSwitcher, setOpenSwitcher] = useState(false);
  const [animatedMessageIds, setAnimatedMessageIds] = useState(() => new Set());
  const messagesEndRef = useRef(null);
  const initialLoad = useRef(true);
  const seenMessageIds = useRef(new Set());

  useEffect(() => subscribeToCommunityPresence(setPresence), []);

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
    seenMessageIds.current = new Set();
    return subscribeToPrivateMessages(selectedConversationId, nextMessages => {
      const latestMessageTimestamp = nextMessages.reduce((latest, message) => Math.max(latest, Number(message.timestamp) || 0), 0);
      if (initialLoad.current) {
        // First load of this conversation: mark everything seen so only
        // genuinely new messages animate (see animatedMessageIds below).
        initialLoad.current = false;
        nextMessages.forEach(message => seenMessageIds.current.add(message.id));
      } else {
        const newlyArrivedIds = [];
        nextMessages.forEach(message => {
          if (seenMessageIds.current.has(message.id)) return;
          seenMessageIds.current.add(message.id);
          newlyArrivedIds.push(message.id);
        });
        if (newlyArrivedIds.length) {
          setAnimatedMessageIds(previous => new Set([...previous, ...newlyArrivedIds]));
          window.setTimeout(() => setAnimatedMessageIds(previous => {
            const next = new Set(previous);
            newlyArrivedIds.forEach(id => next.delete(id));
            return next;
          }), 420);
        }
      }
      setMessages(nextMessages);
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
      window.removeEventListener('visibilitychange', markReadOnRefocus);
    };
  }, [selectedConversationId, uid]);

  useEffect(() => {
    const query = searchText.trim();
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!query || !uid) { setSearchResults([]); return; }
      searchUsers(query, uid).then(results => { if (!cancelled) setSearchResults(results); }).catch(() => { if (!cancelled) setSearchResults([]); });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [searchText, uid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
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
      playSentSound();
      setMessageText('');
    } catch (err) {
      setSendError(err.message || 'Failed to send message.');
    }
  };

  return (
    // pageContent={false}: F7's Page auto-wraps children in its own
    // .page-content, which would nest with ours and break the pinned composer.
    <Page className={styles.page} pageContent={false}>
      <Navbar title={recipient?.displayName || 'Private Messages'} backLink={false}>
        <MenuButton slot="left" />
        <button type="button" slot="right" className={styles.navIconBtn} onClick={() => setOpenSwitcher(true)} aria-label="Conversations">
          <span className="material-symbols-outlined">forum</span>
        </button>
        {recipient?.uid && <a href="#/profile/" slot="right"><UserAvatar user={recipient} size="1.75rem" /></a>}
      </Navbar>

      {/* Conversation switcher (in-page sheet) */}
      {openSwitcher && (
        <div className={styles.switcherBackdrop} onClick={() => setOpenSwitcher(false)}>
          <div className={styles.switcher} onClick={event => event.stopPropagation()}>
            <div className={styles.switcherHead}>
              <strong>Conversations</strong>
              <button type="button" onClick={() => setOpenSwitcher(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className={styles.searchBox}>
              <span className="material-symbols-outlined">search</span>
              <input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Find someone to message" />
            </div>
            {searchResults.length > 0 && (
              <div className={styles.searchResults}>
                {searchResults.map(user => (
                  <button type="button" key={user.uid} onClick={() => { selectUser(user); setOpenSwitcher(false); }}>
                    <UserAvatar user={user} size="1.9rem" />
                    <span>{user.displayName || user.email}</span>
                  </button>
                ))}
              </div>
            )}
            <div className={styles.switcherList}>
              {conversations.map(conversation => {
                const user = otherParticipant(conversation, uid);
                const isUnread = conversation.lastSenderUid && conversation.lastSenderUid !== uid && conversation.updatedAt > (conversation.lastReadAt || 0);
                return (
                  <button
                    type="button"
                    key={conversation.id}
                    className={`${styles.conversationItem} ${conversation.id === selectedConversationId ? styles.active : ''}`}
                    onClick={() => { setSelectedConversationId(conversation.id); setOpenSwitcher(false); }}
                  >
                    <span className={styles.avatarWrap}>
                      <UserAvatar user={user} size="2.4rem" />
                      <span className={`${styles.statusDot} ${presence[user?.uid] ? styles.online : styles.offline}`} />
                    </span>
                    <span className={styles.conversationInfo}>
                      <strong>{user.displayName || 'User'}</strong>
                      <small>{conversation.lastMessage || 'Start a conversation'}</small>
                    </span>
                    {isUnread && <span className={styles.unreadDot} />}
                  </button>
                );
              })}
              {!conversations.length && !loading && <p className={styles.emptyState}>Search for someone to start a private conversation.</p>}
            </div>
          </div>
        </div>
      )}

      {selectedConversationId && recipient?.uid ? (
        <>
          <PageContent className={styles.messageScroll}>
            {/* init={false}: without it the Messages wrapper re-animates the
                whole history on every conversation switch (see Channel.jsx).
                Only messages in animatedMessageIds get the appear animation. */}
            <Messages className={styles.messages} init={false}>
              <MessagesTitle>Beginning of conversation</MessagesTitle>
              {messages.map(message => {
                const isMe = message.senderUid === uid;
                const tail = message.id === messages[messages.length - 1]?.id;
                return (
                  <Message
                    key={message.id}
                    type={isMe ? 'sent' : 'received'}
                    className={animatedMessageIds.has(message.id) ? 'message-appear-from-bottom' : undefined}
                    first={message === messages[0]}
                    last={tail}
                    tail={tail}
                  >
                    <div slot="avatar"><UserAvatar user={isMe ? (currentUser.profile || currentUser) : recipient} size="2.1rem" /></div>
                    {!isMe && <div slot="name">{recipient.displayName || 'User'}</div>}
                    <div slot="header">{timeShort(message.timestamp)}</div>
                    <div slot="text">
                      {message.text}
                      {isMe && (
                        <button type="button" className={styles.deleteBtn} onClick={async () => {
                          try { await deletePrivateMessage(selectedConversationId, message.id); } catch (err) { console.error('Failed to delete message:', err); }
                        }} title="Delete message">
                          <span className="material-symbols-outlined">delete</span>
                        </button>
                      )}
                    </div>
                  </Message>
                );
              })}
              <div ref={messagesEndRef} />
            </Messages>
          </PageContent>

          <div className={styles.composerWrap}>
            {sendError && <p className={styles.sendError}>{sendError}</p>}
            <form className={styles.composer} onSubmit={handleSend}>
              <input
                className={styles.composerInput}
                value={messageText}
                onChange={event => setMessageText(event.target.value)}
                placeholder={`Message ${recipient.displayName || 'user'}`}
              />
              <button type="submit" className={styles.sendBtn} disabled={!messageText.trim()}>
                <span className="material-symbols-outlined">send</span>
              </button>
            </form>
          </div>
        </>
      ) : (
        <PageContent>
          <div className={styles.emptyThread}>
            <span className="material-symbols-outlined">forum</span>
            <h2>Your private messages</h2>
            <p>Tap the conversations icon to pick a conversation, or search for a person.</p>
          </div>
        </PageContent>
      )}
    </Page>
  );
}
