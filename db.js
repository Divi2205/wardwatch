// ---------------------------------------------------------------------
// MySQL connection pool. Every route imports this to talk to MySQL.
// A pool reuses connections instead of opening a new one per request.
// Set DB_SSL=true for cloud databases (TiDB Cloud, Aiven, etc.).
// ---------------------------------------------------------------------
require('dotenv').config();
const mysql = require('mysql2/promise');

const useSsl = process.env.DB_SSL === 'true';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wardwatch',
  ssl: useSsl ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
  waitForConnections: true,
  connectionLimit: process.env.VERCEL ? 3 : 10, // serverless: keep it small
  enableKeepAlive: true,
  decimalNumbers: true // return DECIMAL lat/lng as numbers, not strings
});

module.exports = pool;
