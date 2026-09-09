import { roleBadgeUrl } from '../../services/roleBadges';
export default function RoleBadge({ role, size = '0.9em' }) {
  const src = roleBadgeUrl(role?.badge);
  return src ? <img src={src} alt="" aria-hidden="true" style={{ width: size, height: size, objectFit: 'contain', verticalAlign: '-0.12em', marginRight: '0.25em' }} /> : null;
}
