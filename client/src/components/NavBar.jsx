import { NavLink } from 'react-router-dom';

export default function NavBar() {
  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar-brand">🎴 PokéTracker</NavLink>
      <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>Browse Sets</NavLink>
      <NavLink to="/collection" className={({ isActive }) => isActive ? 'active' : ''}>My Collection</NavLink>
      <NavLink to="/wishlist" className={({ isActive }) => isActive ? 'active' : ''}>Wishlist</NavLink>
      <NavLink to="/sync" className={({ isActive }) => isActive ? 'active' : ''} style={{ marginLeft: 'auto', fontSize: '0.85rem' }}>🔄 Sync</NavLink>
    </nav>
  );
}
