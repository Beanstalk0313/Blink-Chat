import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Home from './pages/Home';
import Login from './pages/Login';
import Communities from './pages/Communities';
import ChatArea from './components/chat/ChatArea';
import Discover from './pages/Discover';
import Activity from './pages/Activity';
import Admin from './pages/Admin';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import CreateCommunity from './pages/CreateCommunity';
import CommunitySettings from './pages/CommunitySettings';
import JoinCommunity from './pages/JoinCommunity';
import { useAuth } from './contexts/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { currentUser } = useAuth();
  if (!currentUser) return <Navigate to="/login" replace />;
  return children;
};

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: 'communities',
        element: <Communities />,
      },
      {
        path: 'channels/:communityId',
        element: <ChatArea />,
      },
      {
        path: 'channels/:communityId/:channelId',
        element: <ChatArea />,
      },
      {
        path: 'discover',
        element: <Discover />,
      },
      {
        path: 'activity',
        element: <Activity />,
      },
      {
        path: 'admin',
        element: <Admin />,
      },
      {
        path: 'profile',
        element: <Profile />,
      },
      {
        path: 'settings',
        element: <Settings />,
      },
      {
        path: 'create-community',
        element: <CreateCommunity />,
      },
      {
        path: 'community-settings/:communityId',
        element: <CommunitySettings />,
      },
    ],
  },
  {
    path: '/join/:communityId',
    element: <JoinCommunity />,
  },
]);
