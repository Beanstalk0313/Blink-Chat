// Installed-app gestures.
//
// The viewport meta and `touch-action` handle pinch zoom on modern browsers,
// but iOS Safari ignores `user-scalable=no` in a normal tab and still sends
// its proprietary gesture events. Cancelling those (and multi-finger moves)
// makes the Home Screen PWA feel like an app rather than a zoomable page.
// Single-finger scrolling and taps are untouched.
let installed = false;

export function installAppGestures() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  const preventGesture = event => event.preventDefault();
  document.addEventListener('gesturestart', preventGesture, { passive: false });
  document.addEventListener('gesturechange', preventGesture, { passive: false });
  document.addEventListener('gestureend', preventGesture, { passive: false });

  // In the app shell a second finger only ever means "pinch to zoom".
  document.addEventListener('touchmove', event => {
    if (event.touches.length > 1) event.preventDefault();
  }, { passive: false });
}
