import { lazy } from 'react';
import styles from './AppErrorScreen.module.css';

function isChunkError(error) {
  const text = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  return text.includes('chunk') || text.includes('dynamically imported module') || text.includes('importing a module script failed') || text.includes('modulepreload');
}

export function lazyWithRecovery(loader) {
  return lazy(() => loader().catch(error => {
    const retryKey = 'blink-chunk-retry';
    let alreadyRetried = false;
    try {
      alreadyRetried = sessionStorage.getItem(retryKey) === '1';
      if (!alreadyRetried) sessionStorage.setItem(retryKey, '1');
    } catch {
      // Continue to the error screen if storage is unavailable.
    }
    if (!alreadyRetried) {
      recoverFromStaleAssets();
    }
    throw error;
  }));
}

export async function recoverFromStaleAssets() {
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.filter(name => name.startsWith('blink-shell-')).map(name => caches.delete(name)));
    }
    const registrations = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
    await Promise.all(registrations.map(registration => registration.update().catch(() => {})));
  } catch {
    // The reload below is still useful when cache APIs are unavailable.
  }
  const url = new URL(window.location.href);
  url.searchParams.set('blink-retry', String(Date.now()));
  window.location.replace(url.toString());
}

export default function AppErrorScreen({ error, onRetry, startup = false }) {
  const chunkError = isChunkError(error);
  const details = [
    `Time: ${new Date().toISOString()}`,
    `Route: ${window.location.pathname}${window.location.search}`,
    `Type: ${error?.name || 'Error'}`,
    `Message: ${error?.message || 'Unknown application error'}`,
    error?.stack ? `Stack:\n${error.stack}` : ''
  ].filter(Boolean).join('\n');

  const copyDetails = () => navigator.clipboard?.writeText(details)?.catch(() => {});

  return (
    <main className={styles.screen}>
      <section className={styles.card} role="alert">
        <div className={styles.icon}><span className="material-symbols-outlined">{chunkError ? 'sync_problem' : 'error_outline'}</span></div>
        <p className={styles.eyebrow}>{startup ? 'STARTUP ERROR' : 'APPLICATION ERROR'}</p>
        <h1>{chunkError ? 'Blink needs to refresh' : 'Something went wrong'}</h1>
        <p className={styles.message}>
          {chunkError
            ? 'A newer version of Blink is available, but this device still has an older bundle cached. Refreshing the app should repair it.'
            : 'Blink hit an unexpected error. You can retry without losing your account or messages.'}
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={chunkError ? recoverFromStaleAssets : onRetry}>Reload Blink</button>
          <button type="button" className={styles.secondary} onClick={copyDetails}>Copy error details</button>
        </div>
        <details className={styles.details}>
          <summary>Technical details</summary>
          <pre>{details}</pre>
        </details>
      </section>
    </main>
  );
}
