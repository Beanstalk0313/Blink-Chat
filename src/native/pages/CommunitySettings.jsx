import { useEffect, useState } from 'react';
import { f7, Navbar, Page, PageContent, Toggle } from 'framework7-react';
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
} from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { compressAndConvert } from '../../services/utils';
import UserAvatar from '../../components/common/UserAvatar';
import ThemeSelect from '../../components/common/ThemeSelect';
import { useTheme } from '../../contexts/ThemeContext';
import { hasCommunityPermission, ROLE_PERMISSION_OPTIONS, normalizeRoleIds, buildMemberPermissions } from '../../services/permissions';
import { ROLE_BADGE_PRESETS } from '../../services/roleBadges';
import MenuButton from '../components/MenuButton';
import styles from './CommunitySettings.module.css';

const SETTINGS_TABS = ['general', 'channels', 'members', 'roles'];
export const COMMUNITY_SETTINGS_TAB_LABELS = {
  general: 'General',
  channels: 'Channels',
  members: 'Members',
  roles: 'Roles',
};

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
  { label: '15 minutes', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '24 hours', minutes: 1440 }
];

export default function CommunitySettings({ f7route }) {
  const { communityId } = f7route.params;
  const queryTab = f7route?.query?.tab;
  const { currentUser } = useAuth();
  const { setCommunityTheme } = useTheme();
  const [activeTab, setActiveTab] = useState(SETTINGS_TABS.includes(queryTab) ? queryTab : 'general');
  const [community, setCommunity] = useState(null);
  const [channels, setChannels] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adminError, setAdminError] = useState('');

  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [description, setDescription] = useState('');
  const [iconBase64, setIconBase64] = useState('');
  const [zoom, setZoom] = useState(1);
  const [originalFile, setOriginalFile] = useState(null);

  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState('text');
  const [newChannelLocked, setNewChannelLocked] = useState(false);
  const [newChannelSlowMode, setNewChannelSlowMode] = useState(0);
  const [newAllowedRoles, setNewAllowedRoles] = useState([]);
  const [autoModProfanity, setAutoModProfanity] = useState(false);
  const [autoModLinks, setAutoModLinks] = useState(false);
  const [systemJoinEnabled, setSystemJoinEnabled] = useState(false);
  const [systemLeaveEnabled, setSystemLeaveEnabled] = useState(false);
  const [systemChannelId, setSystemChannelId] = useState('');
  const [editingChannel, setEditingChannel] = useState(null);
  const [editChannelName, setEditChannelName] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#7dd3fc');
  const [newRolePermissions, setNewRolePermissions] = useState([]);
  const [newRoleBadge, setNewRoleBadge] = useState('spark');
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [editRoleName, setEditRoleName] = useState('');
  const [editRoleColor, setEditRoleColor] = useState('#7dd3fc');
  const [editRolePermissions, setEditRolePermissions] = useState([]);
  const [editRoleBadge, setEditRoleBadge] = useState('spark');

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

  // Keep in sync when the sidebar navigates to /community-settings/<id>/?tab=.
  // Adjusting state during render (React's documented pattern) avoids both
  // effects and stale state when the query changes on an existing instance.
  const [lastQueryTab, setLastQueryTab] = useState(queryTab);
  if (queryTab !== lastQueryTab) {
    setLastQueryTab(queryTab);
    if (SETTINGS_TABS.includes(queryTab)) setActiveTab(queryTab);
  }

  // Publish the section list to the app sidebar (modular sidebar).
  const allowedTabsKey = allowedTabs.join(',');
  useEffect(() => {
    if (!community) return undefined;
    const info = { communityId, communityName: community.name || 'Community', tabs: allowedTabs };
    window.__blinkCommunitySettings = info;
    window.dispatchEvent(new CustomEvent('blink:community-settings-updated', { detail: info }));
    return () => {
      if (window.__blinkCommunitySettings === info) delete window.__blinkCommunitySettings;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId, community?.name, allowedTabsKey]);

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
          const migrated = currentUser?.uid === comm.adminUid
            ? await migrateCommunityPermissions(communityId, comm).catch(() => comm)
            : comm;
          if (cancelled) return;
          setCommunity(migrated);
          setName(migrated.name || '');
          setDescription(migrated.description || '');
          setIconBase64(migrated.iconBase64 || '');
          setInviteCode(migrated.inviteCode || '');
          setAutoModProfanity(Boolean(migrated.autoMod?.profanity));
          setAutoModLinks(Boolean(migrated.autoMod?.links));
          setSystemJoinEnabled(Boolean(migrated.systemMessages?.joinEnabled));
          setSystemLeaveEnabled(Boolean(migrated.systemMessages?.leaveEnabled));
          setSystemChannelId(migrated.systemMessages?.channelId || '');
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

  const handleIconChange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      setOriginalFile(file);
      const base64 = await compressAndConvert(file, 200, 1);
      setIconBase64(base64);
    } catch (error) {
      setAdminError(error.message || 'Could not process that image.');
    }
  };

  const handleZoomChange = async event => {
    const nextZoom = parseFloat(event.target.value);
    setZoom(nextZoom);
    if (originalFile) {
      try {
        const base64 = await compressAndConvert(originalFile, 200, nextZoom);
        setIconBase64(base64);
      } catch (error) {
        console.error('Failed to resize community icon:', error);
      }
    }
  };

  const handleSaveGeneral = async event => {
    event.preventDefault();
    setSaving(true);
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
      f7.toast.create({ text: 'Settings saved', closeTimeout: 1500 }).open();
    } catch (err) {
      f7.dialog.alert(err.message || 'Failed to save settings.');
    }
    setSaving(false);
  };

  const handleAddChannel = async event => {
    event.preventDefault();
    if (!newChannelName.trim()) return;
    setAdminError('');
    try {
      await createChannel(communityId, newChannelName, newChannelType, {
        isLocked: newChannelLocked,
        slowModeSeconds: newChannelSlowMode,
        allowedRoles: newAllowedRoles
      });
      setNewChannelName('');
      setNewChannelType('text');
      setNewChannelLocked(false);
      setNewChannelSlowMode(0);
      setNewAllowedRoles([]);
      const chans = await getChannels(communityId);
      setChannels(chans);
    } catch (err) {
      setAdminError(err.message || 'Could not create channel.');
    }
  };

  const handleAddAnnouncement = async () => {
    const allowedRoles = Object.entries(community?.roles || {}).filter(([, role]) => (role.permissions || []).includes('manage_messages')).map(([id]) => id);
    if (!allowedRoles.length) { setAdminError('Create a moderator role with Manage messages first.'); return; }
    try { await createChannel(communityId, 'announcements', 'text', { isLocked: true, allowedRoles }); setChannels(await getChannels(communityId)); } catch (error) { setAdminError(error.message || 'Could not create announcement channel.'); }
  };

  const handleRenameChannel = async id => {
    if (!editChannelName.trim()) return;
    try {
      await updateChannel(id, { name: editChannelName });
      setChannels(channels.map(channel => channel.id === id ? { ...channel, name: editChannelName } : channel));
      setEditingChannel(null);
    } catch (err) {
      console.error(err);
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

  const handleTimeout = (uid, minutes) => {
    timeoutUser(communityId, uid, minutes)
      .then(() => setCommunity(previous => ({ ...previous, timedOutUsers: { ...(previous.timedOutUsers || {}), [uid]: Date.now() + minutes * 60000 } })))
      .catch(error => f7.dialog.alert(error.message || 'Could not apply the timeout.'));
  };

  const handleCreateRole = async event => {
    event.preventDefault();
    const trimmedName = newRoleName.trim();
    if (!trimmedName) return;
    try {
      const baseId = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'role';
      const roles = { ...(community.roles || {}) };
      let roleId = baseId;
      let suffix = 2;
      while (roles[roleId]) roleId = `${baseId}-${suffix++}`;
      roles[roleId] = { name: trimmedName, color: newRoleColor, badge: newRoleBadge, permissions: newRolePermissions };
      const memberPermissions = buildMemberPermissions(roles, community.memberRoles || {});
      await updateCommunity(communityId, { roles, memberPermissions });
      setCommunity(previous => ({ ...previous, roles, memberPermissions }));
      setNewRoleName('');
      setNewRolePermissions([]);
    } catch (error) {
      setAdminError(error.message || 'Could not create role.');
    }
  };

  const handleSaveRole = async roleId => {
    const trimmedName = editRoleName.trim();
    if (!trimmedName) return;
    try {
      const roles = { ...(community.roles || {}) };
      roles[roleId] = { ...roles[roleId], name: trimmedName, color: editRoleColor, badge: editRoleBadge, permissions: editRolePermissions };
      const memberPermissions = buildMemberPermissions(roles, community.memberRoles || {});
      await updateCommunity(communityId, { roles, memberPermissions });
      setCommunity(previous => ({ ...previous, roles, memberPermissions }));
      setEditingRoleId(null);
    } catch (error) {
      setAdminError(error.message || 'Could not save role.');
    }
  };

  const handleDeleteRole = async roleId => {
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

  const confirmKick = member => {
    f7.dialog.confirm(`Kick ${member.displayName}?`, 'Confirm kick', async () => {
      try {
        await kickUser(communityId, member.uid);
        setMembers(members.filter(entry => entry.uid !== member.uid));
      } catch (err) {
        console.error(err);
      }
    });
  };

  const confirmBan = member => {
    f7.dialog.confirm(`Ban ${member.displayName}?`, 'Ban member', async () => {
      try {
        await banUser(communityId, member.uid, -1);
        setMembers(members.filter(entry => entry.uid !== member.uid));
      } catch (err) {
        console.error(err);
      }
    });
  };

  const openTimeoutPicker = member => {
    const buttons = TIMEOUT_OPTIONS.map(option => ({ text: option.label, onClick: () => handleTimeout(member.uid, option.minutes) }));
    buttons.push({ text: 'Cancel', color: 'red' });
    f7.actions.create({ buttons }).open();
  };

  if (loading) return <Page className={styles.page}><div className={styles.center}><div className={styles.loader} /><p>Loading settings...</p></div></Page>;
  if (!community) return <Page className={styles.page}><div className={styles.center}><p>{adminError || 'Community settings are unavailable.'}</p></div></Page>;

  const roleEntries = Object.entries(community?.roles || {});
  const roleLabelFor = uid => {
    const roleNames = roleIdsFor(uid).map(roleId => community?.roles?.[roleId]?.name).filter(Boolean);
    return roleNames.length ? roleNames.join(', ') : 'No role assigned';
  };

  return (
    <Page className={styles.page}>
      <Navbar title="Community Settings" backLink="Back" backLinkShowText={false}>
        <MenuButton slot="left" />
      </Navbar>

      <PageContent className={styles.content}>
        {adminError && <div className={styles.errorBanner} role="alert">{adminError}<button type="button" onClick={() => setAdminError('')}><span className="material-symbols-outlined">close</span></button></div>}

        {visibleTab === 'general' && (
          <form onSubmit={handleSaveGeneral} className={styles.form}>
            <div className={styles.iconSection}>
              <label className={styles.iconPreview}>
                {iconBase64 ? <img src={iconBase64} alt="Preview" /> : <span>?</span>}
                <input type="file" onChange={handleIconChange} hidden />
              </label>
              <div className={styles.iconInfo}>
                <p>Community Icon</p>
                <small>Recommended size: 512x512px</small>
                {originalFile && (
                  <input type="range" min="1" max="3" step="0.1" value={zoom} onChange={handleZoomChange} />
                )}
              </div>
            </div>

            <div className={styles.field}><label>COMMUNITY NAME</label><input type="text" value={name} onChange={event => setName(event.target.value)} /></div>
            <div className={styles.field}><label>DESCRIPTION</label><textarea rows={4} value={description} onChange={event => setDescription(event.target.value)} /></div>

            {canManageCommunity && (
              <div className={styles.field}>
                <label>COMMUNITY THEME</label>
                <ThemeSelect value={community?.theme || 'default'} onChange={themeId => setCommunityTheme(communityId, themeId).then(() => setCommunity(previous => ({ ...previous, theme: themeId }))).catch(() => {})} label="COMMUNITY THEME" />
              </div>
            )}

            {canManageCommunity && (
              <div className={styles.settingBlock}>
                <p className={styles.settingTitle}>AUTO-MOD</p>
                <label className={styles.toggleRow}><span>Block profanity</span><Toggle checked={autoModProfanity} onToggleChange={setAutoModProfanity} /></label>
                <label className={styles.toggleRow}><span>Block links</span><Toggle checked={autoModLinks} onToggleChange={setAutoModLinks} /></label>
                <small className={styles.hint}>Messages that violate these filters are blocked from being sent.</small>
              </div>
            )}

            {canManageCommunity && (
              <div className={styles.settingBlock}>
                <p className={styles.settingTitle}>SYSTEM MESSAGES</p>
                <label className={styles.toggleRow}><span>Show when members join</span><Toggle checked={systemJoinEnabled} onToggleChange={setSystemJoinEnabled} /></label>
                <label className={styles.toggleRow}><span>Show when members leave</span><Toggle checked={systemLeaveEnabled} onToggleChange={setSystemLeaveEnabled} /></label>
                <label className={styles.field}>
                  <span>CHANNEL FOR SYSTEM MESSAGES</span>
                  <select className={styles.selectInput} value={systemChannelId} onChange={event => setSystemChannelId(event.target.value)}>
                    <option value="">None</option>
                    {channels.filter(channel => channel.type !== 'voice').map(channel => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
                  </select>
                </label>
                <small className={styles.hint}>Joined/left activity is posted to this channel when enabled.</small>
              </div>
            )}

            {canManageInvites && community?.isPrivate && (
              <div className={styles.field}>
                <label>INVITE CODE</label>
                <div className={styles.inviteRow}>
                  <input type="text" value={inviteCode} onChange={event => setInviteCode(event.target.value.toUpperCase())} placeholder="e.g. BLINK123" />
                  <button type="button" onClick={() => setInviteCode(Math.random().toString(36).substring(2, 10).toUpperCase())}>Regenerate</button>
                </div>
                <small className={styles.hint}>This code is required for users to join your private community.</small>
              </div>
            )}

            <button type="submit" className={styles.primaryBtn} disabled={saving || (!canManageCommunity && !canManageInvites)}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        )}

        {visibleTab === 'channels' && (
          <div className={styles.tabBody}>
            <form onSubmit={handleAddChannel} className={styles.addChannelForm}>
              <input type="text" placeholder="New channel name..." value={newChannelName} onChange={event => setNewChannelName(event.target.value)} />
              <select value={newChannelType} onChange={event => setNewChannelType(event.target.value)}>
                <option value="text">Text</option>
                <option value="voice">Voice</option>
              </select>
              <label className={styles.lockedToggle}>
                <span>Locked</span>
                <Toggle checked={newChannelLocked} onToggleChange={value => setNewChannelLocked(value)} />
              </label>
              <select className={styles.selectInput} value={newChannelSlowMode} onChange={event => setNewChannelSlowMode(Number(event.target.value))}>
                {SLOW_MODE_OPTIONS.map(option => <option key={option.seconds} value={option.seconds}>Slow mode: {option.label}</option>)}
              </select>
              {roleEntries.length > 0 && (
                <div className={styles.channelRoles}>
                  <span className={styles.channelRolesLabel}>WHO CAN MESSAGE</span>
                  <div className={styles.roleChips}>
                    {roleEntries.map(([roleId, role]) => {
                      const active = newAllowedRoles.includes(roleId);
                      return (
                        <button key={roleId} type="button" className={`${styles.roleChip} ${active ? styles.roleChipActive : ''}`} onClick={() => setNewAllowedRoles(previous => active ? previous.filter(id => id !== roleId) : [...previous, roleId])}>
                          {role.name}
                        </button>
                      );
                    })}
                  </div>
                  <small className={styles.hint}>{newAllowedRoles.length ? `Only: ${newAllowedRoles.map(id => community?.roles?.[id]?.name).filter(Boolean).join(', ')}` : 'Everyone can message.'}</small>
                </div>
              )}
              <button type="submit" disabled={!newChannelName.trim()}>Add channel</button>
            </form>
            <button type="button" onClick={handleAddAnnouncement}>Add announcement channel preset</button>

            <div className={styles.channelList}>
              {channels.map((channel, index) => (
                <div key={channel.id} className={styles.channelItem}>
                  <span className="material-symbols-outlined">{channel.type === 'voice' ? 'graphic_eq' : 'tag'}</span>
                  {editingChannel === channel.id ? (
                    <input
                      type="text"
                      value={editChannelName}
                      onChange={event => setEditChannelName(event.target.value)}
                      onBlur={() => handleRenameChannel(channel.id)}
                      onKeyDown={event => event.key === 'Enter' && handleRenameChannel(channel.id)}
                      autoFocus
                      className={styles.editChannelInput}
                    />
                  ) : (
                    <strong className={styles.channelName}>{channel.name}</strong>
                  )}
                  <div className={styles.channelActions}>
                    <button type="button" onClick={() => moveChannel(index, -1)} disabled={index === 0} title="Move up"><span className="material-symbols-outlined">arrow_upward</span></button>
                    <button type="button" onClick={() => moveChannel(index, 1)} disabled={index === channels.length - 1} title="Move down"><span className="material-symbols-outlined">arrow_downward</span></button>
                    <Toggle checked={Boolean(channel.isLocked)} onToggleChange={value => updateChannel(channel.id, { isLocked: value }).then(() => setChannels(previous => previous.map(item => item.id === channel.id ? { ...item, isLocked: value } : item))).catch(error => setAdminError(error.message || 'Could not update channel.'))} />
                    <select className={styles.selectInput} value={Number(channel.slowModeSeconds) || 0} onChange={event => updateChannel(channel.id, { slowModeSeconds: Number(event.target.value) }).then(() => setChannels(previous => previous.map(item => item.id === channel.id ? { ...item, slowModeSeconds: Number(event.target.value) } : item))).catch(error => setAdminError(error.message || 'Could not update channel.'))} title="Slow mode">
                      {SLOW_MODE_OPTIONS.map(option => <option key={option.seconds} value={option.seconds}>{option.label}</option>)}
                    </select>
                    <button type="button" onClick={() => { setEditingChannel(channel.id); setEditChannelName(channel.name); }} title="Rename"><span className="material-symbols-outlined">edit</span></button>
                    <button type="button" className={styles.dangerAction} onClick={() => f7.dialog.confirm(`Delete #${channel.name}? This cannot be undone.`, 'Delete channel', async () => {
                      try {
                        await deleteChannel(channel.id);
                        setChannels(channels.filter(entry => entry.id !== channel.id));
                      } catch (err) {
                        console.error(err);
                      }
                    })} title="Delete"><span className="material-symbols-outlined">delete</span></button>
                  </div>
                  {roleEntries.length > 0 && channel.type === 'text' && (
                    <div className={styles.channelRoles}>
                      <span className={styles.channelRolesLabel}>WHO CAN MESSAGE</span>
                      <div className={styles.roleChips}>
                        {roleEntries.map(([roleId, role]) => {
                          const active = (channel.allowedRoles || []).includes(roleId);
                          return (
                            <button key={roleId} type="button" className={`${styles.roleChip} ${active ? styles.roleChipActive : ''}`} onClick={() => {
                              const next = active ? (channel.allowedRoles || []).filter(id => id !== roleId) : [...(channel.allowedRoles || []), roleId];
                              updateChannel(channel.id, { allowedRoles: next })
                                .then(() => setChannels(previous => previous.map(item => item.id === channel.id ? { ...item, allowedRoles: next } : item)))
                                .catch(error => setAdminError(error.message || 'Could not update channel.'));
                            }}>
                              {role.name}
                            </button>
                          );
                        })}
                      </div>
                      <small className={styles.hint}>{(channel.allowedRoles || []).length ? `Only: ${(channel.allowedRoles || []).map(id => community?.roles?.[id]?.name).filter(Boolean).join(', ')}` : 'Everyone can message.'}</small>
                    </div>
                  )}
                </div>
              ))}
              {!channels.length && <p className={styles.hint}>No channels yet.</p>}
            </div>
          </div>
        )}

        {visibleTab === 'members' && (
          <div className={styles.tabBody}>
            <p className={styles.sectionMeta}>{members.length} Members</p>
            <div className={styles.memberList}>
              {members.map(member => (
                <div key={member.uid} className={styles.memberItem}>
                  <UserAvatar user={member} size="2.4rem" />
                  <div className={styles.memberInfo}>
                    <strong>{member.displayName}</strong>
                    <small>{member.uid === community?.adminUid ? 'Owner' : roleLabelFor(member.uid)}</small>
                  </div>
                  {member.uid !== community?.adminUid && (
                    <div className={styles.memberActions}>
                      {canManageRoles && roleEntries.length > 0 && (
                        <select value={roleIdsFor(member.uid)[0] || ''} onChange={event => handleRoleChange(member.uid, event.target.value)}>
                          <option value="">No role</option>
                          {roleEntries.map(([roleId, role]) => <option key={roleId} value={roleId}>{role.name}</option>)}
                        </select>
                      )}
                      <button type="button" onClick={() => openTimeoutPicker(member)}>Timeout</button>
                      <button type="button" onClick={() => confirmKick(member)}>Kick</button>
                      <button type="button" className={styles.dangerAction} onClick={() => confirmBan(member)}>Ban</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {visibleTab === 'roles' && (
          <div className={styles.tabBody}>
            <form onSubmit={handleCreateRole} className={styles.addChannelForm}>
              <input value={newRoleName} onChange={event => setNewRoleName(event.target.value)} placeholder="e.g. Event Host" maxLength={32} />
              <input type="color" value={newRoleColor} onChange={event => setNewRoleColor(event.target.value)} className={styles.colorInput} /><select value={newRoleBadge} onChange={event => setNewRoleBadge(event.target.value)}>{ROLE_BADGE_PRESETS.map(badge => <option key={badge} value={badge}>{badge}</option>)}</select>
              <button type="submit" disabled={!newRoleName.trim()}>Create role</button>
            </form>
            <div className={styles.roleCheckRow}>
              {ROLE_PERMISSION_OPTIONS.map(permission => (
                <label key={permission.id} className={`${styles.permChip} ${newRolePermissions.includes(permission.id) ? styles.permChipActive : ''}`}>
                  <input type="checkbox" checked={newRolePermissions.includes(permission.id)} onChange={event => setNewRolePermissions(previous => event.target.checked ? [...previous, permission.id] : previous.filter(id => id !== permission.id))} />
                  {permission.label}
                </label>
              ))}
            </div>

            <div className={styles.roleList}>
              {roleEntries.map(([roleId, role]) => (
                <article key={roleId} className={styles.roleCard}>
                  <div className={styles.roleHead}>
                    <span className={styles.roleSwatch} style={{ backgroundColor: role.color || '#7dd3fc' }} />
                    <div className={styles.roleIdentity}>
                      <strong>{role.name}</strong>
                      <small>@{roleId} · {(role.permissions || []).length} permissions</small>
                    </div>
                    <button type="button" onClick={() => { setEditingRoleId(roleId); setEditRoleName(role.name || ''); setEditRoleColor(role.color || '#7dd3fc'); setEditRolePermissions(role.permissions || []); setEditRoleBadge(role.badge || 'spark'); }}><span className="material-symbols-outlined">edit</span></button>
                    <button type="button" className={styles.dangerAction} onClick={() => handleDeleteRole(roleId)}><span className="material-symbols-outlined">delete</span></button>
                  </div>
                  {editingRoleId === roleId && (
                    <div className={styles.roleEditor}>
                      <input value={editRoleName} onChange={event => setEditRoleName(event.target.value)} />
                      <input type="color" value={editRoleColor} onChange={event => setEditRoleColor(event.target.value)} className={styles.colorInput} /><select value={editRoleBadge} onChange={event => setEditRoleBadge(event.target.value)}>{ROLE_BADGE_PRESETS.map(badge => <option key={badge} value={badge}>{badge}</option>)}</select>
                      <div className={styles.roleCheckRow}>
                        {ROLE_PERMISSION_OPTIONS.map(permission => (
                          <label key={permission.id} className={`${styles.permChip} ${editRolePermissions.includes(permission.id) ? styles.permChipActive : ''}`}>
                            <input type="checkbox" checked={editRolePermissions.includes(permission.id)} onChange={event => setEditRolePermissions(previous => event.target.checked ? [...previous, permission.id] : previous.filter(id => id !== permission.id))} />
                            {permission.label}
                          </label>
                        ))}
                      </div>
                      <div className={styles.editorActions}>
                        <button type="button" onClick={() => setEditingRoleId(null)}>Cancel</button>
                        <button type="button" className={styles.primaryBtn} onClick={() => handleSaveRole(roleId)}>Save role</button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
              {!roleEntries.length && <p className={styles.hint}>No roles created yet.</p>}
            </div>
          </div>
        )}
      </PageContent>
    </Page>
  );
}
