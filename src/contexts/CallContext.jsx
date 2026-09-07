import { createContext, useContext, useState } from 'react';

const CallContext = createContext();

export const CallProvider = ({ children }) => {
  const [activeCall, setActiveCall] = useState(null);
  // Incremented on every startCall so the call surface can remount fresh per session.
  const [callSeq, setCallSeq] = useState(0);

  const leaveParticipant = participant => {
    if (!participant?.channelId || !participant?.uid) return;
    import('../services/db').then(({ leaveVoiceChannel }) => {
      leaveVoiceChannel(participant.channelId, participant.uid).catch(() => {});
    });
  };

  const startCall = (roomId, type = 'video', participant = null) => {
    setCallSeq(sequence => sequence + 1);
    setActiveCall(previous => {
      leaveParticipant(previous?.participant);
      return { roomId, type, participant };
    });
  };

  const endCall = () => {
    setActiveCall(previous => {
      leaveParticipant(previous?.participant);
      return null;
    });
  };

  return (
    <CallContext.Provider value={{ activeCall, callSeq, startCall, endCall }}>
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => useContext(CallContext);
