// Wraps pages that need a logged-in user (or an officer).
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RequireAuth({ admin = false, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <main className="page"><p className="loading">Loading…</p></main>;

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (admin && user.role !== 'admin') {
    return (
      <main className="page">
        <div className="empty">
          <p>This page is for ward officers only.</p>
          <Link className="btn btn-secondary" to="/">Back to the map</Link>
        </div>
      </main>
    );
  }
  return children;
}
