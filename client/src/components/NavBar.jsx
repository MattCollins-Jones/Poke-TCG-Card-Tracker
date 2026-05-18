import { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCurrency, CURRENCIES } from '../context/CurrencyContext.jsx';

export default function NavBar() {
  const { user, signOut, isAdmin } = useAuth();
  const { currency, setCurrency } = useCurrency();
  const [adminOpen, setAdminOpen] = useState(false);
  const adminRef = useRef(null);

  useEffect(() => {
    if (!adminOpen) return;
    const handleClick = (e) => {
      if (adminRef.current && !adminRef.current.contains(e.target)) setAdminOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [adminOpen]);

  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar-brand">🎴 PokéTracker</NavLink>
      <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>Browse Sets</NavLink>
      <NavLink to="/collection" className={({ isActive }) => isActive ? 'active' : ''}>My Collection</NavLink>
      <NavLink to="/wishlist" className={({ isActive }) => isActive ? 'active' : ''}>Wishlist</NavLink>
      {isAdmin && (
        <div className="admin-dropdown" ref={adminRef}>
          <button className="admin-dropdown-btn" onClick={() => setAdminOpen((o) => !o)}>
            ⚙️ Admin {adminOpen ? '▲' : '▾'}
          </button>
          {adminOpen && (
            <div className="admin-dropdown-menu">
              <NavLink to="/sync" onClick={() => setAdminOpen(false)}>🔄 Sync</NavLink>
              <NavLink to="/admin" onClick={() => setAdminOpen(false)}>🛠️ Manage</NavLink>
            </div>
          )}
        </div>
      )}
      <select
        className="currency-select"
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        title="Display currency"
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </select>
      {user && (
        <div className="navbar-user">
          <span className="navbar-email">{user.email}</span>
          <button className="navbar-signout" onClick={signOut}>Sign out</button>
        </div>
      )}
    </nav>
  );
}

