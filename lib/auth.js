// Route guards based on the logged-in user stored in the session.

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Log in to continue.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Log in to continue.' });
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only ward officers can do this.' });
  }
  next();
}

module.exports = { requireLogin, requireAdmin };
