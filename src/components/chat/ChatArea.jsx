import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import {
  createChannel,
  deleteMessage,
  editMessage,
  getCachedMessages,
  getChannels,
  getCommunity,
  sendMessage,
  subscribeToCommunityMembers,
  subscribeToMessages,
  subscribeToCommunityPresence,
  subscribeToVoiceParticipants,
  joinVoiceChannel,
  reorderChannels,
  togglePinCommunity,
  togglePinMessage,
  updateLastRead,
  setCommunityMuted,
  leaveCommunity
} from '../../services/db';
import { uploadFile } from '../../services/upload';
import { mentionsUser } from '../../services/utils';
import { useCall } from '../../contexts/CallContext';
import UserAvatar from '../common/UserAvatar';
import ProfilePopover from '../common/ProfilePopover';
import Modal from '../common/Modal';
import CommunityBannedScreen from '../common/CommunityBannedScreen';
import styles from './ChatArea.module.css';
import { getMemberPermissions } from '../../services/permissions';
import AppErrorScreen from '../common/AppErrorScreen';

class ChatAreaErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return <AppErrorScreen error={this.state.error} onRetry={() => window.location.reload()} />;
  }
}

function isWordCharacter(character) {
  return Boolean(character && /[A-Za-z0-9_]/.test(character));
}

// Scans message text and returns every @user / @everyone / @role / #channel mention
// as a range, preferring the longest display name when names overlap (e.g. "Rob" vs "Rob K").
function collectMentionRanges(text, members, channels, roles) {
  if (!text) return [];
  const lowerText = text.toLowerCase();
  const ranges = [];

  const addTriggerMatches = (trigger, candidates) => {
    const ordered = [...candidates].sort((first, second) => second.label.length - first.label.length);
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== trigger || isWordCharacter(text[index - 1])) continue;
      for (const candidate of ordered) {
        const name = candidate.label;
        if (lowerText.slice(index + 1, index + 1 + name.length) !== name) continue;
        if (isWordCharacter(text[index + 1 + name.length])) continue;
        ranges.push({ start: index, end: index + 1 + name.length, ...candidate });
        break;
      }
    }
  };

  addTriggerMatches('@', [
    ...members.filter(member => member?.displayName).map(member => ({ kind: 'user', label: member.displayName.trim().toLowerCase(), user: member })),
    { kind: 'everyone', label: 'everyone' },
    ...Object.values(roles || {}).filter(role => role?.name).map(role => ({ kind: 'role', label: role.name.trim().toLowerCase(), role }))
  ]);
  addTriggerMatches('#', channels
    .filter(channel => channel?.name && channel.type !== 'voice')
    .map(channel => ({ kind: 'channel', label: channel.name.trim().toLowerCase(), channel })));

  ranges.sort((first, second) => first.start - second.start || (second.end - first.end));
  const nonOverlapping = [];
  let cursor = -1;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    nonOverlapping.push(range);
    cursor = range.end;
  }
  return nonOverlapping;
}

// Module-level metadata caches let remounts restore community/channel data
// instantly instead of flashing a loading screen while Firestore responds.
const communityCache = new Map();
const channelsCache = new Map();

