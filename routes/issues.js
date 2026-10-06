// ---------------------------------------------------------------------
// /api/issues : everything citizens do
//   GET    /categories        list categories with target times
//   GET    /                  list issues (filters: status, category, mine, open)
//   GET    /nearby            open issues of the same category within 150 m
//   GET    /:id               one issue with its full history
//   POST   /                  report a new issue (multipart form, optional photo)
//   POST   /:id/support       "me too" on someone else's issue
//   POST   /:id/confirm       reporter confirms the fix worked -> closed
//   POST   /:id/reopen        reporter says it isn't fixed -> reopened
// ---------------------------------------------------------------------
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('../db');
const wrap = require('../lib/wrap');
const { requireLogin } = require('../lib/auth');
const { scoreIssue, recomputeTriage } = require('../lib/triage');
const { OPEN_STATUSES, STATUSES } = require('../lib/workflow');

const router = express.Router();
const DUPLICATE_RADIUS_M = 150;

// ---------- Photo upload (stored on disk, path saved in MySQL) ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'uploads'),
    filename: (req, file, cb) => {
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype];
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(null, true);
    const err = new Error('Upload a JPG, PNG or WebP photo.');
    err.status = 400;
    cb(err);
  }
});

// Columns shared by list and detail queries
const ISSUE_COLUMNS = `
  i.id, i.title, i.description, i.category_code, c.label AS category_label,
  i.latitude, i.longitude, i.landmark, i.photo_path, i.status, i.priority,
  i.suggested_priority, i.supporters, i.escalated, i.reopen_count, i.remarks,
  i.reporter_id, SUBSTRING_INDEX(u.name, ' ', 1) AS reporter_first_name,
  i.created_at, i.updated_at, i.resolved_at, i.closed_at, c.sla_hours,
  TIMESTAMPDIFF(HOUR, i.created_at, COALESCE(i.resolved_at, NOW())) AS hours_open`;

const ISSUE_FROM = `
  FROM issues i
  JOIN categories c ON c.code = i.category_code
  JOIN users u ON u.id = i.reporter_id`;

router.get('/categories', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT code, label, sla_hours FROM categories ORDER BY base_weight DESC, label');
  res.json({ categories: rows });
}));

router.get('/', wrap(async (req, res) => {
  const where = [];
  const params = [];

  if (req.query.status && STATUSES.includes(req.query.status)) {
    where.push('i.status = ?');
    params.push(req.query.status);
  }
  if (req.query.category) {
    where.push('i.category_code = ?');
    params.push(req.query.category);
  }
  if (req.query.open === '1') {
    where.push(`i.status IN (${OPEN_STATUSES.map(() => '?').join(',')})`);
    params.push(...OPEN_STATUSES);
  }
  if (req.query.mine === '1') {
    if (!req.session.user) return res.status(401).json({ error: 'Log in to see your reports.' });
    where.push('(i.reporter_id = ? OR i.id IN (SELECT issue_id FROM issue_supporters WHERE user_id = ?))');
    params.push(req.session.user.id, req.session.user.id);
  }

  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const [rows] = await pool.query(
    `SELECT ${ISSUE_COLUMNS} ${ISSUE_FROM}
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY i.created_at DESC
     LIMIT ${limit}`,
    params
  );
  res.json({ issues: rows });
}));

// Duplicate check used by the report form before submitting.
// Uses the haversine formula to get distance in metres between two points.
router.get('/nearby', wrap(async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const category = req.query.category;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !category) {
    return res.status(400).json({ error: 'lat, lng and category are required.' });
  }

  const [rows] = await pool.query(
    `SELECT ${ISSUE_COLUMNS},
       ROUND(6371000 * ACOS(LEAST(1,
         COS(RADIANS(?)) * COS(RADIANS(i.latitude)) * COS(RADIANS(i.longitude) - RADIANS(?)) +
         SIN(RADIANS(?)) * SIN(RADIANS(i.latitude))))) AS distance_m
     ${ISSUE_FROM}
     WHERE i.category_code = ?
       AND i.status IN (${OPEN_STATUSES.map(() => '?').join(',')})
       AND i.latitude BETWEEN ? AND ?
       AND i.longitude BETWEEN ? AND ?
     HAVING distance_m <= ?
     ORDER BY distance_m
     LIMIT 5`,
    [lat, lng, lat, category, ...OPEN_STATUSES, lat - 0.005, lat + 0.005, lng - 0.005, lng + 0.005, DUPLICATE_RADIUS_M]
  );
  res.json({ issues: rows, radius_m: DUPLICATE_RADIUS_M });
}));

router.get('/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.query(`SELECT ${ISSUE_COLUMNS} ${ISSUE_FROM} WHERE i.id = ?`, [id]);
  if (!rows.length) return res.status(404).json({ error: 'This issue doesn\'t exist.' });

  const [history] = await pool.query(
    `SELECT h.action, h.from_value, h.to_value, h.note, h.created_at,
            u.name AS actor_name, u.role AS actor_role
       FROM issue_history h LEFT JOIN users u ON u.id = h.actor_id
      WHERE h.issue_id = ?
      ORDER BY h.created_at, h.id`,
    [id]
  );

  const me = req.session.user;
  let supported = false;
  if (me) {
    const [s] = await pool.query('SELECT 1 FROM issue_supporters WHERE issue_id = ? AND user_id = ?', [id, me.id]);
    supported = s.length > 0;
  }

  res.json({
    issue: rows[0],
    history,
    viewer: {
      isReporter: !!me && me.id === rows[0].reporter_id,
      supported,
      isAdmin: !!me && me.role === 'admin'
    }
  });
}));

