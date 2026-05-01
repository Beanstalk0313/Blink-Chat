import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getCommunity, joinCommunity } from '../services/db';
import { useAuth } from '../contexts/AuthContext';
import styles from './JoinCommunity.module.css';

export default function JoinCommunity() {
  const { communityId } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [community, setCommunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    async function loadCommunity() {
      if (!currentUser) return; // Wait for auth
      
      try {
        const data = await getCommunity(communityId);
        if (!data) {
          setError('Community not found');
        } else {
          setCommunity(data);
          // If user is already in community, redirect to chat
          if (currentUser?.profile?.joinedCommunities?.includes(communityId)) {
            navigate(`/channels/${communityId}`, { replace: true });
          }
        }
      } catch (err) {
        console.error("JoinCommunity error:", err);
        setError('Failed to load community information');
      } finally {
        setLoading(false);
      }
    }

    if (currentUser) {
      loadCommunity();
    } else {
      // If we've finished checking auth and there's no user, redirect
      const timeout = setTimeout(() => {
        if (!currentUser) {
          navigate('/login', { state: { from: `/join/${communityId}` } });
        }
      }, 1500); // Small grace period for auth state to settle
      return () => clearTimeout(timeout);
    }
  }, [communityId, currentUser, navigate]);

  const handleJoin = async () => {
    if (!currentUser) {
      navigate('/login', { state: { from: `/join/${communityId}` } });
      return;
    }

    setJoining(true);
    setError('');

    try {
      if (community.isPrivate) {
        if (inviteCode.toUpperCase() !== community.inviteCode?.toUpperCase()) {
          setError('Invalid invite code');
          setJoining(false);
          return;
        }
      }

      await joinCommunity(currentUser.uid, communityId);
      navigate(`/channels/${communityId}`);
    } catch (err) {
      setError('Failed to join community: ' + err.message);
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.loader}></div>
          <p>Loading community info...</p>
        </div>
      </div>
    );
  }

  if (error && !community) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h1 className="text-headline-lg">Oops!</h1>
          <p className="text-body-lg text-tertiary">{error}</p>
          <Link to="/" className={styles.backBtn}>Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.iconWrapper}>
            {community.iconBase64 ? (
              <img src={community.iconBase64} alt={community.name} className={styles.icon} />
            ) : (
              <div className={styles.iconPlaceholder}>
                <span className="material-symbols-outlined">groups</span>
              </div>
            )}
          </div>
          <h1 className="text-headline-lg">You've been invited to {community.name}!</h1>
          <p className="text-body-lg text-tertiary">
            {community.isPrivate 
              ? 'Enter your invite code and click join.' 
              : 'Click below to join.'}
          </p>
        </div>

        <div className={styles.content}>
          {community.isPrivate && (
            <div className={styles.inputGroup}>
              <label htmlFor="inviteCode" className="text-label-md">INVITE CODE</label>
              <input
                id="inviteCode"
                type="text"
                placeholder="Enter code here..."
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className={styles.input}
                autoFocus
              />
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <button 
            className={styles.joinBtn} 
            onClick={handleJoin}
            disabled={joining || (community.isPrivate && !inviteCode.trim())}
          >
            {joining ? 'Joining...' : 'Join Community'}
          </button>

          <Link to="/" className={styles.backBtn}>Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
