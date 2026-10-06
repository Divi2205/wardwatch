// Site header with navigation that adapts to who is logged in.
// NavLink adds aria-current="page" to the active link automatically.
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Close the mobile menu whenever the page changes
  useEffect(() => setMenuOpen(false), [location.pathname]);

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <header className="site-header">
      <div className="bar">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="#2a2e33" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-6-5.6-6-11a6 6 0 1 1 12 0c0 5.4-6 11-6 11z" />
              <circle cx="12" cy="10" r="2.2" />
            </svg>
          </span>
          WardWatch
        </Link>
        <button
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          onClick={() => setMenuOpen((o) => !o)}
        >
          Menu
        </button>
        <nav className={`site-nav${menuOpen ? ' open' : ''}`} id="site-nav" aria-label="Main">
          <NavLink to="/" end>Map</NavLink>
          <NavLink to="/report">Report an issue</NavLink>
          {user && <NavLink to="/my-reports">My reports</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin">Officer queue</NavLink>}
          <NavLink to="/dashboard">Dashboard</NavLink>
          {user ? (
            <>
              <span className="who">
                {user.name.split(' ')[0]}
                {user.role === 'admin' ? ' (officer)' : ''}
              </span>
              <button type="button" onClick={handleLogout}>Log out</button>
            </>
          ) : (
            <NavLink to="/login">Log in</NavLink>
          )}
        </nav>
      </div>
      <div className="centre-line" aria-hidden="true" />
    </header>
  );
}
