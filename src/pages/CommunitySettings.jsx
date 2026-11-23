import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getCommunity,
  updateCommunity,
  getChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  deleteCommunity,
  getCommunityMembers,
  kickUser,
  banUser,
  unbanUser,
  timeoutUser,
  clearTimeoutUser,
  getUserProfile,
  setMemberRoles,
  reorderChannels,
  migrateCommunityPermissions,
  clearChannelMessages
} from '../services/db';
import { useAuth } from '../contexts/AuthContext';
import { compressAndConvert } from '../services/utils';
import { inviteLinkFor } from '../services/invites';
import UserAvatar from '../components/common/UserAvatar';
import Modal from '../components/common/Modal';
import Dropdown from '../components/common/Dropdown';
import styles from './CommunitySettings.module.css';
import ThemeSelect from '../components/common/ThemeSelect';
import { useTheme } from '../contexts/ThemeContext';
import { hasCommunityPermission, ROLE_PERMISSION_OPTIONS, normalizeRoleIds, buildMemberPermissions, voiceJoinMode } from '../services/permissions';
import { ROLE_BADGE_PRESETS } from '../services/roleBadges';

const SLOW_MODE_OPTIONS = [
  { label: 'Off', seconds: 0 },
  { label: '5 seconds', seconds: 5 },
  { label: '10 seconds', seconds: 10 },
  { label: '30 seconds', seconds: 30 },
  { label: '1 minute', seconds: 60 },
  { label: '5 minutes', seconds: 300 },
  { label: '15 minutes', seconds: 900 },
  { label: '1 hour', seconds: 3600 }
];

const TIMEOUT_OPTIONS = [
  { label: '30 seconds', minutes: 0.5 },
  { label: '60 seconds', minutes: 1 },
  { label: '2 minutes', minutes: 2 },
  { label: '5 minutes', minutes: 5 },
  { label: '10 minutes', minutes: 10 },
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: '45 minutes', minutes: 45 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: '3 hours', minutes: 180 },
  { label: '5 hours', minutes: 300 },
  { label: '10 hours', minutes: 600 },
  { label: '24 hours', minutes: 1440 }
];

