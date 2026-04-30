import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { AuthProvider } from './contexts/AuthContext';
import { CallProvider } from './contexts/CallContext';
import { NotificationProvider } from './contexts/NotificationContext';
import CallOverlay from './components/common/CallOverlay';
import './index.css';

function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <CallProvider>
          <div className="app-container">
            <RouterProvider router={router} />
            <CallOverlay />
          </div>
        </CallProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
