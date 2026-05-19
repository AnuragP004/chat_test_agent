CREATE TABLE IF NOT EXISTS users (
  user_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email     TEXT UNIQUE NOT NULL,
  name      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  job_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  customer     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','in_progress','closed')),
  priority     TEXT NOT NULL DEFAULT 'normal'
                 CHECK (priority IN ('low','normal','high')),
  scheduled_at TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);

CREATE TABLE IF NOT EXISTS tasks (
  task_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('labour','material')),
  qty         NUMERIC(10,2) NOT NULL,
  unit_rate   NUMERIC(10,2) NOT NULL,
  taxable     BOOLEAN NOT NULL DEFAULT true,
  actual_hrs  NUMERIC(10,2) DEFAULT 0,
  complete_pct INTEGER DEFAULT 0 CHECK (complete_pct BETWEEN 0 AND 100),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_job_id ON tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);

CREATE TABLE IF NOT EXISTS estimates (
  estimate_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID UNIQUE NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','sent','approved','rejected')),
  markup_pct   NUMERIC(5,2) DEFAULT 0,
  tax_rate_pct NUMERIC(5,2) DEFAULT 10,
  discount_pct NUMERIC(5,2) DEFAULT 0,
  note         TEXT,
  approved_by  TEXT,
  approved_at  TIMESTAMPTZ,
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_estimates_user_id ON estimates(user_id);