function ChatAreaContent() {
  const { communityId, channelId } = useParams();
  const { currentUser } = useAuth();
  const { notify } = useNotifications();
  const { activeCall, startCall } = useCall();
  const navigate = useNavigate();
  const [community, setCommunity] = useState(() => communityCache.get(communityId) || null);
  const [channels, setChannels] = useState(() => channelsCache.get(communityId) || []);
  const [members, setMembers] = useState([]);
  const [presence, setPresence] = useState({});
  const [voiceParticipants, setVoiceParticipants] = useState({});
  const [messages, setMessages] = useState([]);
  const [animatedMessageIds, setAnimatedMessageIds] = useState(() => new Set());
  const [messageLimit, setMessageLimit] = useState(25);
  const [newMessage, setNewMessage] = useState('');
  const [authorSearch, setAuthorSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState('text');
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [isMemberListOpen, setIsMemberListOpen] = useState(false);
  const [isPinnedMessagesOpen, setIsPinnedMessagesOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth > 1024);
  const notificationPreferences = currentUser?.profile?.notificationPreferences || {};
  const communityMuted = Boolean(notificationPreferences.communityMuted?.[communityId]);
  const channelNotificationMode = notificationPreferences.channelModes?.[channelId] || 'mentions';
  const [isMuted, setIsMuted] = useState(communityMuted);
  const notificationMode = channelNotificationMode;
  const [isUploading, setIsUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [sendError, setSendError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [draggedChannelId, setDraggedChannelId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const dragGhostRef = useRef(null);
  const messagesListRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messageInputRef = useRef(null);
  const composerTextLayerRef = useRef(null);
  const initialLoad = useRef(true);
  const previousMessageCount = useRef(0);
  const seenMessageIds = useRef(new Set());
  const mountTime = useRef(null);
  const hasMarkedChannelRead = useRef(false);
  const liveReadThrottleRef = useRef(0);
  const hasRenderedMessages = useRef(false);
  const latestMessageTimestampRef = useRef(0);
  // Set while this client performs its own kick/ban cleanup, so the effect does
  // not double-fire when the community document updates mid-navigation.
  const isExecutingKick = useRef(false);

  const currentChannel = channels.find(channel => channel.id === channelId) || channels[0];
  const currentUid = currentUser?.uid;
  // Members flagged in kickedUsers have been removed but may still appear in
  // the Firestore subscription until their own client cleans up.
  const activeMembers = members.filter(member => !community?.kickedUsers?.[member.uid]);

  // Kicked-user cleanup: when a moderator records the uid in kickedUsers, the
  // removed member's own client removes the community from their profile and
  // navigates away. Without this, kicked users keep full chat access until a
  // manual reload. Banned users are deliberately excluded: they must stay
  // members so the ban screen below keeps blocking them - auto-leaving would
  // let them rejoin via invite and bypass the ban.
  const kickedAt = community?.kickedUsers?.[currentUid];

  useEffect(() => {
    if (!kickedAt || !currentUid || !communityId) return;
    if (isExecutingKick.current) return;
    isExecutingKick.current = true;
    leaveCommunity(currentUid, communityId).catch(() => {})
      .finally(() => navigate('/communities', { replace: true }));
  }, [kickedAt, currentUid, communityId, navigate]);

  const markCurrentChannelRead = useCallback(() => {
    if (!channelId || !currentUid || document.visibilityState !== 'visible') return;
    const nowMs = Date.now();
    if (nowMs - liveReadThrottleRef.current < 750) return;
    liveReadThrottleRef.current = nowMs;
    updateLastRead(currentUid, channelId, latestMessageTimestampRef.current || undefined).catch(() => {});
  }, [channelId, currentUid]);
  const permissions = getMemberPermissions(community, currentUser?.uid);
  const canManageChannels = permissions.includes('manage_channels');
  const canManageMessages = permissions.includes('manage_messages');
  const canOpenSettings = permissions.some(permission => ['manage_channels', 'manage_roles', 'manage_members', 'manage_community', 'manage_invites'].includes(permission));
  const currentUserDisplayName = currentUser?.profile?.displayName?.trim().toLowerCase();
  const assignedRoleValue = community?.memberRoles?.[currentUser?.uid];
  const roleIds = Array.isArray(assignedRoleValue) ? assignedRoleValue : assignedRoleValue ? [assignedRoleValue] : [];

  const timeoutExpires = community?.timedOutUsers?.[currentUser?.uid] || 0;
  const isTimedOut = timeoutExpires > now;
  const canSend = currentChannel?.type !== 'voice' && !isTimedOut && !currentChannel?.isLocked && (
    !currentChannel?.allowedRoles?.length || currentChannel.allowedRoles.some(allowedRole => roleIds.includes(allowedRole)) || canManageChannels
  );

  useEffect(() => {
    const handleResize = () => setIsSidebarOpen(window.innerWidth > 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!selectedProfile) return undefined;
    const handleDocumentClick = event => {
      if (event.target.closest?.('[data-profile-popover]') || event.target.closest?.('[data-profile-trigger]')) return;
      setSelectedProfile(null);
    };
    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, [selectedProfile]);

  // Loads community/channel metadata. Keeps the previously loaded community on
  // screen while the next one loads so switching does not flash a loading screen.
  useEffect(() => {
    let cancelled = false;
    async function loadCommunity() {
      if (!communityId) return;
      setCommunity(previousCommunity => (previousCommunity?.id === communityId ? previousCommunity : null));
      const [nextCommunity, nextChannels] = await Promise.all([
        getCommunity(communityId).catch(() => null),
        getChannels(communityId).catch(() => [])
      ]);
      if (cancelled) return;
      setCommunity(nextCommunity);
      setChannels(nextChannels);
      if (nextCommunity) communityCache.set(communityId, nextCommunity);
      if (nextChannels.length) channelsCache.set(communityId, nextChannels);
      if (!channelId && nextChannels[0]) navigate(`/channels/${communityId}/${nextChannels[0].id}`, { replace: true });
    }
    loadCommunity();
    initialLoad.current = true;
    hasRenderedMessages.current = false;
    return () => { cancelled = true; };
  }, [communityId, channelId, navigate, currentUser?.profile?.notificationPreferences]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!communityId) return undefined;
    return subscribeToCommunityMembers(communityId, setMembers);
  }, [communityId]);

  useEffect(() => {
    return subscribeToCommunityPresence(nextPresence => setPresence(nextPresence));
  }, []);

  useEffect(() => {
    return subscribeToVoiceParticipants(nextParticipants => setVoiceParticipants(nextParticipants));
  }, []);

  // Channel switch: reset per-channel state so the previous channel's content
  // never bleeds into the new one. Render-time adjustment (not an effect) so
  // React applies the reset before painting the new channel.
  const [loadedChannelId, setLoadedChannelId] = useState(channelId);
  if (loadedChannelId !== channelId) {
    setLoadedChannelId(channelId);
    setMessages([]);
    setPinnedMessages([]);
    setAnimatedMessageIds(new Set());
    setEditingMessageId(null);
    setMentionQuery(null);
  }
  useEffect(() => {
    initialLoad.current = true;
    const cachedMessages = channelId ? getCachedMessages(channelId) : [];
    seenMessageIds.current = new Set(cachedMessages.map(message => message.id));
    hasMarkedChannelRead.current = false;
    mountTime.current = Date.now();
    latestMessageTimestampRef.current = cachedMessages.reduce((latest, message) => Math.max(latest, Number(message.timestamp) || 0), 0);
  }, [channelId]);

  useEffect(() => {
    if (!channelId || !currentUser?.uid) return undefined;
    return subscribeToMessages(channelId, nextMessages => {
      if (initialLoad.current) {
        nextMessages.forEach(message => seenMessageIds.current.add(message.id));
        latestMessageTimestampRef.current = nextMessages.reduce((latest, message) => Math.max(latest, Number(message.timestamp) || 0), latestMessageTimestampRef.current);
        setMessages(nextMessages);
        setPinnedMessages(nextMessages.filter(message => message?.isPinned));
        previousMessageCount.current = nextMessages.length;
        if (!hasMarkedChannelRead.current) {
          hasMarkedChannelRead.current = true;
          updateLastRead(currentUser.uid, channelId, latestMessageTimestampRef.current || undefined).catch(() => {});
        }
        initialLoad.current = false;
        return;
      }

      const newlyArrived = nextMessages.filter(message => {
        if (seenMessageIds.current.has(message.id)) return false;
        seenMessageIds.current.add(message.id);
        return true;
      });

      const newlyArrivedIds = newlyArrived.map(message => message.id);
      latestMessageTimestampRef.current = nextMessages.reduce((latest, message) => Math.max(latest, Number(message.timestamp) || 0), latestMessageTimestampRef.current);
      if (newlyArrivedIds.length) {
        setAnimatedMessageIds(previous => new Set([...previous, ...newlyArrivedIds]));
        window.setTimeout(() => setAnimatedMessageIds(previous => {
          const next = new Set(previous);
          newlyArrivedIds.forEach(id => next.delete(id));
          return next;
        }), 420);
      }

      const newIncomingMessage = newlyArrived.find(message => message.authorUid !== currentUser.uid);

      if (newIncomingMessage && !isMuted && !communityMuted) {
        const isFresh = !newIncomingMessage.timestamp || newIncomingMessage.timestamp >= (mountTime.current - 5000);
        if (isFresh) {
          const displayName = currentUserDisplayName;
          const mentionsCurrentUser = mentionsUser(newIncomingMessage.text, displayName);
          const shouldNotify = notificationMode === 'all' || (notificationMode === 'mentions' && mentionsCurrentUser);
          if (shouldNotify && document.visibilityState === 'visible' && document.hasFocus()) {
            notify(`#${currentChannel?.name || 'chat'}`, newIncomingMessage.text || 'New attachment');
          }
        }
      }

      // While the channel is on screen, mark incoming messages as read so unread badges clear.
      if (newIncomingMessage && document.visibilityState === 'visible' && document.hasFocus()) {
        const nowMs = Date.now();
        if (nowMs - liveReadThrottleRef.current >= 10000) {
          liveReadThrottleRef.current = nowMs;
          updateLastRead(currentUser.uid, channelId, latestMessageTimestampRef.current || undefined).catch(() => {});
        }
      }

      setMessages(nextMessages);
      setPinnedMessages(nextMessages.filter(message => message?.isPinned));
      previousMessageCount.current = nextMessages.length;
      if (!hasMarkedChannelRead.current) {
        hasMarkedChannelRead.current = true;
        updateLastRead(currentUser.uid, channelId, latestMessageTimestampRef.current || undefined).catch(() => {});
      }
    }, messageLimit);
  }, [channelId, currentUser?.uid, currentUserDisplayName, currentChannel?.name, communityMuted, isMuted, messageLimit, notificationMode, notify]);

  useEffect(() => {
    if (!channelId || !currentUser?.uid) return undefined;
    const markReadOnRefocus = () => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
      const nowMs = Date.now();
      if (nowMs - liveReadThrottleRef.current < 10000) return;
      liveReadThrottleRef.current = nowMs;
      updateLastRead(currentUser.uid, channelId, latestMessageTimestampRef.current || undefined).catch(() => {});
    };
    window.addEventListener('focus', markReadOnRefocus);
    document.addEventListener('visibilitychange', markReadOnRefocus);
    return () => {
      window.removeEventListener('focus', markReadOnRefocus);
      document.removeEventListener('visibilitychange', markReadOnRefocus);
    };
  }, [channelId, currentUser?.uid]);

  useEffect(() => {
    if (!channelId || !currentUser?.uid) return undefined;
    const handleInteraction = event => {
      if (event.type === 'keydown' && event.isComposing) return;
      markCurrentChannelRead();
    };
    const interactionEvents = ['pointerdown', 'touchstart', 'keydown', 'click'];
    interactionEvents.forEach(eventName => document.addEventListener(eventName, handleInteraction, true));
    return () => interactionEvents.forEach(eventName => document.removeEventListener(eventName, handleInteraction, true));
  }, [channelId, currentUser?.uid, markCurrentChannelRead]);

  useLayoutEffect(() => {
    if (!messages.length) return;
    const messageList = messagesListRef.current;
    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
    hasRenderedMessages.current = true;
  }, [messages]);

  // '@' suggests people (plus @everyone and role mentions); '#' suggests channels only.
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

  const insertMention = value => {
    const input = messageInputRef.current;
    const cursor = input?.selectionStart ?? newMessage.length;
    const before = newMessage.slice(0, cursor);
    const after = newMessage.slice(cursor);
    const match = before.match(/(?:^|\s)([@#])[^\s@#]*$/);
    const start = match ? match.index + (match[0].startsWith(' ') ? 1 : 0) : before.length;
    const nextCursor = start + value.length + 1;
    setNewMessage(`${before.slice(0, start)}${value} ${after}`);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      input?.focus({ preventScroll: true });
      input?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleSendMessage = async event => {
    event.preventDefault();
    if (!canSend || (!newMessage.trim() && !pendingAttachment) || !channelId) return;
    setSendError('');
    try {
      await sendMessage(channelId, newMessage, currentUser.uid, pendingAttachment || undefined);
      setNewMessage('');
      setPendingAttachment(null);
      setMentionQuery(null);
    } catch (error) {
      setSendError(error?.message || 'Message could not be sent. Please try again.');
    }
  };

  const handleFileUpload = async event => {
    const file = event.target.files?.[0];
    if (!file || !canSend || file.size > 100 * 1024 * 1024) return;
    setIsUploading(true);
    try {
      const result = await uploadFile(file);
      setPendingAttachment({ url: result.url, name: result.name, size: result.size, type: file.type });
    } catch (error) {
      console.error(error);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleCreateChannel = async event => {
    event.preventDefault();
    if (!newChannelName.trim()) return;
    if (!canManageChannels) return;
    try {
      await createChannel(communityId, newChannelName, newChannelType);
      const nextChannels = await getChannels(communityId);
      setChannels(nextChannels);
      if (nextChannels.length) channelsCache.set(communityId, nextChannels);
      setNewChannelName('');
      setNewChannelType('text');
      setIsCreateChannelOpen(false);
    } catch (error) {
      setSendError(error?.message || 'Channel could not be created.');
    }
  };

  const handleChannelDragStart = (event, channelId) => {
    if (!canManageChannels) return;
    setDraggedChannelId(channelId);
    setDropTarget(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', channelId);
    const ghost = document.createElement('div');
    ghost.textContent = channels.find(channel => channel.id === channelId)?.name || 'Channel';
    ghost.style.cssText = 'position:fixed;top:-1000px;left:-1000px;padding:8px 14px;border-radius:8px;background:#2a2a2c;color:#e4e2e4;font:600 13px Manrope,sans-serif;border:1px solid #414755;';
    document.body.appendChild(ghost);
    dragGhostRef.current = ghost;
    event.dataTransfer.setDragImage(ghost, 14, 14);
  };

  const handleChannelDragOver = (event, channelId) => {
    if (!canManageChannels || !draggedChannelId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    setDropTarget(previous => previous && previous.id === channelId && previous.before === before ? previous : { id: channelId, before });
  };

  const handleChannelDrop = async event => {
    event.preventDefault();
    if (!canManageChannels || !draggedChannelId || !dropTarget) return;
    const sourceIndex = channels.findIndex(channel => channel.id === draggedChannelId);
    if (sourceIndex < 0) { setDraggedChannelId(null); setDropTarget(null); return; }
    const reorderedChannels = [...channels];
    const [movedChannel] = reorderedChannels.splice(sourceIndex, 1);
    let insertAt = reorderedChannels.findIndex(channel => channel.id === dropTarget.id);
    if (insertAt < 0) { setDraggedChannelId(null); setDropTarget(null); return; }
    if (!dropTarget.before) insertAt += 1;
    reorderedChannels.splice(insertAt, 0, movedChannel);
    setChannels(reorderedChannels);
    setDraggedChannelId(null);
    setDropTarget(null);
    try {
      await reorderChannels(communityId, reorderedChannels.map(channel => channel.id));
    } catch (error) {
      setChannels(channels);
      console.error(error);
    }
  };

  const handleChannelDragEnd = () => {
    setDraggedChannelId(null);
    setDropTarget(null);
    if (dragGhostRef.current) {
      dragGhostRef.current.remove();
      dragGhostRef.current = null;
    }
  };

  const participantsFor = channel => {
    const roster = Object.values(voiceParticipants[channel?.id] || {}).filter(Boolean);
    const activeParticipant = activeCall?.type === 'voice' && activeCall.participant?.channelId === channel?.id
      ? activeCall.participant
      : null;
    if (activeParticipant && !roster.some(participant => participant.uid === activeParticipant.uid)) {
      return [...roster, activeParticipant];
    }
    return roster;
  };

  const handleJoinVoice = async () => {
    if (!currentChannel || currentChannel.type !== 'voice') return;
    const participant = {
      channelId: currentChannel.id,
      uid: currentUser.uid,
      displayName: currentUser.profile?.displayName || currentUser.displayName || 'User',
      avatarBase64: currentUser.profile?.avatarBase64 || ''
    };
    try {
      await joinVoiceChannel(currentChannel.id, currentUser.uid, participant);
      startCall(`${communityId}-${currentChannel.id}`, 'voice', participant);
    } catch (error) {
      setSendError(error?.message || 'Could not join the voice channel.');
    }
  };

  const handleMuteToggle = async () => {
    const next = !isMuted;
    setIsMuted(next);
    try {
      await setCommunityMuted(currentUser.uid, communityId, next);
    } catch (error) {
      setIsMuted(!next);
      setSendError(error?.message || 'Notification setting could not be saved.');
    }
  };

  const handleEditMessage = async (messageId, text) => {
    try {
      await editMessage(channelId, messageId, text);
      setEditingMessageId(null);
    } catch (error) {
      setSendError(error?.message || 'Message could not be edited.');
    }
  };

  const handlePinMessage = async (messageId, isPinned) => {
    try {
      await togglePinMessage(channelId, messageId, isPinned);
    } catch (error) {
      setSendError(error?.message || 'Message pin could not be updated.');
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/join/${communityId}`;
    try {
      if (navigator.share) await navigator.share({ title: community.name, text: `Join ${community.name} on Blink`, url });
      else {
        await navigator.clipboard.writeText(url);
        window.alert('Community link copied to clipboard.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') console.error(error);
    }
  };

  const authorFor = message => activeMembers.find(member => member.uid === message.authorUid) || {
    uid: message.authorUid,
    displayName: message.authorName || 'User',
    avatarBase64: message.authorAvatar
  };
  const visibleMessages = messages.filter(message => {
    if (!authorSearch.trim()) return true;
    return authorFor(message).displayName?.toLowerCase().includes(authorSearch.trim().toLowerCase());
  });

  const renderMessageText = (text, messageId, plain = false) => {
    if (!text) return null;
    const ranges = collectMentionRanges(text, members, channels, community?.roles || {});
    if (!ranges.length) return text;
    const nodes = [];
    let cursor = 0;
    ranges.forEach((range, rangeIndex) => {
      if (range.start > cursor) nodes.push(text.slice(cursor, range.start));
      const label = text.slice(range.start, range.end);
      const key = `${messageId}:mention:${rangeIndex}`;
      if (plain) {
        nodes.push(<span key={key} className={styles.composerMention}>{label}</span>);
        cursor = range.end;
        return;
      }
      if (range.kind === 'user' && range.user?.uid) {
        nodes.push(
          <button key={key} type="button" data-profile-trigger className={styles.userMention} title={`Open ${range.user.displayName || 'user'} profile`} onClick={() => messageId === 'draft' ? navigate(`/profile/${range.user.uid}`) : setSelectedProfile(previous => previous?.messageId === messageId && previous?.user?.uid === range.user.uid ? null : { messageId, user: range.user })}>{label}</button>
        );
      } else if (range.kind === 'channel' && range.channel?.id) {
        nodes.push(
          <Link key={key} to={`/channels/${communityId}/${range.channel.id}`} className={styles.channelMention} onClick={() => window.innerWidth <= 1024 && setIsSidebarOpen(false)}>{label}</Link>
        );
      } else if (range.kind === 'everyone') {
        nodes.push(<span key={key} className={styles.everyoneMention}>{label}</span>);
      } else if (range.kind === 'role' && range.role) {
        nodes.push(<span key={key} className={styles.roleMention} style={range.role.color ? { color: range.role.color } : undefined}>{label}</span>);
      } else {
        nodes.push(label);
      }
      cursor = range.end;
    });
    if (cursor < text.length) nodes.push(text.slice(cursor));
    return nodes;
  };
  const hasDraftMention = Boolean(newMessage && collectMentionRanges(newMessage, members, channels, community?.roles || {}).length);

  if (!community) return <div className={styles.loadingContainer}><div className={styles.loader} /><p>Loading Blink...</p></div>;
  const banExpiration = community.bannedUsers?.[currentUser?.uid];
  if (banExpiration === -1 || banExpiration > now) return <CommunityBannedScreen expirationTime={banExpiration} />;

  return (
    <div className={styles.chatLayout}>
      {isSidebarOpen && window.innerWidth <= 1024 && <div className={styles.sidebarBackdrop} onClick={() => setIsSidebarOpen(false)} />}
      <aside className={`${styles.innerSidebar} ${!isSidebarOpen ? styles.closed : ''}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.communityHeading}><h2>{community.name}</h2><p>{community.description || 'No description'}</p></div>
          <div className={styles.communityActions}><button className={styles.pinBtn} onClick={handleShare} title="Share community"><span className="material-symbols-outlined">share</span></button><button className={`${styles.pinBtn} ${currentUser.profile?.pinnedCommunities?.includes(communityId) ? styles.pinned : ''}`} onClick={() => togglePinCommunity(currentUser.uid, communityId)} title="Pin community"><span className="material-symbols-outlined">push_pin</span></button></div>
        </div>
        <div className={styles.channelList}>
          <div className={styles.sectionHeader}><span className="text-label-sm text-tertiary">CHANNELS</span>{canManageChannels && <button className={styles.addChannelBtn} onClick={() => setIsCreateChannelOpen(true)} title="Create channel"><span className="material-symbols-outlined">add</span></button>}</div>
          {channels.map(channel => <div key={channel.id} className={`${styles.channelRow} ${draggedChannelId === channel.id ? styles.dragging : ''} ${dropTarget?.id === channel.id ? (dropTarget.before ? styles.dropBefore : styles.dropAfter) : ''}`} draggable={canManageChannels} onDragStart={event => handleChannelDragStart(event, channel.id)} onDragOver={event => handleChannelDragOver(event, channel.id)} onDrop={handleChannelDrop} onDragEnd={handleChannelDragEnd} onDragLeave={() => setDropTarget(previous => previous?.id === channel.id ? null : previous)}><div className={styles.channelEntry}><Link to={`/channels/${communityId}/${channel.id}`} onClick={() => window.innerWidth <= 1024 && setIsSidebarOpen(false)} className={`${styles.channelItem} ${channel.id === currentChannel?.id ? styles.active : ''}`}>{canManageChannels && <span className="material-symbols-outlined channelDragHandle" aria-hidden="true">drag_indicator</span>}<span className="material-symbols-outlined">{channel.type === 'voice' ? 'graphic_eq' : 'tag'}</span><span>{channel.name}</span></Link></div>{channel.type === 'voice' && <div className={styles.voiceRoster}>{participantsFor(channel).map(participant => <div className={styles.voiceParticipant} key={participant.uid}><UserAvatar user={participant} size="1.5rem" /><span>{participant.uid === currentUser.uid ? `${participant.displayName} (You)` : participant.displayName}</span></div>)}</div>}</div>)}
        </div>
        <div className={styles.userStatus}><Link to="/profile" className={styles.userInfo}><div className={styles.avatarWrapper}><UserAvatar user={currentUser.profile} size="2.5rem" /><span className={`${styles.statusDot} ${styles.online}`} /></div><div className={styles.userDetails}><strong>{currentUser.profile?.displayName || 'User'}</strong><span>{currentUser.profile?.status || 'Online'}</span></div></Link></div>
      </aside>

      <section className={styles.chatCanvas} onPointerDown={markCurrentChannelRead} onKeyDown={markCurrentChannelRead}>
        <header className={styles.chatHeader}>
          <div className={styles.headerTitle}><button className={styles.menuToggle} onClick={() => setIsSidebarOpen(previous => !previous)} title="Open channels"><span className="material-symbols-outlined">menu</span></button><span className="material-symbols-outlined text-tertiary">{currentChannel?.type === 'voice' ? 'graphic_eq' : 'tag'}</span><h1>{currentChannel?.name || 'Channel'}</h1></div>
          <div className={styles.headerActions}>
            <button className={`${styles.iconBtn} ${isMuted ? styles.active : ''}`} onClick={handleMuteToggle} title={isMuted ? 'Unmute community' : 'Mute community'}><span className="material-symbols-outlined">{isMuted ? 'notifications_off' : 'notifications'}</span></button>
            <button className={`${styles.iconBtn} ${isSearchOpen ? styles.active : ''}`} onClick={() => setIsSearchOpen(previous => !previous)} title="Search messages"><span className="material-symbols-outlined">search</span></button>
            {isSearchOpen && <input className={styles.headerSearch} value={authorSearch} onChange={event => setAuthorSearch(event.target.value)} placeholder="Search by author" aria-label="Search messages by author" />}
            <button className={`${styles.iconBtn} ${isPinnedMessagesOpen ? styles.active : ''}`} onClick={() => setIsPinnedMessagesOpen(true)} title="Pinned messages"><span className="material-symbols-outlined">push_pin</span></button>
            <button className={`${styles.iconBtn} ${isMemberListOpen ? styles.active : ''}`} onClick={() => setIsMemberListOpen(previous => !previous)} title="Members"><span className="material-symbols-outlined">group</span></button>
            {canOpenSettings && <Link to={`/community-settings/${communityId}`} className={styles.iconBtn} title="Community settings"><span className="material-symbols-outlined">settings</span></Link>}
          </div>
        </header>

        {currentChannel?.type === 'voice' ? <><div className={styles.voiceEmpty}>{activeCall?.roomId !== `${communityId}-${currentChannel.id}` && <div className={styles.voicePanel}><div className={styles.voicePanelContent}><span className="material-symbols-outlined">graphic_eq</span><h2>Voice channel</h2><p>Join the room to talk with your community.</p><div className={styles.voiceRoomRoster}>{participantsFor(currentChannel).length ? participantsFor(currentChannel).map(participant => <div className={styles.voiceRoomPerson} key={participant.uid}><UserAvatar user={participant} size="3rem" /><span>{participant.uid === currentUser.uid ? `${participant.displayName} (You)` : participant.displayName}</span></div>) : <span className={styles.emptyVoiceRoster}>No one is in the room yet.</span>}</div><button className={styles.joinVoiceBtn} onClick={handleJoinVoice}><span className="material-symbols-outlined">headset_mic</span>Join voice channel</button></div></div>}</div></> : <>
          <div ref={messagesListRef} className={styles.messageList}>
            {messages.length >= messageLimit && <button className={styles.loadMoreBtn} onClick={() => setMessageLimit(previous => previous + 25)}>Load older messages</button>}
            {visibleMessages.map(message => {
              const author = authorFor(message);
              const isMe = author.uid === currentUser.uid;
              return <article key={message.id} className={`${styles.messageItem} ${isMe ? styles.sent : styles.received} ${isMe && animatedMessageIds.has(message.id) ? styles.justSent : ''}`}>
                <button className={styles.messageAvatar} data-profile-trigger onClick={() => setSelectedProfile(selectedProfile?.messageId === message.id ? null : { messageId: message.id, user: author })} title={`Open ${author.displayName} profile`}><UserAvatar user={author} size="2.5rem" /></button>
                {selectedProfile?.messageId === message.id && <ProfilePopover user={selectedProfile.user} isOwnProfile={selectedProfile.user?.uid === currentUser.uid} onClose={() => setSelectedProfile(null)} />}
                <div className={styles.messageContent}>
                  <div className={styles.messageHeader}><button className={styles.authorButton} data-profile-trigger onClick={() => setSelectedProfile(selectedProfile?.messageId === message.id ? null : { messageId: message.id, user: author })}>{author.displayName}</button><time>{message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</time><div className={styles.messageActions}>{isMe && <button className={styles.msgActionBtn} onClick={() => { setEditingMessageId(message.id); setEditingText(message.text || ''); }} title="Edit message"><span className="material-symbols-outlined">edit</span></button>}{(isMe || canManageMessages) && <button className={styles.msgActionBtn} onClick={async () => { try { await deleteMessage(channelId, message.id); } catch (err) { console.error('Failed to delete message:', err); alert('Failed to delete message: ' + (err?.message || 'Permission denied')); } }} title="Delete message"><span className="material-symbols-outlined">delete</span></button>}{canManageMessages && <button className={styles.msgPinBtn} onClick={() => handlePinMessage(message.id, message.isPinned)} title="Pin message"><span className="material-symbols-outlined">push_pin</span></button>}</div></div>
                  {editingMessageId === message.id ? <form className={styles.editForm} onSubmit={async event => { event.preventDefault(); await handleEditMessage(message.id, editingText); }}><input value={editingText} onChange={event => setEditingText(event.target.value)} autoFocus /><button type="submit">Save</button></form> : <>{message.text && <p className={styles.messageBubble}>{renderMessageText(message.text, message.id)}</p>}{(message.attachment || message.fileUrl) && <div className={styles.fileCard}><span className="material-symbols-outlined">description</span><span>{message.attachment?.name || message.fileName || 'Attachment'}</span><a href={message.attachment?.url || message.fileUrl} target="_blank" rel="noreferrer" title="Open attachment"><span className="material-symbols-outlined">download</span></a></div>}</>}
                </div>
              </article>;
            })}
            <div ref={messagesEndRef} />
          </div>
          <div className={styles.inputArea}>{sendError && <p className={styles.sendError} role="alert">{sendError}</p>}{pendingAttachment && <div className={styles.pendingAttachment}><span className="material-symbols-outlined">description</span><span>{pendingAttachment.name}</span><button type="button" className={styles.removeAttachmentBtn} onClick={() => setPendingAttachment(null)} title="Remove attachment"><span className="material-symbols-outlined">close</span></button></div>}<form className={styles.inputContainer} onSubmit={handleSendMessage}><label className={styles.inputAction} title="Attach file"><span className="material-symbols-outlined">{isUploading ? 'sync' : 'attach_file'}</span><input type="file" hidden onChange={handleFileUpload} disabled={isUploading || !canSend} /></label><div className={styles.composerField}>{hasDraftMention && <div ref={composerTextLayerRef} className={styles.composerTextLayer} aria-hidden="true">{renderMessageText(newMessage, 'draft', true)}</div>}<input ref={messageInputRef} className={`${styles.textInput} ${hasDraftMention ? styles.textInputWithMentionOverlay : ''}`} value={newMessage} disabled={!canSend || isUploading} placeholder={canSend ? `Message #${currentChannel?.name || 'channel'}` : isTimedOut ? 'You are temporarily timed out' : 'Messages are restricted'} onScroll={event => { if (composerTextLayerRef.current) composerTextLayerRef.current.scrollLeft = event.currentTarget.scrollLeft; }} onChange={event => { const value = event.target.value; setNewMessage(value); setSendError(''); const match = value.match(/(?:^|\s)([@#])([^\s@#]*)$/); setMentionQuery(match ? { trigger: match[1], query: match[2] } : null); }} />{mentionOptions.length > 0 && <div className={styles.mentionMenu}>{mentionOptions.map(option => <button type="button" key={option.label} onPointerDown={event => event.preventDefault()} onClick={() => insertMention(option.value)}>{option.avatar ? <UserAvatar user={option.avatar} size="1.4rem" /> : <span className="material-symbols-outlined">{option.type === 'channel' ? 'tag' : option.type === 'everyone' ? 'campaign' : 'badge'}</span>}<span className={styles.mentionOptionLabel} style={option.color ? { color: option.color } : undefined}>{option.label}</span></button>)}</div>}</div><button className={styles.inputAction} type="submit" disabled={!canSend || (!newMessage.trim() && !pendingAttachment)} title="Send message"><span className="material-symbols-outlined">send</span></button></form></div>
        </>}
      </section>

      {isMemberListOpen && <aside className={styles.memberListSidebar}><p className="text-label-sm text-tertiary">MEMBERS - {activeMembers.length}</p>{activeMembers.map(member => <div className={styles.memberItemWrap} key={member.uid}><button className={styles.memberItem} data-profile-trigger onClick={() => { setSelectedProfile(selectedProfile?.user?.uid === member.uid ? null : { messageId: null, user: member }); }}><UserAvatar user={member} size="2rem" /><span>{member.displayName}</span><span className={`${styles.statusDot} ${presence[member.uid] ? styles.online : styles.offline}`} /></button>{selectedProfile?.user?.uid === member.uid && <ProfilePopover user={selectedProfile.user} isOwnProfile={selectedProfile.user?.uid === currentUser.uid} onClose={() => setSelectedProfile(null)} />}</div>)}</aside>}

      <Modal isOpen={isCreateChannelOpen} onClose={() => setIsCreateChannelOpen(false)} title="Create channel" footer={<><button className={styles.modalCancel} onClick={() => setIsCreateChannelOpen(false)}>Cancel</button><button className={styles.modalConfirm} onClick={handleCreateChannel}>Create</button></>}><div className={styles.modalInputGroup}><label>CHANNEL NAME</label><input className={styles.modalInput} value={newChannelName} onChange={event => setNewChannelName(event.target.value)} autoFocus /><label>CHANNEL TYPE</label><select className={styles.modalInput} value={newChannelType} onChange={event => setNewChannelType(event.target.value)}><option value="text">Text</option><option value="voice">Voice</option></select></div></Modal>
      <Modal isOpen={isPinnedMessagesOpen} onClose={() => setIsPinnedMessagesOpen(false)} title="Pinned messages" footer={<button className={styles.modalConfirm} onClick={() => setIsPinnedMessagesOpen(false)}>Close</button>}><div className={styles.pinnedList}>{pinnedMessages.length ? pinnedMessages.map(message => <div className={styles.pinnedMsgItem} key={message.id}><strong>{authorFor(message).displayName}</strong><p>{message.text || 'Attachment'}</p></div>) : <p className="text-tertiary">No pinned messages in this channel.</p>}</div></Modal>
    </div>
  );
}

export default function ChatArea() {
  const { communityId } = useParams();
  // Key by community only: switching channels must not remount the whole chat
  // (which previously flashed the loading screen on every channel change).
  return <ChatAreaErrorBoundary><ChatAreaContent key={communityId || ''} /></ChatAreaErrorBoundary>;
}
