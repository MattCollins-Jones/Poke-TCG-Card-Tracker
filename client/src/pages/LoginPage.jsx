import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('signin'); // 'signin' | 'register' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });
      setLoading(false);
      if (error) return setError(error.message);
      return setMessage('Password reset email sent — check your inbox.');
    }

    const fn = mode === 'register'
      ? supabase.auth.signUp({ email, password })
      : supabase.auth.signInWithPassword({ email, password });

    const { error } = await fn;
    setLoading(false);
    if (error) return setError(error.message);
    if (mode === 'register') return setMessage('Account created! Check your email to confirm, then sign in.');
    navigate('/');
  };

  const handleOAuth = async (provider) => {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) setError(error.message);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-pokeball">⬤</span>
          <h1>Pokémon TCG Tracker</h1>
        </div>

        <div className="oauth-buttons">
          <button className="oauth-btn oauth-google" onClick={() => handleOAuth('google')}>
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
              <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
          <button className="oauth-btn oauth-microsoft" onClick={() => handleOAuth('azure')}>
            <svg width="18" height="18" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
              <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
              <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
            </svg>
            Continue with Microsoft
          </button>
        </div>

        <div className="login-divider"><span>or</span></div>

        <form onSubmit={handleEmailAuth} className="login-form">
          <input
            className="search-input"
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          {mode !== 'reset' && (
            <input
              className="search-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            />
          )}

          {error && <div className="login-error">{error}</div>}
          {message && <div className="login-message">{message}</div>}

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? '…' : mode === 'signin' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Send Reset Email'}
          </button>
        </form>

        <div className="login-links">
          {mode === 'signin' && (
            <>
              <button className="link-btn" onClick={() => { setMode('register'); setError(''); setMessage(''); }}>
                Create an account
              </button>
              <button className="link-btn" onClick={() => { setMode('reset'); setError(''); setMessage(''); }}>
                Forgot password?
              </button>
            </>
          )}
          {(mode === 'register' || mode === 'reset') && (
            <button className="link-btn" onClick={() => { setMode('signin'); setError(''); setMessage(''); }}>
              ← Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
