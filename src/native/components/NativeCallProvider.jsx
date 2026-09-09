import { CallProvider } from '../../contexts/CallContext';
import CallOverlay from '../../components/common/CallOverlay';

// Bridges the existing CallContext into the native shell. The CallOverlay
// manages its own call lifecycle (floating window, end call) and persists
// across native route changes because it is mounted here, above the View.
export default function NativeCallProvider({ children }) {
  return (
    <CallProvider>
      {children}
      <CallOverlay />
    </CallProvider>
  );
}
