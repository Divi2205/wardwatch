// =====================================================================
// AdminQueue : ward officer's work list
//  - filterable table, most urgent first (sorted by the server)
//  - side drawer to change status (only allowed next steps), priority
//    (pre-filled with the system's suggestion) and the public note
// =====================================================================
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { PriorityTag, StatusBadge } from '../components/Badges';
import { useCategories } from '../hooks';
import { PRIORITY_LABELS, STATUS_LABELS, formatHours, timeAgo } from '../utils';

export default function AdminQueue() {
  const categories = useCategories();
  const [searchParams] = useSearchParams();
  const focusId = Number(searchParams.get('focus')) || null;

  // Show everything when arriving from an issue page, so it's in the list
  const [filters, setFilters] = useState({ status: focusId ? '' : 'open', category: '', overdue: false, unconfirmed: false });
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(focusId);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.category) params.set('category', filters.category);
    if (filters.overdue) params.set('overdue', '1');
    if (filters.unconfirmed) params.set('unconfirmed', '1');
    setLoading(true);
    setError('');
    try {
      const d = await api(`/api/admin/queue?${params}`);
      setIssues(d.issues);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  // Escape closes the drawer
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setSelectedId(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const selected = issues.find((i) => i.id === selectedId) || null;
  const overdueCount = issues.filter((i) => i.overdue).length;
  const setFilter = (key) => (e) =>
    setFilters((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <main className="page page-wide">
      <div className="page-head">
        <h1>Officer queue</h1>
        <p>
          Most urgent first: issues past their target time, then by priority. Priorities in dashed outline are
          suggestions the system worked out; confirm or change them.
        </p>
      </div>

      <div className="toolbar">
        <div className="field">
          <label htmlFor="q-status">Status</label>
          <select id="q-status" value={filters.status} onChange={setFilter('status')}>
            <option value="open">Open (needs action)</option>
            <option value="">All</option>
            <option value="submitted">Submitted</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="in_progress">In progress</option>
            <option value="reopened">Reopened</option>
            <option value="resolved">Resolved, awaiting reporter</option>
            <option value="closed">Closed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="q-category">Category</label>
          <select id="q-category" value={filters.category} onChange={setFilter('category')}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </div>
        <label className="check">
          <input type="checkbox" id="q-overdue" checked={filters.overdue} onChange={setFilter('overdue')} /> Past target time only
        </label>
        <label className="check">
          <input type="checkbox" id="q-unconfirmed" checked={filters.unconfirmed} onChange={setFilter('unconfirmed')} /> Priority not confirmed
        </label>
      </div>
      <p className="result-count" aria-live="polite">
        {!loading && `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}${overdueCount ? `, ${overdueCount} past target time` : ''}`}
      </p>

      <div className={`queue-layout${selected ? ' has-drawer' : ''}`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Issue</th>
                <th scope="col">Category</th>
                <th scope="col">Status</th>
                <th scope="col">Priority</th>
                <th scope="col">Open for</th>
                <th scope="col" className="num">Backing</th>
              </tr>
            </thead>
            <tbody>
              {error && <tr><td colSpan={6}><div className="form-error">{error}</div></td></tr>}
              {loading && !issues.length && <tr><td colSpan={6} className="loading">Loading queue…</td></tr>}
              {!loading && !error && !issues.length && (
                <tr><td colSpan={6}><div className="empty"><p>Nothing here. Clear a filter to see more issues.</p></div></td></tr>
              )}
              {issues.map((i) => (
                <tr
                  key={i.id}
                  data-id={i.id}
                  tabIndex={0}
                  className={i.id === selectedId ? 'is-selected' : ''}
                  onClick={() => setSelectedId(i.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(i.id); }
                  }}
                >
                  <td>
                    <div className="title">{i.title}</div>
                    <div className="sub">#{i.id}{i.landmark ? `, ${i.landmark}` : ''}</div>
                  </td>
                  <td>{i.category_label}</td>
                  <td>
                    <StatusBadge status={i.status} />
                    {i.reopen_count > 0 && <div className="sub">Reopened {i.reopen_count}×</div>}
                  </td>
                  <td><PriorityTag issue={i} /></td>
                  <td>
                    {formatHours(i.hours_open)}
                    <div className="sub">target {formatHours(i.sla_hours)}</div>
                    {i.overdue && <div className="flag-overdue">Past target</div>}
                  </td>
                  <td className="num">{i.supporters}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          // key resets the form whenever a different issue (or a newer version) is shown
          <Drawer key={`${selected.id}-${selected.updated_at}`} issue={selected} onClose={() => setSelectedId(null)} onSaved={load} />
        )}
      </div>
    </main>
  );
}

function Drawer({ issue, onClose, onSaved }) {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState(issue.priority || issue.suggested_priority);
  const [remarks, setRemarks] = useState(issue.remarks || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  let statusNote = '';
  if (issue.status === 'resolved') statusNote = 'Waiting for the reporter to confirm the fix. It closes automatically after 7 days.';
  if (issue.status === 'closed' || issue.status === 'rejected') statusNote = 'This issue is finished. Its status can no longer change.';

  async function save(e) {
    e.preventDefault();
    setError('');
    const payload = { remarks };
    if (status) payload.status = status;
    // Saving the suggestion unchanged still counts as confirming it
    if (priority !== issue.priority) payload.priority = priority;

    setSaving(true);
    try {
      await api(`/api/admin/issues/${issue.id}`, { method: 'PATCH', body: payload });
      toast('Changes saved.');
      await onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <aside className="panel drawer" aria-labelledby="d-title">
      <div className="drawer-head">
        <div>
          <StatusBadge status={issue.status} />
          <h2 id="d-title">{issue.title}</h2>
        </div>
        <button className="close-btn" id="d-close" aria-label="Close" onClick={onClose}>&times;</button>
      </div>
      <p className="sub">
        {issue.category_label}, reported by {issue.reporter_name} {timeAgo(issue.created_at)}.{' '}
        <a href={`/issues/${issue.id}`} target="_blank" rel="noopener">Public page</a>
      </p>
      {issue.photo_path && <img className="issue-photo" src={issue.photo_path} alt="Photo of the issue" />}
      <p className="issue-description">{issue.description}</p>

      <form id="d-form" onSubmit={save} noValidate>
        <div className="form-error" id="d-error" role="alert">{error}</div>
        <div className="field">
          <label htmlFor="d-status">Status</label>
          <select id="d-status" value={status} onChange={(e) => setStatus(e.target.value)} disabled={!issue.next_statuses.length}>
            <option value="">Keep as {STATUS_LABELS[issue.status].toLowerCase()}</option>
            {issue.next_statuses.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          {statusNote && <span className="hint">{statusNote}</span>}
        </div>
        <div className="field">
          <label htmlFor="d-priority">Priority</label>
          <select id="d-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <p className="suggestion">
            {issue.priority
              ? `Confirmed. The system suggests ${PRIORITY_LABELS[issue.suggested_priority].toLowerCase()}`
              : `Suggested: ${PRIORITY_LABELS[issue.suggested_priority].toLowerCase()}`}{' '}
            (score {issue.triage_score}, from category, danger words, {issue.supporters} backing
            {issue.reopen_count ? ', reopenings' : ''}{issue.escalated ? ', time past target' : ''}).
          </p>
        </div>
        <div className="field">
          <label htmlFor="d-remarks">Note to residents</label>
          <textarea id="d-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)}
            placeholder="What's being done, or why it was rejected" />
          <span className="hint">Shown on the public issue page. Required when rejecting.</span>
        </div>
        <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      </form>
    </aside>
  );
}
