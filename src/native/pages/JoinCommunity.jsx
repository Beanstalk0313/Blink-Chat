import { useEffect, useState } from 'react';
import { Navbar, Page, PageContent } from 'framework7-react';
import { useAuth } from '../../contexts/AuthContext';
import { getCommunity, joinCommunity } from '../../services/db';
import MenuButton from '../components/MenuButton';
import styles from './JoinCommunity.module.css';

export default function JoinCommunity({ f7route }) {
  const { communityId } = f7route.params;
  const { currentUser, login, register } = useAuth();
  const [community, setCommunity] = useState(null);
  const [, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCommunity(communityId).then(data => {
      if (cancelled) return;
      if (!data) setError('Community not found or unavailable.');
      setCommunity(data);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setError('Sign in to view and join this community.');
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [communityId]);

  useEffect(() => {
    if (currentUser?.profile?.joinedCommunities?.includes(communityId)) {
      window.location.hash = `#/channels/${communityId}/`;
    }
  }, [communityId, currentUser]);

  const handleJoin = async () => {
    if (!currentUser || !community) return;
    setJoining(true);
    setError('');
    try {
      if (community.isPrivate && inviteCode.toUpperCase() !== community.inviteCode?.toUpperCase()) {
        throw new Error('Invalid invite code');
      }
      await joinCommunity(currentUser.uid, communityId);
      window.location.hash = `#/channels/${communityId}/`;
    } catch (joinError) {
      setError(joinError.message || 'Failed to join community.');
      setJoining(false);
    }
  };

  const handleAuth = async event => {
    event.preventDefault();
    setAuthLoading(true);
    setError('');
    try {
      if (authMode === 'login') await login(email, password);
      else await register(email, password, displayName);
      window.location.hash = `#/join/${communityId}/`;
    } catch (authError) {
      setError(authError.message || 'Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <Page className={styles.page}>
      <Navbar title="Community invitation" backLink="Back" backLinkShowText={false}>
        <MenuButton slot="left" />
      </Navbar>
      <PageContent className={styles.content}>
        <div className={styles.card}>
          <div className={styles.header}>
            {community?.iconBase64
              ? <img src={community.iconBase64} alt="" className={styles.icon} />
              : <span className={styles.iconFallback}><span className="material-symbols-outlined">groups</span></span>}
            <h1>{community ? `Join ${community.name}` : 'Community invitation'}</h1>
            <p>{community?.description || 'Sign in first to view this community and continue joining.'}</p>
          </div>

          {currentUser && community && !community.isPrivate && <p className={styles.joinHint}>This is a public community. Join when you are ready.</p>}
          {currentUser && community?.isPrivate && (
            <div className={styles.field}>
              <label>INVITE CODE</label>
              <input type="text" value={inviteCode} onChange={event => setInviteCode(event.target.value)} />
            </div>
          )}
          {error && <p className={styles.error}>{error}</p>}
          {currentUser && community
            ? <button type="button" className={styles.joinBtn} onClick={handleJoin} disabled={joining || (community.isPrivate && !inviteCode.trim())}>{joining ? 'Joining...' : 'Join community'}</button>
            : <p className={styles.joinHint}>Sign in or create an account to unlock joining.</p>}

          {!currentUser && (
            <form onSubmit={handleAuth} className={styles.authForm}>
              <div className={styles.divider}><span>Sign in to continue</span></div>
              {authMode === 'register' && <input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Display name" required />}
              <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Email" required />
              <input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Password" required />
              <button type="submit" disabled={authLoading}>{authLoading ? 'Please wait...' : authMode === 'login' ? 'Sign in' : 'Sign up'}</button>
              <button type="button" className={styles.modeBtn} onClick={() => setAuthMode(previous => previous === 'login' ? 'register' : 'login')}>
                {authMode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
              </button>
            </form>
          )}
        </div>
      </PageContent>
    </Page>
  );
}
