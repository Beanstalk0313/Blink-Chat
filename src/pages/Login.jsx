import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import styles from './Login.module.css';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login, register, loginWithGoogle, resetPassword } = useAuth();
  const navigate = useNavigate();

  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);

  async function handleResetPassword(e) {
    e.preventDefault();
    if (!email) return setError("Please enter your email first.");
    setLoading(true);
    setError("");
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch (err) {
      setError("Failed to send reset email: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password, displayName);
      }
      navigate('/discover');
    } catch (err) {
      console.error("Login attempt failed:", err);
      setError('Failed to ' + (isLogin ? 'log in' : 'create account') + '. ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
      navigate('/discover');
    } catch (err) {
      console.error("Google login attempt failed:", err);
      setError('Google login failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.brandIcon}>
            <img src="/logo.svg" alt="Blink Logo" style={{ width: '48px', height: '48px' }} />
          </div>
          <h2 className="text-headline-md">{isLogin ? 'Welcome Back' : 'Join Blink'}</h2>
          <p className="text-body-md text-tertiary">
            {isLogin ? 'Enter your details to access your communities.' : 'Create an account to connect with others.'}
          </p>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          {!isLogin && (
            <div className={styles.inputGroup}>
              <label className="text-label-sm">DISPLAY NAME</label>
              <input 
                type="text" 
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className={styles.input}
              />
            </div>
          )}
          <div className={styles.inputGroup}>
            <label className="text-label-sm">EMAIL</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={styles.input}
            />
          </div>
          <div className={styles.inputGroup}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="text-label-sm">PASSWORD</label>
              {isLogin && (
                <span 
                  className={styles.forgotLink} 
                  onClick={() => setShowReset(true)}
                >
                  Forgot?
                </span>
              )}
            </div>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={styles.input}
            />
          </div>
          <button disabled={loading} className={styles.button} type="submit">
            {isLogin ? 'Log In' : 'Sign Up'}
          </button>
        </form>

        {showReset && (
          <div className={styles.resetOverlay}>
            <div className={styles.resetModal}>
              <h3 className="text-headline-sm">Reset Password</h3>
              {resetSent ? (
                <div style={{ textAlign: 'center' }}>
                  <p className="text-body-md" style={{ margin: '1rem 0' }}>Password reset email sent! Check your inbox.</p>
                  <button className={styles.button} onClick={() => setShowReset(false)}>Close</button>
                </div>
              ) : (
                <form onSubmit={handleResetPassword}>
                  <p className="text-body-md" style={{ margin: '1rem 0' }}>Enter your email to receive a reset link.</p>
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={styles.input}
                    placeholder="your@email.com"
                  />
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                    <button type="button" className={styles.cancelBtn} onClick={() => setShowReset(false)}>Cancel</button>
                    <button type="submit" className={styles.button} disabled={loading}>Send Link</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        <div className={styles.divider}>
          <span>OR</span>
        </div>

        <button className={styles.googleButton} onClick={handleGoogleLogin} disabled={loading}>
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" />
          {isLogin ? 'Continue with Google' : 'Sign up with Google'}
        </button>

        <div className={styles.footer}>
          <p className="text-label-md text-tertiary">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <span 
              className={styles.toggleLink} 
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? 'Sign up' : 'Log in'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