router.post('/', requireLogin, upload.single('photo'), wrap(async (req, res) => {
  const cleanup = () => req.file && fs.unlink(req.file.path, () => {});
  const title = (req.body.title || '').trim();
  const description = (req.body.description || '').trim();
  const category = req.body.category;
  const landmark = (req.body.landmark || '').trim().slice(0, 200) || null;
  const lat = Number(req.body.latitude);
  const lng = Number(req.body.longitude);

  const fail = (msg) => { cleanup(); return res.status(400).json({ error: msg }); };
  if (title.length < 5 || title.length > 150) return fail('Give the issue a short title (5 to 150 characters).');
  if (description.length < 10) return fail('Describe the issue in at least 10 characters.');
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return fail('Pin the location on the map.');
  }

  const [cats] = await pool.query('SELECT base_weight FROM categories WHERE code = ?', [category]);
  if (!cats.length) return fail('Choose a category.');

  const triage = scoreIssue({ baseWeight: cats[0].base_weight, title, description });
  const photoPath = req.file ? `/uploads/${req.file.filename}` : null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO issues (title, description, category_code, latitude, longitude, landmark,
                           photo_path, triage_score, suggested_priority, reporter_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, category, lat, lng, landmark, photoPath, triage.score, triage.priority, req.session.user.id]
    );
    await conn.query(
      `INSERT INTO issue_history (issue_id, actor_id, action, to_value, note) VALUES (?, ?, 'created', 'submitted', NULL)`,
      [result.insertId, req.session.user.id]
    );
    await conn.commit();
    res.status(201).json({ id: result.insertId, suggested_priority: triage.priority });
  } catch (err) {
    await conn.rollback();
    cleanup();
    throw err;
  } finally {
    conn.release();
  }
}));

router.post('/:id/support', requireLogin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const me = req.session.user;
  const [rows] = await pool.query('SELECT reporter_id, status FROM issues WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ error: 'This issue doesn\'t exist.' });
  if (rows[0].reporter_id === me.id) return res.status(400).json({ error: 'You reported this issue, so you\'re already counted.' });
  if (!OPEN_STATUSES.includes(rows[0].status)) return res.status(400).json({ error: 'This issue is no longer open.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [ins] = await conn.query('INSERT IGNORE INTO issue_supporters (issue_id, user_id) VALUES (?, ?)', [id, me.id]);
    if (ins.affectedRows === 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'You\'ve already backed this issue.' });
    }
    await conn.query('UPDATE issues SET supporters = supporters + 1 WHERE id = ?', [id]);
    await conn.query(
      `INSERT INTO issue_history (issue_id, actor_id, action, note) VALUES (?, ?, 'support', NULL)`,
      [id, me.id]
    );
    const triage = await recomputeTriage(conn, id);
    await conn.commit();
    res.json({ ok: true, suggested_priority: triage.priority });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}));

// Shared checks for confirm / reopen: only the reporter, only when resolved
async function loadResolvedForReporter(req, res) {
  const id = Number(req.params.id);
  const [rows] = await pool.query('SELECT id, reporter_id, status FROM issues WHERE id = ?', [id]);
  if (!rows.length) { res.status(404).json({ error: 'This issue doesn\'t exist.' }); return null; }
  if (rows[0].reporter_id !== req.session.user.id) { res.status(403).json({ error: 'Only the person who reported this can do that.' }); return null; }
  if (rows[0].status !== 'resolved') { res.status(400).json({ error: 'This issue isn\'t marked resolved yet.' }); return null; }
  return rows[0];
}

router.post('/:id/confirm', requireLogin, wrap(async (req, res) => {
  const issue = await loadResolvedForReporter(req, res);
  if (!issue) return;
  await pool.query(`UPDATE issues SET status = 'closed', closed_at = NOW() WHERE id = ?`, [issue.id]);
  await pool.query(
    `INSERT INTO issue_history (issue_id, actor_id, action, from_value, to_value, note)
     VALUES (?, ?, 'status', 'resolved', 'closed', 'Reporter confirmed the fix.')`,
    [issue.id, req.session.user.id]
  );
  res.json({ ok: true });
}));

router.post('/:id/reopen', requireLogin, wrap(async (req, res) => {
  const reason = (req.body.reason || '').trim();
  if (reason.length < 5) return res.status(400).json({ error: 'Say what is still wrong so the officer can act on it.' });
  const issue = await loadResolvedForReporter(req, res);
  if (!issue) return;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE issues SET status = 'reopened', resolved_at = NULL, reopen_count = reopen_count + 1 WHERE id = ?`,
      [issue.id]
    );
    await conn.query(
      `INSERT INTO issue_history (issue_id, actor_id, action, from_value, to_value, note)
       VALUES (?, ?, 'status', 'resolved', 'reopened', ?)`,
      [issue.id, req.session.user.id, reason]
    );
    await recomputeTriage(conn, issue.id);
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
