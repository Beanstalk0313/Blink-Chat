import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getCachedMessages, subscribeToPrivateConversations, subscribeToUserChannelMessages } from '../services/db';
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
  // Tracked in a ref so the channel subscription does not tear down and re-read
  // every channel on each navigation (the gap between teardown and the new
  // subscription could swallow an incoming reply or mention).
  const pathnameRef = useRef(location.pathname);
  // One shared, preloaded audio element for notification sounds. Creating a
  // fresh Audio per notification throws away the element's autoplay unlock and
  // can drop the sound entirely, and it re-decodes the file every time.
  const notificationAudioRef = useRef(null);
  const pendingSoundRef = useRef(false);
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

  const playNotificationSound = useCallback(() => {
    if (typeof Audio === 'undefined') return;
    let audio = notificationAudioRef.current;
    if (!audio) {
      audio = new Audio('/notification.mp3');
      audio.preload = 'auto';
      notificationAudioRef.current = audio;
    }
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch { /* Seeking before metadata loads is harmless. */ }
    let result;
    try {
      result = audio.play();
    } catch {
      pendingSoundRef.current = true;
      return;
    }
    if (result?.then) {
      result
        .then(() => { pendingSoundRef.current = false; })
        .catch(() => { pendingSoundRef.current = true; });
    } else {
      pendingSoundRef.current = false;
    }
  }, []);

  // Browsers (iOS Safari especially) only allow audio once the page has had a
  // user gesture. Warm the shared element up on the first gesture and replay a
  // sound that was blocked, so a reply arriving before the first tap still
  // rings as soon as the user touches the page.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return undefined;
    if (!notificationAudioRef.current) {
      const audio = new Audio('/notification.mp3');
      audio.preload = 'auto';
      notificationAudioRef.current = audio;
    }
    let unlocked = false;
    const unlock = () => {
      const audio = notificationAudioRef.current;
      if (audio && !unlocked) {
        unlocked = true;
        const wasMuted = audio.muted;
        audio.muted = true;
        const attempt = audio.play();
        const restore = () => {
          // A real notification may have taken the element over in the
          // meantime; only undo our own muted warm-up play.
          if (!audio.muted) return;
          audio.pause();
          audio.muted = wasMuted;
          try { audio.currentTime = 0; } catch { /* ignore */ }
        };
        if (attempt?.then) attempt.then(restore).catch(() => { audio.muted = wasMuted; });
        else restore();
      }
      if (pendingSoundRef.current) {
        pendingSoundRef.current = false;
        playNotificationSound();
      }
    };
    const events = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach(eventName => window.addEventListener(eventName, unlock, true));
    return () => {
      events.forEach(eventName => window.removeEventListener(eventName, unlock, true));
      notificationAudioRef.current = null;
    };
  }, [playNotificationSound]);

  const notify = useCallback((title, body, icon) => {
    if (!settings.enabled) return;
    if (settings.sound) playNotificationSound();
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
  }, [settings.enabled, settings.sound, settings.desktop, playNotificationSound]);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return false;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    return permission === 'granted';
  }, []);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    if (!currentUser?.uid) return undefined;
    privateConversationState.current = new Map();
    return subscribeToPrivateConversations(currentUser.uid, conversations => {
      conversations.forEach(conversation => {
        const previousUpdatedAt = privateConversationState.current.get(conversation.id);
        const isNewIncomingMessage = previousUpdatedAt !== undefined &&
          conversation.updatedAt > previousUpdatedAt &&
          conversation.lastSenderUid !== currentUser.uid &&
          // lastReadAt is a scalar on the per-user index (see getPrivateConversations),
          // not a { uid: timestamp } map: reading it as an object made this
          // comparison "updatedAt > 0", so conversations already read on another
          // device still raised a notification.
          conversation.updatedAt > (conversation.lastReadAt || 0);
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
      // Join/leave system messages are in-channel announcements, not
      // notification-worthy activity.
      if (message.system) return;
      if (preferences.communityMuted?.[message.communityId]) return;
      const mode = preferences.channelModes?.[message.channelId] || 'mentions';
      if (mode === 'none') return;

      const isMention = mentionsUser(message.text, displayName);
      // A reply is stored with the target message's author, but that field is
      // optional in the rules and older clients may not have written it, so
      // fall back to the in-memory cache of the channel when possible.
      const isReplyToMe = (() => {
        if (!message.replyTo?.id) return false;
        if (message.replyTo.authorUid) return message.replyTo.authorUid === uid;
        return getCachedMessages(message.channelId)
          .some(cached => cached.id === message.replyTo.id && cached.authorUid === uid);
      })();
      if (mode !== 'all' && !isMention && !isReplyToMe) return;

      const isCurrentChannel = pathnameRef.current === `/channels/${message.communityId}/${message.channelId}`;
      if (isCurrentChannel && document.visibilityState === 'visible' && document.hasFocus()) return;
      notify(`#${message.channelName || 'chat'}`, message.text || 'New attachment');
    });
  }, [currentUser?.uid, currentUser?.profile?.joinedCommunities, currentUser?.profile?.notificationPreferences, currentUser?.profile?.displayName, notify]);

  return <NotificationContext.Provider value={{ settings, setSettings, notify, notificationPermission, requestNotificationPermission }}>{children}</NotificationContext.Provider>;
};

export const useNotifications = () => useContext(NotificationContext);
