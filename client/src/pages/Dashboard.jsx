// =====================================================================
// Dashboard : public statistics
//  - headline figures
//  - stacked bar: counts by category and status (core requirement)
//  - grouped bar: average fix time vs target per category
//  - the same numbers as accessible tables
// =====================================================================
import { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Title, Tooltip } from 'chart.js';
import { api } from '../api';
import { STATUS_COLORS, STATUS_LABELS, formatHours } from '../utils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);
ChartJS.defaults.font.family = "'Barlow', 'Segoe UI', system-ui, sans-serif";
ChartJS.defaults.font.size = 13;
ChartJS.defaults.color = '#5f6670';

const STATUSES = ['submitted', 'acknowledged', 'in_progress', 'reopened', 'resolved', 'closed', 'rejected'];
const legend = { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12 } };

function Figure({ value, label, alert = false }) {
  return (
    <div className={`figure${alert ? ' alert' : ''}`}>
      <div className="num">{value}</div>
      <div className="lbl">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/stats/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <main className="page"><div className="form-error">{error}</div></main>;
  if (!data) return <main className="page"><p className="loading">Loading numbers…</p></main>;

  const { categories, matrix, summary, responseTimes } = data;

  // counts[category][status] = number of issues
  const counts = Object.fromEntries(categories.map((c) => [c.code, {}]));
  matrix.forEach((m) => { counts[m.category_code][m.status] = m.count; });
  const n = (cat, st) => counts[cat][st] || 0;

  const rowTotal = (cat) => STATUSES.reduce((sum, s) => sum + n(cat, s), 0);
  const colTotal = (st) => categories.reduce((sum, c) => sum + n(c.code, st), 0);
  const grandTotal = categories.reduce((sum, c) => sum + rowTotal(c.code), 0);

  return (
    <main className="page">
      <div className="page-head">
        <h1>How the ward is doing</h1>
        <p>Live numbers from every report. Anyone can see this page, so residents can hold the ward to its target fix times.</p>
      </div>

      <div className="figures">
        <Figure value={summary.open} label="Open right now" />
        <Figure value={summary.overdue} label="Past their target time" alert={summary.overdue > 0} />
        <Figure value={summary.fixed} label="Fixed so far" />
        <Figure value={summary.avg_fix_hours === null ? '–' : formatHours(summary.avg_fix_hours)} label="Average time to fix" />
        <Figure value={summary.within_target_pct === null ? '–' : `${summary.within_target_pct}%`} label="Fixed within target" />
      </div>

      <div className="charts">
        <section className="panel">
          <h2>Issues by category and status</h2>
          <p className="sub">Each bar is one category, split by where its issues are in the workflow.</p>
          <div className="chart-box">
            <Bar
              aria-label="Stacked bar chart of issue counts by category and status. The same numbers are in the table below."
              role="img"
              data={{
                labels: categories.map((c) => c.label),
                datasets: STATUSES.map((s) => ({
                  label: STATUS_LABELS[s],
                  data: categories.map((c) => n(c.code, s)),
                  backgroundColor: STATUS_COLORS[s],
                  borderColor: '#fff',
                  borderWidth: 1
                }))
              }}
              options={{
                indexAxis: 'y',
                maintainAspectRatio: false,
                scales: {
                  x: { stacked: true, ticks: { precision: 0 }, grid: { color: '#e8ebe9' } },
                  y: { stacked: true, grid: { display: false } }
                },
                plugins: { legend }
              }}
            />
          </div>
        </section>

        <section className="panel">
          <h2>Time to fix compared with target</h2>
          <p className="sub">Average hours from report to resolved, for fixed issues only.</p>
          <div className="chart-box">
            <Bar
              aria-label="Bar chart comparing average fix time with the target time for each category. The same numbers are in the table below."
              role="img"
              data={{
                labels: responseTimes.map((r) => r.label),
                datasets: [
                  {
                    label: 'Average time to fix (h)',
                    data: responseTimes.map((r) => r.avg_hours),
                    backgroundColor: responseTimes.map((r) => (r.avg_hours !== null && r.avg_hours > r.sla_hours ? '#b42318' : '#1f5fad'))
                  },
                  { label: 'Target (h)', data: responseTimes.map((r) => r.sla_hours), backgroundColor: '#f2b705' }
                ]
              }}
              options={{
                maintainAspectRatio: false,
                scales: {
                  y: { beginAtZero: true, title: { display: true, text: 'Hours' }, grid: { color: '#e8ebe9' } },
                  x: { grid: { display: false } }
                },
                plugins: { legend }
              }}
            />
          </div>
        </section>
      </div>

      <section className="panel stack">
        <h2>Issue counts</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Category</th>
                {STATUSES.map((s) => <th key={s} scope="col" className="num">{STATUS_LABELS[s]}</th>)}
                <th scope="col" className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.code}>
                  <th scope="row">{c.label}</th>
                  {STATUSES.map((s) => <td key={s} className="num">{n(c.code, s)}</td>)}
                  <td className="num"><strong>{rowTotal(c.code)}</strong></td>
                </tr>
              ))}
              <tr className="total">
                <td>Total</td>
                {STATUSES.map((s) => <td key={s} className="num">{colTotal(s)}</td>)}
                <td className="num">{grandTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Response times</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col" className="num">Target</th>
                <th scope="col" className="num">Fixed</th>
                <th scope="col" className="num">Average time</th>
                <th scope="col" className="num">Within target</th>
              </tr>
            </thead>
            <tbody>
              {responseTimes.map((r) => (
                <tr key={r.code}>
                  <th scope="row">{r.label}</th>
                  <td className="num">{formatHours(r.sla_hours)}</td>
                  <td className="num">{r.fixed_count}</td>
                  <td className="num">{r.avg_hours === null ? '–' : formatHours(r.avg_hours)}</td>
                  <td className="num">{r.fixed_count ? `${Math.round((r.within_target / r.fixed_count) * 100)}%` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
