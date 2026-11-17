import { useEffect, useState } from 'react';
import styles from './Modal.module.css';

const Modal = ({ isOpen, onClose, title, children, footer, wide = false }) => {
  // Exit animation: when isOpen flips to false we keep rendering with the
  // `closing` flag so the fade/slide-out plays, then clear it (unmounting
  // via the `!isOpen && !closing` check below) after the animation window.
  // State adjustment during render (the setPreviousOpen pattern) is the
  // sanctioned React way to react to a prop transition.
  const [closing, setClosing] = useState(false);
  const [previousOpen, setPreviousOpen] = useState(isOpen);

  if (previousOpen !== isOpen) {
    setPreviousOpen(isOpen);
    setClosing(isOpen ? false : true);
  }

  useEffect(() => {
    if (!closing || isOpen) return undefined;
    const timer = window.setTimeout(() => setClosing(false), 200);
    return () => window.clearTimeout(timer);
  }, [closing, isOpen]);

  if (!isOpen && !closing) return null;

  return (
    <div className={`${styles.overlay} ${closing ? styles.overlayClosing : ''}`} onClick={() => { if (!closing) onClose?.(); }}>
      <div className={`${styles.modal} ${wide ? styles.modalWide : ''} ${closing ? styles.modalClosing : ''}`} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className="text-headline-md">{title}</h2>
          {onClose && <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>}
        </div>
        <div className={styles.content}>
          {children}
        </div>
        {footer && (
          <div className={styles.footer}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;