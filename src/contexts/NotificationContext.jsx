import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState({
    enabled: true,
    sound: true,
    desktop: true
  });

  useEffect(() => {
    // Request notification permission on mount
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const notify = (title, body, icon) => {
    if (!settings.enabled) return;

    // Play Sound
    if (settings.sound) {
      const audio = new Audio('/notification.mp3');
      audio.play().catch(e => console.error("Sound play failed:", e));
    }

    // Show Desktop Notification
    if (settings.desktop && Notification.permission === 'granted') {
      new Notification(title, { body, icon });
    }
  };

  return (
    <NotificationContext.Provider value={{ settings, setSettings, notify }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);