// Friendly remaining time for bans and timeouts ("2 hours left").
function describeRemaining(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${Math.ceil(hours / 24)} days`;
}

function describeUntil(timestamp) {
  if (timestamp === -1) return 'Permanent ban';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Banned';
  return `Until ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function CommunitySettings() {
  const { communityId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { setCommunityTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('general');
  const [community, setCommunity] = useState(null);
  const [channels, setChannels] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [description, setDescription] = useState('');
  const [iconBase64, setIconBase64] = useState('');
  const [zoom, setZoom] = useState(1);
  const [originalFile, setOriginalFile] = useState(null);

  // Creation and editing of channels and roles happens in a modal; these
  // hold the in-progress draft and are null while the dialog is closed.
  const [channelDraft, setChannelDraft] = useState(null);
  const [roleDraft, setRoleDraft] = useState(null);
  // Visibility is separate from the draft: closing flips `open` but keeps the
  // draft, so the dialog still has its fields while the exit animation runs.
  const [channelEditorOpen, setChannelEditorOpen] = useState(false);
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [typeWarningOpen, setTypeWarningOpen] = useState(false);

  const [autoModProfanity, setAutoModProfanity] = useState(false);
  const [autoModLinks, setAutoModLinks] = useState(false);
  const [systemJoinEnabled, setSystemJoinEnabled] = useState(false);
  const [systemLeaveEnabled, setSystemLeaveEnabled] = useState(false);
  const [systemChannelId, setSystemChannelId] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [moderationProfiles, setModerationProfiles] = useState({});
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const rolePermissions = ROLE_PERMISSION_OPTIONS;
  const [draggedChannelId, setDraggedChannelId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const dragGhostRef = useRef(null);
  const moderationRequests = useRef(new Set());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Banned and timed-out people are usually no longer members, so their
  // profiles are fetched separately for the moderation tab.
  useEffect(() => {
    if (!community) return undefined;
    const uids = [...new Set([
      ...Object.keys(community.bannedUsers || {}),
      ...Object.keys(community.timedOutUsers || {})
    ])];
    const missing = uids.filter(uid => !moderationRequests.current.has(uid));
    if (!missing.length) return undefined;
    missing.forEach(uid => moderationRequests.current.add(uid));
    let cancelled = false;
    Promise.all(missing.map(async uid => [uid, await getUserProfile(uid).catch(() => null)]))
      .then(entries => {
        if (cancelled) return;
        setModerationProfiles(previous => ({
          ...previous,
          ...Object.fromEntries(entries.filter(([, profile]) => profile))
        }));
      });
    return () => { cancelled = true; };
  }, [community]);

  const isOwner = community?.adminUid === currentUser?.uid;
  const canManageChannels = isOwner || hasCommunityPermission(community, currentUser?.uid, 'manage_channels');
  const canManageRoles = isOwner || hasCommunityPermission(community, currentUser?.uid, 'manage_roles');
  const canManageMembers = isOwner || hasCommunityPermission(community, currentUser?.uid, 'manage_members');
  const canManageCommunity = isOwner || hasCommunityPermission(community, currentUser?.uid, 'manage_community');
  const canManageInvites = isOwner || hasCommunityPermission(community, currentUser?.uid, 'manage_invites');

  const [modalType, setModalType] = useState(null); // 'kick', 'ban', 'deleteChannel', 'deleteCommunity', 'timeout'
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingCommunity, setDeletingCommunity] = useState(false);
  const [banDuration, setBanDuration] = useState('-1');

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [comm, chans, mems] = await Promise.all([
          getCommunity(communityId),
          getChannels(communityId),
          getCommunityMembers(communityId)
        ]);
        if (cancelled) return;
        if (comm) {
          const migratedCommunity = currentUser?.uid === comm.adminUid
            ? await migrateCommunityPermissions(communityId, comm).catch(() => comm)
            : comm;
          if (cancelled) return;
          setCommunity(migratedCommunity);
          setName(migratedCommunity.name || '');
          setDescription(migratedCommunity.description || '');
          setIconBase64(migratedCommunity.iconBase64 || '');
          setInviteCode(migratedCommunity.inviteCode || '');
          setAutoModProfanity(Boolean(migratedCommunity.autoMod?.profanity));
          setAutoModLinks(Boolean(migratedCommunity.autoMod?.links));
          setSystemJoinEnabled(Boolean(migratedCommunity.systemMessages?.joinEnabled));
          setSystemLeaveEnabled(Boolean(migratedCommunity.systemMessages?.leaveEnabled));
          setSystemChannelId(migratedCommunity.systemMessages?.channelId || '');
        }
        setChannels(chans);
        setMembers(mems);
      } catch (error) {
        console.error('Failed to load community settings:', error);
        if (!cancelled) setAdminError(error.message || 'Could not load community settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, [communityId, currentUser?.uid]);

  const handleIconChange = async e => {
    const file = e.target.files[0];
    if (file) {
      try {
        setOriginalFile(file);
        // compressAndConvert(file, size, zoom): the second argument is the
        // output size in pixels. Passing 1 produced a 1x1 pixel community icon.
        const base64 = await compressAndConvert(file, 200, 1);
        setIconBase64(base64);
      } catch (error) {
        console.error('Failed to process community icon:', error);
        setAdminError(error.message || 'Could not process that image.');
      }
    }
  };

  const handleZoomChange = async newZoom => {
    setZoom(newZoom);
    if (originalFile) {
      try {
        const base64 = await compressAndConvert(originalFile, 200, parseFloat(newZoom));
        setIconBase64(base64);
      } catch (error) {
        console.error('Failed to resize community icon:', error);
      }
    }
  };

  const handleSaveGeneral = async e => {
    e.preventDefault();
    setSaving(true);
    setAdminError('');
    try {
      const updateData = {};
      if (canManageCommunity) Object.assign(updateData, {
        name,
        description,
        iconBase64,
        autoMod: { profanity: autoModProfanity, links: autoModLinks },
        systemMessages: {
          joinEnabled: systemJoinEnabled,
          leaveEnabled: systemLeaveEnabled,
          channelId: systemChannelId || ''
        }
      });
      if (canManageInvites && community.isPrivate) updateData.inviteCode = inviteCode;
      await updateCommunity(communityId, updateData);
      setModalType('success');
    } catch (err) {
      console.error(err);
      setModalType('error');
    }
    setSaving(false);
  };

  const handleCopyInvite = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(inviteLinkFor({ origin: window.location.origin, communityId, community }));
      setCopiedInvite(true);
      window.setTimeout(() => setCopiedInvite(false), 2000);
    } catch {
      setAdminError('Could not copy the invite link.');
    }
  };

  // Channels are created and edited in a dialog; this opens it with either a
  // blank draft (create) or the channel's current settings (edit).
  const openChannelDraft = channel => {
    setChannelDraft(channel
      ? {
        id: channel.id,
        name: channel.name || '',
        type: channel.type || 'text',
        originalType: channel.type || 'text',
        isLocked: Boolean(channel.isLocked),
        slowModeSeconds: Number(channel.slowModeSeconds) || 0,
        allowedRoles: channel.allowedRoles || [],
        joinMode: voiceJoinMode(channel),
        joinRoles: channel.joinRoles || [],
        inviteRoles: channel.inviteRoles || [],
        invitedUids: channel.invitedUids || {},
        clearHistory: false
      }
      : { id: null, name: '', type: 'text', originalType: 'text', isLocked: false, slowModeSeconds: 0, allowedRoles: [], joinMode: 'everyone', joinRoles: [], inviteRoles: [], invitedUids: {}, clearHistory: false });
    setChannelEditorOpen(true);
  };

  const applyChannelType = nextType => setChannelDraft(previous => ({
    ...previous,
    type: nextType,
    slowModeSeconds: nextType === 'voice' ? 0 : previous.slowModeSeconds,
    clearHistory: nextType === 'voice' && Boolean(previous.id) && previous.originalType !== 'voice'
  }));

  // Converting text to voice wipes the history on save, so warn first and
  // leave the draft on text until the change is confirmed.
  const requestChannelTypeChange = nextType => {
    if (!channelDraft || nextType === channelDraft.type) return;
    if (nextType === 'voice' && channelDraft.id && channelDraft.originalType !== 'voice') {
      setChannelEditorOpen(false);
      setTypeWarningOpen(true);
      return;
    }
    applyChannelType(nextType);
  };

  const handleSaveChannelDraft = async () => {
    if (!channelDraft) return;
    const trimmedName = channelDraft.name.trim();
    if (!trimmedName) { setAdminError('Give the channel a name first.'); return; }
    setAdminSaving(true);
    setAdminError('');
    const isVoice = channelDraft.type === 'voice';
    const patch = {
      name: trimmedName,
      type: channelDraft.type,
      slowModeSeconds: isVoice ? 0 : (Number(channelDraft.slowModeSeconds) || 0),
      isLocked: Boolean(channelDraft.isLocked),
      allowedRoles: channelDraft.allowedRoles
    };
    if (isVoice) {
      patch.joinMode = channelDraft.joinMode;
      patch.joinRoles = channelDraft.joinMode === 'roles' ? channelDraft.joinRoles : [];
      patch.inviteRoles = channelDraft.joinMode === 'invite' ? channelDraft.inviteRoles : [];
      patch.invitedUids = channelDraft.invitedUids || {};
    }
    try {
      if (channelDraft.id) {
        await updateChannel(channelDraft.id, patch);
        if (channelDraft.clearHistory) await clearChannelMessages(channelDraft.id);
        setChannels(previous => previous.map(item => item.id === channelDraft.id ? { ...item, ...patch } : item));
      } else {
        await createChannel(communityId, trimmedName, channelDraft.type, patch);
        setChannels(await getChannels(communityId));
      }
      setChannelEditorOpen(false);
    } catch (error) {
      setAdminError(error.message || 'Could not save that channel.');
    } finally {
      setAdminSaving(false);
    }
  };

  const handleAddAnnouncement = async () => {
    const allowedRoles = Object.entries(community?.roles || {}).filter(([, role]) => (role.permissions || []).includes('manage_messages')).map(([id]) => id);
    if (!allowedRoles.length) { setAdminError('Create a moderator role with Manage messages first.'); return; }
    await createChannel(communityId, 'announcements', 'text', { isLocked: true, allowedRoles });
    setChannels(await getChannels(communityId));
  };

  const confirmDeleteChannel = async () => {
    try {
      await deleteChannel(selectedTarget);
      setChannels(channels.filter(c => c.id !== selectedTarget));
      setModalType(null);
    } catch (err) {
      console.error(err);
    }
  };

  const confirmDeleteCommunity = async () => {
    if (!isOwner) return;
    if (deleteConfirmText.trim().toLowerCase() !== (community.name || '').trim().toLowerCase()) return;
    setDeletingCommunity(true);
    setAdminError('');
    try {
      await deleteCommunity(communityId, currentUser.uid);
      navigate('/communities', { replace: true });
    } catch (error) {
      setAdminError(error.message || 'Could not delete this community.');
      setModalType(null);
    } finally {
      setDeletingCommunity(false);
    }
  };

  const confirmKick = async () => {
    try {
      await kickUser(communityId, selectedTarget);
      setMembers(members.filter(m => m.uid !== selectedTarget));
      setModalType(null);
    } catch (err) {
      console.error(err);
    }
  };

  const confirmBan = async () => {
    try {
      const duration = parseInt(banDuration, 10);
      await banUser(communityId, selectedTarget, duration);
      setMembers(members.filter(m => m.uid !== selectedTarget));
      setModalType(null);
      setBanDuration('-1');
    } catch (err) {
      console.error(err);
    }
  };

  const moveChannel = async (channelIndex, direction) => {
    const nextIndex = channelIndex + direction;
    if (nextIndex < 0 || nextIndex >= channels.length) return;
    const reorderedChannels = [...channels];
    [reorderedChannels[channelIndex], reorderedChannels[nextIndex]] = [reorderedChannels[nextIndex], reorderedChannels[channelIndex]];
    setChannels(reorderedChannels);
    try {
      await reorderChannels(communityId, reorderedChannels.map(channel => channel.id));
    } catch (error) {
      setChannels(channels);
      setAdminError(error.message || 'Could not reorder channels.');
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
    ghost.style.cssText = 'position:fixed;top:-1000px;left:-1000px;padding:8px 14px;border-radius:8px;background:var(--color-surface-container-high);color:var(--color-on-surface);font:600 13px Manrope,sans-serif;border:1px solid var(--color-outline-variant);';
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
      setAdminError(error.message || 'Could not reorder channels.');
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

  const roleIdsFor = uid => normalizeRoleIds(community?.memberRoles?.[uid]);

  const handleRoleChange = async (uid, roleId) => {
    if (!canManageRoles) return;
    const currentRoleIds = roleIdsFor(uid);
    const nextRoleIds = currentRoleIds.includes(roleId)
      ? currentRoleIds.filter(id => id !== roleId)
      : [...currentRoleIds, roleId];
    try {
      await setMemberRoles(communityId, uid, nextRoleIds, community?.roles);
      setCommunity(previous => ({
        ...previous,
        memberRoles: nextRoleIds.length
          ? { ...(previous.memberRoles || {}), [uid]: nextRoleIds }
          : Object.fromEntries(Object.entries(previous.memberRoles || {}).filter(([memberUid]) => memberUid !== uid))
      }));
    } catch (error) {
      setAdminError(error.message || 'Could not update member roles.');
    }
  };

  const handleTimeout = async (uid, minutes) => {
    try {
      await timeoutUser(communityId, uid, minutes);
      setCommunity(previous => ({ ...previous, timedOutUsers: { ...(previous.timedOutUsers || {}), [uid]: Date.now() + minutes * 60000 } }));
      setModalType(null);
      setSelectedTarget(null);
    } catch (error) {
      setAdminError(error.message || 'Could not apply the timeout.');
      setModalType(null);
    }
  };

  const handleClearTimeout = async uid => {
    setAdminError('');
    try {
      await clearTimeoutUser(communityId, uid);
      setCommunity(previous => ({
        ...previous,
        timedOutUsers: Object.fromEntries(Object.entries(previous.timedOutUsers || {}).filter(([memberUid]) => memberUid !== uid))
      }));
    } catch (error) {
      setAdminError(error.message || 'Could not clear that timeout.');
    }
  };

  const handleUnban = async uid => {
    setAdminError('');
    try {
      await unbanUser(communityId, uid);
      setCommunity(previous => ({
        ...previous,
        bannedUsers: Object.fromEntries(Object.entries(previous.bannedUsers || {}).filter(([memberUid]) => memberUid !== uid))
      }));
    } catch (error) {
      setAdminError(error.message || 'Could not lift that ban.');
    }
  };

  const openRoleDraft = (roleId, role) => {
    setRoleDraft(role
      ? {
        id: roleId,
        name: role.name || '',
        color: role.color || '#7dd3fc',
        badge: role.badge || 'spark',
        permissions: role.permissions || []
      }
      : { id: null, name: '', color: '#7dd3fc', badge: 'spark', permissions: [] });
    setRoleEditorOpen(true);
  };

  const handleSaveRoleDraft = async () => {
    if (!roleDraft) return;
    const trimmedName = roleDraft.name.trim();
    if (!trimmedName) { setAdminError('Give the role a name first.'); return; }
    setAdminSaving(true);
    setAdminError('');
    try {
      const roles = { ...(community.roles || {}) };
      let roleId = roleDraft.id;
      if (!roleId) {
        const baseId = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'role';
        roleId = baseId;
        let suffix = 2;
        while (roles[roleId]) roleId = `${baseId}-${suffix++}`;
      }
      roles[roleId] = { ...(roles[roleId] || {}), name: trimmedName, color: roleDraft.color, badge: roleDraft.badge, permissions: roleDraft.permissions };
      const memberPermissions = buildMemberPermissions(roles, community.memberRoles || {});
      await updateCommunity(communityId, { roles, memberPermissions });
      setCommunity(previous => ({ ...previous, roles, memberPermissions }));
      setRoleEditorOpen(false);
    } catch (error) {
      setAdminError(error.message || 'Could not save that role.');
    } finally {
      setAdminSaving(false);
    }
  };

  const handleDeleteRole = async roleId => {
    setAdminSaving(true);
    setAdminError('');
    try {
      const roles = { ...(community.roles || {}) };
      delete roles[roleId];
      const memberRoles = Object.fromEntries(Object.entries(community.memberRoles || {}).map(([uid]) => {
        const remaining = roleIdsFor(uid).filter(id => id !== roleId);
        return [uid, remaining];
      }).filter(([, remainingRoles]) => remainingRoles.length));
      const memberPermissions = buildMemberPermissions(roles, memberRoles);
      await updateCommunity(communityId, { roles, memberRoles, memberPermissions });
      setCommunity(previous => ({ ...previous, roles, memberRoles, memberPermissions }));
    } catch (error) {
      setAdminError(error.message || 'Could not delete role.');
    } finally {
      setAdminSaving(false);
    }
  };

  if (loading) return <div className={styles.loading}>Loading settings...</div>;
  if (!community) return <div className={styles.loading}><p>{adminError || 'Community settings are unavailable.'}</p><button className={styles.backBtn} onClick={() => navigate(-1)}>Go back</button></div>;

  const roleEntries = Object.entries(community.roles || {});
  const allowedRoleNames = roleIds => {
    const names = (roleIds || []).map(roleId => community.roles?.[roleId]?.name).filter(Boolean);
    return names.length ? names.join(', ') : 'Everyone';
  };

  const bannedEntries = Object.entries(community.bannedUsers || {})
    .map(([uid, until]) => ({ uid, until: Number(until) }))
    .filter(entry => entry.until === -1 || entry.until > now)
    .sort((first, second) => (first.until === -1 ? 1 : 0) - (second.until === -1 ? 1 : 0));
  const timedOutEntries = Object.entries(community.timedOutUsers || {})
    .map(([uid, until]) => ({ uid, until: Number(until) }))
    .filter(entry => entry.until > now);

  const tabs = [
    { id: 'general', label: 'General', icon: 'tune', visible: canManageCommunity || canManageInvites },
    { id: 'channels', label: 'Channels', icon: 'tag', visible: canManageChannels, count: channels.length },
    { id: 'roles', label: 'Roles', icon: 'shield_person', visible: canManageRoles, count: roleEntries.length },
    { id: 'members', label: 'Members', icon: 'group', visible: canManageMembers, count: members.length },
    { id: 'moderation', label: 'Moderation', icon: 'gavel', visible: canManageMembers, count: bannedEntries.length + timedOutEntries.length }
  ].filter(tab => tab.visible);
  const allowedTabs = tabs.map(tab => tab.id);
  const visibleTab = allowedTabs.includes(activeTab) ? activeTab : allowedTabs[0];

  // Reached by a direct URL from someone without any moderator permission:
  // an empty settings shell would be worse than a clear explanation.
  if (!allowedTabs.length) {
    return (
      <div className={styles.loading}>
        <div>
          <p>You need a moderator permission in this community to open its settings.</p>
          <button type="button" className={styles.backBtn} onClick={() => navigate(`/channels/${communityId}`)}>Back to chat</button>
        </div>
      </div>
    );
  }

  const filteredMembers = members.filter(member => {
    const query = memberQuery.trim().toLowerCase();
    if (query && !(member.displayName || '').toLowerCase().includes(query) && !member.uid.toLowerCase().includes(query)) return false;
    if (roleFilter === 'none') return roleIdsFor(member.uid).length === 0;
    if (roleFilter !== 'all') return roleIdsFor(member.uid).includes(roleFilter);
    return true;
  });

  const profileFor = uid => moderationProfiles[uid] || members.find(member => member.uid === uid) || null;

  const renderAdminAlert = () => adminError ? (
    <div className={styles.adminAlert} role="alert">
      <span className="material-symbols-outlined">error</span>
      <span>{adminError}</span>
      <button type="button" onClick={() => setAdminError('')} aria-label="Dismiss error"><span className="material-symbols-outlined">close</span></button>
    </div>
  ) : null;

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarEyebrow}>COMMUNITY SETTINGS</span>
          <h2>{community.name}</h2>
          <span className={styles.sidebarMeta}>{members.length} {members.length === 1 ? 'member' : 'members'} · {channels.length} {channels.length === 1 ? 'channel' : 'channels'}</span>
        </div>
        <nav className={styles.nav} aria-label="Settings sections">
          <span className={styles.navLabel}>MANAGE</span>
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`${styles.navItem} ${visibleTab === tab.id ? styles.active : ''}`}
              onClick={() => { setActiveTab(tab.id); setAdminError(''); }}
              aria-current={visibleTab === tab.id ? 'page' : undefined}
            >
              <span className="material-symbols-outlined">{tab.icon}</span>
              {tab.label}
              {typeof tab.count === 'number' && tab.count > 0 && <span className={styles.navCount}>{tab.count}</span>}
            </button>
          ))}
          <div className={styles.divider} />
          <button type="button" className={styles.navItem} onClick={() => navigate(`/channels/${communityId}`)}>
            <span className="material-symbols-outlined">arrow_back</span>
            Back to chat
          </button>
        </nav>
      </aside>

      <main className={styles.content}>
        {visibleTab === 'general' && (
          <div className={styles.tabContent}>
            <header className={styles.pageHeading}>
              <div>
                <p className={styles.eyebrow}>GENERAL</p>
                <h1 className="text-headline-md">Community overview</h1>
                <p className={styles.sectionDescription}>Your community&apos;s identity, theme, and the safety defaults that apply everywhere.</p>
              </div>
              <span className={styles.sectionCount}>{community.isPrivate ? 'Private community' : 'Public community'}</span>
            </header>
            {renderAdminAlert()}

            <form onSubmit={handleSaveGeneral} className={styles.form}>
              {canManageCommunity && (
                <section className={styles.card}>
                  <h2 className={styles.cardTitle}><span className="material-symbols-outlined">badge</span>Identity</h2>
                  <div className={styles.iconSection}>
                    <div className={styles.iconPreview}>
                      {iconBase64 ? <img src={iconBase64} alt="Community icon preview" /> : <div className={styles.iconPlaceholder}>?</div>}
                      <label className={styles.iconUpload} title="Upload a community icon">
                        <span className="material-symbols-outlined">edit</span>
                        <input type="file" accept="image/*" onChange={handleIconChange} style={{ display: 'none' }} />
                      </label>
                    </div>
                    <div className={styles.iconInfo}>
                      <p className="text-label-md">Community icon</p>
                      <p className="text-label-sm text-tertiary">Square image, 512×512 recommended.</p>
                      {originalFile && (
                        <div className={styles.zoomControl}>
                          <span className="material-symbols-outlined">zoom_out</span>
                          <input
                            type="range"
                            min="1"
                            max="3"
                            step="0.1"
                            value={zoom}
                            aria-label="Icon zoom"
                            onChange={e => handleZoomChange(e.target.value)}
                          />
                          <span className="material-symbols-outlined">zoom_in</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={styles.fieldGrid}>
                    <label className={styles.inputGroup}>
                      <span>COMMUNITY NAME</span>
                      <input type="text" value={name} maxLength={60} onChange={e => setName(e.target.value)} />
                    </label>
                    <label className={`${styles.inputGroup}`}>
                      <span>DESCRIPTION</span>
                      <textarea value={description} maxLength={300} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What is this community about?" />
                    </label>
                  </div>
                </section>
              )}

              {canManageCommunity && (
                <section className={styles.card}>
                  <h2 className={styles.cardTitle}><span className="material-symbols-outlined">palette</span>Appearance</h2>
                  <ThemeSelect
                    value={community.theme || 'default'}
                    label="COMMUNITY THEME"
                    onChange={themeId => setCommunityTheme(communityId, themeId).then(() => setCommunity(previous => ({ ...previous, theme: themeId })))}
                  />
                  <p className={styles.cardHint}>The theme recolours the community&apos;s chat, sidebar and accents for every member.</p>
                </section>
              )}

              {canManageCommunity && (
                <section className={styles.card}>
                  <h2 className={styles.cardTitle}><span className="material-symbols-outlined">shield</span>Safety</h2>
                  <div className={styles.toggleRow}>
                    <label className={styles.policyToggle}><input type="checkbox" checked={autoModProfanity} onChange={e => setAutoModProfanity(e.target.checked)} />Block profanity</label>
                    <label className={styles.policyToggle}><input type="checkbox" checked={autoModLinks} onChange={e => setAutoModLinks(e.target.checked)} />Block links</label>
                  </div>
                  <p className={styles.cardHint}>Messages that trip these filters are refused before they are sent.</p>
                </section>
              )}

              {canManageCommunity && (
                <section className={styles.card}>
                  <h2 className={styles.cardTitle}><span className="material-symbols-outlined">campaign</span>Activity feed</h2>
                  <div className={styles.toggleRow}>
                    <label className={styles.policyToggle}><input type="checkbox" checked={systemJoinEnabled} onChange={e => setSystemJoinEnabled(e.target.checked)} />Announce joins</label>
                    <label className={styles.policyToggle}><input type="checkbox" checked={systemLeaveEnabled} onChange={e => setSystemLeaveEnabled(e.target.checked)} />Announce leaves</label>
                  </div>
                  <div className={styles.fieldGrid}>
                    <div className={styles.fieldGroup}>
                      <span>POST TO CHANNEL</span>
                      <Dropdown value={systemChannelId} onChange={setSystemChannelId} options={[{ value: '', label: 'None' }, ...channels.filter(channel => channel.type !== 'voice').map(channel => ({ value: channel.id, label: `#${channel.name}` }))]} />
                    </div>
                  </div>
                  <p className={styles.cardHint}>Join and leave notes are posted to the selected channel while announcements are enabled.</p>
                </section>
              )}

              {canManageInvites && (
                <section className={styles.card}>
                  <h2 className={styles.cardTitle}><span className="material-symbols-outlined">key</span>Invite access</h2>
                  {community.isPrivate && (
                    <div className={styles.fieldGrid}>
                      <label className={styles.inputGroup}>
                        <span>INVITE CODE</span>
                        <input type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} placeholder="e.g. BLINK123" />
                      </label>
                    </div>
                  )}
                  <div className={styles.saveBar}>
                    <span className={styles.saveBarHint}>{community.isPrivate ? 'Invite links carry this code, so members you trust join without typing it.' : 'Anyone with this link can join the community.'}</span>
                    <div className={styles.channelActions}>
                      {community.isPrivate && <button type="button" className={styles.secondaryAction} onClick={() => setInviteCode(Math.random().toString(36).substring(2, 10).toUpperCase())}>Regenerate code</button>}
                      <button type="button" className={styles.secondaryAction} onClick={handleCopyInvite}>{copiedInvite ? 'Copied' : 'Copy invite link'}</button>
                    </div>
                  </div>
                </section>
              )}

              <div className={styles.saveBar}>
                <span className={styles.saveBarHint}>Changes apply to everyone in {community.name}.</span>
                <button type="submit" className={styles.saveBtn} disabled={saving || (!canManageCommunity && !canManageInvites)}>
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>

            {isOwner && (
              <section className={`${styles.card} ${styles.dangerCard}`}>
                <h2 className={styles.cardTitle}><span className="material-symbols-outlined">delete_forever</span>Delete this community</h2>
                <p className={styles.cardHint}>Deleting removes every channel and the community itself, and its messages become unreachable. This cannot be undone.</p>
                <div className={styles.saveBar}>
                  <span className={styles.saveBarHint}>Only the owner can delete {community.name}.</span>
                  <button
                    type="button"
                    className={styles.dangerBtn}
                    onClick={() => { setDeleteConfirmText(''); setModalType('deleteCommunity'); }}
                  >
                    Delete community
                  </button>
                </div>
              </section>
            )}
          </div>
        )}

        {visibleTab === 'channels' && (
          <div className={styles.tabContent}>
            <header className={styles.pageHeading}>
              <div>
                <p className={styles.eyebrow}>COMMUNITY STRUCTURE</p>
                <h1 className="text-headline-md">Channels</h1>
                <p className={styles.sectionDescription}>Create spaces for conversation, control who can post in them, and set the pace.</p>
              </div>
              <div className={styles.headingActions}>
                <span className={styles.sectionCount}>{channels.length} {channels.length === 1 ? 'channel' : 'channels'}</span>
                <button type="button" className={styles.secondaryAction} onClick={handleAddAnnouncement}>Announcement preset</button>
                <button type="button" className={styles.primaryAction} onClick={() => openChannelDraft()}>
                  <span className="material-symbols-outlined">add</span>
                  New channel
                </button>
              </div>
            </header>
            {renderAdminAlert()}

            <div className={styles.channelList}>
              {channels.length === 0 && <p className={styles.emptyState}>No channels yet. Create one so members have somewhere to talk.</p>}
              {channels.map(chan => {
                const locked = Boolean(chan.isLocked);
                const slowMode = Number(chan.slowModeSeconds) || 0;
                const accessLabel = allowedRoleNames(chan.allowedRoles);
                return (
                  <article
                    key={chan.id}
                    className={`${styles.channelItem} ${draggedChannelId === chan.id ? styles.dragging : ''} ${dropTarget?.id === chan.id ? (dropTarget.before ? styles.dropBefore : styles.dropAfter) : ''}`}
                    draggable={canManageChannels}
                    onDragStart={event => handleChannelDragStart(event, chan.id)}
                    onDragOver={event => handleChannelDragOver(event, chan.id)}
                    onDrop={handleChannelDrop}
                    onDragEnd={handleChannelDragEnd}
                    onDragLeave={() => setDropTarget(previous => previous?.id === chan.id ? null : previous)}
                  >
                    <div className={styles.channelTop}>
                      <div className={styles.channelInfo}>
                        <span className="material-symbols-outlined" aria-hidden="true">{chan.type === 'voice' ? 'graphic_eq' : 'tag'}</span>
                        <p>{chan.name}</p>
                      </div>
                      <div className={styles.channelMeta}>
                        <span className={styles.badge}>{chan.type === 'voice' ? 'Voice' : 'Text'}</span>
                        {chan.type === 'voice'
                          ? <span className={styles.badge}>
                            {voiceJoinMode(chan) === 'roles'
                              ? `Only ${allowedRoleNames(chan.joinRoles)}`
                              : voiceJoinMode(chan) === 'invite' ? 'Invite only' : 'Anyone can join'}
                          </span>
                          : <>
                            <span className={`${styles.badge} ${locked ? styles.warn : ''}`}>{locked ? 'Locked' : 'Open'}</span>
                            {slowMode > 0 && <span className={styles.badge}>Slow: {SLOW_MODE_OPTIONS.find(option => option.seconds === slowMode)?.label || `${slowMode}s`}</span>}
                            <span className={styles.badge}>{accessLabel === 'Everyone' ? 'Everyone can post' : `Only ${accessLabel}`}</span>
                          </>}
                      </div>
                      <div className={styles.reorderActions}>
                        <button type="button" className={styles.actionBtn} onClick={() => moveChannel(channels.indexOf(chan), -1)} disabled={channels.indexOf(chan) === 0} title="Move channel up"><span className="material-symbols-outlined">arrow_upward</span></button>
                        <button type="button" className={styles.actionBtn} onClick={() => moveChannel(channels.indexOf(chan), 1)} disabled={channels.indexOf(chan) === channels.length - 1} title="Move channel down"><span className="material-symbols-outlined">arrow_downward</span></button>
                      </div>
                      <div className={styles.channelActions}>
                        <button type="button" className={styles.actionBtn} onClick={() => openChannelDraft(chan)} title="Edit channel"><span className="material-symbols-outlined">edit</span></button>
                        <button type="button" className={`${styles.actionBtn} ${styles.dangerAction}`} onClick={() => { setSelectedTarget(chan.id); setModalType('deleteChannel'); }} title="Delete channel"><span className="material-symbols-outlined">delete</span></button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {visibleTab === 'roles' && (
          <div className={styles.tabContent}>
            <header className={styles.pageHeading}>
              <div>
                <p className={styles.eyebrow}>ACCESS CONTROL</p>
                <h1 className="text-headline-md">Roles</h1>
                <p className={styles.sectionDescription}>Roles decide what members can do. Create them here and assign them from the Members tab.</p>
              </div>
              <div className={styles.headingActions}>
                <span className={styles.sectionCount}>{roleEntries.length} {roleEntries.length === 1 ? 'role' : 'roles'}</span>
                <button type="button" className={styles.primaryAction} onClick={() => openRoleDraft()}>
                  <span className="material-symbols-outlined">add</span>
                  New role
                </button>
              </div>
            </header>
            {renderAdminAlert()}

            <div className={styles.roleList}>
              {roleEntries.length === 0 && <p className={styles.emptyState}>No roles yet. A role is how you give someone moderator powers.</p>}
              {roleEntries.map(([roleId, role]) => (
                <article className={styles.roleCard} key={roleId}>
                  <div className={styles.roleCardHeader}>
                    <div className={styles.roleIdentity}>
                      <span className={styles.roleSwatch} style={{ backgroundColor: role.color || '#7dd3fc' }} />
                      <div><strong>{role.name}</strong><span>@{roleId}</span></div>
                    </div>
                    <div className={styles.roleActions}>
                      <button type="button" className={styles.actionBtn} onClick={() => openRoleDraft(roleId, role)} title={`Edit ${role.name}`}><span className="material-symbols-outlined">edit</span></button>
                      <button type="button" className={`${styles.actionBtn} ${styles.dangerAction}`} onClick={() => handleDeleteRole(roleId)} title={`Delete ${role.name}`}><span className="material-symbols-outlined">delete</span></button>
                    </div>
                  </div>
                  <div className={styles.roleSummary}>
                    <div className={styles.permissionChips}>
                      {(role.permissions || []).length
                        ? role.permissions.map(permission => <span key={permission}>{rolePermissions.find(option => option.id === permission)?.label || permission}</span>)
                        : <span>No special permissions</span>}
                    </div>
                    <span className={styles.roleNote}>{members.filter(member => roleIdsFor(member.uid).includes(roleId)).length} assigned</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {visibleTab === 'members' && (
          <div className={styles.tabContent}>
            <header className={styles.pageHeading}>
              <div>
                <p className={styles.eyebrow}>PEOPLE</p>
                <h1 className="text-headline-md">Members</h1>
                <p className={styles.sectionDescription}>Find someone quickly, change their roles, or step in when behaviour needs a timeout.</p>
              </div>
              <span className={styles.sectionCount}>{filteredMembers.length} of {members.length}</span>
            </header>
            {renderAdminAlert()}

            <div className={styles.memberToolbar}>
              <label className={styles.searchField}>
                <span>SEARCH MEMBERS</span>
                <input type="search" value={memberQuery} onChange={event => setMemberQuery(event.target.value)} placeholder="Name or user ID" />
              </label>
              <label className={styles.fieldGroup}>
                <span>FILTER BY ROLE</span>
                <select className={styles.filterSelect} value={roleFilter} onChange={event => setRoleFilter(event.target.value)}>
                  <option value="all">All roles</option>
                  {roleEntries.map(([roleId, role]) => <option key={roleId} value={roleId}>{role.name}</option>)}
                  <option value="none">No role</option>
                </select>
              </label>
            </div>

            <div className={styles.memberList}>
              {filteredMembers.length === 0 && <p className={styles.emptyState}>No members match that search.</p>}
              {filteredMembers.map(member => {
                const isTimedOut = Number(community.timedOutUsers?.[member.uid]) > now;
                const memberRoleIds = roleIdsFor(member.uid);
                return (
                  <div key={member.uid} className={styles.memberItem}>
                    <div className={styles.memberInfo}>
                      <UserAvatar user={member} size="2.5rem" />
                      <div className={styles.memberName}>
                        <p><strong>{member.displayName || 'Member'}</strong></p>
                        <div className={styles.memberBadges}>
                          {member.uid === community.adminUid
                            ? <span className={styles.badge}>Owner</span>
                            : memberRoleIds.length
                              ? memberRoleIds.map(roleId => <span className={styles.badge} key={roleId}>{community.roles?.[roleId]?.name || roleId}</span>)
                              : <span className={styles.badge}>No role</span>}
                          {isTimedOut && <span className={`${styles.badge} ${styles.warn}`}>Timed out · {describeRemaining(Number(community.timedOutUsers[member.uid]) - now)}</span>}
                        </div>
                      </div>
                    </div>
                    <div className={styles.memberActions}>
                      {canManageRoles && roleEntries.length > 0 && (
                        <div className={styles.memberRolePicker}>
                          <span className={styles.pickerLabel}>ROLES</span>
                          <div className={styles.roleCheckboxes}>
                            {roleEntries.map(([roleId, role]) => (
                              <label className={`${styles.roleCheckbox} ${memberRoleIds.includes(roleId) ? styles.checked : ''}`} key={roleId}>
                                <input type="checkbox" checked={memberRoleIds.includes(roleId)} onChange={() => handleRoleChange(member.uid, roleId)} aria-label={`${role.name} for ${member.displayName}`} />
                                <span style={{ '--role-color': role.color || '#7dd3fc' }}>{role.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {member.uid !== community.adminUid && (
                        <>
                          <button type="button" className={styles.kickBtn} onClick={() => { setSelectedTarget(member.uid); setModalType('kick'); }}>Kick</button>
                          <button type="button" className={styles.kickBtn} onClick={() => { setSelectedTarget(member.uid); setModalType('timeout'); }}>{isTimedOut ? 'Timeout again' : 'Timeout'}</button>
                          {isTimedOut && <button type="button" className={styles.smallAction} onClick={() => handleClearTimeout(member.uid)}>Clear timeout</button>}
                          <button type="button" className={styles.banBtn} onClick={() => { setSelectedTarget(member.uid); setModalType('ban'); }}>Ban</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {visibleTab === 'moderation' && (
          <div className={styles.tabContent}>
            <header className={styles.pageHeading}>
              <div>
                <p className={styles.eyebrow}>MODERATION</p>
                <h1 className="text-headline-md">Bans and timeouts</h1>
                <p className={styles.sectionDescription}>Everyone you have removed or silenced, with the expiry and a way back.</p>
              </div>
              <span className={styles.sectionCount}>{bannedEntries.length} banned · {timedOutEntries.length} timed out</span>
            </header>
            {renderAdminAlert()}

            <div className={styles.moderationGrid}>
              <section className={styles.card}>
                <h2 className={styles.cardTitle}><span className="material-symbols-outlined">block</span>Banned members</h2>
                <p className={styles.cardHint}>A ban keeps someone out until it expires or you lift it.</p>
                <div className={styles.memberList}>
                  {bannedEntries.length === 0 && <p className={styles.emptyState}>Nobody is banned.</p>}
                  {bannedEntries.map(({ uid, until }) => {
                    const profile = profileFor(uid);
                    return (
                      <div className={styles.moderationRow} key={uid}>
                        <UserAvatar user={profile || { displayName: 'Member' }} size="2rem" />
                        <div className={styles.moderationRowInfo}>
                          <strong>{profile?.displayName || 'Former member'}</strong>
                          <span>{describeUntil(until)}</span>
                        </div>
                        <button type="button" className={styles.smallAction} onClick={() => handleUnban(uid)}>Unban</button>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className={styles.card}>
                <h2 className={styles.cardTitle}><span className="material-symbols-outlined">timer</span>Active timeouts</h2>
                <p className={styles.cardHint}>Timed-out members can read but cannot post until the timer runs out.</p>
                <div className={styles.memberList}>
                  {timedOutEntries.length === 0 && <p className={styles.emptyState}>Nobody is timed out.</p>}
                  {timedOutEntries.map(({ uid, until }) => {
                    const profile = profileFor(uid);
                    return (
                      <div className={styles.moderationRow} key={uid}>
                        <UserAvatar user={profile || { displayName: 'Member' }} size="2rem" />
                        <div className={styles.moderationRowInfo}>
                          <strong>{profile?.displayName || 'Member'}</strong>
                          <span>{describeRemaining(until - now)} left</span>
                        </div>
                        <button type="button" className={styles.smallAction} onClick={() => handleClearTimeout(uid)}>Clear</button>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      <Modal
        isOpen={typeWarningOpen}
        onClose={() => { setTypeWarningOpen(false); setChannelEditorOpen(true); }}
        title="Convert to a voice channel?"
        footer={(
          <>
            <button className={styles.modalCancel} onClick={() => { setTypeWarningOpen(false); setChannelEditorOpen(true); }}>Keep as text</button>
            <button className={styles.modalConfirm} style={{ backgroundColor: 'var(--color-error)' }} onClick={() => { applyChannelType('voice'); setTypeWarningOpen(false); setChannelEditorOpen(true); }}>Convert to voice</button>
          </>
        )}
      >
        <p className="text-body-md">All message history in this channel will be deleted when you save the change. Nothing is removed until then.</p>
      </Modal>

      <Modal
        isOpen={channelEditorOpen}
        onClose={() => setChannelEditorOpen(false)}
        title={channelDraft?.id ? 'Edit channel' : 'New channel'}
        footer={(
          <>
            <button className={styles.modalCancel} onClick={() => setChannelEditorOpen(false)}>Cancel</button>
            <button className={styles.modalConfirm} onClick={handleSaveChannelDraft} disabled={adminSaving}>{adminSaving ? 'Saving...' : channelDraft?.id ? 'Save channel' : 'Create channel'}</button>
          </>
        )}
      >
        {channelDraft && (
          <div className={styles.modalForm}>
            {channelDraft.clearHistory && (
              <p className={styles.dialogWarning}>
                <span className="material-symbols-outlined">warning</span>
                All message history in this channel is deleted when you save.
              </p>
            )}
            <label className={styles.fieldGroup}>
              <span>CHANNEL NAME</span>
              <input type="text" value={channelDraft.name} maxLength={40} placeholder="e.g. design-talk" autoFocus onChange={event => setChannelDraft(previous => ({ ...previous, name: event.target.value }))} />
            </label>
            <label className={styles.fieldGroup}>
              <span>TYPE</span>
              <Dropdown
                value={channelDraft.type}
                onChange={requestChannelTypeChange}
                options={[{ value: 'text', label: 'Text' }, { value: 'voice', label: 'Voice' }]}
              />
            </label>
            {channelDraft.type === 'voice' ? (
              <>
                <div className={styles.fieldGroup}>
                  <span>WHO CAN JOIN</span>
                  <Dropdown
                    value={channelDraft.joinMode}
                    onChange={joinMode => setChannelDraft(previous => ({ ...previous, joinMode }))}
                    options={[{ value: 'everyone', label: 'Anyone in the community' }, { value: 'roles', label: 'Only selected roles' }, { value: 'invite', label: 'Invite only' }]}
                  />
                </div>
                {channelDraft.joinMode === 'roles' && (
                <div className={styles.fieldGroup}>
                  <span>ROLES THAT CAN SEE AND JOIN</span>
                  <div className={styles.roleCheckboxes}>
                    {roleEntries.map(([roleId, role]) => (
                      <label className={`${styles.roleCheckbox} ${channelDraft.joinRoles.includes(roleId) ? styles.checked : ''}`} key={roleId}>
                        <input
                          type="checkbox"
                          checked={channelDraft.joinRoles.includes(roleId)}
                          onChange={event => setChannelDraft(previous => ({
                            ...previous,
                            joinRoles: event.target.checked
                              ? [...new Set([...previous.joinRoles, roleId])]
                              : previous.joinRoles.filter(id => id !== roleId)
                          }))}
                        />
                        <span style={{ '--role-color': role.color || '#7dd3fc' }}>{role.name}</span>
                      </label>
                    ))}
                    {!roleEntries.length && <span className={styles.noRoles}>Add a role first</span>}
                  </div>
                  <span className={styles.noRoles}>{channelDraft.joinRoles.length ? allowedRoleNames(channelDraft.joinRoles) : 'Nobody yet — managers still have access'}</span>
                </div>
                )}
                {channelDraft.joinMode === 'invite' && (
                  <>
                <div className={styles.fieldGroup}>
                  <span>ROLES THAT CAN INVITE</span>
                  <div className={styles.roleCheckboxes}>
                    {roleEntries.map(([roleId, role]) => (
                      <label className={`${styles.roleCheckbox} ${channelDraft.inviteRoles.includes(roleId) ? styles.checked : ''}`} key={roleId}>
                        <input
                          type="checkbox"
                          checked={channelDraft.inviteRoles.includes(roleId)}
                          onChange={event => setChannelDraft(previous => ({
                            ...previous,
                            inviteRoles: event.target.checked
                              ? [...new Set([...previous.inviteRoles, roleId])]
                              : previous.inviteRoles.filter(id => id !== roleId)
                          }))}
                        />
                        <span style={{ '--role-color': role.color || '#7dd3fc' }}>{role.name}</span>
                      </label>
                    ))}
                    {!roleEntries.length && <span className={styles.noRoles}>Add a role first</span>}
                  </div>
                  <span className={styles.noRoles}>{channelDraft.inviteRoles.length ? `${allowedRoleNames(channelDraft.inviteRoles)} can invite` : 'Managers only, until you pick a role'}</span>
                </div>
                    <div className={styles.fieldGroup}>
                      <span>INVITED MEMBERS</span>
                      {Object.keys(channelDraft.invitedUids || {}).length ? (
                        <div className={styles.invitedList}>
                          {Object.keys(channelDraft.invitedUids).map(uid => (
                            <span className={styles.invitedChip} key={uid}>
                              {members.find(member => member.uid === uid)?.displayName || 'Member'}
                              <button
                                type="button"
                                title="Revoke invite"
                                onClick={() => setChannelDraft(previous => ({
                                  ...previous,
                                  invitedUids: Object.fromEntries(Object.entries(previous.invitedUids || {}).filter(([invitedUid]) => invitedUid !== uid))
                                }))}
                              >
                                <span className="material-symbols-outlined">close</span>
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className={styles.noRoles}>No one yet. Invite people from the room itself.</span>
                      )}
                    </div>
                  </>
                )}
                <p className={styles.cardHint}>Voice rooms have no slow mode or posting access; these settings only control who can see and join.</p>
              </>
            ) : (
              <>
                <label className={styles.fieldGroup}>
                  <span>SLOW MODE</span>
                  <Dropdown value={channelDraft.slowModeSeconds} onChange={value => setChannelDraft(previous => ({ ...previous, slowModeSeconds: Number(value) }))} options={SLOW_MODE_OPTIONS.map(option => ({ value: option.seconds, label: option.label }))} />
                </label>
                <div className={styles.fieldGroup}>
                  <span>SEND ACCESS</span>
                  <label className={styles.policyToggle}>
                    <input type="checkbox" checked={channelDraft.isLocked} onChange={event => setChannelDraft(previous => ({ ...previous, isLocked: event.target.checked }))} />
                    Locked to moderators
                  </label>
                </div>
                <div className={styles.fieldGroup}>
                  <span>WHO CAN POST</span>
                  <div className={styles.roleCheckboxes}>
                    {roleEntries.map(([roleId, role]) => (
                      <label className={`${styles.roleCheckbox} ${channelDraft.allowedRoles.includes(roleId) ? styles.checked : ''}`} key={roleId}>
                        <input
                          type="checkbox"
                          checked={channelDraft.allowedRoles.includes(roleId)}
                          onChange={event => setChannelDraft(previous => ({
                            ...previous,
                            allowedRoles: event.target.checked
                              ? [...new Set([...previous.allowedRoles, roleId])]
                              : previous.allowedRoles.filter(id => id !== roleId)
                          }))}
                        />
                        <span style={{ '--role-color': role.color || '#7dd3fc' }}>{role.name}</span>
                      </label>
                    ))}
                    {!roleEntries.length && <span className={styles.noRoles}>Everyone, until you add roles</span>}
                  </div>
                  <span className={styles.noRoles}>{allowedRoleNames(channelDraft.allowedRoles)}</span>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={roleEditorOpen}
        onClose={() => setRoleEditorOpen(false)}
        title={roleDraft?.id ? 'Edit role' : 'New role'}
        footer={(
          <>
            <button className={styles.modalCancel} onClick={() => setRoleEditorOpen(false)}>Cancel</button>
            <button className={styles.modalConfirm} onClick={handleSaveRoleDraft} disabled={adminSaving}>{adminSaving ? 'Saving...' : roleDraft?.id ? 'Save role' : 'Create role'}</button>
          </>
        )}
      >
        {roleDraft && (
          <div className={styles.modalForm}>
            <div className={styles.roleFormGrid}>
              <label className={styles.fieldGroup}><span>ROLE NAME</span><input value={roleDraft.name} maxLength={32} placeholder="e.g. Event Host" autoFocus onChange={event => setRoleDraft(previous => ({ ...previous, name: event.target.value }))} /></label>
              <label className={styles.fieldGroup}><span>COLOUR</span><input className={styles.colorInput} type="color" value={roleDraft.color} onChange={event => setRoleDraft(previous => ({ ...previous, color: event.target.value }))} /></label>
              <label className={styles.fieldGroup}><span>BADGE ICON</span><Dropdown value={roleDraft.badge} onChange={badge => setRoleDraft(previous => ({ ...previous, badge }))} options={ROLE_BADGE_PRESETS.map(badge => ({ value: badge, label: badge }))} /></label>
            </div>
            <fieldset className={styles.permissionsFieldset}>
              <legend>PERMISSIONS</legend>
              <div className={styles.permissionGrid}>
                {rolePermissions.map(permission => (
                  <label className={styles.permissionOption} key={permission.id}>
                    <input
                      type="checkbox"
                      checked={roleDraft.permissions.includes(permission.id)}
                      onChange={event => setRoleDraft(previous => ({
                        ...previous,
                        permissions: event.target.checked
                          ? [...previous.permissions, permission.id]
                          : previous.permissions.filter(id => id !== permission.id)
                      }))}
                    />
                    <span>{permission.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={modalType === 'kick'}
        isOpen={modalType === 'kick'}
        onClose={() => setModalType(null)}
        title="Kick member"
        footer={(
          <>
            <button className={styles.modalCancel} onClick={() => setModalType(null)}>Cancel</button>
            <button className={styles.modalConfirm} onClick={confirmKick}>Kick member</button>
          </>
        )}
      >
        <p className="text-body-md">They lose access to this community right away, but can rejoin with an invite.</p>
      </Modal>

      <Modal
        isOpen={modalType === 'deleteChannel'}
        onClose={() => setModalType(null)}
        title="Delete channel"
        footer={(
          <>
            <button className={styles.modalCancel} onClick={() => setModalType(null)}>Cancel</button>
            <button className={styles.modalConfirm} style={{ backgroundColor: 'var(--color-error)' }} onClick={confirmDeleteChannel}>Delete channel</button>
          </>
        )}
      >
        <p className="text-body-md">The channel is removed from the sidebar and its messages are no longer reachable. This cannot be undone.</p>
      </Modal>

      <Modal
        isOpen={modalType === 'ban'}
        onClose={() => setModalType(null)}
        title="Ban member"
        footer={(
          <>
            <button className={styles.modalCancel} onClick={() => setModalType(null)}>Cancel</button>
            <button className={styles.modalConfirm} style={{ backgroundColor: 'var(--color-error)' }} onClick={confirmBan}>Ban member</button>
          </>
        )}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <p className="text-body-md">They are removed now and cannot rejoin until the ban ends. You can lift it from Moderation.</p>
          <div className={styles.fieldGroup}>
            <span>BAN DURATION</span>
            <Dropdown value={banDuration} onChange={setBanDuration} options={[{ value: '-1', label: 'Permanent' }, { value: '60', label: '1 hour' }, { value: '1440', label: '24 hours' }, { value: '10080', label: '7 days' }, { value: '43200', label: '30 days' }]} />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={modalType === 'timeout'}
        onClose={() => setModalType(null)}
        title="Timeout member"
        footer={<button className={styles.modalCancel} onClick={() => setModalType(null)}>Cancel</button>}
      >
        <p className="text-body-md" style={{ marginBottom: '0.9rem' }}>How long should they be unable to post?</p>
        <div className={styles.timeoutGrid}>
          {TIMEOUT_OPTIONS.map(option => <button key={option.label} className={styles.timeoutOption} onClick={() => handleTimeout(selectedTarget, option.minutes)}>{option.label}</button>)}
        </div>
      </Modal>

      <Modal
        isOpen={modalType === 'deleteCommunity'}
        onClose={() => setModalType(null)}
        title="Delete community"
        footer={(
          <>
            <button className={styles.modalCancel} onClick={() => setModalType(null)}>Cancel</button>
            <button
              className={styles.modalConfirm}
              style={{ backgroundColor: 'var(--color-error)' }}
              disabled={deletingCommunity || deleteConfirmText.trim().toLowerCase() !== (community.name || '').trim().toLowerCase()}
              onClick={confirmDeleteCommunity}
            >
              {deletingCommunity ? 'Deleting…' : 'Delete forever'}
            </button>
          </>
        )}
      >
        <div className={styles.deleteConfirm}>
          <p className="text-body-md">Every channel and the community itself in <strong>{community.name}</strong> will be removed, and its messages will become unreachable. This cannot be undone.</p>
          <label className={styles.inputGroup}>
            <span>TYPE THE COMMUNITY NAME TO CONFIRM</span>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={event => setDeleteConfirmText(event.target.value)}
              placeholder={community.name}
              autoFocus
            />
          </label>
        </div>
      </Modal>

      <Modal
        isOpen={modalType === 'success'}
        onClose={() => setModalType(null)}
        title="Saved"
        footer={<button className={styles.modalConfirm} onClick={() => setModalType(null)}>Done</button>}
      >
        <p className="text-body-md">Community settings were updated.</p>
      </Modal>

      <Modal
        isOpen={modalType === 'error'}
        onClose={() => setModalType(null)}
        title="Could not save"
        footer={<button className={styles.modalConfirm} onClick={() => setModalType(null)}>Close</button>}
      >
        <p className="text-body-md">The change was not saved. Check your connection and permission, then try again.</p>
      </Modal>
    </div>
  );
}
