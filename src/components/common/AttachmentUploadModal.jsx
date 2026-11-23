import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import {
  PERMANENT_UPLOADS_AVAILABLE,
  TEMPORARY_DURATIONS,
  UPLOAD_LIMITS,
  formatBytes,
  uploadFile
} from '../../services/filehost';
import styles from './AttachmentUploadModal.module.css';

// Asks how long the file should live, then picks and uploads it in one go so
// the composer only ever receives a finished link.
export default function AttachmentUploadModal({ isOpen, onClose, onUploaded }) {
  const [kind, setKind] = useState('temporary');
  const [duration, setDuration] = useState('24h');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const abortRef = useRef(null);

  // Each opening starts clean: the same adjustment Modal itself makes when its
  // open prop flips, so no state is set from inside an effect.
  const [previousOpen, setPreviousOpen] = useState(isOpen);
  if (previousOpen !== isOpen) {
    setPreviousOpen(isOpen);
    if (isOpen) {
      setKind('temporary');
      setDuration('24h');
      setIsUploading(false);
      setError('');
    }
  }

  useEffect(() => {
    if (isOpen) return;
    abortRef.current?.abort();
    abortRef.current = null;
  }, [isOpen]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    if (file.size > UPLOAD_LIMITS.temporary) {
      setError(`${file.name} is ${formatBytes(file.size)}. Temporary files can be up to ${formatBytes(UPLOAD_LIMITS.temporary)}.`);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setIsUploading(true);
    try {
      const uploaded = await uploadFile(file, { duration, signal: controller.signal });
      onUploaded?.(uploaded);
      onClose?.();
    } catch (uploadError) {
      if (!controller.signal.aborted) setError(uploadError?.message || 'That file could not be uploaded.');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsUploading(false);
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isUploading ? undefined : onClose}
      title="Send a file"
      footer={(
        <>
          <button type="button" className={styles.cancel} onClick={onClose} disabled={isUploading}>Cancel</button>
          <button type="button" className={styles.confirm} onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            {isUploading ? 'Uploading…' : 'Choose file'}
          </button>
        </>
      )}
    >
      <div className={styles.options}>
        <button
          type="button"
          className={`${styles.option} ${kind === 'temporary' ? styles.optionActive : ''}`}
          onClick={() => setKind('temporary')}
          aria-pressed={kind === 'temporary'}
          disabled={isUploading}
        >
          <span className="material-symbols-outlined">timer</span>
          <span className={styles.optionBody}>
            <strong>Temporary</strong>
            <small>Deleted automatically after the time you pick. Up to {formatBytes(UPLOAD_LIMITS.temporary)}.</small>
          </span>
        </button>
        <button
          type="button"
          className={`${styles.option} ${kind === 'permanent' ? styles.optionActive : ''} ${PERMANENT_UPLOADS_AVAILABLE ? '' : styles.optionDisabled}`}
          onClick={() => PERMANENT_UPLOADS_AVAILABLE && setKind('permanent')}
          aria-pressed={kind === 'permanent'}
          disabled={isUploading || !PERMANENT_UPLOADS_AVAILABLE}
        >
          <span className="material-symbols-outlined">all_inclusive</span>
          <span className={styles.optionBody}>
            <strong>Permanent</strong>
            <small>
              {PERMANENT_UPLOADS_AVAILABLE
                ? `Stays up indefinitely. Up to ${formatBytes(UPLOAD_LIMITS.permanent)}.`
                : 'Not available yet: Catbox cannot be reached from a browser. Files can be up to 200 MB once it is.'}
            </small>
          </span>
        </button>
      </div>

      {kind === 'temporary' && (
        <div className={styles.durations}>
          <p className={styles.durationsLabel}>HOW LONG SHOULD IT STAY?</p>
          <div className={styles.durationRow}>
            {TEMPORARY_DURATIONS.map(option => (
              <button
                key={option.value}
                type="button"
                className={`${styles.durationChip} ${duration === option.value ? styles.durationChipActive : ''}`}
                onClick={() => setDuration(option.value)}
                aria-pressed={duration === option.value}
                disabled={isUploading}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}

      <input ref={fileInputRef} type="file" hidden onChange={handleFile} />
    </Modal>
  );
}
