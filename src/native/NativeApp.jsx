import { useEffect } from 'react';
import { f7, App } from 'framework7-react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import NativeShell from './components/NativeShell';
import NativeCallProvider from './components/NativeCallProvider';
import { nativeRoutes } from './routes';
import { applyDeviceMarkers, detectNativeDevice, getOsOverride, setFramework7Device } from './device';
import './native.css';
import './f7-plugin';

// NotificationProvider assumes an authenticated user (the regular app only
// mounts it inside AuthenticatedShell). The native shell also renders while
// logged out, so gate the provider until a user exists.
function NativeNotificationGate({ children }) {
  const { currentUser } = useAuth();
  if (!currentUser) return children;
  return <NotificationProvider>{children}</NotificationProvider>;
}

// Framework7 handles the mobile UI. `theme: 'auto'` applies the iOS theme on
// iOS devices and the Material theme everywhere else, including Android. The
// `?os=ios` desktop-testing override (see device.js) forces the iOS theme.
const osOverride = getOsOverride();
const f7Params = {
  name: 'Blink Chat',
  theme: osOverride === 'ios' ? 'ios' : 'auto',
  darkMode: true,
  colors: { primary: '#4b8eff' },
  routes: nativeRoutes,
  panel: { swipe: 'left', swipeActiveArea: 30 },
  touch: { tapHold: true, disableContextMenu: false },
  statusbar: { enabled: false },
};

// Many links across the app (panel nav, cards, chips) still use the web app's
// `#/path` hash form. Framework7's router ignores hash links, which left every
// one of them dead. One capture-phase document handler converts any such click
// into a real F7 navigation. stopPropagation keeps F7's own link handler from
// also processing the raw hash href.
function installHashLinkNavigation() {
  const getRouter = () => (
    // Resolve from the DOM: .f7View is set by F7 on the View element and is
    // always the live instance (imported singletons can go stale).
    document.querySelector('.view')?.f7View?.router
    || f7?.views?.main?.router
    || null
  );
  const handleClick = event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target?.closest?.('a[href^="#/"]');
    if (!link || link.target === '_blank') return;
    // F7's clicks module preventDefaults every link but only routes hrefs that
    // do NOT start with '#', so hash links would die silently here. That is
    // also why event.defaultPrevented must not be used as a bail-out signal.
    event.preventDefault();
    event.stopPropagation();
    const path = link.getAttribute('href').slice(1) || '/';
    const router = getRouter();
    if (router) router.navigate(path);
    else window.location.hash = `#${path}`;
    // Dismiss the custom React sidebar (see NativeShell); F7 panel APIs are
    // unreliable in production, so this goes through a plain event.
    window.dispatchEvent(new CustomEvent('blink:panel-close'));
  };
  document.addEventListener('click', handleClick, true);
  return () => document.removeEventListener('click', handleClick, true);
}

export default function NativeApp() {
  // Native styling is scoped under body.blink-native, and OS detection prefers
  // Framework7's Device module once the app instance exists.
  useEffect(() => {
    setFramework7Device(f7?.device);
    applyDeviceMarkers();
    if (import.meta.env.DEV) window.__f7 = f7; // dev debugging
    return installHashLinkNavigation();
  }, []);

  return (
    <AuthProvider>
      {/* MemoryRouter keeps router-dependent contexts (Notifications) working
          inside the native build; navigation itself is handled by Framework7. */}
      <MemoryRouter>
        <ThemeProvider>
          <NativeNotificationGate>
            <App {...f7Params}>
              <NativeCallProvider>
                <NativeShell />
              </NativeCallProvider>
            </App>
          </NativeNotificationGate>
        </ThemeProvider>
      </MemoryRouter>
    </AuthProvider>
  );
}

export { applyDeviceMarkers, detectNativeDevice };
