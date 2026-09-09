import { useState } from 'react';
import { f7 } from 'framework7-react';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Login.module.css';

// Native login screen. Rendered by NativeShell's auth overlay so it works for
// any deep link that requires an account.
export default function Login() {
  const { login, register, loginWithGoogle, resetPassword } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigateAfterAuth = () => f7?.views?.main?.router?.navigate('/', { reloadCurrent: true });

  const handleSubmit = async event => {
    event.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      if (isLogin) await login(email, password);
      else await register(email, password, displayName);
      navigateAfterAuth();
    } catch (err) {
      setError('Failed to ' + (isLogin ? 'log in' : 'create account') + '. ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
      navigateAfterAuth();
    } catch (err) {
      setError('Google login failed: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!email) {
      setError('Enter your email above first, then tap Forgot.');
      return;
    }
    try {
      await resetPassword(email);
      f7.dialog.alert('Password reset email sent! Check your inbox.', 'Reset Password');
    } catch (err) {
      setError('Failed to send reset email: ' + (err.message || ''));
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <img src="/logo.svg" alt="Blink" className={styles.logo} />
        <h1 className={styles.title}>{isLogin ? 'Welcome back' : 'Join Blink'}</h1>
        <p className={styles.subtitle}>
          {isLogin ? 'Enter your details to access your communities.' : 'Create an account to connect with others.'}
        </p>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          {!isLogin && (
            <input
              type="text"
              value={displayName}
              onChange={event => setDisplayName(event.target.value)}
              placeholder="Display name"
              className={styles.input}
              required
            />
          )}
          <input
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            placeholder="Email"
            className={styles.input}
            required
          />
          <input
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            placeholder="Password"
            className={styles.input}
            required
          />
          <button type="submit" className={styles.primaryBtn} disabled={loading}>
            {loading ? 'Please wait...' : isLogin ? 'Log In' : 'Sign Up'}
          </button>
        </form>

        {isLogin && (
          <button type="button" className={styles.forgotBtn} onClick={handleForgot}>
            Forgot password?
          </button>
        )}

        <div className={styles.divider}><span>OR</span></div>

        <button type="button" className={styles.googleBtn} onClick={handleGoogle} disabled={loading}>
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" />
          {isLogin ? 'Continue with Google' : 'Sign up with Google'}
        </button>

        <button type="button" className={styles.toggleBtn} onClick={() => setIsLogin(previous => !previous)}>
          {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
        </button>
      </div>
    </div>
  );
}
