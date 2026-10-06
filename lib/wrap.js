// Express 4 does not catch errors thrown inside async handlers.
// Wrapping a handler forwards any error to the error middleware in server.js.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
