import { CallProvider } from '../../contexts/CallContext';
import { NotificationProvider } from '../../contexts/NotificationContext';
import { ThemeProvider } from '../../contexts/ThemeContext';
import InstallPrompt from '../common/InstallPrompt';
import AppLayout from './AppLayout';

export default function AuthenticatedShell() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <CallProvider>
          <AppLayout />
          <InstallPrompt />
        </CallProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}
