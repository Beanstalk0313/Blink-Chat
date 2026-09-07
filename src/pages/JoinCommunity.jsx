import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getCommunity, joinCommunity } from '../services/db';
import { useAuth } from '../contexts/AuthContext';
import styles from './JoinCommunity.module.css';

export default function JoinCommunity() {
  const { communityId } = useParams();
  const { currentUser, login, register } = useAuth();
  const navigate = useNavigate();
  const [community, setCommunity] = useState(null);
  const [loading, setLoading] = useState(true);
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
      navigate(`/channels/${communityId}`, { replace: true });
    }
  }, [communityId, currentUser, navigate]);

  const handleJoin = async () => {
    if (!currentUser || !community) return;
    setJoining(true);
    setError('');
    try {
      if (community.isPrivate && inviteCode.toUpperCase() !== community.inviteCode?.toUpperCase()) {
        throw new Error('Invalid invite code');
      }
      await joinCommunity(currentUser.uid, communityId);
      navigate(`/channels/${communityId}`);
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
      navigate(`/join/${communityId}`, { replace: true });
    } catch (authError) {
      setError(authError.message || 'Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) return <div className={styles.container}><div className={styles.card}><div className={styles.loader} /><p>Loading community info...</p></div></div>;

  const communityPanel = (
    <section className={styles.card}>
      <div className={styles.header}>
        <div className={styles.iconWrapper}>
          {community?.iconBase64 ? <img src={community.iconBase64} alt={community.name} className={styles.icon} /> : <div className={styles.iconPlaceholder}><span className="material-symbols-outlined">groups</span></div>}
        </div>
        <h1 className="text-headline-lg">{community ? `Join ${community.name}` : 'Community invitation'}</h1>
        <p className="text-body-lg text-tertiary">{community?.description || 'Sign in first to view this community and continue joining.'}</p>
      </div>
      {currentUser && community && !community.isPrivate && <p className={styles.joinHint}>This is a public community. Join when you are ready.</p>}
      {currentUser && community?.isPrivate && <div className={styles.inputGroup}><label htmlFor="inviteCode" className="text-label-md">INVITE CODE</label><input id="inviteCode" type="text" value={inviteCode} onChange={event => setInviteCode(event.target.value)} className={styles.input} autoFocus /></div>}
      {error && <p className={styles.error}>{error}</p>}
      {currentUser && community ? <button className={styles.joinBtn} onClick={handleJoin} disabled={joining || (community.isPrivate && !inviteCode.trim())}>{joining ? 'Joining...' : 'Join community'}</button> : <p className={styles.joinHint}>Sign in or create an account to unlock joining.</p>}
      <Link to={currentUser ? '/' : '/login'} className={styles.backBtn}>Back</Link>
    </section>
  );

  if (currentUser) return <div className={styles.container}>{communityPanel}</div>;

  return (
    <div className={styles.container}>
      <div className={styles.splitLayout}>
        <section className={styles.card}>
          <div className={styles.authHeader}><img src="/logo.svg" alt="Blink Logo" /><h2 className="text-headline-lg">{authMode === 'login' ? 'Sign in to Blink' : 'Create your Blink account'}</h2><p className="text-body-md text-tertiary">Sign in here, then your invitation will stay ready on the right.</p></div>
          <form className={styles.authForm} onSubmit={handleAuth}>
            {authMode === 'register' && <input className={styles.input} value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Display name" required />}
            <input className={styles.input} type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Email" required />
            <input className={styles.input} type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Password" required />
            <button className={styles.joinBtn} disabled={authLoading}>{authLoading ? 'Please wait...' : authMode === 'login' ? 'Sign in' : 'Sign up'}</button>
          </form>
          <button className={styles.modeBtn} onClick={() => setAuthMode(previous => previous === 'login' ? 'register' : 'login')}>{authMode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}</button>
          {error && <p className={styles.error}>{error}</p>}
        </section>
        {communityPanel}
      </div>
    </div>
  );
}
