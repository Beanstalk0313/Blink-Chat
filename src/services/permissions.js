export const ALL_PERMISSIONS = [
  'manage_channels',
  'manage_roles',
  'manage_members',
  'manage_messages',
  'manage_community',
  'manage_voice',
  'manage_invites'
];

export const ROLE_PERMISSION_OPTIONS = [
  { id: 'manage_channels', label: 'Manage channels', description: 'Create, edit, delete, and reorder channels.' },
  { id: 'manage_roles', label: 'Manage roles', description: 'Create roles, edit permissions, and assign roles.' },
  { id: 'manage_members', label: 'Manage members', description: 'Kick, ban, timeout, and review members.' },
  { id: 'manage_messages', label: 'Manage messages', description: 'Delete and moderate messages.' },
  { id: 'manage_community', label: 'Manage community', description: 'Edit the community profile, theme, and settings.' },
  { id: 'manage_voice', label: 'Manage voice', description: 'Manage voice-channel access and rooms.' },
  { id: 'manage_invites', label: 'Manage invites', description: 'Create and rotate community invite links.' }
];

export function normalizeRoleIds(value) {
  if (Array.isArray(value)) return Array.from(new Set(value.filter(Boolean)));
  return value ? [value] : [];
}

export function normalizeRole(role = {}) {
  return {
    name: role.name || 'Unnamed role',
    color: role.color || '#7dd3fc',
    badge: role.badge || 'spark',
    permissions: Array.from(new Set((role.permissions || []).filter(permission => ALL_PERMISSIONS.includes(permission))))
  };
}

export function normalizeRoles(roles = {}) {
  return Object.fromEntries(Object.entries(roles).map(([roleId, role]) => [roleId, normalizeRole(role)]));
}

export function getMemberRoleIds(community, uid) {
  return normalizeRoleIds(community?.memberRoles?.[uid]);
}

export function getMemberPermissions(community, uid) {
  if (!uid) return [];
  if (community?.adminUid === uid) return [...ALL_PERMISSIONS];

  const permissions = new Set();
  const storedPermissions = community?.memberPermissions?.[uid];
  if (storedPermissions) {
    Object.entries(storedPermissions)
      .filter(([, enabled]) => enabled === true)
      .map(([permission]) => permission)
      .forEach(permission => permissions.add(permission));
  }

  getMemberRoleIds(community, uid).forEach(roleId => {
    normalizeRole(community?.roles?.[roleId]).permissions.forEach(permission => permissions.add(permission));
  });

  return [...permissions].filter(permission => ALL_PERMISSIONS.includes(permission));
}

export function hasCommunityPermission(community, uid, permission) {
  return getMemberPermissions(community, uid).includes(permission);
}

export function buildMemberPermissions(roles = {}, memberRoles = {}) {
  const normalizedRoles = normalizeRoles(roles);
  return Object.fromEntries(Object.entries(memberRoles).map(([uid, value]) => {
    const permissions = new Set();
    normalizeRoleIds(value).forEach(roleId => {
      normalizedRoles[roleId]?.permissions.forEach(permission => permissions.add(permission));
    });
    return [uid, Object.fromEntries([...permissions].map(permission => [permission, true]))];
  }));
}

function roleMatches(role, name) {
  return normalizeRole(role).name.toLowerCase() === name.toLowerCase();
}

function nextRoleId(roles, baseId) {
  let roleId = baseId;
  let suffix = 2;
  while (roles[roleId]) roleId = `${baseId}-${suffix++}`;
  return roleId;
}

export function migrateLegacyCommunity(community) {
  const roles = normalizeRoles(community?.roles || {});
  const originalRoles = JSON.stringify(community?.roles || {});
  const memberRoles = Object.fromEntries(Object.entries(community?.memberRoles || {}).map(([uid, value]) => [uid, normalizeRoleIds(value)]));
  let changed = JSON.stringify(roles) !== originalRoles;
  const roleRemap = {};

  const legacyDefinitions = [
    { id: 'admin', name: 'Community Manager', legacyName: 'Admin', permissions: [...ALL_PERMISSIONS] },
    { id: 'moderator', name: 'Message Moderator', legacyName: 'Moderator', permissions: ['manage_messages'] },
    { id: 'member', name: null, legacyName: 'Member', permissions: [] }
  ];

  legacyDefinitions.forEach(({ id, name, legacyName, permissions }) => {
    const legacyRole = roles[id];
    if (!legacyRole) return;
    const isLegacy = roleMatches(legacyRole, legacyName);
    if (!isLegacy) return;

    if (name) {
      const replacementId = nextRoleId(roles, id === 'admin' ? 'community-manager' : 'message-moderator');
      roles[replacementId] = { name, color: legacyRole.color, permissions };
      roleRemap[id] = replacementId;
    } else {
      roleRemap[id] = null;
    }
    delete roles[id];
    changed = true;
  });

  Object.keys(memberRoles).forEach(uid => {
    const nextIds = memberRoles[uid].map(roleId => roleId in roleRemap ? roleRemap[roleId] : roleId).filter(Boolean);
    if (JSON.stringify(nextIds) !== JSON.stringify(memberRoles[uid])) changed = true;
    if (nextIds.length) memberRoles[uid] = nextIds;
    else delete memberRoles[uid];
  });

  const legacyCoAdmins = normalizeRoleIds(community?.coAdmins);
  if (legacyCoAdmins.length) {
    const managerId = Object.keys(roles).find(roleId => roles[roleId].name === 'Community Manager') || nextRoleId(roles, 'community-manager');
    if (!roles[managerId]) roles[managerId] = { name: 'Community Manager', color: '#f59e0b', permissions: [...ALL_PERMISSIONS] };
    legacyCoAdmins.forEach(uid => {
      memberRoles[uid] = Array.from(new Set([...(memberRoles[uid] || []), managerId]));
    });
    changed = true;
  }

  const memberPermissions = buildMemberPermissions(roles, memberRoles);
  if (JSON.stringify(memberPermissions) !== JSON.stringify(community?.memberPermissions || {})) changed = true;
  if (!changed) return null;

  return {
    roles,
    memberRoles,
    memberPermissions,
    removeLegacyCoAdmins: legacyCoAdmins.length > 0
  };
}
