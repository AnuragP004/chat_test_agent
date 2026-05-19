const fs = require('fs');
const path = require('path');
const db = require('./db');

async function initDB() {
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await db.query(schemaSql);
    console.log('Database schema created successfully.');
    
    // Create a dummy user for testing
    const res = await db.query(`
      INSERT INTO users (email, name)
      VALUES ($1, $2)
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING user_id
    `, ['test@example.com', 'Test User']);
    console.log('Test user ID:', res.rows[0].user_id);

    const user_id = res.rows[0].user_id;

    // Create a sample job
    await db.query(`
      INSERT INTO jobs (user_id, title, customer, status, priority)
      VALUES ($1, 'Repair HVAC', 'ACME Corp', 'open', 'high')
      ON CONFLICT DO NOTHING
    `, [user_id]);
    console.log('Sample job created.');

    process.exit(0);
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

initDB();