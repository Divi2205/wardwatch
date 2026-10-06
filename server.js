// ---------------------------------------------------------------------
// Local server: runs the Express app from app.js, serves uploaded photos
// and the built React app, and runs the escalation check every 15 min.
// (On Vercel this file isn't used; see api/index.js and vercel.json.)
// ---------------------------------------------------------------------
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = require('./app');
const pool = require('./db');
const { runMaintenance } = require('./lib/triage');

const PORT = Number(process.env.PORT) || 3000;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));

const clientDist = path.join(__dirname, 'client', 'dist');
app.use(express.static(clientDist));

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
    console.error('Check DB_HOST, DB_USER, DB_PASSWORD and DB_NAME in your .env file, and that you ran the schema.\n');
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`WardWatch running at http://localhost:${PORT}`);
    maintenance();
    setInterval(maintenance, 15 * 60 * 1000);
  });
}

start();
