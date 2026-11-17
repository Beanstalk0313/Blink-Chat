import { useCall } from '../../contexts/CallContext';
import UserAvatar from './UserAvatar';
import styles from './CallRinging.module.css';

// The ringing card: incoming calls are answered or declined here, and an
// outgoing call can be cancelled while the other person's device is ringing.
// Nothing joins the room until the call is accepted.
export default function CallRinging() {
  const { activeCall, incomingCall, outgoingCall, acceptIncomingCall, declineIncomingCall, cancelOutgoingCall } = useCall();

  if (activeCall || (!incomingCall && !outgoingCall)) return null;

  if (incomingCall) {
    return (
      <div className={styles.ring} role="dialog" aria-live="assertive" aria-label="Incoming call">
        <UserAvatar
          user={{ uid: incomingCall.callerUid, displayName: incomingCall.callerName, avatarBase64: incomingCall.callerAvatar }}
          size="2.75rem"
        />
        <div className={styles.body}>
          <strong>{incomingCall.callerName}</strong>
          <span>is calling you</span>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.decline} onClick={declineIncomingCall} title="Decline call" aria-label="Decline call">
            <span className="material-symbols-outlined">call_end</span>
          </button>
          <button type="button" className={styles.accept} onClick={acceptIncomingCall} title="Accept call" aria-label="Accept call">
            <span className="material-symbols-outlined">call</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.ring} role="status" aria-live="polite">
      <span className={styles.pulse} aria-hidden="true">
        <span className="material-symbols-outlined">call</span>
      </span>
      <div className={styles.body}>
        <strong>{outgoingCall.calleeName}</strong>
        <span>Calling…</span>
      </div>
      <button type="button" className={styles.decline} onClick={cancelOutgoingCall} title="Cancel call" aria-label="Cancel call">
        <span className="material-symbols-outlined">call_end</span>
      </button>
    </div>
  );
}
