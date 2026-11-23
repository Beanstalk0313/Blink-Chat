import { useEffect, useState } from 'react';
import { useCall } from '../../contexts/CallContext';
import UserAvatar from './UserAvatar';
import { startRingtone } from '../../services/ringtone';
import styles from './CallRinging.module.css';

// The ringing card. It rises from the bottom of the screen as just the other
// person's photo, then grows into the full card with their name and the answer
// / cancel buttons. An incoming ring shows the caller; an outgoing one shows
// the person being called.
export default function CallRinging() {
  const { activeCall, incomingCall, outgoingCall, outgoingNotice, acceptIncomingCall, declineIncomingCall, cancelOutgoingCall } = useCall();
  // Which ring has finished growing. Keyed by ring id so a new call starts
  // collapsed without needing to reset state from an effect.
  const [expandedFor, setExpandedFor] = useState(null);
  const [reducedMotion] = useState(() => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  const visibleId = incomingCall?.id || outgoingCall?.id || outgoingNotice?.key || null;

  // The two ends hear different things: a chime for the person being called,
  // a quiet ringback for the person waiting.
  useEffect(() => {
    if (activeCall || (!incomingCall && !outgoingCall)) return undefined;
    return startRingtone(incomingCall ? 'incoming' : 'outgoing');
  }, [activeCall, incomingCall, outgoingCall]);

  useEffect(() => {
    if (!visibleId || outgoingNotice || reducedMotion) return undefined;
    // The photo gets a beat on its own before the card unfolds around it.
    const timer = window.setTimeout(() => setExpandedFor(visibleId), 780);
    return () => window.clearTimeout(timer);
  }, [visibleId, outgoingNotice, reducedMotion]);

  // A decline notice appears in the card that is already open, and reduced
  // motion skips the staged expansion entirely.
  const expanded = Boolean(outgoingNotice) || reducedMotion || expandedFor === visibleId;

  if (activeCall || (!incomingCall && !outgoingCall && !outgoingNotice)) return null;

  const avatarUser = incomingCall
    ? { uid: incomingCall.callerUid, displayName: incomingCall.callerName, avatarBase64: incomingCall.callerAvatar }
    : outgoingCall
      ? { uid: outgoingCall.roomId || 'callee', displayName: outgoingCall.calleeName, avatarBase64: outgoingCall.calleeAvatar }
      : { displayName: outgoingNotice.name };

  const title = incomingCall?.callerName || outgoingCall?.calleeName || outgoingNotice?.name || 'Call';
  const subtitle = incomingCall
    ? 'is calling you'
    : outgoingCall
      ? 'Calling…'
      : (outgoingNotice?.type === 'declined' ? 'Call declined' : 'Call ended');

  const className = [
    styles.ring,
    expanded ? styles.expanded : styles.compact,
    outgoingNotice ? styles.notice : ''
  ].filter(Boolean).join(' ');

  return (
    <div
      className={className}
      role={incomingCall ? 'dialog' : 'status'}
      aria-live={incomingCall ? 'assertive' : 'polite'}
      aria-label={incomingCall ? `Incoming call from ${title}` : `${title}: ${subtitle}`}
    >
      <div className={styles.avatarStage}>
        <UserAvatar user={avatarUser} size="3rem" />
        {!incomingCall && !outgoingNotice && (
          <span className={`${styles.callBadge} material-symbols-outlined`} aria-hidden="true">call</span>
        )}
      </div>
      <div className={styles.body}>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <div className={styles.actions}>
        {incomingCall && (
          <>
            <button type="button" className={styles.decline} onClick={declineIncomingCall} title="Decline call" aria-label="Decline call">
              <span className="material-symbols-outlined">call_end</span>
            </button>
            <button type="button" className={styles.accept} onClick={acceptIncomingCall} title="Accept call" aria-label="Accept call">
              <span className="material-symbols-outlined">call</span>
            </button>
          </>
        )}
        {outgoingCall && (
          <button type="button" className={styles.decline} onClick={cancelOutgoingCall} title="Cancel call" aria-label="Cancel call">
            <span className="material-symbols-outlined">call_end</span>
          </button>
        )}
      </div>
    </div>
  );
}
