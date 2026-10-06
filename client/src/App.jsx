// =====================================================================
// App : the header plus one route per page.
// Pages that need a login are wrapped in <RequireAuth>.
// =====================================================================
import { Link, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import RequireAuth from './components/RequireAuth';
import Home from './pages/Home';
import Report from './pages/Report';
import IssueDetail from './pages/IssueDetail';
import MyReports from './pages/MyReports';
import AdminQueue from './pages/AdminQueue';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';

function NotFound() {
  return (
    <main className="page">
      <div className="empty">
        <p>This page doesn't exist.</p>
        <Link className="btn btn-secondary" to="/">Back to the map</Link>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/report" element={<RequireAuth><Report /></RequireAuth>} />
        <Route path="/issues/:id" element={<IssueDetail />} />
        <Route path="/my-reports" element={<RequireAuth><MyReports /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth admin><AdminQueue /></RequireAuth>} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
