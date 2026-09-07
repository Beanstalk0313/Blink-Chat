import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getCommunity, 
  updateCommunity, 
  getChannels, 
  createChannel, 
  updateChannel, 
  deleteChannel, 
  getCommunityMembers,
  kickUser,
  banUser,
  timeoutUser,
  setMemberRoles,
  reorderChannels,
  migrateCommunityPermissions
} from '../services/db';
import { useAuth } from '../contexts/AuthContext';
import { compressAndConvert } from '../services/utils';
import UserAvatar from '../components/common/UserAvatar';
import Modal from '../components/common/Modal';
import styles from './CommunitySettings.module.css';
import ThemeSelect from '../components/common/ThemeSelect';
import { useTheme } from '../contexts/ThemeContext';
import { hasCommunityPermission, ROLE_PERMISSION_OPTIONS, normalizeRoleIds, buildMemberPermissions } from '../services/permissions';

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
  
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState('text');
  const [newChannelLocked, setNewChannelLocked] = useState(false);
  const [newAllowedRoles, setNewAllowedRoles] = useState([]);
  const [editingChannel, setEditingChannel] = useState(null);
  const [editChannelName, setEditChannelName] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#7dd3fc');
  const [newRolePermissions, setNewRolePermissions] = useState([]);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [editRoleName, setEditRoleName] = useState('');
  const [editRoleColor, setEditRoleColor] = useState('#7dd3fc');
  const [editRolePermissions, setEditRolePermissions] = useState([]);
  const [adminError, setAdminError] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);

  const rolePermissions = ROLE_PERMISSION_OPTIONS;
  const [draggedChannelId, setDraggedChannelId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const dragGhostRef = useRef(null);

  const isOwner = community?.adminUid === currentUser?.uid;
  const canManageChannels = isOwner || hasCommunityPermission(community, currentUser?.uid, 'manage_channels');
  const canManageRoles = isOwner || hasCommunityPermission(community, currentUser?.uid, 'manage_roles');
  const canManageMembers = isOwner || hasCommunityPermission(community, currentUser?.uid, 'manage_members');
  const canManageCommunity = isOwner || hasCommunityPermission(community, currentUser?.uid, 'manage_community');
  const canManageInvites = isOwner || hasCommunityPermission(community, currentUser?.uid, 'manage_invites');
  const allowedTabs = [
    ...(canManageCommunity || canManageInvites ? ['general'] : []),
    ...(canManageChannels ? ['channels'] : []),
    ...(canManageMembers ? ['members'] : []),
    ...(canManageRoles ? ['roles'] : [])
  ];
  const visibleTab = allowedTabs.includes(activeTab) ? activeTab : allowedTabs[0];

  const [modalType, setModalType] = useState(null); // 'kick', 'ban', 'deleteChannel', 'timeout'
  const [selectedTarget, setSelectedTarget] = useState(null);
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

  const handleIconChange = async (e) => {
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

  const handleZoomChange = async (newZoom) => {
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

  const handleSaveGeneral = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updateData = {};
      if (canManageCommunity) Object.assign(updateData, { name, description, iconBase64 });
      if (canManageInvites && community.isPrivate) updateData.inviteCode = inviteCode;
      await updateCommunity(communityId, updateData);
      setModalType('success');
    } catch (err) {
      console.error(err);
      setModalType('error');
    }
    setSaving(false);
  };

  const handleAddChannel = async (e) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    setAdminSaving(true);
    setAdminError('');
    try {
      await createChannel(communityId, newChannelName, newChannelType, {
        isLocked: newChannelLocked,
        allowedRoles: newAllowedRoles
      });
      setNewChannelName('');
      setNewChannelType('text');
      setNewChannelLocked(false);
      setNewAllowedRoles([]);
      const chans = await getChannels(communityId);
      setChannels(chans);
    } catch (err) {
      setAdminError(err.message || 'Could not create channel.');
    } finally {
      setAdminSaving(false);
    }
  };

  const handleRenameChannel = async (id) => {
    if (!editChannelName.trim()) return;
    try {
      await updateChannel(id, { name: editChannelName });
      setChannels(channels.map(c => c.id === id ? { ...c, name: editChannelName } : c));
      setEditingChannel(null);
    } catch (err) {
      console.error(err);
    }
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

  const handleChannelPolicyChange = async (channel, patch) => {
    try {
      await updateChannel(channel.id, patch);
      setChannels(previous => previous.map(item => item.id === channel.id ? { ...item, ...patch } : item));
    } catch (err) {
      setAdminError(err.message || 'Could not update channel.');
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

  const handleCreateRole = async event => {
    event.preventDefault();
    const trimmedName = newRoleName.trim();
    if (!trimmedName) return;
    setAdminSaving(true);
    setAdminError('');
    try {
      const baseId = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'role';
      const roles = { ...(community.roles || {}) };
      let roleId = baseId;
      let suffix = 2;
      while (roles[roleId]) roleId = `${baseId}-${suffix++}`;
      roles[roleId] = { name: trimmedName, color: newRoleColor, permissions: newRolePermissions };
      const memberPermissions = buildMemberPermissions(roles, community.memberRoles || {});
      await updateCommunity(communityId, { roles, memberPermissions });
      setCommunity(previous => ({ ...previous, roles, memberPermissions }));
      setNewRoleName('');
      setNewRoleColor('#7dd3fc');
      setNewRolePermissions([]);
    } catch (error) {
      setAdminError(error.message || 'Could not create role.');
    } finally {
      setAdminSaving(false);
    }
  };

  const beginRoleEdit = (roleId, role) => {
    setEditingRoleId(roleId);
    setEditRoleName(role.name || '');
    setEditRoleColor(role.color || '#7dd3fc');
    setEditRolePermissions(role.permissions || []);
  };

  const handleSaveRole = async roleId => {
    const trimmedName = editRoleName.trim();
    if (!trimmedName) return;
    setAdminSaving(true);
    setAdminError('');
    try {
      const roles = { ...(community.roles || {}) };
      roles[roleId] = { ...roles[roleId], name: trimmedName, color: editRoleColor, permissions: editRolePermissions };
      const memberPermissions = buildMemberPermissions(roles, community.memberRoles || {});
      await updateCommunity(communityId, { roles, memberPermissions });
      setCommunity(previous => ({ ...previous, roles, memberPermissions }));
      setEditingRoleId(null);
    } catch (error) {
      setAdminError(error.message || 'Could not save role.');
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

  const roleEntries = Object.entries(community?.roles || {});
  const roleLabelFor = uid => {
    const roleNames = roleIdsFor(uid).map(roleId => community?.roles?.[roleId]?.name).filter(Boolean);
    return roleNames.length ? roleNames.join(', ') : 'No role assigned';
  };

  const allowedRoleNames = roleIds => {
    const names = (roleIds || []).map(roleId => community?.roles?.[roleId]?.name).filter(Boolean);
    return names.length ? names.join(', ') : 'Everyone';
  };

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className="text-label-md">COMMUNITY SETTINGS</h2>
          <p className="text-label-sm text-tertiary">{community?.name}</p>
        </div>
        <nav className={styles.nav}>
          {canManageCommunity || canManageInvites ? <button
            className={`${styles.navItem} ${visibleTab === 'general' ? styles.active : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <span className="material-symbols-outlined">settings</span>
            General
          </button> : null}
          {canManageChannels && <button
            className={`${styles.navItem} ${visibleTab === 'channels' ? styles.active : ''}`}
            onClick={() => setActiveTab('channels')}
          >
            <span className="material-symbols-outlined">tag</span>
            Channels
          </button>}
          {canManageMembers && <button
            className={`${styles.navItem} ${visibleTab === 'members' ? styles.active : ''}`}
            onClick={() => setActiveTab('members')}
          >
            <span className="material-symbols-outlined">group</span>
            Members
          </button>}
          {canManageRoles && <button
            className={`${styles.navItem} ${visibleTab === 'roles' ? styles.active : ''}`}
            onClick={() => setActiveTab('roles')}
          >
            <span className="material-symbols-outlined">badge</span>
            Roles
          </button>}
          <div className={styles.divider}></div>
          <button className={styles.navItem} onClick={() => navigate(-1)}>
            <span className="material-symbols-outlined">arrow_back</span>
            Back to Chat
          </button>
        </nav>
      </aside>

      <main className={styles.content}>
        {visibleTab === 'general' && (            <div className={styles.tabContent}>
            <h1 className="text-display-xl">Community Overview</h1>
            {canManageCommunity && <div className={styles.themeRow}><ThemeSelect value={community?.theme || 'default'} onChange={themeId => setCommunityTheme(communityId, themeId).then(() => setCommunity(previous => ({ ...previous, theme: themeId })))} label="COMMUNITY THEME" /></div>}
            <form onSubmit={handleSaveGeneral} className={styles.form}>
              <div className={styles.iconSection}>
                <div className={styles.iconPreview}>
                  {iconBase64 ? <img src={iconBase64} alt="Preview" /> : <div className={styles.iconPlaceholder}>?</div>}
                  <label className={styles.iconUpload}>
                    <span className="material-symbols-outlined">edit</span>
                    <input type="file" onChange={handleIconChange} style={{ display: 'none' }} />
                  </label>
                </div>
                <div className={styles.iconInfo}>
                  <p className="text-label-md">Community Icon</p>
                  <p className="text-label-sm text-tertiary">Recommended size: 512x512px</p>
                  {originalFile && (
                    <div className={styles.zoomControl}>
                      <span className="material-symbols-outlined">zoom_out</span>
                      <input 
                        type="range" 
                        min="1" 
                        max="3" 
                        step="0.1" 
                        value={zoom} 
                        onChange={(e) => handleZoomChange(e.target.value)} 
                      />
                      <span className="material-symbols-outlined">zoom_in</span>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.inputGroup}>
                <label className="text-label-md">COMMUNITY NAME</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} />
              </div>

              <div className={styles.inputGroup}>
                <label className="text-label-md">DESCRIPTION</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} />
              </div>

              {canManageInvites && community?.isPrivate && (
                <div className={styles.inputGroup}>
                  <label className="text-label-md">INVITE CODE</label>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <input 
                      type="text" 
                      value={inviteCode} 
                      onChange={e => setInviteCode(e.target.value.toUpperCase())} 
                      placeholder="e.g. BLINK123"
                    />
                    <button 
                      type="button" 
                      className={styles.secondaryBtn}
                      onClick={() => setInviteCode(Math.random().toString(36).substring(2, 10).toUpperCase())}
                    >
                      Regenerate
                    </button>
                  </div>
                  <p className="text-label-sm text-tertiary" style={{ marginTop: '0.5rem' }}>
                    This code is required for users to join your private community.
                  </p>
                </div>
              )}

              <button type="submit" className={styles.saveBtn} disabled={saving || (!canManageCommunity && !canManageInvites)}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>
        )}

        {visibleTab === 'channels' && (
          <div className={styles.tabContent}>
            {adminError && <div className={styles.adminAlert} role="alert"><span className="material-symbols-outlined">error</span><span>{adminError}</span><button type="button" onClick={() => setAdminError('')} aria-label="Dismiss error"><span className="material-symbols-outlined">close</span></button></div>}
            <div className={styles.pageHeading}>
              <div>
                <p className={styles.eyebrow}>COMMUNITY STRUCTURE</p>
                <h1 className="text-display-xl">Manage Channels</h1>
                <p className={styles.sectionDescription}>Create focused spaces for conversation and control which roles can access them.</p>
              </div>
              <span className={styles.sectionCount}>{channels.length} {channels.length === 1 ? 'channel' : 'channels'}</span>
            </div>
            <form onSubmit={handleAddChannel} className={styles.addChannelForm}>
              <div className={styles.formHeading}><svg className={styles.formHeadingIcon} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg><div><strong>Create a channel</strong><span>Set its type and access policy before adding it.</span></div></div>
              <input
                type="text"
                placeholder="New channel name..."
                value={newChannelName}
                onChange={e => setNewChannelName(e.target.value)}
              />
              <select value={newChannelType} onChange={e => setNewChannelType(e.target.value)}>
                <option value="text">Text</option>
                <option value="voice">Voice</option>
              </select>
              <label className={styles.policyToggle}>
                <input type="checkbox" checked={newChannelLocked} onChange={e => setNewChannelLocked(e.target.checked)} />
                Locked
              </label>                    <div className={styles.channelRolePicker} aria-label="Allowed roles for new channel">
                      <span className={styles.pickerLabel}>ACCESS</span>
                      <div className={styles.roleCheckboxes}>
                        {roleEntries.map(([roleId, role]) => <label className={`${styles.roleCheckbox} ${newAllowedRoles.includes(roleId) ? styles.checked : ''}`} key={roleId}><input type="checkbox" checked={newAllowedRoles.includes(roleId)} onChange={event => setNewAllowedRoles(previous => event.target.checked ? [...new Set([...previous, roleId])] : previous.filter(id => id !== roleId))} /><span style={{ '--role-color': role.color || '#7dd3fc' }}>{role.name}</span></label>)}
                        {!roleEntries.length && <span className={styles.noRoles}>Everyone</span>}
                      </div>
                      <small>{allowedRoleNames(newAllowedRoles)}</small>
                    </div>
              <button type="submit" disabled={adminSaving}><span className="material-symbols-outlined">{adminSaving ? 'progress_activity' : 'add'}</span>{adminSaving ? 'Adding...' : 'Add channel'}</button>
            </form>

            <div className={styles.channelList}>
              {channels.map(chan => (
                <div key={chan.id} className={`${styles.channelItem} ${draggedChannelId === chan.id ? styles.dragging : ''} ${dropTarget?.id === chan.id ? (dropTarget.before ? styles.dropBefore : styles.dropAfter) : ''}`} draggable={canManageChannels} onDragStart={event => handleChannelDragStart(event, chan.id)} onDragOver={event => handleChannelDragOver(event, chan.id)} onDrop={handleChannelDrop} onDragEnd={handleChannelDragEnd} onDragLeave={() => setDropTarget(previous => previous?.id === chan.id ? null : previous)}>
                  <div className={styles.channelInfo}>
                    <span className="material-symbols-outlined">{chan.type === 'voice' ? 'graphic_eq' : 'tag'}</span>
                    {editingChannel === chan.id ? (
                      <input 
                        type="text" 
                        value={editChannelName} 
                        onChange={e => setEditChannelName(e.target.value)}
                        onBlur={() => handleRenameChannel(chan.id)}
                        onKeyDown={e => e.key === 'Enter' && handleRenameChannel(chan.id)}
                        autoFocus
                        className={styles.editChannelInput}
                      />
                    ) : (
                      <p className="text-body-md">{chan.name}</p>
                    )}
                  </div>
                  <div className={styles.channelActions}>
                    {canManageChannels && <div className={styles.reorderActions}>
                      <button type="button" className={styles.actionBtn} onClick={() => moveChannel(channels.indexOf(chan), -1)} disabled={channels.indexOf(chan) === 0} title="Move channel up"><span className="material-symbols-outlined">arrow_upward</span></button>
                      <button type="button" className={styles.actionBtn} onClick={() => moveChannel(channels.indexOf(chan), 1)} disabled={channels.indexOf(chan) === channels.length - 1} title="Move channel down"><span className="material-symbols-outlined">arrow_downward</span></button>
                    </div>}
                    <label className={styles.policyToggle}>
                      <input type="checkbox" checked={Boolean(chan.isLocked)} onChange={e => handleChannelPolicyChange(chan, { isLocked: e.target.checked })} />
                      Locked
                    </label>
                    <div className={styles.channelRolePicker} aria-label={`Allowed roles for ${chan.name}`}>
                      <span className={styles.pickerLabel}>ACCESS</span>
                      <div className={styles.roleCheckboxes}>
                        {roleEntries.map(([roleId, role]) => <label className={`${styles.roleCheckbox} ${(chan.allowedRoles || []).includes(roleId) ? styles.checked : ''}`} key={roleId}><input type="checkbox" checked={(chan.allowedRoles || []).includes(roleId)} onChange={event => handleChannelPolicyChange(chan, { allowedRoles: event.target.checked ? [...new Set([...(chan.allowedRoles || []), roleId])] : (chan.allowedRoles || []).filter(id => id !== roleId) })} /><span style={{ '--role-color': role.color || '#7dd3fc' }}>{role.name}</span></label>)}
                        {!roleEntries.length && <span className={styles.noRoles}>Everyone</span>}
                      </div>
                      <small>{allowedRoleNames(chan.allowedRoles)}</small>
                    </div>                      <button type="button" className={styles.actionBtn} onClick={() => {
                      setEditingChannel(chan.id);
                      setEditChannelName(chan.name);
                    }} title="Rename channel">
                      <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>edit</span>
                    </button>
                    <button type="button" className={styles.actionBtn} onClick={() => {
                      setSelectedTarget(chan.id);
                      setModalType('deleteChannel');
                    }} title="Delete channel">
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {visibleTab === 'roles' && (
          <div className={styles.tabContent}>
            <div className={styles.pageHeading}>
              <div>
                <p className={styles.eyebrow}>ACCESS CONTROL</p>
                <h1 className="text-display-xl">Manage Roles</h1>
                <p className={styles.sectionDescription}>Create roles for your community, choose what they can do, and assign them from the Members tab.</p>
              </div>
              <span className={styles.sectionCount}>{Object.keys(community?.roles || {}).length} roles</span>
            </div>

            {adminError && <div className={styles.adminAlert} role="alert"><span className="material-symbols-outlined">error</span><span>{adminError}</span><button type="button" onClick={() => setAdminError('')} aria-label="Dismiss error"><span className="material-symbols-outlined">close</span></button></div>}
            <form onSubmit={handleCreateRole} className={styles.roleCreateForm}>
              <div className={styles.formHeading}><svg className={styles.formHeadingIcon} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg><div><strong>Create a role</strong><span>Use a clear name members will recognize.</span></div></div>
              <div className={styles.roleFormGrid}>
                <label className={styles.fieldGroup}><span>ROLE NAME</span><input value={newRoleName} onChange={event => setNewRoleName(event.target.value)} placeholder="e.g. Event Host" maxLength={32} /></label>
                <label className={styles.fieldGroup}><span>ROLE COLOR</span><input className={styles.colorInput} type="color" value={newRoleColor} onChange={event => setNewRoleColor(event.target.value)} /></label>
              </div>
              <fieldset className={styles.permissionsFieldset}><legend>PERMISSIONS</legend><div className={styles.permissionGrid}>{rolePermissions.map(permission => <label className={styles.permissionOption} key={permission.id}><input type="checkbox" checked={newRolePermissions.includes(permission.id)} onChange={event => setNewRolePermissions(previous => event.target.checked ? [...previous, permission.id] : previous.filter(id => id !== permission.id))} /><span>{permission.label}</span></label>)}</div></fieldset>
              <button type="submit" className={styles.primaryAction} disabled={adminSaving}><span className="material-symbols-outlined">{adminSaving ? 'progress_activity' : 'add'}</span>{adminSaving ? 'Creating...' : 'Create role'}</button>
            </form>

            <div className={styles.roleList}>
              {Object.entries(community?.roles || {}).map(([roleId, role]) => (
                <article className={styles.roleCard} key={roleId}>
                  <div className={styles.roleCardHeader}>
                    <div className={styles.roleIdentity}><span className={styles.roleSwatch} style={{ backgroundColor: role.color || '#7dd3fc' }} /><div><strong>{role.name}</strong><span>@{roleId}</span></div></div>
                    <div className={styles.roleActions}>
                      <button className={styles.actionBtn} onClick={() => beginRoleEdit(roleId, role)} title={`Edit ${role.name}`}><span className="material-symbols-outlined">edit</span></button>
                      <button type="button" className={`${styles.actionBtn} ${styles.dangerAction}`} onClick={() => handleDeleteRole(roleId)} title={`Delete ${role.name}`}><span className="material-symbols-outlined">delete</span></button>
                    </div>
                  </div>
                  {editingRoleId === roleId ? (
                    <div className={styles.roleEditor}>
                      <div className={styles.roleFormGrid}><label className={styles.fieldGroup}><span>ROLE NAME</span><input value={editRoleName} onChange={event => setEditRoleName(event.target.value)} /></label><label className={styles.fieldGroup}><span>ROLE COLOR</span><input className={styles.colorInput} type="color" value={editRoleColor} onChange={event => setEditRoleColor(event.target.value)} /></label></div>
                      <fieldset className={styles.permissionsFieldset}><legend>PERMISSIONS</legend><div className={styles.permissionGrid}>{rolePermissions.map(permission => <label className={styles.permissionOption} key={permission.id}><input type="checkbox" checked={editRolePermissions.includes(permission.id)} onChange={event => setEditRolePermissions(previous => event.target.checked ? [...previous, permission.id] : previous.filter(id => id !== permission.id))} /><span>{permission.label}</span></label>)}</div></fieldset>
                      <div className={styles.editorActions}><button type="button" className={styles.secondaryAction} onClick={() => setEditingRoleId(null)}>Cancel</button><button type="button" className={styles.primaryAction} onClick={() => handleSaveRole(roleId)} disabled={adminSaving}><span className="material-symbols-outlined">{adminSaving ? 'progress_activity' : 'save'}</span>{adminSaving ? 'Saving...' : 'Save role'}</button></div>
                    </div>
                  ) : (
                    <div className={styles.roleSummary}><div className={styles.permissionChips}>{(role.permissions || []).length ? role.permissions.map(permission =>                        <span key={permission}>{rolePermissions.find(option => option.id === permission)?.label || permission}</span>) : <span>No special permissions</span>}</div><span className={styles.roleNote}>Custom role</span></div>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}

        {visibleTab === 'members' && (
          <div className={styles.tabContent}>
            <h1 className="text-display-xl">Member List</h1>
            <p className="text-body-md text-tertiary" style={{ marginBottom: '2rem' }}>{members.length} Members</p>
            
            <div className={styles.memberList}>
              {members.map(member => (
                <div key={member.uid} className={styles.memberItem}>
                  <div className={styles.memberInfo}>
                    <UserAvatar user={member} size="2.5rem" />
                    <div>
                      <p className="text-label-md">{member.displayName}</p>
                      <p className="text-label-sm text-tertiary">
                        {member.uid === community?.adminUid ? 'Owner' : roleLabelFor(member.uid)}
                      </p>
                    </div>
                  </div>
                  <div className={styles.memberActions}>
                    <div className={styles.memberRolePicker} aria-label={`Roles for ${member.displayName}`}>
                      <span className={styles.pickerLabel}>ROLES</span>
                      <div className={styles.roleCheckboxes}>
                        {canManageRoles && roleEntries.map(([roleId, role]) => <label className={`${styles.roleCheckbox} ${roleIdsFor(member.uid).includes(roleId) ? styles.checked : ''}`} key={roleId}><input type="checkbox" checked={roleIdsFor(member.uid).includes(roleId)} onChange={() => handleRoleChange(member.uid, roleId)} /><span style={{ '--role-color': role.color || '#7dd3fc' }}>{role.name}</span></label>)}
                        {!roleEntries.length && <span className={styles.noRoles}>No roles created yet</span>}
                        {roleEntries.length > 0 && !canManageRoles && <span className={styles.noRoles}>Role assignment requires role management permission</span>}
                      </div>
                      <small>{roleLabelFor(member.uid)}</small>
                    </div>
                    {member.uid !== community?.adminUid && (<>
                      <button className={styles.kickBtn} onClick={() => {
                        setSelectedTarget(member.uid);
                        setModalType('kick');
                      }}>Kick</button>
                      <button className={styles.banBtn} onClick={() => {
                        setSelectedTarget(member.uid);
                        setModalType('ban');
                      }}>Ban</button>
                      <button className={styles.kickBtn} onClick={() => {
                        setSelectedTarget(member.uid);
                        setModalType('timeout');
                      }}>Timeout</button>
                    </>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Custom Modals */}
      <Modal 
        isOpen={modalType === 'kick'} 
        onClose={() => setModalType(null)}
        title="Confirm Kick"
        footer={(
          <>
            <button className={styles.modalCancel} onClick={() => setModalType(null)}>Cancel</button>
            <button className={styles.modalConfirm} onClick={confirmKick}>Kick User</button>
          </>
        )}
      >
        <p className="text-body-md">Are you sure you want to kick this member? They will be able to rejoin with an invite link.</p>
      </Modal>

      <Modal 
        isOpen={modalType === 'deleteChannel'} 
        onClose={() => setModalType(null)}
        title="Delete Channel"
        footer={(
          <>
            <button className={styles.modalCancel} onClick={() => setModalType(null)}>Cancel</button>
            <button className={styles.modalConfirm} style={{ backgroundColor: 'var(--color-error)' }} onClick={confirmDeleteChannel}>Delete</button>
          </>
        )}
      >
        <p className="text-body-md">This will permanently remove the channel and all its messages. This action cannot be undone.</p>
      </Modal>

      <Modal 
        isOpen={modalType === 'ban'} 
        onClose={() => setModalType(null)}
        title="Ban Member"
        footer={(
          <>
            <button className={styles.modalCancel} onClick={() => setModalType(null)}>Cancel</button>
            <button className={styles.modalConfirm} style={{ backgroundColor: 'var(--color-error)' }} onClick={confirmBan}>Ban User</button>
          </>
        )}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p className="text-body-md">Are you sure you want to ban this member? They will lose access to this community.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label className="text-label-sm">BAN DURATION</label>
            <select 
              value={banDuration} 
              onChange={(e) => setBanDuration(e.target.value)}
              style={{
                padding: '0.75rem',
                background: 'rgba(255,255,255,0.05)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 'var(--radius-md)'
              }}
            >
              <option value="-1">Permanent</option>
              <option value="60">1 Hour</option>
              <option value="1440">24 Hours</option>
              <option value="10080">7 Days</option>
              <option value="43200">30 Days</option>
            </select>
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={modalType === 'timeout'}
        onClose={() => setModalType(null)}
        title="Timeout Member"
        footer={<button className={styles.modalCancel} onClick={() => setModalType(null)}>Cancel</button>}
      >
        <p className="text-body-md" style={{ marginBottom: '1rem' }}>How long should this member be timed out?</p>
        <div className={styles.timeoutGrid}>
          {TIMEOUT_OPTIONS.map(option => <button key={option.label} className={styles.timeoutOption} onClick={() => handleTimeout(selectedTarget, option.minutes)}>{option.label}</button>)}
        </div>
      </Modal>

      <Modal
        isOpen={modalType === 'success'} 
        onClose={() => setModalType(null)}
        title="Success"
        footer={<button className={styles.modalConfirm} onClick={() => setModalType(null)}>Done</button>}
      >
        <p className="text-body-md">Settings updated successfully!</p>
      </Modal>
    </div>
  );
}
