import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';

const CARDS = [
  { bg: 'linear-gradient(135deg, #ff6b35, #f7931e)', symbol: '🔥', hp: '120 HP', name: 'Charizard' },
  { bg: 'linear-gradient(135deg, #0ea5e9, #2563eb)', symbol: '💧', hp: '90 HP',  name: 'Blastoise' },
  { bg: 'linear-gradient(135deg, #22c55e, #16a34a)', symbol: '🌿', hp: '100 HP', name: 'Venusaur' },
  { bg: 'linear-gradient(135deg, #eab308, #f59e0b)', symbol: '⚡', hp: '110 HP', name: 'Pikachu' },
  { bg: 'linear-gradient(135deg, #a855f7, #9333ea)', symbol: '🔮', hp: '130 HP', name: 'Mewtwo' },
];

function MockCard({ card, index }) {
  return (
    <div className={`splash-card splash-card-${index}`} style={{ '--card-bg': card.bg }}>
      <div className="splash-card-inner">
        <div className="splash-card-header">
          <span>{card.symbol} {card.name}</span>
          <span>{card.hp}</span>
        </div>
        <div className="splash-card-image" />
        <div className="splash-card-footer">
          <div className="splash-card-bar" />
          <div className="splash-card-bar short" />
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true });
  }, [user, loading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });
      setSubmitting(false);
      if (error) return setError(error.message);
      return setMessage('Password reset email sent — check your inbox.');
    }

    const fn = mode === 'register'
      ? supabase.auth.signUp({ email, password })
      : supabase.auth.signInWithPassword({ email, password });

    const { error } = await fn;
    setSubmitting(false);
    if (error) return setError(error.message);
    if (mode === 'register') return setMessage('Account created! Check your email to confirm, then sign in.');
    navigate('/');
  };

  const switchMode = (next) => { setMode(next); setError(''); setMessage(''); };

  return (
    <div className="login-page">
      {/* ── Left visual panel ── */}
      <div className="login-visual">
        <div className="login-brand">
          <span className="login-brand-icon">🎴</span>
          <div>
            <h1 className="login-title">Pokémon TCG<br />Tracker</h1>
            <p className="login-tagline">Track your collection, hunt your wishlist.</p>
          </div>
        </div>

        <div className="splash-cards-container">
          {CARDS.map((card, i) => <MockCard key={card.name} card={card} index={i} />)}
        </div>

        <ul className="login-features">
          <li><span className="feature-icon">📦</span>Browse all Pokémon TCG sets &amp; cards</li>
          <li><span className="feature-icon">✅</span>Track cards you own with quantities</li>
          <li><span className="feature-icon">⭐</span>Maintain a wishlist of cards you want</li>
          <li><span className="feature-icon">📊</span>See your collection completion progress</li>
        </ul>
      </div>

      {/* ── Right form panel ── */}
      <div className="login-form-panel">
        <div className="login-form-card">
          <h2 className="login-form-title">
            {mode === 'signin' ? 'Welcome back' : mode === 'register' ? 'Create account' : 'Reset password'}
          </h2>
          <p className="login-form-subtitle">
            {mode === 'signin' ? 'Sign in to your collection'
              : mode === 'register' ? 'Start tracking your cards today'
              : "We'll send you a reset link"}
          </p>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            {mode !== 'reset' && (
              <div className="login-field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder={mode === 'register' ? 'Choose a strong password' : 'Your password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                />
              </div>
            )}

            {error && <div className="login-error">{error}</div>}
            {message && <div className="login-message">{message}</div>}

            <button className="login-submit" type="submit" disabled={submitting}>
              {submitting ? '…'
                : mode === 'signin' ? 'Sign In'
                : mode === 'register' ? 'Create Account'
                : 'Send Reset Email'}
            </button>
          </form>

          <div className="login-links">
            {mode === 'signin' && (
              <>
                <button className="link-btn" onClick={() => switchMode('register')}>
                  Don't have an account? <strong>Register</strong>
                </button>
                <button className="link-btn" onClick={() => switchMode('reset')}>
                  Forgot password?
                </button>
              </>
            )}
            {(mode === 'register' || mode === 'reset') && (
              <button className="link-btn" onClick={() => switchMode('signin')}>
                ← Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

