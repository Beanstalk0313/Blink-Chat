import { useEffect, useState } from 'react';

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const handleInstall = event => {
      event.preventDefault();
      setInstallEvent(event);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handleInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleInstall);
  }, []);

  if (!visible || !installEvent) return null;

  const install = async () => {
    await installEvent.prompt();
    setVisible(false);
    setInstallEvent(null);
  };

  return (
    <div style={{ position: 'fixed', left: '1rem', right: '1rem', bottom: '5.5rem', zIndex: 2500, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '1rem', background: 'var(--color-surface-container-high)', border: '1px solid var(--color-outline-variant)', borderRadius: 'var(--radius-sm)', boxShadow: '0 12px 32px rgba(0,0,0,.35)' }}>
      <span className="text-label-md">Install Blink for quicker access</span>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="button" onClick={() => setVisible(false)} style={{ padding: '0.5rem 0.75rem', background: 'transparent', color: 'var(--color-tertiary)', border: 0, cursor: 'pointer' }}>Dismiss</button>
        <button type="button" onClick={install} style={{ padding: '0.5rem 0.75rem', background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 0, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Install</button>
      </div>
    </div>
  );
}
