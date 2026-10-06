// ---------------------------------------------------------------------
// npm run db:init : creates the database and tables from db/schema.sql
// using the settings in .env. Works with local MySQL and cloud MySQL,
// so you don't need the mysql command-line client installed.
// WARNING: drops and recreates the "wardwatch" database.
// ---------------------------------------------------------------------
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
    multipleStatements: true
  });
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(sql);
  await conn.end();
  console.log('Database "wardwatch" and its tables are ready. Next: npm run seed');
})().catch((err) => {
  console.error('Could not create the database:', err.message);
  process.exit(1);
});
