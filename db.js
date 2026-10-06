// ---------------------------------------------------------------------
// MySQL connection pool. Every route imports this to talk to MySQL.
// A pool reuses connections instead of opening a new one per request.
// ---------------------------------------------------------------------
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wardwatch',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true // return DECIMAL lat/lng as numbers, not strings
});

module.exports = pool;
