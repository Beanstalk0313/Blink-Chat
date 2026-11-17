import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCommunity } from '../../services/db';
import { inviteLinkFor } from '../../services/invites';
import styles from './CommunityInviteCard.module.css';

// The invite is stored on the message as data (not as text with a URL), so it
// renders as a real embed: live name, icon and description, and a Join button.
// The join target reuses the same link builder as Share, so a private
// community's code travels with the button.
export default function CommunityInviteCard({ invite }) {
  const navigate = useNavigate();
  const [live, setLive] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!invite?.communityId) return undefined;
    let cancelled = false;
    getCommunity(invite.communityId)
      .then(community => {
        if (cancelled) return;
        if (community) setLive(community);
        else setMissing(true);
      })
      .catch(() => { if (!cancelled) setMissing(true); });
    return () => { cancelled = true; };
  }, [invite?.communityId]);

  if (!invite?.communityId) return null;

  const name = live?.name || invite.name || 'Community';
  const description = live?.description || invite.description || '';
  const icon = live?.iconBase64 || '';
  const target = inviteLinkFor({
    origin: '',
    communityId: invite.communityId,
    community: { isPrivate: invite.isPrivate, inviteCode: invite.joincode }
  });

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        {icon ? <img className={styles.icon} src={icon} alt="" /> : (
          <span className={styles.iconPlaceholder}><span className="material-symbols-outlined">groups</span></span>
        )}
        <span>
          <strong className={styles.name}>{name}</strong>
          <span className={styles.subtitle}>COMMUNITY INVITE</span>
        </span>
      </div>
      {description && <p className={styles.description}>{description}</p>}
      {missing ? (
        <p className={styles.missing}>This community is no longer available.</p>
      ) : (
        <button type="button" className={styles.join} onClick={() => navigate(target)}>Join community</button>
      )}
    </div>
  );
}
