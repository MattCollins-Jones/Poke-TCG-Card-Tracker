import { useAuth } from '../context/AuthContext.jsx';
import { Navigate } from 'react-router-dom';

export default function AuthGuard({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
