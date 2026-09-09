import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import StartupErrorBoundary from '../components/common/StartupErrorBoundary.jsx';
import AppErrorScreen from '../components/common/AppErrorScreen.jsx';

const root = createRoot(document.getElementById('app'));

function renderFailure(error) {
  root.render(<AppErrorScreen error={error} onRetry={() => window.location.reload()} startup />);
}

const appImport = import('./NativeApp.jsx');
let appImportSettled = false;
const appImportTimeout = new Promise((_, reject) => {
  window.setTimeout(() => {
    // Only reject while the import is genuinely still pending; otherwise this
    // promise would reject after a successful startup as an unhandled rejection.
    if (!appImportSettled) reject(Object.assign(new Error('Blink startup timed out while loading the application bundle.'), { name: 'StartupTimeoutError' }));
  }, 15000);
});

Promise.race([appImport, appImportTimeout])
  .then(({ default: NativeApp }) => {
    appImportSettled = true;
    root.render(
      <StrictMode>
        <StartupErrorBoundary>
          <NativeApp />
        </StartupErrorBoundary>
      </StrictMode>,
    );
    try { sessionStorage.removeItem('blink-chunk-retry'); } catch { /* Storage may be blocked. */ }
    document.getElementById('boot-fallback')?.remove();
  })
  .catch(error => {
    appImportSettled = true;
    renderFailure(error);
  });

// The losing promise must never surface as an unhandled rejection.
appImport.catch(() => {});
appImportTimeout.catch(() => {});
