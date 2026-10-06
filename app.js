// ---------------------------------------------------------------------
// The Express app: sessions, API routes and error handling.
// Used two ways:
//   - locally by server.js, which also serves the React build and listens
//   - on Vercel by api/index.js, which runs it as a serverless function
// ---------------------------------------------------------------------
require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const crypto = require('crypto');
const wrap = require('./lib/wrap');
const pool = require('./db');
const { runMaintenance } = require('./lib/triage');

const app = express();
app.set('trust proxy', 1); // Vercel sits in front of the app as a proxy
app.use(express.json());

// Logins are kept in a signed cookie instead of server memory, because
// serverless functions don't share memory between requests.
// If SESSION_SECRET isn't set, a private key is derived from the DB password.
function sessionKey() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  return crypto.createHash('sha256').update(`wardwatch-session:${process.env.DB_PASSWORD || 'local-dev'}`).digest('hex');
}
app.use(
  cookieSession({
    name: 'ww_session',
    keys: [sessionKey()],
    maxAge: 1000 * 60 * 60 * 8,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  })
);

// Escalation / auto-close check. Runs at most every 10 minutes, triggered
// by normal page traffic, plus a daily Vercel Cron job as a backstop.
let lastMaintenance = 0;
async function maintenanceTick() {
  if (Date.now() - lastMaintenance < 10 * 60 * 1000) return;
  lastMaintenance = Date.now();
  try {
    await runMaintenance();
  } catch (err) {
    console.error('Maintenance failed:', err.message);
  }
}
app.use('/api', wrap(async (req, res, next) => {
  if (req.method === 'GET') await maintenanceTick();
  next();
}));

// Quick check that the server can reach MySQL (useful after deploying)
app.get('/api/health', wrap(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, database: 'connected' });
}));

// Called by Vercel Cron (see vercel.json)
app.get('/api/cron/maintenance', wrap(async (req, res) => {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Not allowed.' });
  }
  lastMaintenance = Date.now();
  res.json(await runMaintenance());
}));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/issues', require('./routes/issues'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/stats', require('./routes/stats'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route.' }));

// Central error handler: turns thrown errors into JSON the frontend can show
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'The photo must be under 5 MB.' });
  if (['ECONNREFUSED', 'ENOTFOUND', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ETIMEDOUT'].includes(err.code)) {
    console.error('Database connection problem:', err.message);
    return res.status(503).json({ error: 'The server can\'t reach the database. Check the DB_ settings.' });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server.' : err.message });
});

module.exports = app;
