import { Suspense, useEffect, useState } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { lazyWithRecovery } from './components/common/AppErrorScreen';
import AppErrorScreen from './components/common/AppErrorScreen';

// Lazy load pages for better performance
const AuthenticatedShell = lazyWithRecovery(() => import('./components/layout/AuthenticatedShell'));
const Home = lazyWithRecovery(() => import('./pages/Home'));
const Login = lazyWithRecovery(() => import('./pages/Login'));
const Communities = lazyWithRecovery(() => import('./pages/Communities'));
const ChatArea = lazyWithRecovery(() => import('./components/chat/ChatArea'));
const Discover = lazyWithRecovery(() => import('./pages/Discover'));
const Profile = lazyWithRecovery(() => import('./pages/Profile'));
const Settings = lazyWithRecovery(() => import('./pages/Settings'));
const CreateCommunity = lazyWithRecovery(() => import('./pages/CreateCommunity'));
const CommunitySettings = lazyWithRecovery(() => import('./pages/CommunitySettings'));
const PrivateMessages = lazyWithRecovery(() => import('./pages/PrivateMessages'));
const JoinCommunity = lazyWithRecovery(() => import('./pages/JoinCommunity'));
const WhatsNew = lazyWithRecovery(() => import('./pages/WhatsNew'));

const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  if (loading) {
    return <PageLoader />;
  }
  if (!currentUser) return <Navigate to="/login" replace />;
  return children;
};

// Loading fallback component
const PageLoader = () => {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), 12000);
    return () => window.clearTimeout(timer);
  }, []);

  if (timedOut) {
    return <AppErrorScreen error={new Error('This screen took too long to load. The network may be offline or the app may be using an outdated cached bundle.')} onRetry={() => window.location.reload()} />;
  }

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-lg)' }}>
      <div className="loader" aria-label="Loading Blink" />
    </div>
  );
};

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <Suspense fallback={<PageLoader />}>
        <Login />
      </Suspense>
    ),
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageLoader />}>
          <AuthenticatedShell />
        </Suspense>
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<PageLoader />}>
            <Home />
          </Suspense>
        ),
      },
      {
        path: 'communities',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Communities />
          </Suspense>
        ),
      },
      {
        path: 'messages',
        element: (
          <Suspense fallback={<PageLoader />}>
            <PrivateMessages />
          </Suspense>
        ),
      },
      {
        path: 'channels/:communityId',
        element: (
          <Suspense fallback={<PageLoader />}>
            <ChatArea />
          </Suspense>
        ),
      },
      {
        path: 'channels/:communityId/:channelId',
        element: (
          <Suspense fallback={<PageLoader />}>
            <ChatArea />
          </Suspense>
        ),
      },
      {
        path: 'discover',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Discover />
          </Suspense>
        ),
      },
      {
        path: 'profile',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Profile />
          </Suspense>
        ),
      },
      {
        path: 'profile/:uid',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Profile />
          </Suspense>
        ),
      },
      {
        path: 'settings',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Settings />
          </Suspense>
        ),
      },
      {
        path: 'create-community',
        element: (
          <Suspense fallback={<PageLoader />}>
            <CreateCommunity />
          </Suspense>
        ),
      },
      {
        path: 'community-settings/:communityId',
        element: (
          <Suspense fallback={<PageLoader />}>
            <CommunitySettings />
          </Suspense>
        ),
      },
      {
        path: 'whats-new',
        element: (
          <Suspense fallback={<PageLoader />}>
            <WhatsNew />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: '/join/:communityId',
    element: (
      <Suspense fallback={<PageLoader />}>
        <JoinCommunity />
      </Suspense>
    ),
  },
]);
