import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { f7, Navbar, NavLeft, NavRight, NavTitle, Page, PageContent, Messages, Message, Link } from 'framework7-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import {
  createChannel,
  deleteMessage,
  editMessage,
  getCachedMessages,
  getChannels,
  getCommunity,
  getSingleMessage,
  sendMessage,
  subscribeToCommunityMembers,
  subscribeToMessages,
  subscribeToCommunityPresence,
  subscribeToVoiceParticipants,
  subscribeToTyping,
  setTyping,
  clearTyping,
  searchChannelMessages,
  setChannelNotificationMode,
  joinVoiceChannel,
  togglePinMessage,
  toggleReaction,
  votePoll,
  updateLastRead,
  setCommunityMuted,
  leaveCommunity
} from '../../services/db';
import { uploadFile } from '../../services/upload';
import { mentionsUser, filterCommunityMessage } from '../../services/utils';
import { renderRichText } from '../../services/richText';
import { useCall } from '../../contexts/CallContext';
import UserAvatar from '../../components/common/UserAvatar';
import GameMessage from '../../components/chat/GameMessage';
import RoleBadge from '../../components/common/RoleBadge';
import { primaryRoleForMember } from '../../services/roleBadges';
import { getMemberPermissions } from '../../services/permissions';
import { playSentSound, timeShort } from '../utils';
import { navigateTo } from '../navigation';
import MenuButton from '../components/MenuButton';
import styles from './Channel.module.css';

const EMOJI_CHOICES = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀'];

