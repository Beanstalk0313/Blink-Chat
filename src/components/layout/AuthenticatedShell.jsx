import { CallProvider } from '../../contexts/CallContext';
import { NotificationProvider } from '../../contexts/NotificationContext';
import InstallPrompt from '../common/InstallPrompt';
import AppLayout from './AppLayout';

// The theme lives above the router (see App.jsx), so signed-out screens —
// login, join, banned, errors — are painted by the chosen theme too.
export default function AuthenticatedShell() {
  return (
    <NotificationProvider>
      <CallProvider>
        <AppLayout />
        <InstallPrompt />
      </CallProvider>
    </NotificationProvider>
  );
}
