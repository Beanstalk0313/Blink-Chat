import { useEffect, useRef, useState } from 'react';
import styles from './Dropdown.module.css';

// Blink-styled dropdown replacing native <select> elements: styled trigger,
// animated menu (scale/fade in, fade out), closes on outside click or Escape.
// Options are { value, label } pairs; values are compared as strings so
// numeric values from selects keep working.
const Dropdown = ({ value, onChange, options, placeholder = 'Select…', className = '', ariaLabel, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const rootRef = useRef(null);

  const selected = options.find(option => String(option.value) === String(value));

  const close = () => {
    if (!open) return;
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 150);
  };

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = event => {
      if (rootRef.current && !rootRef.current.contains(event.target)) close();
    };
    const handleKeyDown = event => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = () => {
    if (disabled) return;
    if (open) close();
    else setOpen(true);
  };

  const pick = option => {
    onChange(option.value);
    close();
  };

  return (
    <div className={`${styles.root} ${className}`} ref={rootRef}>
      <button type="button" className={styles.trigger} disabled={disabled} onClick={toggle} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}>
        <span className={selected ? styles.value : styles.placeholder}>{selected ? selected.label : placeholder}</span>
        <span className={`material-symbols-outlined ${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true">expand_more</span>
      </button>
      {open && (
        <div className={`${styles.menu} ${closing ? styles.menuClosing : ''}`} role="listbox">
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={String(option.value) === String(value)}
              className={`${styles.option} ${String(option.value) === String(value) ? styles.optionSelected : ''}`}
              onClick={() => pick(option)}
            >
              <span>{option.label}</span>
              {String(option.value) === String(value) && <span className="material-symbols-outlined" aria-hidden="true">check</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dropdown;