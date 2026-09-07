import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCall } from '../../contexts/CallContext';
import styles from './CallOverlay.module.css';

// roomId is `${communityId}-${channelId}`; both ids are Firestore auto-ids
// (alphanumeric, no dashes), so the first dash splits them safely.
function splitRoomId(roomId) {
  const separator = roomId.indexOf('-');
  if (separator < 0) return { communityId: roomId, channelId: '' };
  return { communityId: roomId.slice(0, separator), channelId: roomId.slice(separator + 1) };
}

// The call surface lives here, mounted once inside the app's main content
// column (AppLayout), so the embedded voice room is NEVER unmounted while the
// call is active - navigating away only shrinks it into the floating window.
// AppLayout keys this component per call session so a new call starts fresh.
//
// The big (expanded) view only ever exists on the voice channel's page, where
// it fills the chat canvas to the RIGHT of the channel sidebar - it never
// covers the channel list. Expanding while away from that page navigates there
// first. Anywhere else the call renders as the floating window (or the pill
// when minimized); geometry transitions are handled in CSS.
export default function CallOverlay() {
  const { activeCall, endCall } = useCall();
  const location = useLocation();
  const navigate = useNavigate();
  // expanded -> big view (only shown on the voice channel's page).
  // minimized -> collapsed to the bottom-left pill; the call keeps running.
  const [expanded, setExpanded] = useState(true);
  const [minimized, setIsMinimized] = useState(false);

  const { communityId, channelId } = useMemo(
    () => (activeCall ? splitRoomId(activeCall.roomId) : { communityId: '', channelId: '' }),
    [activeCall],
  );

  const onVoicePage = useMemo(
    () => Boolean(channelId) && location.pathname === `/channels/${communityId}/${channelId}`,
    [communityId, channelId, location.pathname],
  );

  if (!activeCall) return null;

  const showBig = expanded && onVoicePage;
  const containerClass = minimized ? styles.minimized : showBig ? styles.pane : styles.mini;
  const mirotalkUrl = `https://p2p.mirotalk.com/join/${activeCall.roomId}`;

  const expandToBig = () => {
    if (!onVoicePage && channelId) {
      navigate(`/channels/${communityId}/${channelId}`);
    }
    setExpanded(true);
  };

  return (
    <div className={`${styles.overlay} ${containerClass}`}>
      <div className={styles.header}>
        <div className={styles.info}><span className="material-symbols-outlined">headset_mic</span><span className="text-label-md">Voice channel</span></div>
        <div className={styles.actions}>
          {minimized ? (
            <button onClick={() => setIsMinimized(false)} title="Restore voice channel"><span className="material-symbols-outlined">expand_less</span></button>
          ) : showBig ? (
            <>
              <button onClick={() => setExpanded(false)} title="Use windowed view"><span className="material-symbols-outlined">fullscreen_exit</span></button>
              <button onClick={() => setIsMinimized(true)} title="Minimize voice channel"><span className="material-symbols-outlined">expand_more</span></button>
            </>
          ) : (
            <>
              <button onClick={expandToBig} title={onVoicePage ? 'Expand voice channel' : 'Open the voice channel page'}><span className="material-symbols-outlined">fullscreen</span></button>
              <button onClick={() => setIsMinimized(true)} title="Minimize voice channel"><span className="material-symbols-outlined">expand_more</span></button>
            </>
          )}
          <button onClick={endCall} className={styles.endBtn} title="Leave voice channel"><span className="material-symbols-outlined">call_end</span></button>
        </div>
      </div>
      <div className={styles.iframeContainer}><iframe key={activeCall.roomId} src={mirotalkUrl} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; webcam; microphone; display-capture" allowFullScreen title="Mirotalk voice channel" /></div>
    </div>
  );
}
