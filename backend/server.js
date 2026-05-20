require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const Groq = require('groq-sdk');
const db = require('./db');

const groq = process.env.GROQ_API_KEY ? new Groq({
  apiKey: process.env.GROQ_API_KEY,
}) : null;

if (!groq) {
  console.warn('WARNING: GROQ_API_KEY is missing. Chat features will be disabled.');
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// Middleware to validate JWT
const validateJwt = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid JWT' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.sub;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid JWT' });
  }
};

// --- Test Auth Route ---
// Generates a token for testing purposes
app.post('/api/test-token', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Email is required' });

  try {
    const { rows } = await db.query('SELECT user_id FROM users WHERE email = $1', [email]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
    }
    const token = jwt.sign({ sub: rows[0].user_id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user_id: rows[0].user_id });
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

// Helper for error handling
const handleDbError = (err, res, defaultMsg) => {
  if (err.code === '22P02') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid UUID format' });
  }
  console.error(err);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: defaultMsg });
};

// Apply JWT auth middleware to all routes below
app.use(validateJwt);

// ==========================================
// API Endpoints
// ==========================================

// GET /api/jobs
app.get('/api/jobs', async (req, res) => {
  try {
    const { status, priority, search, sort = 'created_at', order = 'desc', page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    let whereClauses = ['j.user_id = $1'];
    let params = [req.userId];
    let paramIndex = 2;

    if (status && status !== 'all') {
      whereClauses.push(`j.status = $${paramIndex++}`);
      params.push(status);
    }

    if (priority) {
      whereClauses.push(`j.priority = $${paramIndex++}`);
      params.push(priority);
    }

    if (search) {
      whereClauses.push(`(j.title ILIKE $${paramIndex} OR j.customer ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    let sortCol = 'j.created_at';
    if (sort === 'scheduled_at') sortCol = 'j.scheduled_at';
    if (sort === 'title') sortCol = 'j.title';

    const sortDir = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const countQuery = `SELECT COUNT(*) FROM jobs j ${whereStr}`;
    const countRes = await db.query(countQuery, params);
    const total = parseInt(countRes.rows[0].count);

    const dataQuery = `
      SELECT 
        j.job_id, j.title, j.customer, j.status, j.priority, j.scheduled_at, j.created_at,
        (SELECT COUNT(*) FROM tasks t WHERE t.job_id = j.job_id) as task_count,
        e.status as estimate_status,
        (
          SELECT COALESCE(SUM(t.qty * t.unit_rate), 0)
          FROM tasks t WHERE t.job_id = j.job_id
        ) as subtotal,
        e.markup_pct, e.tax_rate_pct, e.discount_pct
      FROM jobs j
      LEFT JOIN estimates e ON j.job_id = e.job_id
      ${whereStr}
      ORDER BY ${sortCol} ${sortDir}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(parseInt(limit), offset);

    const dataRes = await db.query(dataQuery, params);

    const jobs = dataRes.rows.map(row => {
      const subtotal = parseFloat(row.subtotal);
      const markup_pct = parseFloat(row.markup_pct || 0);
      const tax_rate_pct = parseFloat(row.tax_rate_pct || 10);
      const discount_pct = parseFloat(row.discount_pct || 0);

      const markup_amount = subtotal * (markup_pct / 100);
      const after_markup = subtotal + markup_amount;
      const discount_amount = after_markup * (discount_pct / 100);
      const after_discount = after_markup - discount_amount;

      const estimate_total = after_discount * (1 + (tax_rate_pct / 100));

      return {
        job_id: row.job_id,
        title: row.title,
        customer: row.customer,
        status: row.status,
        priority: row.priority,
        scheduled_at: row.scheduled_at,
        task_count: parseInt(row.task_count),
        estimate_total: estimate_total,
        estimate_status: row.estimate_status || 'none',
        created_at: row.created_at
      };
    });

    res.json({ jobs, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    handleDbError(error, res, 'Internal server error');
  }
});

// POST /api/jobs
app.post('/api/jobs', async (req, res) => {
  const { title, customer, status = 'open', priority = 'normal', scheduled_at, notes } = req.body;
  if (!title || !customer) {
    return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'Title and customer are required' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const jobRes = await client.query(
      `INSERT INTO jobs (user_id, title, customer, status, priority, scheduled_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.userId, title, customer, status, priority, scheduled_at, notes]
    );
    const newJob = jobRes.rows[0];

    await client.query(
      `INSERT INTO estimates (job_id, user_id, status) VALUES ($1, $2, 'draft')`,
      [newJob.job_id, req.userId]
    );

    await client.query('COMMIT');
    res.status(201).json(newJob);
  } catch (error) {
    await client.query('ROLLBACK');
    handleDbError(error, res, 'Could not create job');
  } finally {
    client.release();
  }
});

// GET /api/jobs/:jobId
app.get('/api/jobs/:jobId', async (req, res) => {
  const { jobId } = req.params;
  try {
    const jobRes = await db.query('SELECT * FROM jobs WHERE job_id = $1 AND user_id = $2', [jobId, req.userId]);
    if (jobRes.rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Job not found' });
    const job = jobRes.rows[0];

    const estimate = await getComputedEstimate(jobId, req.userId);
    const tasks = estimate ? estimate.line_items : [];

    res.json({
      ...job,
      tasks,
      estimate: estimate ? {
        estimate_id: estimate.estimate_id,
        status: estimate.status,
        markup_pct: estimate.markup_pct,
        tax_rate_pct: estimate.tax_rate_pct,
        discount_pct: estimate.discount_pct,
        subtotal: estimate.subtotal,
        markup_amount: estimate.markup_amount,
        discount_amount: estimate.discount_amount,
        taxable_amount: estimate.taxable_amount,
        tax_amount: estimate.tax_amount,
        total: estimate.total,
        note: estimate.note,
        approved_by: estimate.approved_by,
        approved_at: estimate.approved_at,
        sent_at: estimate.sent_at
      } : null
    });

  } catch (error) {
    handleDbError(error, res, 'Could not fetch job');
  }
});

// PATCH /api/jobs/:jobId
app.patch('/api/jobs/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const updates = req.body;
  const allowed = ['title', 'customer', 'status', 'priority', 'scheduled_at', 'notes'];

  const sets = [];
  const params = [jobId, req.userId];
  let paramIndex = 3;

  for (const [key, value] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      sets.push(`${key} = $${paramIndex++}`);
      params.push(value);
    }
  }

  if (sets.length === 0) return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'No valid fields provided' });

  sets.push(`updated_at = now()`);

  try {
    const query = `UPDATE jobs SET ${sets.join(', ')} WHERE job_id = $1 AND user_id = $2 RETURNING *`;
    const result = await db.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Job not found' });
    res.json(result.rows[0]);
  } catch (error) {
    handleDbError(error, res, 'Could not update job');
  }
});

// DELETE /api/jobs/:jobId
app.delete('/api/jobs/:jobId', async (req, res) => {
  const { jobId } = req.params;
  try {
    const result = await db.query('DELETE FROM jobs WHERE job_id = $1 AND user_id = $2 RETURNING job_id', [jobId, req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Job not found' });
    res.status(204).end();
  } catch (error) {
    handleDbError(error, res, 'Could not delete job');
  }
});

// ==========================================
// Tasks Endpoints
// ==========================================

// GET /api/jobs/:jobId/tasks
app.get('/api/jobs/:jobId/tasks', async (req, res) => {
  const { jobId } = req.params;
  try {
    const jobRes = await db.query('SELECT job_id FROM jobs WHERE job_id = $1 AND user_id = $2', [jobId, req.userId]);
    if (jobRes.rows.length === 0) return res.status(403).json({ error: 'FORBIDDEN', message: 'Resource belongs to another user or not found' });

    const tasksRes = await db.query('SELECT * FROM tasks WHERE job_id = $1 ORDER BY created_at ASC', [jobId]);
    res.json({ tasks: tasksRes.rows.map(t => ({ 
      ...t, 
      subtotal: parseFloat(t.qty) * parseFloat(t.unit_rate),
      actual_hrs: parseFloat(t.actual_hrs || 0),
      taxable: t.taxable 
    })) });
  } catch (error) {
    handleDbError(error, res, 'Error fetching tasks');
  }
});

// POST /api/jobs/:jobId/tasks
app.post('/api/jobs/:jobId/tasks', async (req, res) => {
  const { jobId } = req.params;
  const { name, type, qty, unit_rate, taxable = true, actual_hrs = 0, complete_pct = 0, notes } = req.body;

  if (!name || !type || qty === undefined || unit_rate === undefined) {
    return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'Missing required task fields' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const jobRes = await client.query('SELECT job_id FROM jobs WHERE job_id = $1 AND user_id = $2', [jobId, req.userId]);
    if (jobRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Job not found' });
    }

    const taskRes = await client.query(
      `INSERT INTO tasks (job_id, user_id, name, type, qty, unit_rate, taxable, actual_hrs, complete_pct, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [jobId, req.userId, name, type, qty, unit_rate, taxable, actual_hrs, complete_pct, notes]
    );

    await client.query('COMMIT');
    res.status(201).json({ ...taskRes.rows[0], subtotal: parseFloat(qty) * parseFloat(unit_rate), estimate_delta: { diff: 0 } });
  } catch (error) {
    await client.query('ROLLBACK');
    handleDbError(error, res, 'Error creating task');
  } finally {
    client.release();
  }
});

// PATCH /api/jobs/:jobId/tasks/:taskId
app.patch('/api/jobs/:jobId/tasks/:taskId', async (req, res) => {
  const { jobId, taskId } = req.params;
  const updates = req.body;
  const allowed = ['name', 'type', 'qty', 'unit_rate', 'taxable', 'actual_hrs', 'complete_pct', 'notes', 'sprint', 'priority'];

  const sets = [];
  const params = [taskId, jobId, req.userId];
  let paramIndex = 4;

  for (const [key, value] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      sets.push(`${key} = $${paramIndex++}`);
      params.push(value);
    }
  }

  if (sets.length === 0) return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'No valid fields' });
  sets.push(`updated_at = now()`);

  try {
    const jobCheck = await db.query('SELECT job_id FROM jobs WHERE job_id = $1 AND user_id = $2', [jobId, req.userId]);
    if (jobCheck.rows.length === 0) return res.status(403).json({ error: 'FORBIDDEN', message: 'Job not found' });

    const query = `UPDATE tasks SET ${sets.join(', ')} WHERE task_id = $1 AND job_id = $2 RETURNING *`;
    const result = await db.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Task not found' });

    const updated = result.rows[0];
    res.json({ ...updated, subtotal: parseFloat(updated.qty) * parseFloat(updated.unit_rate), estimate_delta: { diff: 0 } });
  } catch (error) {
    handleDbError(error, res, 'Error updating task');
  }
});

// DELETE /api/jobs/:jobId/tasks/:taskId
app.delete('/api/jobs/:jobId/tasks/:taskId', async (req, res) => {
  const { jobId, taskId } = req.params;
  try {
    const jobCheck = await db.query('SELECT job_id FROM jobs WHERE job_id = $1 AND user_id = $2', [jobId, req.userId]);
    if (jobCheck.rows.length === 0) return res.status(403).json({ error: 'FORBIDDEN', message: 'Job not found' });

    const result = await db.query('DELETE FROM tasks WHERE task_id = $1 AND job_id = $2 RETURNING task_id', [taskId, jobId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Task not found' });
    res.status(204).end();
  } catch (error) {
    handleDbError(error, res, 'Error deleting task');
  }
});

// ==========================================
// Estimates Endpoints
// ==========================================

async function getComputedEstimate(jobId, userId) {
  const tasksRes = await db.query('SELECT * FROM tasks WHERE job_id = $1 AND user_id = $2', [jobId, userId]);
  const estRes = await db.query('SELECT * FROM estimates WHERE job_id = $1 AND user_id = $2', [jobId, userId]);
  if (estRes.rows.length === 0) return null;
  const est = estRes.rows[0];

  let subtotal = 0;
  let taxable_amount = 0;

  const markup_pct = parseFloat(est.markup_pct);
  const tax_rate_pct = parseFloat(est.tax_rate_pct);
  const discount_pct = parseFloat(est.discount_pct);

  tasksRes.rows.forEach(task => {
    const lineSub = parseFloat(task.qty) * parseFloat(task.unit_rate);
    subtotal += lineSub;
    if (task.taxable) {
      const lineMarkup = lineSub * (markup_pct / 100);
      const lineAfterMarkup = lineSub + lineMarkup;
      const lineDiscount = lineAfterMarkup * (discount_pct / 100);
      taxable_amount += (lineAfterMarkup - lineDiscount);
    }
  });

  const markup_amount = subtotal * (markup_pct / 100);
  const after_markup = subtotal + markup_amount;
  const discount_amount = after_markup * (discount_pct / 100);
  const after_discount = after_markup - discount_amount;
  const tax_amount = taxable_amount * (tax_rate_pct / 100);
  const total = after_discount + tax_amount;

  return {
    ...est,
    markup_pct, tax_rate_pct, discount_pct,
    line_items: tasksRes.rows.map(t => ({
      task_id: t.task_id, name: t.name, type: t.type,
      qty: parseFloat(t.qty), unit_rate: parseFloat(t.unit_rate),
      subtotal: parseFloat(t.qty) * parseFloat(t.unit_rate),
      taxable: t.taxable
    })),
    subtotal, markup_amount, discount_amount, taxable_amount, tax_amount, total
  };
}

// GET /api/jobs/:jobId/estimate
app.get('/api/jobs/:jobId/estimate', async (req, res) => {
  try {
    const estimate = await getComputedEstimate(req.params.jobId, req.userId);
    if (!estimate) return res.status(404).json({ error: 'NOT_FOUND', message: 'Estimate not found' });
    res.json(estimate);
  } catch (error) {
    handleDbError(error, res, 'Error fetching estimate');
  }
});

// PATCH /api/jobs/:jobId/estimate
app.patch('/api/jobs/:jobId/estimate', async (req, res) => {
  const { jobId } = req.params;
  const { markup_pct, tax_rate_pct, discount_pct, note } = req.body;
  try {
    const estCheck = await db.query('SELECT status FROM estimates WHERE job_id = $1 AND user_id = $2', [jobId, req.userId]);
    if (estCheck.rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Estimate not found' });
    if (estCheck.rows[0].status === 'approved') return res.status(409).json({ error: 'ESTIMATE_LOCKED', message: 'Cannot edit approved estimate' });

    const sets = [];
    const params = [jobId, req.userId];
    let paramIndex = 3;

    if (markup_pct !== undefined) { sets.push(`markup_pct = $${paramIndex++}`); params.push(markup_pct); }
    if (tax_rate_pct !== undefined) { sets.push(`tax_rate_pct = $${paramIndex++}`); params.push(tax_rate_pct); }
    if (discount_pct !== undefined) { sets.push(`discount_pct = $${paramIndex++}`); params.push(discount_pct); }
    if (note !== undefined) { sets.push(`note = $${paramIndex++}`); params.push(note); }

    if (sets.length > 0) {
      sets.push(`updated_at = now()`);
      await db.query(`UPDATE estimates SET ${sets.join(', ')} WHERE job_id = $1 AND user_id = $2`, params);
    }

    const estimate = await getComputedEstimate(jobId, req.userId);
    res.json(estimate);
  } catch (error) {
    handleDbError(error, res, 'Error updating estimate');
  }
});

// POST /api/jobs/:jobId/estimate/approve
app.post('/api/jobs/:jobId/estimate/approve', async (req, res) => {
  const { jobId } = req.params;
  const { approved_by } = req.body;
  try {
    const result = await db.query(
      `UPDATE estimates SET status = 'approved', approved_by = $1, approved_at = now(), updated_at = now()
       WHERE job_id = $2 AND user_id = $3 RETURNING *`,
      [approved_by || 'Unknown', jobId, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Estimate not found' });
    const estimate = await getComputedEstimate(jobId, req.userId);
    res.json({ estimate_id: estimate.estimate_id, status: estimate.status, approved_at: estimate.approved_at, total: estimate.total });
  } catch (error) {
    handleDbError(error, res, 'Error approving estimate');
  }
});

// POST /api/jobs/:jobId/estimate/send
app.post('/api/jobs/:jobId/estimate/send', async (req, res) => {
  const { jobId } = req.params;
  try {
    const result = await db.query(
      `UPDATE estimates SET status = 'sent', sent_at = now(), updated_at = now()
       WHERE job_id = $1 AND user_id = $2 RETURNING estimate_id, status, sent_at`,
      [jobId, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Estimate not found' });
    res.json(result.rows[0]);
  } catch (error) {
    handleDbError(error, res, 'Error sending estimate');
  }
});

// POST /api/jobs/:jobId/estimate/reject
app.post('/api/jobs/:jobId/estimate/reject', async (req, res) => {
  const { jobId } = req.params;
  try {
    const result = await db.query(
      `UPDATE estimates SET status = 'rejected', updated_at = now()
       WHERE job_id = $1 AND user_id = $2 RETURNING estimate_id, status`,
      [jobId, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Estimate not found' });
    res.json(result.rows[0]);
  } catch (error) {
    handleDbError(error, res, 'Error rejecting estimate');
  }
});

// ==========================================
// Chat Endpoints
// ==========================================

// GET /api/chat/history
app.get('/api/chat/history', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT message_id as id, role, content as text, created_at as timestamp FROM chat_messages WHERE user_id = $1 ORDER BY created_at ASC',
      [req.userId]
    );
    
    // Map backend roles to frontend format
    const messages = rows.map(msg => ({
      id: msg.id,
      sender: msg.role === 'user' ? 'You' : 'AI Assistant',
      text: msg.text,
      timestamp: msg.timestamp,
      isMe: msg.role === 'user'
    }));

    res.json({ messages });
  } catch (error) {
    handleDbError(error, res, 'Error fetching chat history');
  }
});

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'Messages array is required' });
  }

  const lastUserMessage = messages[messages.length - 1];

  try {
    // Save user message to DB
    await db.query(
      'INSERT INTO chat_messages (user_id, role, content) VALUES ($1, $2, $3)',
      [req.userId, 'user', lastUserMessage.text]
    );

    console.log(`DEBUG: Proxying message to Python agent: "${lastUserMessage.text}"`);
    const axios = require('axios');
    const pythonResponse = await axios.post('http://localhost:5001/chat', {
      message: lastUserMessage.text,
      history: messages.slice(0, -1).map(m => ({
        role: m.isMe ? 'user' : 'assistant',
        content: m.text
      }))
    });

    const aiResponseText = pythonResponse.data.text;
    console.log(`DEBUG: Python agent responded: "${aiResponseText}"`);

    // Save AI response to DB
    await db.query(
      'INSERT INTO chat_messages (user_id, role, content) VALUES ($1, $2, $3)',
      [req.userId, 'assistant', aiResponseText]
    );

    res.json({ text: aiResponseText });
  } catch (error) {
    console.error('Python Agent Error:', error.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to communicate with Python AI agent' });
  }
});

// ==========================================
// Start Server
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

module.exports = app;