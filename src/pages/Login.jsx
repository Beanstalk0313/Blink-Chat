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
  
  const { login, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
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
      setError('Failed to ' + (isLogin ? 'log in' : 'create account') + '. ' + err.message);
    }

    setLoading(false);
  }

  async function handleGoogleLogin() {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
      navigate('/discover');
    } catch (err) {
      setError('Google login failed: ' + err.message);
    }
    setLoading(false);
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
            <label className="text-label-sm">PASSWORD</label>
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
