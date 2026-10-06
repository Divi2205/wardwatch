// =====================================================================
// IssueDetail : one issue in full
//  - photo, description, officer note
//  - time open compared with the category's target
//  - timeline from issue_history
//  - actions depend on who is viewing: Me too / confirm fix / reopen
// =====================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BaseMap, StatusPin } from '../components/MapParts';
import { PriorityTag, StatusBadge } from '../components/Badges';
import { PRIORITY_LABELS, STATUS_COLORS, STATUS_LABELS, formatDate, formatHours, isOpen } from '../utils';

export default function IssueDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const announced = useRef(false);

  const load = useCallback(() => {
    api(`/api/issues/${id}`)
      .then((d) => {
        setData(d);
        document.title = `${d.issue.title} | WardWatch`;
      })
      .catch((err) => setError(err.message));
  }, [id]);

  // Reload when the issue id or the logged-in user changes
  useEffect(load, [load, user]);

  // One-time messages after reporting or backing, then tidy the URL
  useEffect(() => {
    if (announced.current) return;
    if (searchParams.get('new')) toast('Report submitted. It is now in the ward officer\'s queue.');
    if (searchParams.get('backed')) toast('You\'re now backing this report.');
    if (searchParams.get('new') || searchParams.get('backed')) {
      announced.current = true;
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, toast]);

  if (error) {
    return (
      <main className="page">
        <div className="empty"><p>{error}</p><Link className="btn btn-secondary" to="/">Back to the map</Link></div>
      </main>
    );
  }
  if (!data) return <main className="page"><p className="loading">Loading issue…</p></main>;

  const { issue, history, viewer } = data;
  const hoursOpen = Number(issue.hours_open);
  const pct = Math.min(100, Math.round((hoursOpen / issue.sla_hours) * 100));
  const over = hoursOpen > issue.sla_hours;

  return (
    <main className="page">
      <div className="split">
        <article>
          <div className="issue-head">
            <StatusBadge status={issue.status} /> <PriorityTag issue={issue} />
          </div>
          <h1>{issue.title}</h1>
          <p className="issue-meta">
            {issue.category_label}{issue.landmark ? `, ${issue.landmark}` : ''}. Reported by {issue.reporter_first_name} on{' '}
            {formatDate(issue.created_at)}.
          </p>

          {issue.photo_path ? (
            <img className="issue-photo" src={issue.photo_path} alt={`Photo of the issue: ${issue.title}`} />
          ) : (
            <div className="no-photo">No photo was added to this report.</div>
          )}

          <h2>Description</h2>
          <p className="issue-description">{issue.description}</p>

          {issue.remarks && (
            <div className="officer-note">
              <strong>Note from the ward officer</strong>
              <p>{issue.remarks}</p>
            </div>
          )}

          <Actions issue={issue} viewer={viewer} user={user} onChange={load} toast={toast} />
        </article>

        <aside className="panel">
          <BaseMap key={issue.id} center={[issue.latitude, issue.longitude]} zoom={16} className="mini-map">
            <StatusPin issue={issue} />
          </BaseMap>
          <dl className="facts">
            <dt>Neighbours affected</dt>
            <dd>{issue.supporters + 1} (reporter{issue.supporters ? ` + ${issue.supporters}` : ''})</dd>
            <dt>Target fix time</dt>
            <dd>{formatHours(issue.sla_hours)}</dd>
            <dt>{issue.resolved_at ? 'Took' : 'Open for'}</dt>
            <dd>
              {formatHours(hoursOpen)}
              {over && <span className="flag-overdue"> (past target)</span>}
              <div className={`progress-track${over ? ' over' : ''}`} role="img" aria-label={`${pct}% of target time used`}>
                <span style={{ width: `${pct}%` }} />
              </div>
            </dd>
          </dl>

          <h2>What has happened</h2>
          <ol className="timeline">
            {history.map((h, n) => <TimelineItem key={n} h={h} />)}
          </ol>
        </aside>
      </div>
    </main>
  );
}

function actorName(h) {
  if (!h.actor_name) return 'WardWatch (automatic)';
  if (h.actor_role === 'admin') return 'Ward officer';
  return h.actor_name.split(' ')[0];
}

