import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

const CallContext = createContext();

// A private call rings for this long before both sides drop it.
const RING_TIMEOUT_MS = 45000;

const callServices = () => import('../services/db');

export const CallProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [activeCall, setActiveCall] = useState(null);
  // Incremented on every startCall so the call surface can remount fresh per session.
  const [callSeq, setCallSeq] = useState(0);
  // A ring the other person has to answer before the call surface opens.
  const [incomingCall, setIncomingCall] = useState(null);
  const [outgoingCall, setOutgoingCall] = useState(null);
  // A ring that ended without connecting ("Call declined") stays on screen for
  // a moment so the caller sees why the widget is going away.
  const [outgoingNotice, setOutgoingNotice] = useState(null);
  const noticeTimerRef = useRef(0);
  const incomingRef = useRef(null);
  const outgoingRef = useRef(null);
  const activeCallRef = useRef(null);

  const showOutgoingNotice = useCallback(notice => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    setOutgoingNotice({ ...notice, key: Date.now() });
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = 0;
      setOutgoingNotice(null);
    }, 2400);
  }, []);

  useEffect(() => () => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
  }, []);

  const leaveParticipant = useCallback(participant => {
    if (!participant?.channelId || !participant?.uid) return;
    callServices().then(({ leaveVoiceChannel }) => {
      leaveVoiceChannel(participant.channelId, participant.uid).catch(() => {});
    });
  }, []);

  const setIncoming = useCallback(invite => {
    incomingRef.current = invite;
    setIncomingCall(invite);
  }, []);

  const setOutgoing = useCallback(invite => {
    outgoingRef.current = invite;
    setOutgoingCall(invite);
  }, []);

  const openCall = useCallback((roomId, type, participant) => {
    setCallSeq(sequence => sequence + 1);
    setActiveCall(previous => {
      leaveParticipant(previous?.participant);
      return { roomId, type, participant };
    });
  }, [leaveParticipant]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);



  // Community voice channels are rooms you walk into; there is nobody to ring.
  const startCall = (roomId, type = 'video', participant = null) => {
    setOutgoingNotice(null);
    const pending = outgoingRef.current;
    if (pending) {
      setOutgoing(null);
      callServices().then(({ cancelCallInvite }) => cancelCallInvite(pending.id)).catch(() => {});
    }
    setIncoming(null);
    openCall(roomId, type, participant);
  };

  // Private calls ring first: the call surface only opens once accepted, and the
  // caller waits in a "calling" card that can be cancelled.
  const startPrivateCall = async ({ roomId, type = 'voice', participant, calleeUid, calleeName, calleeAvatar }) => {
    setOutgoingNotice(null);
    const pending = outgoingRef.current;
    if (pending) {
      if (pending.roomId === roomId) return;
      setOutgoing(null);
      try {
        const { cancelCallInvite } = await callServices();
        await cancelCallInvite(pending.id);
      } catch {
        // A ring that is already gone needs no cleanup.
      }
    }
    const { createCallInvite } = await callServices();
    const id = await createCallInvite({
      callerUid: participant?.uid || currentUser?.uid,
      callerName: participant?.displayName || 'Someone',
      callerAvatar: participant?.avatarBase64 || '',
      calleeUid,
      calleeName,
      calleeAvatar,
      roomId,
      type
    });
    setOutgoing({ id, roomId, type, participant, calleeName: calleeName || 'Someone', calleeAvatar: calleeAvatar || '' });
  };

  const endCall = useCallback(() => {
    setActiveCall(previous => {
      leaveParticipant(previous?.participant);
      return null;
    });
  }, [leaveParticipant]);

  // Private calls are one-to-one: when the other person hangs up (or closes
  // their tab, which clears their roster entry), this side hangs up with them.
  const endCallRef = useRef(endCall);
  useEffect(() => {
    endCallRef.current = endCall;
  }, [endCall]);

  useEffect(() => {
    if (!activeCall?.roomId?.startsWith('pm-')) return undefined;
    const roomId = activeCall.roomId;
    const myUid = currentUser?.uid;
    let cancelled = false;
    // Only end on a departure once this call actually had two people in it, so
    // the gap before the other side joins cannot hang up a fresh call.
    let peerSeen = false;
    let unsubscribe = () => {};
    callServices().then(({ subscribeToVoiceParticipants }) => {
      if (cancelled) return;
      unsubscribe = subscribeToVoiceParticipants(allRooms => {
        if (cancelled) return;
        const others = Object.keys(allRooms?.[roomId] || {}).filter(uid => uid !== myUid);
        if (others.length) {
          peerSeen = true;
          return;
        }
        if (peerSeen) {
          peerSeen = false;
          endCallRef.current?.();
        }
      });
    }).catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [activeCall, currentUser?.uid]);

  const acceptIncomingCall = async () => {
    const invite = incomingRef.current;
    if (!invite) return;
    setIncoming(null);
    const participant = {
      uid: currentUser.uid,
      channelId: invite.roomId,
      displayName: currentUser.profile?.displayName || currentUser.displayName || 'User',
      avatarBase64: currentUser.profile?.avatarBase64 || ''
    };
    try {
      const { respondToCallInvite, joinVoiceChannel } = await callServices();
      await respondToCallInvite(invite.id, 'accepted');
      await joinVoiceChannel(invite.roomId, participant.uid, participant);
    } catch (error) {
      console.warn('Could not answer the private call:', error);
    }
    openCall(invite.roomId, invite.type || 'voice', participant);
  };

  const declineIncomingCall = async () => {
    const invite = incomingRef.current;
    setIncoming(null);
    if (!invite) return;
    try {
      const { respondToCallInvite } = await callServices();
      await respondToCallInvite(invite.id, 'declined');
    } catch (error) {
      console.warn('Could not decline the private call:', error);
    }
  };

  const cancelOutgoingCall = async () => {
    const call = outgoingRef.current;
    setOutgoing(null);
    if (!call) return;
    try {
      const { cancelCallInvite } = await callServices();
      await cancelCallInvite(call.id);
    } catch (error) {
      console.warn('Could not cancel the private call:', error);
    }
  };

  // Watch the callee's answer (accepted / declined / ring removed) and the
  // 45 second timeout.
  useEffect(() => {
    if (!outgoingCall?.id) return undefined;
    let cancelled = false;
    let settled = false;
    let unsubscribe = () => {};
    const timeout = window.setTimeout(() => {
      if (cancelled || settled) return;
      settled = true;
      setOutgoing(null);
      callServices().then(({ cancelCallInvite }) => cancelCallInvite(outgoingCall.id)).catch(() => {});
    }, RING_TIMEOUT_MS);

    callServices().then(({ subscribeToCallInvite, cancelCallInvite, joinVoiceChannel }) => {
      if (cancelled) return;
      unsubscribe = subscribeToCallInvite(outgoingCall.id, invite => {
        if (cancelled || settled) return;
        if (!invite) {
          settled = true;
          window.clearTimeout(timeout);
          setOutgoing(null);
          return;
        }
        if (invite.status === 'declined') {
          // The other side said no: keep the card up long enough to say so, then
          // clear the ring record.
          settled = true;
          window.clearTimeout(timeout);
          setOutgoing(null);
          showOutgoingNotice({ type: 'declined', name: outgoingCall.calleeName || 'They' });
          cancelCallInvite(outgoingCall.id).catch(() => {});
          return;
        }
        if (invite.status !== 'accepted') return;
        settled = true;
        window.clearTimeout(timeout);
        setOutgoing(null);
        const participant = outgoingCall.participant;
        joinVoiceChannel(outgoingCall.roomId, participant.uid, participant).catch(() => {});
        cancelCallInvite(outgoingCall.id).catch(() => {});
        openCall(outgoingCall.roomId, outgoingCall.type, participant);
      });
    }).catch(() => {});

    return () => {
      cancelled = true;
      unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [outgoingCall, openCall, setOutgoing, showOutgoingNotice]);

  // Listen for rings addressed to this account.
  useEffect(() => {
    if (!currentUser?.uid) {
      incomingRef.current = null;
      return undefined;
    }
    let cancelled = false;
    let unsubscribe = () => {};
    callServices().then(({ subscribeToIncomingCalls, respondToCallInvite }) => {
      if (cancelled) return;
      unsubscribe = subscribeToIncomingCalls(currentUser.uid, invite => {
        if (cancelled) return;
        if (!invite) {
          if (incomingRef.current) setIncoming(null);
          return;
        }
        if (incomingRef.current?.id === invite.id) return;
        if (outgoingRef.current || activeCallRef.current) {
          // Already ringing or on a call: turn the new ring down.
          respondToCallInvite(invite.id, 'declined').catch(() => {});
          return;
        }
        setIncoming(invite);
      });
    }).catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [currentUser?.uid, setIncoming]);

  // A stale ring from a previous account (or a caller who closed their tab)
  // must never show up for the current user.
  const activeIncomingCall = incomingCall && incomingCall.calleeUid === currentUser?.uid ? incomingCall : null;

  useEffect(() => {
    if (!activeIncomingCall) return undefined;
    const remaining = Math.max(0, Number(activeIncomingCall.createdAt) + RING_TIMEOUT_MS - Date.now());
    const timer = window.setTimeout(() => {
      if (incomingRef.current?.id === activeIncomingCall.id) setIncoming(null);
    }, remaining + 500);
    return () => window.clearTimeout(timer);
  }, [activeIncomingCall, setIncoming]);

  return (
    <CallContext.Provider
      value={{
        activeCall,
        callSeq,
        startCall,
        startPrivateCall,
        endCall,
        incomingCall: activeIncomingCall,
        outgoingCall,
        outgoingNotice,
        acceptIncomingCall,
        declineIncomingCall,
        cancelOutgoingCall
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => useContext(CallContext);
