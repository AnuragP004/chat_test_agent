const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/jobstasks'
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
