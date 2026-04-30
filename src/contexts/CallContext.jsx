import React, { createContext, useContext, useState } from 'react';

const CallContext = createContext();

export const CallProvider = ({ children }) => {
  const [activeCall, setActiveCall] = useState(null);

  const startCall = (roomId, type = 'video') => {
    setActiveCall({ roomId, type, isHidden: false });
  };

  const hideCall = () => {
    setActiveCall(prev => prev ? { ...prev, isHidden: true } : null);
  };

  const showCall = () => {
    setActiveCall(prev => prev ? { ...prev, isHidden: false } : null);
  };

  const endCall = () => {
    setActiveCall(null);
  };

  return (
    <CallContext.Provider value={{ activeCall, startCall, hideCall, showCall, endCall }}>
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => useContext(CallContext);
