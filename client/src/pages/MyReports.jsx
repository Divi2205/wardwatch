// MyReports : issues the user reported or backed, with fixes to check first
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import IssueTicket from '../components/IssueTicket';

function Section({ title, intro, issues }) {
  if (!issues.length) return null;
  return (
    <section className="panel stack">
      <h2>{title}</h2>
      {intro && <p className="sub">{intro}</p>}
      <ul className="ticket-list">
        {issues.map((i) => <li key={i.id}><IssueTicket issue={i} /></li>)}
      </ul>
    </section>
  );
}

export default function MyReports() {
  const { user } = useAuth();
  const [issues, setIssues] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/issues?mine=1').then((d) => setIssues(d.issues)).catch((e) => setError(e.message));
  }, []);

  const mine = (issues || []).filter((i) => i.reporter_id === user.id);
  const waiting = mine.filter((i) => i.status === 'resolved');
  const reported = mine.filter((i) => i.status !== 'resolved');
  const backed = (issues || []).filter((i) => i.reporter_id !== user.id);

  return (
    <main className="page">
      <div className="page-head">
        <h1>My reports</h1>
        <p>Issues you reported and issues you backed. When the officer marks one of yours resolved, check it and confirm the fix.</p>
      </div>
      {error && <div className="form-error">{error}</div>}
      {!issues && !error && <p className="loading">Loading your reports…</p>}
      {issues && issues.length === 0 && (
        <div className="empty">
          <p>You haven't reported or backed any issues yet.</p>
          <Link className="btn btn-marking" to="/report">Report an issue</Link>
        </div>
      )}
      <Section title="Check these fixes" intro="The officer says these are fixed. Open each one to confirm or reopen it." issues={waiting} />
      <Section title="Reported by you" issues={reported} />
      <Section title="Backed by you" issues={backed} />
    </main>
  );
}
