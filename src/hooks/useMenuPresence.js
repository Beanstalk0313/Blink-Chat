import { useEffect, useState } from 'react';

// Menus and panes are conditional renders, so a closing animation needs the
// element to stay in the DOM for the length of the exit. `mounted` is what to
// render with, `closing` is the class to swap in while it animates away.
//
// The state writes are scheduled rather than run inside the effect body: React
// (and the project's lint rules) treat a synchronous setState in an effect as a
// cascading render.
export function useMenuPresence(isOpen, durationMs = 140) {
  const [visible, setVisible] = useState(Boolean(isOpen));
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const openTimer = window.setTimeout(() => {
        setVisible(true);
        setClosing(false);
      }, 0);
      return () => window.clearTimeout(openTimer);
    }
    const closeTimer = window.setTimeout(() => setClosing(true), 0);
    const unmountTimer = window.setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, durationMs);
    return () => {
      window.clearTimeout(closeTimer);
      window.clearTimeout(unmountTimer);
    };
  }, [isOpen, durationMs]);

  return { mounted: Boolean(isOpen) || visible, closing: closing && !isOpen };
}
