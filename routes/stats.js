// ---------------------------------------------------------------------
// /api/stats/dashboard : public numbers for the dashboard page
//   - counts by category and status (the required chart)
//   - headline numbers (open, overdue, resolved, average fix time)
//   - response time per category compared with its target
// ---------------------------------------------------------------------
const express = require('express');
const pool = require('../db');
const wrap = require('../lib/wrap');
const { OPEN_STATUSES } = require('../lib/workflow');

const router = express.Router();
const OPEN_LIST = OPEN_STATUSES.map((s) => `'${s}'`).join(',');

router.get('/dashboard', wrap(async (req, res) => {
  const [categories] = await pool.query('SELECT code, label, sla_hours FROM categories ORDER BY base_weight DESC, label');

  const [matrix] = await pool.query(
    `SELECT category_code, status, COUNT(*) AS count
       FROM issues
      GROUP BY category_code, status`
  );

  const [[summary]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(i.status IN (${OPEN_LIST})), 0) AS open,
            COALESCE(SUM(i.status IN (${OPEN_LIST}) AND TIMESTAMPDIFF(HOUR, i.created_at, NOW()) > c.sla_hours), 0) AS overdue,
            COALESCE(SUM(i.status IN ('resolved','closed')), 0) AS fixed,
            COALESCE(SUM(i.status = 'reopened'), 0) AS reopened,
            COALESCE(SUM(i.supporters), 0) AS supporters,
            ROUND(AVG(CASE WHEN i.resolved_at IS NOT NULL
                       THEN TIMESTAMPDIFF(HOUR, i.created_at, i.resolved_at) END), 1) AS avg_fix_hours,
            ROUND(100 * SUM(i.resolved_at IS NOT NULL AND TIMESTAMPDIFF(HOUR, i.created_at, i.resolved_at) <= c.sla_hours)
                      / NULLIF(SUM(i.resolved_at IS NOT NULL), 0)) AS within_target_pct
       FROM issues i JOIN categories c ON c.code = i.category_code`
  );

  const [responseTimes] = await pool.query(
    `SELECT c.code, c.label, c.sla_hours,
            COUNT(i.id) AS fixed_count,
            ROUND(AVG(TIMESTAMPDIFF(HOUR, i.created_at, i.resolved_at)), 1) AS avg_hours,
            SUM(TIMESTAMPDIFF(HOUR, i.created_at, i.resolved_at) <= c.sla_hours) AS within_target
       FROM categories c
       LEFT JOIN issues i ON i.category_code = c.code AND i.resolved_at IS NOT NULL
      GROUP BY c.code, c.label, c.sla_hours, c.base_weight
      ORDER BY c.base_weight DESC, c.label`
  );

  // MySQL returns SUM() as strings in some setups; normalise to numbers
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  res.json({
    categories,
    matrix: matrix.map((m) => ({ ...m, count: num(m.count) })),
    summary: Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, num(v)])),
    responseTimes: responseTimes.map((r) => ({
      ...r,
      fixed_count: num(r.fixed_count),
      avg_hours: num(r.avg_hours),
      within_target: num(r.within_target) || 0
    }))
  });
}));

module.exports = router;
