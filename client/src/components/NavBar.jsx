import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function NavBar() {
  const { user, signOut, isAdmin } = useAuth();

  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar-brand">🎴 PokéTracker</NavLink>
      <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>Browse Sets</NavLink>
      <NavLink to="/collection" className={({ isActive }) => isActive ? 'active' : ''}>My Collection</NavLink>
      <NavLink to="/wishlist" className={({ isActive }) => isActive ? 'active' : ''}>Wishlist</NavLink>
      {isAdmin && (
        <NavLink to="/sync" className={({ isActive }) => isActive ? 'active' : ''} style={{ fontSize: '0.85rem' }}>🔄 Sync</NavLink>
      )}
      {isAdmin && (
        <NavLink to="/admin" className={({ isActive }) => isActive ? 'active' : ''} style={{ fontSize: '0.85rem' }}>⚙️ Admin</NavLink>
      )}
      {user && (
        <div className="navbar-user">
          <span className="navbar-email">{user.email}</span>
          <button className="navbar-signout" onClick={signOut}>Sign out</button>
        </div>
      )}
    </nav>
  );
}

