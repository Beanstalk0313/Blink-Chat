import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { subscribeToPrivateConversations, subscribeToUserChannelMessages } from '../services/db';
import { mentionsUser } from '../services/utils';
import { useAuth } from './AuthContext';

const NotificationContext = createContext();

const defaultSettings = { enabled: true, sound: true, desktop: true };

function readSettings(uid) {
  if (typeof window === 'undefined' || !uid) return defaultSettings;
  try {
    const saved = localStorage.getItem(`blink-notifications:${uid}`);
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export const NotificationProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const [settingsOverride, setSettingsOverride] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(() => (
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  ));
  const privateConversationState = useRef(new Map());
  const settings = settingsOverride?.uid === currentUser?.uid
    ? settingsOverride.value
    : readSettings(currentUser?.uid);

  const setSettings = updater => {
    const previous = settings;
    const next = typeof updater === 'function' ? updater(previous) : updater;
    setSettingsOverride({ uid: currentUser?.uid, value: next });
    if (currentUser?.uid) {
      try { localStorage.setItem(`blink-notifications:${currentUser.uid}`, JSON.stringify(next)); } catch { /* Storage may be blocked. */ }
    }
  };

  const notify = useCallback((title, body, icon) => {
    if (!settings.enabled) return;
    if (settings.sound) new Audio('/notification.mp3').play().catch(() => {});
    if (settings.desktop && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const options = { body, icon: icon || '/favicon.svg' };
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then(registration => registration.showNotification(title, options))
          .catch(() => new Notification(title, options));
      } else {
        new Notification(title, options);
      }
    }
  }, [settings.enabled, settings.sound, settings.desktop]);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return false;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    return permission === 'granted';
  }, []);

  useEffect(() => {
    if (!currentUser?.uid) return undefined;
    privateConversationState.current = new Map();
    return subscribeToPrivateConversations(currentUser.uid, conversations => {
      conversations.forEach(conversation => {
        const previousUpdatedAt = privateConversationState.current.get(conversation.id);
        const isNewIncomingMessage = previousUpdatedAt !== undefined &&
          conversation.updatedAt > previousUpdatedAt &&
          conversation.lastSenderUid !== currentUser.uid &&
          conversation.updatedAt > (conversation.lastReadAt?.[currentUser.uid] || 0);
        if (isNewIncomingMessage && !conversation.muted) {
          notify('Private message', conversation.lastMessage || 'You received a new private message.');
        }
        privateConversationState.current.set(conversation.id, conversation.updatedAt || 0);
      });
    });
  }, [currentUser?.uid, notify]);

  useEffect(() => {
    const uid = currentUser?.uid;
    const communityIds = currentUser?.profile?.joinedCommunities || [];
    if (!uid || !communityIds.length) return undefined;
    const preferences = currentUser.profile?.notificationPreferences || {};
    const displayName = currentUser.profile?.displayName?.trim().toLowerCase();

    return subscribeToUserChannelMessages(uid, communityIds, message => {
      if (message.authorUid === uid) return;
      if (preferences.communityMuted?.[message.communityId]) return;
      const mode = preferences.channelModes?.[message.channelId] || 'mentions';
      if (mode === 'none') return;

      const isMention = mentionsUser(message.text, displayName);
      if (mode !== 'all' && !isMention) return;

      const isCurrentChannel = location.pathname === `/channels/${message.communityId}/${message.channelId}`;
      if (isCurrentChannel && document.visibilityState === 'visible' && document.hasFocus()) return;
      notify(`#${message.channelName || 'chat'}`, message.text || 'New attachment');
    });
  }, [currentUser?.uid, currentUser?.profile?.joinedCommunities, currentUser?.profile?.notificationPreferences, currentUser?.profile?.displayName, location.pathname, notify]);

  return <NotificationContext.Provider value={{ settings, setSettings, notify, notificationPermission, requestNotificationPermission }}>{children}</NotificationContext.Provider>;
};

export const useNotifications = () => useContext(NotificationContext);
