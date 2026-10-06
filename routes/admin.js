// ---------------------------------------------------------------------
// /api/admin : ward officer tools (admin role only)
//   GET   /queue          all issues, sorted so the most urgent come first
//   PATCH /issues/:id     change status, priority and remarks
// ---------------------------------------------------------------------
const express = require('express');
const pool = require('../db');
const wrap = require('../lib/wrap');
const { requireAdmin } = require('../lib/auth');
const { OPEN_STATUSES, PRIORITIES, STATUSES, nextStatusesForAdmin, canAdminMove } = require('../lib/workflow');

const router = express.Router();
router.use(requireAdmin);

const OPEN_LIST = OPEN_STATUSES.map((s) => `'${s}'`).join(',');

router.get('/queue', wrap(async (req, res) => {
  const where = [];
  const params = [];

  if (req.query.status === 'open') {
    where.push(`i.status IN (${OPEN_LIST})`);
  } else if (STATUSES.includes(req.query.status)) {
    where.push('i.status = ?');
    params.push(req.query.status);
  }
  if (req.query.category) {
    where.push('i.category_code = ?');
    params.push(req.query.category);
  }
  if (req.query.overdue === '1') {
    where.push(`i.status IN (${OPEN_LIST}) AND TIMESTAMPDIFF(HOUR, i.created_at, NOW()) > c.sla_hours`);
  }
  if (req.query.unconfirmed === '1') {
    where.push('i.priority IS NULL');
  }

  const [rows] = await pool.query(
    `SELECT i.id, i.title, i.description, i.category_code, c.label AS category_label,
            i.latitude, i.longitude, i.landmark, i.photo_path, i.status, i.priority,
            i.suggested_priority, i.triage_score, i.supporters, i.escalated, i.reopen_count,
            i.remarks, i.created_at, i.updated_at, c.sla_hours, u.name AS reporter_name,
            TIMESTAMPDIFF(HOUR, i.created_at, COALESCE(i.resolved_at, NOW())) AS hours_open,
            (i.status IN (${OPEN_LIST}) AND TIMESTAMPDIFF(HOUR, i.created_at, NOW()) > c.sla_hours) AS overdue
       FROM issues i
       JOIN categories c ON c.code = i.category_code
       JOIN users u ON u.id = i.reporter_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY (i.status IN (${OPEN_LIST})) DESC,
               overdue DESC,
               FIELD(COALESCE(i.priority, i.suggested_priority), 'critical', 'high', 'medium', 'low'),
               i.triage_score DESC,
               i.created_at ASC
      LIMIT 500`,
    params
  );

  res.json({
    issues: rows.map((r) => ({ ...r, overdue: !!r.overdue, next_statuses: nextStatusesForAdmin(r.status) }))
  });
}));

router.patch('/issues/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const adminId = req.session.user.id;
  const { status, priority } = req.body;
  const remarks = typeof req.body.remarks === 'string' ? req.body.remarks.trim() : undefined;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // FOR UPDATE locks the row so two officers can't overwrite each other
    const [rows] = await conn.query('SELECT * FROM issues WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'This issue doesn\'t exist.' });
    }
    const issue = rows[0];
    const sets = [];
    const setParams = [];
    const history = [];

    // ----- Status -----
    if (status && status !== issue.status) {
      if (!canAdminMove(issue.status, status)) {
        await conn.rollback();
        return res.status(400).json({ error: `An issue that is "${issue.status.replace('_', ' ')}" can't move to "${status.replace('_', ' ')}".` });
      }
      if (status === 'rejected' && !remarks) {
        await conn.rollback();
        return res.status(400).json({ error: 'Add a remark explaining why this issue is rejected.' });
      }
      sets.push('status = ?');
      setParams.push(status);
      if (status === 'resolved') sets.push('resolved_at = NOW()');
      history.push(['status', issue.status, status, null]);
    }

    // ----- Priority -----
    if (priority && priority !== issue.priority) {
      if (!PRIORITIES.includes(priority)) {
        await conn.rollback();
        return res.status(400).json({ error: 'Choose a valid priority.' });
      }
      sets.push('priority = ?');
      setParams.push(priority);
      history.push(['priority', issue.priority, priority, null]);
    }

    // ----- Remarks (visible to the public) -----
    if (remarks !== undefined && remarks !== (issue.remarks || '')) {
      sets.push('remarks = ?');
      setParams.push(remarks || null);
      if (remarks) history.push(['remark', null, null, remarks]);
    }

    if (!sets.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'Nothing changed, so there was nothing to save.' });
    }

    await conn.query(`UPDATE issues SET ${sets.join(', ')} WHERE id = ?`, [...setParams, id]);
    for (const [action, from, to, note] of history) {
      await conn.query(
        'INSERT INTO issue_history (issue_id, actor_id, action, from_value, to_value, note) VALUES (?, ?, ?, ?, ?, ?)',
        [id, adminId, action, from, to, note]
      );
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}));

module.exports = router;
