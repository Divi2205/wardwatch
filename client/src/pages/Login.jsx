// Login : log in or create a citizen account, then return to ?next=
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { safeNext } from '../utils';

export default function Login() {
  const { user, loading, login, register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  const [tab, setTab] = useState('login');
  const [fields, setFields] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const destination = (u) => next || (u.role === 'admin' ? '/admin' : '/');
  if (!loading && user) return <Navigate to={destination(user)} replace />;

  const update = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = tab === 'login'
        ? await login(fields.email, fields.password)
        : await register(fields.name, fields.email, fields.password);
      navigate(destination(u), { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function switchTab(t) {
    setTab(t);
    setError('');
  }

  return (
    <main className="page">
      <div className="auth panel">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" id="tab-login" aria-selected={tab === 'login'} onClick={() => switchTab('login')}>
            Log in
          </button>
          <button type="button" role="tab" id="tab-register" aria-selected={tab === 'register'} onClick={() => switchTab('register')}>
            Create account
          </button>
        </div>

        <form id={tab === 'login' ? 'login-form' : 'register-form'} onSubmit={submit} noValidate>
          <div className="form-error" role="alert">{error}</div>
          {tab === 'register' && (
            <div className="field">
              <label htmlFor="reg-name">Your name</label>
              <input type="text" id="reg-name" autoComplete="name" value={fields.name} onChange={update('name')} required />
            </div>
          )}
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input type="email" id="login-email" autoComplete="email" value={fields.email} onChange={update('email')} required />
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input type="password" id="login-password" value={fields.password} onChange={update('password')}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'} required />
            {tab === 'register' && <span className="hint">At least 6 characters.</span>}
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {tab === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
      </div>
    </main>
  );
}
