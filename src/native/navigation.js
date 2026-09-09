import { f7 } from 'framework7-react';

// Navigate within the native Framework7 view. Falls back to the hash when the
// router is not ready (e.g. very early during startup).
export function navigateTo(path, options = {}) {
  const router = f7?.views?.main?.router;
  if (router) {
    router.navigate(path, options);
    return;
  }
  window.location.hash = `#${path}`;
}

// Opens the app-level left sidebar.
//
// The sidebar is a plain React component owned by NativeShell (Framework7's
// Panel API proved unreliable in production builds). Two redundant paths so a
// single wiring failure can never leave the sidebar dead:
//   1. A direct imperative handle (window.__blinkSidebar) that NativeShell
//      sets on mount - synchronous, no event plumbing involved.
//   2. A window event that NativeShell also listens for.
export function openLeftPanel() {
  if (typeof window === 'undefined') return;
  window.__blinkSidebar?.open?.();
  window.dispatchEvent(new CustomEvent('blink:panel-open'));
}

// Requests the sidebar to close (used by the global hash-link navigator so any
// internal link also dismisses the sidebar).
export function closeLeftPanel() {
  if (typeof window === 'undefined') return;
  window.__blinkSidebar?.close?.();
  window.dispatchEvent(new CustomEvent('blink:panel-close'));
}
