// Records Framework7's Device module result once the app instance exists, so
// detection works even if this helper runs before or after F7 initialization.
let f7Device = null;

export function setFramework7Device(device) {
  if (device) f7Device = device;
}

// Desktop-testing override: set `?os=ios` (persisted to localStorage) to
// preview the iOS theme and device markers on a PC. `?os=android` forces the
// Material theme; `?os=auto` (or `?os=` anything else) clears the override.
const OS_OVERRIDE_KEY = 'blink-native-os';

export function getOsOverride() {
  try {
    const param = new URLSearchParams(window.location.search).get('os');
    if (param) {
      // The query param is a one-shot command: consume it so a later reload
      // cannot silently re-impose the override over a Settings-app choice.
      const url = new URL(window.location.href);
      url.searchParams.delete('os');
      window.history.replaceState(null, '', url);
      if (param === 'ios' || param === 'android') {
        localStorage.setItem(OS_OVERRIDE_KEY, param);
        return param;
      }
      localStorage.removeItem(OS_OVERRIDE_KEY);
    }
    return localStorage.getItem(OS_OVERRIDE_KEY) || null;
  } catch {
    return null;
  }
}

// Applies platform markers to <body> so CSS can theme per OS and PWA state.
export function applyDeviceMarkers() {
  const { os, pwa } = detectNativeDevice();
  document.body.classList.add('blink-native');
  document.body.dataset.blinkDevice = os;
  if (pwa) document.body.dataset.blinkPwa = 'true';
  return { os, pwa };
}

// Framework7's Device module gives reliable OS detection for styling and
// behavior switches. A lightweight UA fallback covers non-standard environments.
export function detectNativeDevice() {
  // Explicit override always wins (used for testing iOS on a PC).
  const override = getOsOverride();
  if (override) {
    let pwa = false;
    if (typeof navigator !== 'undefined' && navigator.standalone) pwa = true;
    if (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) pwa = true;
    return { os: override, pwa };
  }

  let os = 'android';
  let pwa = false;

  const device = f7Device;
  if (device?.ios) os = 'ios';
  else if (device?.android) os = 'android';
  else if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) os = 'ios';
  }

  if (typeof navigator !== 'undefined' && navigator.standalone) pwa = true;
  if (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) pwa = true;

  return { os, pwa };
}
