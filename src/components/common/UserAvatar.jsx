import { getColor } from '../../services/utils';

const UserAvatar = ({ user, size = '2.5rem', className = '' }) => {
  const displayName = user?.displayName || user?.profile?.displayName || user?.email?.split('@')[0] || 'User';
  const avatarBase64 = user?.avatarBase64 || user?.profile?.avatarBase64;
  
  const firstLetter = displayName.charAt(0).toUpperCase();
  const backgroundColor = getColor(displayName);

  const style = {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: `calc(${size} * 0.4)`,
    fontWeight: '700',
    color: 'white',
    backgroundColor: backgroundColor,
    flexShrink: 0,
    overflow: 'hidden',
    position: 'relative'
  };

  if (avatarBase64) {
    return (
      <div className={className} style={style}>
        <img src={avatarBase64} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  return (
    <div className={className} style={style}>
      {firstLetter}
    </div>
  );
};

export default UserAvatar;
