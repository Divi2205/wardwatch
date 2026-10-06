// =====================================================================
// Home : map of issues beside a filterable list.
// Hovering a list item enlarges its pin; focusing it flies the map there.
// =====================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Popup } from 'react-leaflet';
import { api } from '../api';
import { BaseMap, FitBounds, FlyTo, Legend, StatusPin } from '../components/MapParts';
import { StatusBadge } from '../components/Badges';
import IssueTicket from '../components/IssueTicket';
import { useCategories } from '../hooks';

export default function Home() {
  const categories = useCategories();
  const [status, setStatus] = useState('open');
  const [category, setCategory] = useState('');
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hoverId, setHoverId] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const pinRefs = useRef({});
  const listRef = useRef(null);

  // Reload whenever a filter changes
  useEffect(() => {
    const params = new URLSearchParams();
    if (status === 'open') params.set('open', '1');
    else if (status) params.set('status', status);
    if (category) params.set('category', category);

    setLoading(true);
    setError('');
    api(`/api/issues?${params}`)
      .then((d) => setIssues(d.issues))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [status, category]);

  const points = useMemo(() => issues.map((i) => [i.latitude, i.longitude]), [issues]);

  // List item focused with the keyboard: fly to its pin and open the popup
  function focusIssue(issue) {
    setActiveId(issue.id);
    setFlyTarget([issue.latitude, issue.longitude]);
    setTimeout(() => pinRefs.current[issue.id]?.openPopup(), 650);
  }

  // Pin clicked: highlight and scroll to its list item
  function pinClicked(id) {
    setActiveId(id);
    listRef.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  return (
    <main className="home">
      <section className="home-map" aria-label="Map of reported issues">
        <BaseMap className="home-leaflet">
          <FitBounds points={points} />
          <FlyTo target={flyTarget} />
          {issues.map((i) => (
            <StatusPin
              key={i.id}
              issue={i}
              big={hoverId === i.id}
              ref={(el) => (pinRefs.current[i.id] = el)}
              eventHandlers={{ click: () => pinClicked(i.id) }}
            >
              <Popup>
                <div className="pin-popup">
                  <StatusBadge status={i.status} />
                  <h3>{i.title}</h3>
                  <p>{i.category_label}{i.landmark ? `, ${i.landmark}` : ''}</p>
                  <Link to={`/issues/${i.id}`}>See details</Link>
                </div>
              </Popup>
            </StatusPin>
          ))}
        </BaseMap>
      </section>

      <aside className="home-panel">
        <h1>What needs fixing nearby</h1>
        <p className="lede">
          Every pin is a problem a resident reported. It stays on the map until the ward fixes it and the
          person who reported it confirms the fix.
        </p>
        <Link className="btn btn-marking" to="/report">Report an issue</Link>

        <div className="filter-row">
          <div>
            <label htmlFor="f-status">Show</label>
            <select id="f-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="open">Open issues</option>
              <option value="">Everything</option>
              <option value="submitted">Submitted</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="in_progress">In progress</option>
              <option value="reopened">Reopened</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-category">Category</label>
            <select id="f-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <Legend statuses={['submitted', 'acknowledged', 'in_progress', 'reopened', 'resolved']} />

        <p className="result-count" aria-live="polite">
          {!loading && !error && `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}`}
        </p>

        {error && <div className="form-error">{error}</div>}
        {loading && <p className="loading">Loading issues…</p>}
        {!loading && !error && issues.length === 0 && (
          <div className="empty">
            <p>No issues match these filters.</p>
            <Link className="btn btn-secondary" to="/report">Report one</Link>
          </div>
        )}

        <ul className="ticket-list" ref={listRef}>
          {issues.map((i) => (
            <li key={i.id}>
              <IssueTicket
                issue={i}
                active={activeId === i.id}
                onMouseEnter={() => setHoverId(i.id)}
                onMouseLeave={() => setHoverId(null)}
                onFocus={() => focusIssue(i)}
              />
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
