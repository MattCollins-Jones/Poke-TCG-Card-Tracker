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

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-pokeball">🎴</span>
          <h1>Pokémon TCG Tracker</h1>
        </div>

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

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
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