function TimelineItem({ h }) {
  let what;
  let color = STATUS_COLORS.submitted;
  switch (h.action) {
    case 'created':
      what = `Reported by ${actorName(h)}`;
      break;
    case 'status':
      what = <>{STATUS_LABELS[h.to_value]} <span className="when">by {actorName(h)}</span></>;
      color = STATUS_COLORS[h.to_value];
      break;
    case 'priority':
      what = h.from_value
        ? `Priority changed from ${PRIORITY_LABELS[h.from_value]} to ${PRIORITY_LABELS[h.to_value]}`
        : `Priority set to ${PRIORITY_LABELS[h.to_value]}`;
      color = '#9a6200';
      break;
    case 'remark':
      what = 'Officer added a note';
      color = STATUS_COLORS.acknowledged;
      break;
    case 'support':
      what = `${actorName(h)} is affected too`;
      color = '#f2b705';
      break;
    case 'escalated':
      what = 'Escalated';
      color = '#b42318';
      break;
    default:
      what = h.action;
  }
  return (
    <li style={{ '--c': color }}>
      <span className="when">{formatDate(h.created_at)}</span>
      <span className="what">{what}</span>
      {h.note && <p className="note">{h.note}</p>}
    </li>
  );
}

// The box of actions under the description
function Actions({ issue, viewer, user, onChange, toast }) {
  const [busy, setBusy] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const [reason, setReason] = useState('');
  const open = isOpen(issue.status);

  async function run(path, body, message) {
    setBusy(true);
    try {
      await api(`/api/issues/${issue.id}/${path}`, { method: 'POST', body });
      toast(message);
      setShowReopen(false);
      onChange();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (viewer.isAdmin) {
    return (
      <div className="action-box">
        <p>You're signed in as a ward officer.</p>
        <Link className="btn btn-primary" to={`/admin?focus=${issue.id}`}>Update in officer queue</Link>
      </div>
    );
  }

  if (viewer.isReporter && issue.status === 'resolved') {
    return (
      <div className="action-box">
        <p><strong>The officer marked this as resolved. Is it actually fixed?</strong></p>
        <div className="action-buttons">
          <button className="btn btn-primary" id="confirm-btn" disabled={busy}
            onClick={() => run('confirm', undefined, 'Thanks. The issue is now closed.')}>
            Yes, it's fixed
          </button>
          <button className="btn btn-danger" id="reopen-toggle" onClick={() => setShowReopen(true)}>
            No, it's still a problem
          </button>
        </div>
        {showReopen && (
          <form id="reopen-form" onSubmit={(e) => {
            e.preventDefault();
            run('reopen', { reason: reason.trim() }, 'Issue reopened. It\'s back in the officer\'s queue with higher priority.');
          }}>
            <div className="field">
              <label htmlFor="reopen-reason">What is still wrong?</label>
              <textarea id="reopen-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus required />
            </div>
            <button className="btn btn-danger" type="submit" disabled={busy}>Reopen issue</button>
          </form>
        )}
      </div>
    );
  }

  if (viewer.isReporter) {
    return open ? (
      <div className="action-box">
        <p>This is your report. You'll be asked to confirm the fix once the officer marks it resolved.</p>
      </div>
    ) : null;
  }

  if (!open) return null;

  if (!user) {
    return (
      <div className="action-box">
        <p>Affected by this too? Backing a report raises its priority.</p>
        <Link className="btn btn-marking" to={`/login?next=${encodeURIComponent(`/issues/${issue.id}`)}`}>
          Log in to back this report
        </Link>
      </div>
    );
  }

  if (viewer.supported) {
    return <div className="action-box"><p>You're backing this report. It's listed under My reports.</p></div>;
  }

  return (
    <div className="action-box">
      <p>Affected by this too? Backing a report raises its priority instead of creating a duplicate.</p>
      <button className="btn btn-marking" id="support-btn" disabled={busy}
        onClick={() => run('support', undefined, 'You\'re now backing this report.')}>
        Me too
      </button>
    </div>
  );
}
