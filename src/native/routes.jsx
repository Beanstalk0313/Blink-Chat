import Home from './pages/Home';
import Communities from './pages/Communities';
import Discover from './pages/Discover';
import Messages from './pages/Messages';
import Channel from './pages/Channel';
import Login from './pages/Login';
import Changelog from './pages/Changelog';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import CreateCommunity from './pages/CreateCommunity';
import CommunitySettings from './pages/CommunitySettings';
import JoinCommunity from './pages/JoinCommunity';

// Framework7 route table for the native build. Path shapes intentionally match
// the regular web app's React Router routes so deep links and habits carry over.
export const nativeRoutes = [
  // No custom transition: Home must use the same default per-platform
  // transition as every other page (f7-parallax made it look iOS-styled on
  // Android and differed from all other transitions).
  { path: '/', component: Home },
  { path: '/login/', component: Login },
  { path: '/communities/', component: Communities },
  { path: '/discover/', component: Discover },
  { path: '/messages/', component: Messages },
  { path: '/channels/:communityId/:channelId?/', component: Channel },
  { path: '/changelog/', component: Changelog },
  { path: '/profile/:uid?/', component: Profile },
  { path: '/settings/', component: Settings },
  { path: '/create-community/', component: CreateCommunity },
  { path: '/community-settings/:communityId/', component: CommunitySettings },
  { path: '/join/:communityId/', component: JoinCommunity },
  { path: '/profile/', component: Profile },
  { path: '(.*)', component: Home },
];
