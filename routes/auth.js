// ---------------------------------------------------------------------
// /api/auth : register, log in, log out, who am I
// Passwords are hashed with bcrypt; the logged-in user lives in the session.
// ---------------------------------------------------------------------
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const wrap = require('../lib/wrap');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

router.post('/register', wrap(async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (name.length < 2) return res.status(400).json({ error: 'Enter your name.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 6) return res.status(400).json({ error: 'Use a password of at least 6 characters.' });

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) return res.status(409).json({ error: 'An account with this email already exists. Log in instead.' });

  const hash = await bcrypt.hash(password, 10);
  // New accounts are always citizens. Admins are created by the seed script.
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    [name, email, hash]
  );

  req.session.user = { id: result.insertId, name, email, role: 'citizen' };
  res.status(201).json({ user: req.session.user });
}));

router.post('/login', wrap(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'That email and password don\'t match an account.' });
  }

  req.session.user = publicUser(user);
  res.json({ user: req.session.user });
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

module.exports = router;