// Native chat screen: navbar channel chips, F7 Messages list, composer with
// mention suggestions, voice room, and moderation actions.
export default function Channel({ f7route }) {
  const { communityId, channelId: routeChannelId } = f7route.params;
  const { currentUser } = useAuth();
  const { notify = () => {} } = useNotifications() || {};
  const { activeCall, startCall } = useCall();

  const [community, setCommunity] = useState(null);
  const [channels, setChannels] = useState([]);
  const [members, setMembers] = useState([]);
  const [presence, setPresence] = useState({});
  const [voiceParticipants, setVoiceParticipants] = useState({});
  const [messages, setMessages] = useState([]);
  const [animatedMessageIds, setAnimatedMessageIds] = useState(() => new Set());
  const [messageLimit, setMessageLimit] = useState(25);
  const [newMessage, setNewMessage] = useState('');
  const [mentionQuery, setMentionQuery] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [attachment, setAttachment] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [sendError, setSendError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [isMuted, setIsMuted] = useState(Boolean(currentUser?.profile?.notificationPreferences?.communityMuted?.[communityId]));
  const [replyingTo, setReplyingTo] = useState(null);
  const [typingUsers, setTypingUsers] = useState({});
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchFetching, setIsSearchFetching] = useState(false);
  const [isComposerMenuOpen, setIsComposerMenuOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const initialLoad = useRef(true);
  const seenMessageIds = useRef(new Set());
  const latestMessageTimestampRef = useRef(0);
  const liveReadThrottleRef = useRef(0);
  const isExecutingKick = useRef(false);
  const typingTimerRef = useRef(null);
  const typingActiveRef = useRef(false);
  const searchQueryRef = useRef('');
  const searchTimerRef = useRef(null);

  const currentUid = currentUser?.uid;
  const currentChannel = channels.find(channel => channel.id === routeChannelId) || channels[0];
  const currentChannelId = currentChannel?.id;
  const activeMembers = members.filter(member => !community?.kickedUsers?.[member.uid]);

  // Kick cleanup, same behavior as the web app.
  const kickedAt = community?.kickedUsers?.[currentUid];
  useEffect(() => {
    if (!kickedAt || !currentUid || !communityId || isExecutingKick.current) return;
    isExecutingKick.current = true;
    leaveCommunity(currentUid, communityId).catch(() => {})
      .finally(() => navigateTo('/communities/', { reloadCurrent: true }));
  }, [kickedAt, currentUid, communityId]);

  const permissions = getMemberPermissions(community, currentUid);
  const canManageChannels = permissions.includes('manage_channels');
  const canManageMessages = permissions.includes('manage_messages');
  const canOpenSettings = permissions.some(permission => ['manage_channels', 'manage_roles', 'manage_members', 'manage_community', 'manage_invites'].includes(permission));
  const currentUserDisplayName = currentUser?.profile?.displayName?.trim().toLowerCase();
  const assignedRoleValue = community?.memberRoles?.[currentUid];
  const roleIds = Array.isArray(assignedRoleValue) ? assignedRoleValue : assignedRoleValue ? [assignedRoleValue] : [];
  const timeoutExpires = community?.timedOutUsers?.[currentUid] || 0;
  const isTimedOut = timeoutExpires > now;
  const slowModeSeconds = Number(currentChannel?.slowModeSeconds) || 0;
  const slowModeRemaining = (() => {
    if (!slowModeSeconds || !currentUid) return 0;
    try {
      const lastSent = Number(window.localStorage.getItem(`blink-slowmode-${currentChannelId}`)) || 0;
      return Math.max(0, lastSent + slowModeSeconds * 1000 - now);
    } catch {
      return 0;
    }
  })();
  const canSend = currentChannel?.type !== 'voice' && !isTimedOut && !currentChannel?.isLocked && slowModeRemaining <= 0 && (
    !currentChannel?.allowedRoles?.length || currentChannel.allowedRoles.some(allowedRole => roleIds.includes(allowedRole)) || canManageChannels
  );

  // Load community + channels; redirect to the first channel when unspecified.
  useEffect(() => {
    let cancelled = false;
    async function loadCommunity() {
      if (!communityId) return;
      const [nextCommunity, nextChannels] = await Promise.all([
        getCommunity(communityId).catch(() => null),
        getChannels(communityId).catch(() => [])
      ]);
      if (cancelled) return;
      setCommunity(nextCommunity);
      setChannels(nextChannels);
      if (!routeChannelId && nextChannels[0]) {
        // Redirect to the community's first (top) channel. Plain navigation:
        // reloadCurrent on a *different* URL leaves the router confused and can
        // fall back to the catch-all home route.
        navigateTo(`/channels/${communityId}/${nextChannels[0].id}/`);
      }
    }
    loadCommunity();
    initialLoad.current = true;
    return () => { cancelled = true; };
  }, [communityId, routeChannelId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!currentChannelId || !currentUid) return undefined;
    return subscribeToTyping(currentChannelId, setTypingUsers);
  }, [currentChannelId, currentUid]);

  // Readers prune stale typing entries client-side (~8s), so a writer that
  // died mid-burst disappears without any extra Firebase calls.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTypingUsers(previous => {
        const cutoff = Date.now() - 8000;
        const next = {};
        let changed = false;
        Object.entries(previous).forEach(([uid, entry]) => {
          if (Number(entry?.startedAt || 0) > cutoff) next[uid] = entry;
          else changed = true;
        });
        return changed ? next : previous;
      });
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  // Clear the user's own typing entry when leaving the channel or unmounting.
  useEffect(() => () => {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    if (typingActiveRef.current && currentChannelId && currentUid) {
      clearTyping(currentChannelId, currentUid).catch(() => {});
    }
  }, [currentChannelId, currentUid]);

  useEffect(() => {
    if (!communityId) return undefined;
    return subscribeToCommunityMembers(communityId, setMembers);
  }, [communityId]);

  useEffect(() => subscribeToCommunityPresence(setPresence), []);
  useEffect(() => subscribeToVoiceParticipants(setVoiceParticipants), []);

  // Channel switch resets per-channel state.
  useEffect(() => {
    initialLoad.current = true;
    seenMessageIds.current = new Set((currentChannelId ? getCachedMessages(currentChannelId) : []).map(message => message.id));
    latestMessageTimestampRef.current = 0;
  }, [currentChannelId]);

  useEffect(() => {
    if (!currentChannelId || !currentUid) return undefined;
    const notificationPreferences = currentUser?.profile?.notificationPreferences || {};
    const notificationMode = notificationPreferences.channelModes?.[currentChannelId] || 'mentions';
    const communityMuted = Boolean(notificationPreferences.communityMuted?.[communityId]);
    return subscribeToMessages(currentChannelId, nextMessages => {
      if (initialLoad.current) {
        nextMessages.forEach(message => seenMessageIds.current.add(message.id));
        latestMessageTimestampRef.current = nextMessages.reduce((latest, message) => Math.max(latest, Number(message.timestamp) || 0), 0);
        setMessages(nextMessages);
        setPinnedMessages(nextMessages.filter(message => message?.isPinned));
        updateLastRead(currentUid, currentChannelId, latestMessageTimestampRef.current || undefined).catch(() => {});
        initialLoad.current = false;
        return;
      }

      const newlyArrived = nextMessages.filter(message => {
        if (seenMessageIds.current.has(message.id)) return false;
        seenMessageIds.current.add(message.id);
        return true;
      });
      latestMessageTimestampRef.current = nextMessages.reduce((latest, message) => Math.max(latest, Number(message.timestamp) || 0), latestMessageTimestampRef.current);
      const newlyArrivedIds = newlyArrived.map(message => message.id);
      if (newlyArrivedIds.length) {
        setAnimatedMessageIds(previous => new Set([...previous, ...newlyArrivedIds]));
        window.setTimeout(() => setAnimatedMessageIds(previous => {
          const next = new Set(previous);
          newlyArrivedIds.forEach(id => next.delete(id));
          return next;
        }), 420);
      }

      const newIncomingMessage = newlyArrived.find(message => message.authorUid !== currentUid);
      if (newIncomingMessage && !newIncomingMessage.system && !isMuted && !communityMuted) {
        const isFresh = !newIncomingMessage.timestamp || newIncomingMessage.timestamp >= (Date.now() - 5000);
        if (isFresh && (notificationMode === 'all' || (notificationMode === 'mentions' && mentionsUser(newIncomingMessage.text, currentUserDisplayName)))) {
          if (document.visibilityState === 'visible' && document.hasFocus()) {
            notify(`#${currentChannel?.name || 'chat'}`, newIncomingMessage.text || 'New attachment');
          }
        }
      }

      if (newIncomingMessage && document.visibilityState === 'visible' && document.hasFocus()) {
        const nowMs = Date.now();
        if (nowMs - liveReadThrottleRef.current >= 10000) {
          liveReadThrottleRef.current = nowMs;
          updateLastRead(currentUid, currentChannelId, latestMessageTimestampRef.current || undefined).catch(() => {});
        }
      }

      setMessages(nextMessages);
      setPinnedMessages(nextMessages.filter(message => message?.isPinned));
    }, messageLimit);
  }, [currentChannelId, currentUid, currentUserDisplayName, currentUser?.profile?.notificationPreferences, currentChannel?.name, communityId, isMuted, messageLimit, notify]);

  useLayoutEffect(() => {
    if (!messages.length) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [messages]);

  // Mention suggestions (ported semantics from the web composer).
  const mentionOptions = mentionQuery === null ? [] : (() => {
    const { trigger, query } = mentionQuery;
    const normalized = query.toLowerCase();
    if (trigger === '#') {
      return channels
        .filter(channel => channel.type !== 'voice' && channel.name?.toLowerCase().includes(normalized))
        .slice(0, 6)
        .map(channel => ({ label: `#${channel.name}`, value: `#${channel.name}`, type: 'channel' }));
    }
    return [
      ...activeMembers.filter(member => member.displayName?.toLowerCase().includes(normalized)).slice(0, 6).map(member => ({ label: `@${member.displayName}`, value: `@${member.displayName}`, type: 'user', avatar: member })),
      ...(normalized === 'everyone' ? [{ label: '@everyone', value: '@everyone', type: 'everyone' }] : []),
      ...Object.values(community?.roles || {}).filter(role => role.name?.toLowerCase().includes(normalized)).slice(0, 4).map(role => ({ label: `@${role.name}`, value: `@${role.name}`, type: 'role', color: role.color }))
    ];
  })();

  const insertMention = option => {
    const value = option.value;
    setNewMessage(previous => {
      const match = previous.match(/(?:^|\s)([@#])[^\s@#]*$/);
      if (!match) return `${previous}${value} `;
      return previous.slice(0, match.index) + value + ' ';
    });
    setMentionQuery(null);
  };

  const authorFor = message => activeMembers.find(member => member.uid === message.authorUid) || {
    uid: message.authorUid,
    displayName: message.authorName || 'User',
    avatarBase64: message.authorAvatar
  };

  const renderMessageText = text => renderRichText(text, {
    members,
    channels,
    roles: community?.roles || {},
    classNames: {
      userMention: styles.mention,
      channelMention: styles.mention,
      everyoneMention: styles.mention,
      roleMention: styles.mention,
      plainMention: styles.mention,
      link: styles.mdLink,
      inlineCode: styles.mdInlineCode,
      codeBlock: styles.mdCodeBlock,
      codeBlockLang: styles.mdCodeBlockLang,
      quote: styles.mdQuote,
      heading: styles.mdHeading,
      list: styles.mdList,
      paragraph: styles.mdParagraph
    },
    channelHref: channel => `#/channels/${communityId}/${channel.id}/`
  });

  const performSend = async (text, attachmentValue, options = {}) => {
    if (!currentChannelId) return false;
    const modResult = filterCommunityMessage(text, community);
    if (modResult.blocked) {
      setSendError(modResult.reason);
      return false;
    }
    setSendError('');
    try {
      await sendMessage(currentChannelId, text, currentUid, attachmentValue || undefined, options);
      playSentSound();
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        clearTyping(currentChannelId, currentUid).catch(() => {});
      }
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      if (slowModeSeconds > 0) {
        try {
          // eslint-disable-next-line react-hooks/purity
          window.localStorage.setItem(`blink-slowmode-${currentChannelId}`, String(Date.now()));
        } catch {
          // Storage unavailable: cooldown simply won't persist across reloads.
        }
        // eslint-disable-next-line react-hooks/purity
        setNow(Date.now());
      }
      setNewMessage('');
      setAttachment(null);
      setMentionQuery(null);
      setReplyingTo(null);
      return true;
    } catch (error) {
      setSendError(error?.message || 'Message could not be sent.');
      return false;
    }
  };

  const handleSend = async () => {
    if (!canSend || (!newMessage.trim() && !attachment)) return;
    await performSend(newMessage, attachment, { replyTo: replyingTo || undefined });
  };

  const handleComposerChange = value => {
    setNewMessage(value);
    setSendError('');
    const match = value.match(/(?:^|\s)([@#])([^\s@#]*)$/);
    setMentionQuery(match ? { trigger: match[1], query: match[2] } : null);
    if (!currentChannelId || !currentUid) return;
    if (!value.trim()) {
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        clearTyping(currentChannelId, currentUid).catch(() => {});
      }
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      return;
    }
    // One write per typing burst, cleared after 3s of inactivity (or on send).
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      setTyping(currentChannelId, currentUid, currentUser?.profile?.displayName || 'User').catch(() => {});
    }
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      typingActiveRef.current = false;
      clearTyping(currentChannelId, currentUid).catch(() => {});
    }, 3000);
  };

  const runSearch = async query => {
    const normalized = String(query || '').trim().toLowerCase();
    if (!normalized) {
      setSearchResults([]);
      setIsSearchFetching(false);
      return;
    }
    setSearchResults(getCachedMessages(currentChannelId)
      .filter(message => message?.text?.toLowerCase().includes(normalized))
      .slice(-60));
    setIsSearchFetching(true);
    try {
      const results = await searchChannelMessages(currentChannelId, query);
      if (searchQueryRef.current === query) setSearchResults(results);
    } finally {
      if (searchQueryRef.current === query) setIsSearchFetching(false);
    }
  };

  const handleSearchChange = value => {
    setSearchQuery(value);
    searchQueryRef.current = value;
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => runSearch(value), 250);
  };

  const jumpToMessage = async messageId => {
    if (!messageId || !currentChannelId) return;
    let target = messages.find(message => message.id === messageId);
    if (!target) {
      try {
        const single = await getSingleMessage(currentChannelId, messageId);
        if (single) {
          target = single;
          setMessages(previous => {
            const byId = new Map(previous.map(message => [message.id, message]));
            byId.set(single.id, single);
            return [...byId.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
          });
        }
      } catch {
        // Not found or offline.
      }
    }
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    if (!target) return;
    window.setTimeout(() => {
      const element = document.getElementById(`blink-msg-${messageId}`);
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
  };

  const handleNotificationModeChange = mode => {
    setChannelNotificationMode(currentUid, currentChannelId, mode)
      .catch(error => setSendError(error?.message || 'Notification setting could not be saved.'));
  };

  const openNotificationSheet = () => {
    const notificationMode = currentUser?.profile?.notificationPreferences?.channelModes?.[currentChannelId] || 'mentions';
    const buttons = [
      { text: notificationMode === 'all' ? '✓ All messages' : 'All messages', onClick: () => handleNotificationModeChange('all') },
      { text: notificationMode === 'mentions' ? '✓ Mentions only' : 'Mentions only', onClick: () => handleNotificationModeChange('mentions') },
      { text: notificationMode === 'none' ? '✓ Nothing' : 'Nothing', onClick: () => handleNotificationModeChange('none') },
      { label: true, text: 'COMMUNITY' },
      { text: isMuted ? 'Unmute entire community' : 'Mute entire community', onClick: handleMuteToggle },
      { text: 'Cancel', color: 'red' }
    ];
    f7.actions.create({ buttons }).open();
  };

  const startPollCreation = () => {
    f7.dialog.prompt('Question', 'Create poll', question => {
      const questionText = (question || '').trim();
      if (!questionText) return;
      const optionTexts = [];
      const askOption = () => {
        if (optionTexts.length >= 6) {
          sendPoll(questionText, optionTexts);
          return;
        }
        f7.dialog.prompt(`Option ${optionTexts.length + 1} (leave empty to finish)`, 'Create poll', value => {
          const text = (value || '').trim();
          if (!text) {
            if (optionTexts.length < 2) {
              f7.dialog.alert('A poll needs at least two options.');
              return;
            }
            sendPoll(questionText, optionTexts);
            return;
          }
          optionTexts.push(text);
          askOption();
        });
      };
      askOption();
    });
  };

  const sendPoll = async (question, optionTexts) => {
    const options = optionTexts.slice(0, 6).map((text, index) => ({ id: String.fromCharCode(97 + index), text }));
    await performSend('', null, { poll: { question, options } });
  };

  const startGame = () => {
    setIsComposerMenuOpen(false);
    const opponents = activeMembers.filter(member => member.uid !== currentUid);
    if (!opponents.length) { f7.dialog.alert('Invite another member before starting a two-player game.'); return; }
    f7.actions.create({ buttons: [
      { text: 'Tic-Tac-Toe', onClick: () => chooseGameOpponent('ticTacToe', opponents) },
      { text: 'Connect Four', onClick: () => chooseGameOpponent('connectFour', opponents) },
      { text: 'Checkers', onClick: () => chooseGameOpponent('checkers', opponents) },
      { text: 'Chess', onClick: () => chooseGameOpponent('chess', opponents) },
      { text: 'Cancel', color: 'red' }
    ] }).open();
  };

  const chooseGameOpponent = (type, opponents) => f7.actions.create({ buttons: [
    { label: true, text: 'CHOOSE OPPONENT' },
    ...opponents.slice(0, 12).map(opponent => ({ text: opponent.displayName || 'Member', onClick: () => performSend('', null, { game: { type, opponentUid: opponent.uid, opponentName: opponent.displayName || 'Member' } }) })),
    { text: 'Cancel', color: 'red' }
  ] }).open();

  const openReactionSheet = message => {
    const buttons = EMOJI_CHOICES.map(emoji => ({
      text: `${emoji}  ${message.reactions?.[emoji]?.[currentUid] === true ? '(remove)' : ''}`,
      onClick: () => toggleReaction(currentChannelId, message.id, emoji, currentUid, message.reactions?.[emoji]?.[currentUid] === true).catch(() => {})
    }));
    buttons.push({ text: 'Cancel', color: 'red' });
    f7.actions.create({ buttons }).open();
  };

  const handleFilePick = async event => {
    const file = event.target.files?.[0];
    if (!file || !canSend || file.size > 100 * 1024 * 1024) return;
    setIsUploading(true);
    try {
      const result = await uploadFile(file);
      setAttachment({ url: result.url, name: result.name, size: result.size, type: file.type });
    } catch (error) {
      console.error(error);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleCreateChannel = async (name, type) => {
    if (!name || !name.trim() || !canManageChannels) return;
    try {
      await createChannel(communityId, name, type || 'text');
      const nextChannels = await getChannels(communityId);
      setChannels(nextChannels);
    } catch (error) {
      f7.dialog.alert(error?.message || 'Channel could not be created.');
    }
  };

  const promptCreateChannel = () => {
    f7.dialog.prompt('Channel name', 'Create channel', name => {
      if (!name || !name.trim()) return;
      f7.dialog.confirm('Create it as a voice channel?', 'Channel type',
        () => handleCreateChannel(name, 'voice'),
        () => handleCreateChannel(name, 'text'));
    });
  };

  const handleEditMessage = async (messageId, text) => {
    try {
      await editMessage(currentChannelId, messageId, text);
      setEditingMessageId(null);
    } catch (error) {
      f7.dialog.alert(error?.message || 'Message could not be edited.');
    }
  };

  const handleJoinVoice = async () => {
    if (!currentChannel || currentChannel.type !== 'voice') return;
    const participant = {
      channelId: currentChannel.id,
      uid: currentUid,
      displayName: currentUser.profile?.displayName || currentUser.displayName || 'User',
      avatarBase64: currentUser.profile?.avatarBase64 || ''
    };
    try {
      await joinVoiceChannel(currentChannel.id, currentUid, participant);
      startCall(`${communityId}-${currentChannel.id}`, 'voice', participant);
    } catch (error) {
      f7.dialog.alert(error?.message || 'Could not join the voice channel.');
    }
  };

  const handleMuteToggle = async () => {
    const next = !isMuted;
    setIsMuted(next);
    try {
      await setCommunityMuted(currentUid, communityId, next);
    } catch (error) {
      setIsMuted(!next);
      f7.dialog.alert(error?.message || 'Notification setting could not be saved.');
    }
  };

  const participantsFor = channel => {
    const roster = Object.values(voiceParticipants[channel?.id] || {}).filter(Boolean);
    const activeParticipant = activeCall?.type === 'voice' && activeCall.participant?.channelId === channel?.id ? activeCall.participant : null;
    if (activeParticipant && !roster.some(participant => participant.uid === activeParticipant.uid)) return [...roster, activeParticipant];
    return roster;
  };

  const showPinned = () => {
    const buttons = pinnedMessages.slice(0, 8).map(message => ({
      text: `${authorFor(message).displayName}: ${(message.text || 'Attachment').slice(0, 80)}`
    }));
    if (!pinnedMessages.length) buttons.push({ text: 'No pinned messages in this channel.', label: true });
    buttons.push({ text: 'Close', color: 'blue', close: true });
    f7.actions.create({ buttons }).open();
  };

  const openMemberSheet = () => {
    const buttons = activeMembers.slice(0, 8).map(member => ({
      text: `${member.displayName}${member.uid === community?.adminUid ? ' (Owner)' : ''}${presence[member.uid] ? ' • online' : ''}`
    }));
    if (activeMembers.length > 8) buttons.push({ text: `…and ${activeMembers.length - 8} more`, label: true });
    if (!activeMembers.length) buttons.push({ text: 'No members found.', label: true });
    buttons.push({ text: 'Close', color: 'blue', close: true });
    f7.actions.create({ buttons }).open();
  };

  if (!community) {
    return (
      <Page className={styles.page}>
        <div className={styles.centerLoader}><div className={styles.loader} /><p>Loading Blink...</p></div>
      </Page>
    );
  }

  const banExpiration = community.bannedUsers?.[currentUid];
  if (banExpiration === -1 || banExpiration > now) {
    return (
      <Page className={styles.page}>
        <div className={styles.centerLoader}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#ff5252' }}>gavel</span>
          <p>You are banned from this community.</p>
        </div>
      </Page>
    );
  }

  return (
    // pageContent={false}: F7's Page auto-wraps children in its own
    // .page-content, which would nest with ours and break the pinned composer.
    <Page className={styles.page} pageContent={false}>
      <Navbar backLink={false} large={false} className={styles.navbar}>
        <NavLeft>
          <MenuButton />
        </NavLeft>
        <NavTitle>
          <span className={styles.navChannelName}>{currentChannel?.type === 'voice' ? '' : '#'}{currentChannel?.name || 'Channel'}</span>
        </NavTitle>
        <NavRight>
          <Link onClick={openNotificationSheet} style={isMuted ? { color: '#4b8eff' } : undefined}><span className="material-symbols-outlined">notifications</span></Link>
          <Link onClick={() => setIsSearchOpen(previous => !previous)}><span className="material-symbols-outlined">search</span></Link>
          <Link onClick={showPinned}><span className="material-symbols-outlined">push_pin</span></Link>
          <Link onClick={openMemberSheet}><span className="material-symbols-outlined">group</span></Link>
          {canOpenSettings && <Link onClick={() => navigateTo(`/community-settings/${communityId}/`)}><span className="material-symbols-outlined">settings</span></Link>}
          {canManageChannels && <Link onClick={promptCreateChannel}><span className="material-symbols-outlined">add</span></Link>}
        </NavRight>
      </Navbar>

      {currentChannel?.type === 'voice' ? (
        <PageContent>
          <div className={styles.voiceWrap}>
            <span className="material-symbols-outlined" style={{ fontSize: 56, color: '#4b8eff' }}>graphic_eq</span>
            <h2>Voice channel</h2>
            <p>Join the room to talk with your community.</p>
            <div className={styles.voiceRoster}>
              {participantsFor(currentChannel).length
                ? participantsFor(currentChannel).map(participant => (
                  <div key={participant.uid} className={styles.voicePerson}>
                    <UserAvatar user={participant} size="2.75rem" />
                    <span>{participant.uid === currentUid ? `${participant.displayName} (You)` : participant.displayName}</span>
                  </div>
                ))
                : <span className={styles.voiceEmptyRoster}>No one is in the room yet.</span>}
            </div>
            <button type="button" className={styles.joinVoiceBtn} onClick={handleJoinVoice}>
              <span className="material-symbols-outlined">headset_mic</span> Join voice channel
            </button>
          </div>
        </PageContent>
      ) : (
        <>
          {/* Messages scroll inside page-content; the composer below is pinned
              to the page bottom (position absolute, see Channel.module.css). */}
          <PageContent className={styles.messageScroll}>
            {/* init={false}: framework7-react's Messages wrapper otherwise adds
                message-appear-from-bottom to EVERY child that lacks the
                message-appeared marker on every update - so a channel switch
                re-animates the whole history mid page-transition. With init
                off, only messages we explicitly mark (newly arrived ones, via
                animatedMessageIds) get the appear animation. */}
            <Messages className={styles.messages} init={false}>
              {messages.length >= messageLimit && (
                <button type="button" className={styles.loadMore} onClick={() => setMessageLimit(previous => previous + 25)}>Load older messages</button>
              )}
              {messages.map(message => {
                const author = authorFor(message);
                const isMe = author.uid === currentUid;
                const tail = message.id === messages[messages.length - 1]?.id;
                if (message.system) {
                  return (
                    <div key={message.id} className={styles.systemMessage}>
                      <span className="material-symbols-outlined">campaign</span>
                      <span>{message.system === 'join' ? `${message.name || 'Someone'} joined the community` : `${message.name || 'Someone'} left the community`}</span>
                      <small>{timeShort(message.timestamp)}</small>
                    </div>
                  );
                }
                const reactions = Object.entries(message.reactions || {})
                  .filter(([, uids]) => uids && typeof uids === 'object' && Object.keys(uids).length > 0)
                  .map(([emoji, uids]) => ({ emoji, uids: Object.keys(uids) }));
                const poll = message.poll ? { ...message.poll, options: Object.values(message.poll.options || {}) } : null;
                const myVote = poll ? poll.options.find(option => option.id && poll.votes?.[option.id]?.[currentUid])?.id || null : null;
                const pollTotal = poll ? [...new Set(poll.options.flatMap(option => Object.keys(poll.votes?.[option.id] || {})))].length : 0;
                return (
                  <Message
                    key={message.id}
                    id={`blink-msg-${message.id}`}
                    type={isMe ? 'sent' : 'received'}
                    className={animatedMessageIds.has(message.id) ? 'message-appear-from-bottom' : undefined}
                    first={message === messages[0]}
                    last={tail}
                    tail={tail}
                  >
                    <div slot="avatar"><UserAvatar user={author} size="2.25rem" /></div>
                    {!isMe && <div slot="name" style={primaryRoleForMember(community, author.uid)?.color ? { color: primaryRoleForMember(community, author.uid).color } : undefined}><RoleBadge role={primaryRoleForMember(community, author.uid)} />{author.displayName}</div>}
                    <div slot="header">{timeShort(message.timestamp)}</div>
                    <div slot="text">
                      {editingMessageId === message.id ? (
                        <form className={styles.editForm} onSubmit={async event => { event.preventDefault(); await handleEditMessage(message.id, editingText); }}>
                          <input value={editingText} onChange={event => setEditingText(event.target.value)} autoFocus />
                          <button type="submit">Save</button>
                        </form>
                      ) : (
                        <>
                          {message.replyTo && (
                            <button type="button" className={styles.replyQuote} onClick={() => jumpToMessage(message.replyTo.id)}>
                              <span className="material-symbols-outlined">format_quote</span>
                              <span className={styles.replyQuoteBody}>
                                <strong>{message.replyTo.authorName || 'User'}</strong>
                                <span>{message.replyTo.text || 'Attachment'}</span>
                              </span>
                            </button>
                          )}
                          {message.text && renderMessageText(message.text)}
                          {message.game && <GameMessage message={{ ...message, channelId: currentChannelId }} currentUid={currentUid} />}
                          {poll && (
                            <div className={styles.pollCard}>
                              <strong className={styles.pollQuestion}>{poll.question}</strong>
                              <div className={styles.pollOptions}>
                                {poll.options.map(option => {
                                  const optionVotes = option.id ? Object.keys(poll.votes?.[option.id] || {}) : [];
                                  const voted = optionVotes.includes(currentUid);
                                  const percentage = pollTotal ? Math.round((optionVotes.length / pollTotal) * 100) : 0;
                                  return (
                                    <button key={option.id} type="button" className={`${styles.pollOption} ${voted ? styles.pollOptionVoted : ''}`} onClick={() => votePoll(currentChannelId, message.id, option.id, currentUid, myVote).catch(() => {})}>
                                      <span className={styles.pollOptionText}>{option.text}</span>
                                      <span className={styles.pollOptionCount}>{optionVotes.length} · {percentage}%</span>
                                      <span className={styles.pollBar} style={{ width: `${percentage}%` }} />
                                    </button>
                                  );
                                })}
                              </div>
                              <small className={styles.pollMeta}>{pollTotal} {pollTotal === 1 ? 'vote' : 'votes'}</small>
                            </div>
                          )}
                          {(message.attachment || message.fileUrl) && (
                            <a className={styles.fileCard} href={message.attachment?.url || message.fileUrl} target="_blank" rel="noreferrer">
                              <span className="material-symbols-outlined">description</span>
                              <span className={styles.fileCardName}>{message.attachment?.name || message.fileName || 'Attachment'}</span>
                              <span className="material-symbols-outlined">download</span>
                            </a>
                          )}
                          <div className={styles.messageActions}>
                            <button type="button" onClick={() => setReplyingTo({ id: message.id, authorUid: author.uid, authorName: author.displayName, text: (message.text || '').slice(0, 200) })}><span className="material-symbols-outlined">reply</span></button>
                            <button type="button" onClick={() => openReactionSheet(message)}><span className="material-symbols-outlined">add_reaction</span></button>
                            {isMe && <button type="button" onClick={() => { setEditingMessageId(message.id); setEditingText(message.text || ''); }}><span className="material-symbols-outlined">edit</span></button>}
                            {(isMe || canManageMessages) && <button type="button" onClick={async () => { try { await deleteMessage(currentChannelId, message.id); } catch (err) { f7.dialog.alert('Failed to delete message: ' + (err?.message || 'Permission denied')); } }}><span className="material-symbols-outlined">delete</span></button>}
                            {canManageMessages && <button type="button" onClick={() => togglePinMessage(currentChannelId, message.id, message.isPinned).catch(error => f7.dialog.alert(error?.message || 'Pin failed'))}><span className="material-symbols-outlined">push_pin</span></button>}
                          </div>
                          {reactions.length > 0 && (
                            <div className={styles.reactionRow}>
                              {reactions.map(({ emoji, uids }) => (
                                <button key={emoji} type="button" className={`${styles.reactionChip} ${uids.includes(currentUid) ? styles.reactionChipActive : ''}`} onClick={() => toggleReaction(currentChannelId, message.id, emoji, currentUid, uids.includes(currentUid)).catch(() => {})}>
                                  <span>{emoji}</span><span>{uids.length}</span>
                                </button>
                              ))}
                              <button type="button" className={styles.reactionChip} onClick={() => openReactionSheet(message)}><span className="material-symbols-outlined">add</span></button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </Message>
                );
              })}
              <div ref={messagesEndRef} />
            </Messages>
          </PageContent>

          <div className={styles.composerWrap}>
            {isSearchOpen && (
              <div className={styles.searchOverlay}>
                <div className={styles.searchBarRow}>
                  <input className={styles.searchInput} value={searchQuery} onChange={event => handleSearchChange(event.target.value)} placeholder="Search messages" autoFocus />
                  <button type="button" className={styles.searchClose} onClick={() => { setIsSearchOpen(false); setSearchQuery(''); setSearchResults([]); }}><span className="material-symbols-outlined">close</span></button>
                </div>
                {isSearchFetching && <p className={styles.searchHint}>Searching more messages…</p>}
                <div className={styles.searchResults}>
                  {searchResults.length ? searchResults.map(result => {
                    const resultAuthor = authorFor(result);
                    return (
                      <button key={result.id} type="button" className={styles.searchResult} onClick={() => jumpToMessage(result.id)}>
                        <UserAvatar user={resultAuthor} size="1.6rem" />
                        <span className={styles.searchResultBody}>
                          <span className={styles.searchResultMeta}><strong>{resultAuthor.displayName}</strong><small>{timeShort(result.timestamp)}</small></span>
                          <span className={styles.searchResultSnippet}>{result.text}</span>
                        </span>
                      </button>
                    );
                  }) : searchQuery.trim() ? <p className={styles.searchHint}>No matches in this channel.</p> : <p className={styles.searchHint}>Search messages in #{currentChannel?.name || 'this channel'}.</p>}
                </div>
              </div>
            )}
            {mentionOptions.length > 0 && (
              <div className={styles.mentionMenu}>
                {mentionOptions.map(option => (
                  <button type="button" key={option.label} onMouseDown={event => event.preventDefault()} onClick={() => insertMention(option)}>
                    {option.avatar ? <UserAvatar user={option.avatar} size="1.4rem" /> : <span className="material-symbols-outlined">{option.type === 'channel' ? 'tag' : option.type === 'everyone' ? 'campaign' : 'badge'}</span>}
                    <span style={option.color ? { color: option.color } : undefined}>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
            {(() => {
              const names = Object.values(typingUsers).map(entry => entry?.name).filter(Boolean);
              if (!names.length) return null;
              const label = names.length === 1 ? `${names[0]} is typing…` : names.length === 2 ? `${names[0]} and ${names[1]} are typing…` : names.length === 3 ? `${names[0]}, ${names[1]}, and ${names[2]} are typing…` : 'Several people are typing…';
              return <div className={styles.typingIndicator}><span className={styles.typingDots}><i /><i /><i /></span><span>{label}</span></div>;
            })()}
            {sendError && <p className={styles.sendError} role="alert">{sendError}</p>}
            {replyingTo && (
              <div className={styles.replyBar}>
                <span className="material-symbols-outlined">reply</span>
                <span className={styles.replyBarBody}><strong>Replying to {replyingTo.authorName}</strong><span>{replyingTo.text || 'Attachment'}</span></span>
                <button type="button" onClick={() => setReplyingTo(null)}><span className="material-symbols-outlined">close</span></button>
              </div>
            )}
            {attachment && (
              <div className={styles.pendingAttachment}>
                <span className="material-symbols-outlined">description</span>
                <span className={styles.pendingName}>{attachment.name}</span>
                <button type="button" onClick={() => setAttachment(null)}><span className="material-symbols-outlined">close</span></button>
              </div>
            )}
            <div className={styles.composer}>
              {isComposerMenuOpen && <div className={styles.composerMenu}><label className={styles.composerMenuItem}><span className="material-symbols-outlined">{isUploading ? 'sync' : 'attach_file'}</span>Attach file<input type="file" hidden onChange={event => { setIsComposerMenuOpen(false); handleFilePick(event); }} disabled={isUploading || !canSend} /></label><button type="button" className={styles.composerMenuItem} onClick={() => { setIsComposerMenuOpen(false); startPollCreation(); }}><span className="material-symbols-outlined">poll</span>Create Poll</button><button type="button" className={styles.composerMenuItem} onClick={startGame}><span className="material-symbols-outlined">sports_esports</span>Play a Game</button></div>}
              <button type="button" className={styles.plusBtn} onClick={() => setIsComposerMenuOpen(open => !open)} disabled={!canSend} title="More composer actions"><span className="material-symbols-outlined">{isComposerMenuOpen ? 'close' : 'add'}</span></button>
              <input
                className={styles.composerInput}
                value={newMessage}
                disabled={!canSend || isUploading}
                placeholder={slowModeRemaining > 0 ? `Slow mode: ${Math.ceil(slowModeRemaining / 1000)}s left` : canSend ? `Message #${currentChannel?.name || 'channel'}` : isTimedOut ? 'You are temporarily timed out' : 'Messages are restricted'}
                onChange={event => handleComposerChange(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); handleSend(); } }}
              />
              <button type="button" className={styles.sendBtn} onClick={handleSend} disabled={!canSend || (!newMessage.trim() && !attachment)}>
                <span className="material-symbols-outlined">send</span>
              </button>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
