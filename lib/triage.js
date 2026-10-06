// ---------------------------------------------------------------------
// Automatic triage.
//
// Every issue gets a triage score, which maps to a SUGGESTED priority.
// The admin sees the suggestion pre-filled and confirms or overrides it.
//
//   score = category weight x 10
//         + 15 per danger keyword found in title/description (max 30)
//         + 5 per resident who backed it with "me too" (max 25)
//         + 10 per time it was reopened after a failed fix
//         + 20 if it has gone past its category's target time
//
//   score >= 75 -> critical | >= 55 -> high | >= 35 -> medium | else low
// ---------------------------------------------------------------------
const pool = require('../db');
const { PRIORITIES, OPEN_STATUSES } = require('./workflow');

const DANGER_KEYWORDS = [
  'accident', 'injur', 'fell', 'child', 'school', 'hospital', 'ambulance',
  'flood', 'live wire', 'electric', 'shock', 'sewage', 'contaminat',
  'dark', 'unsafe', 'women', 'elderly', 'mosquito', 'dengue'
];

function scoreIssue({ baseWeight, title = '', description = '', supporters = 0, reopenCount = 0, escalated = false }) {
  const text = `${title} ${description}`.toLowerCase();
  const keywordHits = DANGER_KEYWORDS.filter((k) => text.includes(k)).length;

  const score =
    baseWeight * 10 +
    Math.min(keywordHits * 15, 30) +
    Math.min(supporters * 5, 25) +
    reopenCount * 10 +
    (escalated ? 20 : 0);

  return { score, priority: priorityFromScore(score) };
}

function priorityFromScore(score) {
  if (score >= 75) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

function bumpPriority(p) {
  const i = PRIORITIES.indexOf(p);
  return PRIORITIES[Math.min(i + 1, PRIORITIES.length - 1)];
}

// 168 -> "7-day", 36 -> "36-hour"
function targetText(hours) {
  return hours % 24 === 0 ? `${hours / 24}-day` : `${hours}-hour`;
}

// Recalculate and store the score for one issue (after support, reopen, etc.)
async function recomputeTriage(conn, issueId) {
  const [rows] = await conn.query(
    `SELECT i.title, i.description, i.supporters, i.reopen_count, i.escalated, c.base_weight
       FROM issues i JOIN categories c ON c.code = i.category_code
      WHERE i.id = ?`,
    [issueId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  const result = scoreIssue({
    baseWeight: r.base_weight,
    title: r.title,
    description: r.description,
    supporters: r.supporters,
    reopenCount: r.reopen_count,
    escalated: !!r.escalated
  });
  await conn.query('UPDATE issues SET triage_score = ?, suggested_priority = ? WHERE id = ?', [
    result.score,
    result.priority,
    issueId
  ]);
  return result;
}

// ---------------------------------------------------------------------
// Background maintenance, run on startup and every 15 minutes:
//  1. Escalate open issues that have passed their category's target time.
//  2. Auto-close resolved issues the reporter didn't respond to in 7 days.
// ---------------------------------------------------------------------
async function runMaintenance() {
  const placeholders = OPEN_STATUSES.map(() => '?').join(',');
  const [overdue] = await pool.query(
    `SELECT i.id, i.priority, c.sla_hours, c.label
       FROM issues i JOIN categories c ON c.code = i.category_code
      WHERE i.status IN (${placeholders})
        AND i.escalated = 0
        AND TIMESTAMPDIFF(HOUR, i.created_at, NOW()) > c.sla_hours`,
    OPEN_STATUSES
  );

  for (const issue of overdue) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('UPDATE issues SET escalated = 1 WHERE id = ?', [issue.id]);
      await recomputeTriage(conn, issue.id);

      // If an officer already confirmed a priority, raise it one level.
      if (issue.priority && issue.priority !== 'critical') {
        const raised = bumpPriority(issue.priority);
        await conn.query('UPDATE issues SET priority = ? WHERE id = ?', [raised, issue.id]);
        await conn.query(
          `INSERT INTO issue_history (issue_id, actor_id, action, from_value, to_value, note)
           VALUES (?, NULL, 'priority', ?, ?, ?)`,
          [issue.id, issue.priority, raised, 'Raised automatically after escalation.']
        );
      }
      await conn.query(
        `INSERT INTO issue_history (issue_id, actor_id, action, note) VALUES (?, NULL, 'escalated', ?)`,
        [issue.id, `Open longer than the ${targetText(issue.sla_hours)} target for ${issue.label.toLowerCase()}.`]
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  const [stale] = await pool.query(
    `SELECT id FROM issues WHERE status = 'resolved' AND resolved_at < NOW() - INTERVAL 7 DAY`
  );
  for (const { id } of stale) {
    await pool.query(`UPDATE issues SET status = 'closed', closed_at = NOW() WHERE id = ?`, [id]);
    await pool.query(
      `INSERT INTO issue_history (issue_id, actor_id, action, from_value, to_value, note)
       VALUES (?, NULL, 'status', 'resolved', 'closed', ?)`,
      [id, 'Closed automatically: the reporter did not respond within 7 days.']
    );
  }

  return { escalated: overdue.length, autoClosed: stale.length };
}

module.exports = { scoreIssue, priorityFromScore, recomputeTriage, runMaintenance, DANGER_KEYWORDS };
