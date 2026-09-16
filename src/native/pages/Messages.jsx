import { useEffect, useMemo, useRef, useState } from 'react';
import {
  f7,
  Link,
  List,
  ListItem,
  Message,
  Messagebar,
  Messages,
  MessagesTitle,
  Navbar,
  Page,
  PageContent,
  Searchbar,
  Sheet
} from 'framework7-react';
import { useAuth } from '../../contexts/AuthContext';
import UserAvatar from '../../components/common/UserAvatar';
import MenuButton from '../components/MenuButton';
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
  deletePrivateMessage
} from '../../services/db';
import { playSentSound, timeShort } from '../utils';
import styles from './Messages.module.css';

function otherParticipant(conversation, uid) {
  const participantEntries = Object.entries(conversation?.participants || {});
  const participant = participantEntries.find(([participantUid]) => participantUid !== uid)?.[1];
  return participant || { uid: Object.keys(conversation?.members || {}).find(memberUid => memberUid !== uid), displayName: 'Private conversation' };
}

export default function PrivateMessagesPage({ f7route }) {
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

  const targetUid = f7route?.query?.uid || null;
  const targetAppliedRef = useRef(false);

  useEffect(() => {
    if (!uid) return undefined;
    const applyTarget = nextConversations => {
      if (!targetUid || targetAppliedRef.current) return;
      const existing = nextConversations.find(conversation => conversation.participants?.[targetUid] || conversation.members?.[targetUid]);
      if (existing) {
        targetAppliedRef.current = true;
        setSelectedConversationId(existing.id);
        return;
      }
      targetAppliedRef.current = true;
      getUserProfile(targetUid).then(user => {
        if (!user?.uid) return;
        const conversationId = privateConversationId(uid, targetUid);
        setConversations(previous => previous.some(conversation => conversation.id === conversationId)
          ? previous
          : [{ id: conversationId, members: { [uid]: true, [targetUid]: true }, participants: { [uid]: currentUser?.profile || currentUser, [targetUid]: user } }, ...previous]);
        setSelectedConversationId(conversationId);
        ensurePrivateConversation(conversationId, uid, targetUid, { [uid]: currentUser?.profile || currentUser, [targetUid]: user }).catch(() => {});
      }).catch(() => {});
    };
    getPrivateConversations(uid).then(nextConversations => {
      setConversations(nextConversations);
      setSelectedConversationId(previous => previous || nextConversations[0]?.id || null);
      applyTarget(nextConversations);
      setLoading(false);
    }).catch(() => setLoading(false));
    return subscribeToPrivateConversations(uid, nextConversations => {
      setConversations(nextConversations);
      setSelectedConversationId(previous => previous || nextConversations[0]?.id || null);
      applyTarget(nextConversations);
    });
  }, [uid, targetUid, currentUser]);

  useEffect(() => {
    if (!selectedConversationId) return undefined;
    initialLoad.current = true;
    seenMessageIds.current = new Set();
    return subscribeToPrivateMessages(selectedConversationId, nextMessages => {
      const latestMessageTimestamp = nextMessages.reduce((latest, message) => Math.max(latest, Number(message.timestamp) || 0), 0);
      if (initialLoad.current) {
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
    ensurePrivateConversation(conversationId, uid, user.uid, { [uid]: currentUser.profile || currentUser, [user.uid]: user }).catch(() => {});
    setSearchText('');
    setSearchResults([]);
  };

  const handleSend = async () => {
    if (!selectedConversationId || !recipient?.uid || !messageText.trim()) return;
    setSendError('');
    const textToSend = messageText.trim();
    setMessageText('');
    const participants = {
      [uid]: { uid, displayName: currentUser.profile?.displayName || currentUser.displayName || 'User', avatarBase64: currentUser.profile?.avatarBase64 || '' },
      [recipient.uid]: { uid: recipient.uid, displayName: recipient.displayName || 'User', avatarBase64: recipient.avatarBase64 || '' }
    };
    try {
      await sendPrivateMessage(selectedConversationId, uid, recipient.uid, textToSend, participants);
      playSentSound();
    } catch (err) {
      setSendError(err.message || 'Failed to send message.');
    }
  };

  const openMessageActions = (message, isMe) => {
    const buttons = [];
    if (isMe) {
      buttons.push({
        text: 'Delete message',
        color: 'red',
        icon: '<span class="material-symbols-outlined">delete</span>',
        onClick: async () => {
          try {
            await deletePrivateMessage(selectedConversationId, message.id);
          } catch (err) {
            console.error('Failed to delete message:', err);
          }
        }
      });
    }
    buttons.push({ text: 'Cancel', color: 'gray' });
    f7.actions.create({ buttons }).open();
  };

  return (
    <Page className={styles.page} pageContent={false}>
      <Navbar title={recipient?.displayName || 'Private Messages'} backLink={false}>
        <MenuButton slot="left" />
        <Link iconOnly slot="right" className={styles.navIconBtn} onClick={() => setOpenSwitcher(true)} aria-label="Conversations">
          <span className="material-symbols-outlined">forum</span>
        </Link>
        {recipient?.uid && (
          <Link iconOnly slot="right" onClick={() => setOpenSwitcher(true)} aria-label="Contacts">
            <UserAvatar user={recipient} size="1.75rem" />
          </Link>
        )}
      </Navbar>

      <Sheet
        opened={openSwitcher}
        onSheetClosed={() => setOpenSwitcher(false)}
        swipeToClose
        backdrop
        className={styles.switcher}
      >
        <div className="sheet-modal-inner">
          <div className={styles.switcherHead}>
            <strong>Conversations</strong>
            <Link iconOnly onClick={() => setOpenSwitcher(false)}>
              <span className="material-symbols-outlined">close</span>
            </Link>
          </div>
          <div className={styles.searchWrap}>
            <Searchbar
              placeholder="Find someone to message"
              value={searchText}
              onInput={event => setSearchText(event.target.value)}
              customSearch
              disableButton={false}
              clearButton
            />
          </div>
          {searchResults.length > 0 && (
            <List strongIos outlineIos inset className={styles.searchResultsList}>
              {searchResults.map(user => (
                <ListItem
                  key={user.uid}
                  link="#"
                  title={user.displayName || user.email}
                  onClick={() => { selectUser(user); setOpenSwitcher(false); }}
                >
                  <div slot="media">
                    <UserAvatar user={user} size="1.9rem" />
                  </div>
                </ListItem>
              ))}
            </List>
          )}
          <List strongIos outlineIos inset mediaList className={styles.switcherList}>
            {conversations.map(conversation => {
              const user = otherParticipant(conversation, uid);
              const isUnread = conversation.lastSenderUid && conversation.lastSenderUid !== uid && conversation.updatedAt > (conversation.lastReadAt || 0);
              return (
                <ListItem
                  key={conversation.id}
                  link="#"
                  title={user.displayName || 'User'}
                  text={conversation.lastMessage || 'Start a conversation'}
                  className={conversation.id === selectedConversationId ? styles.activeItem : undefined}
                  badge={isUnread ? '●' : undefined}
                  badgeColor="blue"
                  onClick={() => { setSelectedConversationId(conversation.id); setOpenSwitcher(false); }}
                >
                  <div slot="media" className={styles.avatarWrap}>
                    <UserAvatar user={user} size="2.4rem" />
                    <span className={`${styles.statusDot} ${presence[user?.uid] ? styles.online : styles.offline}`} />
                  </div>
                </ListItem>
              );
            })}
            {!conversations.length && !loading && (
              <ListItem title="Search for someone to start a conversation" disabled />
            )}
          </List>
        </div>
      </Sheet>

      {selectedConversationId && recipient?.uid ? (
        <>
          <PageContent className={styles.messageScroll}>
            <Messages className={styles.messages} init={false}>
              <MessagesTitle>Beginning of conversation</MessagesTitle>
              {messages.map((message, index) => {
                const isMe = message.senderUid === uid;
                const inSameRun = other => other && other.senderUid === message.senderUid
                  && Math.abs((other.timestamp || 0) - (message.timestamp || 0)) < 5 * 60 * 1000;
                const isFirst = !inSameRun(messages[index - 1]);
                const isLast = !inSameRun(messages[index + 1]);
                return (
                  <Message
                    key={message.id}
                    type={isMe ? 'sent' : 'received'}
                    className={animatedMessageIds.has(message.id) ? 'message-appear-from-bottom' : undefined}
                    first={isFirst}
                    last={isLast}
                    tail={isLast}
                    sameName={!isFirst}
                    sameHeader={!isFirst}
                    onClick={() => openMessageActions(message, isMe)}
                  >
                    <div slot="avatar"><UserAvatar user={isMe ? (currentUser.profile || currentUser) : recipient} size="2.1rem" /></div>
                    {!isMe && <div slot="name">{recipient.displayName || 'User'}</div>}
                    <div slot="header">{timeShort(message.timestamp)}</div>
                    <div slot="text">
                      {message.text}
                    </div>
                  </Message>
                );
              })}
              <div ref={messagesEndRef} />
            </Messages>
          </PageContent>

          <div className={styles.composerWrap}>
            {sendError && <p className={styles.sendError}>{sendError}</p>}
            <Messagebar
              placeholder={`Message ${recipient.displayName || 'user'}`}
              value={messageText}
              onInput={event => setMessageText(event.target.value)}
              sendLink={Boolean(messageText.trim())}
              onSend={handleSend}
              onSubmit={handleSend}
            />
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
