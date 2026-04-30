import React, { useState } from 'react';
import { useCall } from '../../contexts/CallContext';
import styles from './CallOverlay.module.css';

const CallOverlay = () => {
  const { activeCall, endCall } = useCall();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (!activeCall) return null;

  const mirotalkUrl = `https://p2p.mirotalk.com/join/${activeCall.roomId}`;

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    setIsMinimized(false);
  };

  // We use CSS visibility/display to keep the iframe alive
  const containerStyle = {
    display: activeCall.isHidden ? 'none' : 'flex'
  };

  return (
    <div 
      className={`
        ${styles.overlay} 
        ${isMinimized ? styles.minimized : ''} 
        ${isFullscreen ? styles.fullscreen : ''}
      `}
      style={containerStyle}
    >
      <div className={styles.header}>
        <div className={styles.info}>
          <span className="material-symbols-outlined">call</span>
          <span className="text-label-md">Live Call: {activeCall.roomId}</span>
        </div>
        <div className={styles.actions}>
          <button onClick={toggleFullscreen} title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
            <span className="material-symbols-outlined">{isFullscreen ? 'fullscreen_exit' : 'fullscreen'}</span>
          </button>
          <button onClick={() => setIsMinimized(!isMinimized)} title={isMinimized ? "Expand" : "Minimize"}>
            <span className="material-symbols-outlined">{isMinimized ? 'expand_less' : 'expand_more'}</span>
          </button>
          <button onClick={endCall} className={styles.endBtn} title="End Call">
            <span className="material-symbols-outlined">call_end</span>
          </button>
        </div>
      </div>
      <div 
        className={styles.iframeContainer} 
        style={{ display: isMinimized ? 'none' : 'block' }}
      >
        <iframe 
          src={mirotalkUrl} 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; webcam; microphone; display-capture" 
          allowFullScreen
          title="Mirotalk Call"
        />
      </div>
    </div>
  );
};

export default CallOverlay;
