// ---------------------------------------------------------------------
// WardWatch server
// Exposes /api routes that read and write MySQL, and serves the built
// React app from client/dist. Browsers can't connect to MySQL directly,
// so this file is the database connectivity layer between the two.
// ---------------------------------------------------------------------
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const pool = require('./db');
const { runMaintenance } = require('./lib/triage');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 }
  })
);

app.use('/uploads', express.static(uploadDir));
const clientDist = path.join(__dirname, 'client', 'dist');
app.use(express.static(clientDist));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/issues', require('./routes/issues'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/stats', require('./routes/stats'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route.' }));

// React Router handles page URLs in the browser, so every other GET
// returns index.html and the React app shows the right page.
app.get('*', (req, res) => {
  const indexFile = path.join(clientDist, 'index.html');
  if (!fs.existsSync(indexFile)) {
    return res
      .status(503)
      .send('The React app has not been built yet. Run "npm run build" and restart, or use "npm run dev" and open http://localhost:5173');
  }
  res.sendFile(indexFile);
});

// Central error handler: turns thrown errors into JSON the frontend can show
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'The photo must be under 5 MB.' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server. Check the terminal for details.' : err.message });
});

async function maintenance() {
  try {
    const r = await runMaintenance();
    if (r.escalated || r.autoClosed) console.log(`Maintenance: escalated ${r.escalated}, auto-closed ${r.autoClosed}`);
  } catch (err) {
    console.error('Maintenance failed:', err.message);
  }
}

async function start() {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('\nCould not connect to MySQL:', err.message);
    console.error('Check DB_HOST, DB_USER, DB_PASSWORD and DB_NAME in your .env file, and that you ran db/schema.sql.\n');
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`WardWatch running at http://localhost:${PORT}`);
    maintenance();
    setInterval(maintenance, 15 * 60 * 1000);
  });
}

start();
