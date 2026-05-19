# Jobs & Tasks Management System

A field service management UI with Jobs, Tasks, and Estimates.

## Tech Stack
- **Frontend**: React (TypeScript), Tailwind CSS, React Query
- **Backend**: Node.js, Express, PostgreSQL
- **Database**: PostgreSQL (requires `jobstasks` database)

## Setup

### Backend
1. `cd backend`
2. `npm install`
3. Configure `DATABASE_URL` in your environment.
4. `node init-db.js` (Initializes schema and test user)
5. `node server.js`

### Frontend
1. `cd frontend`
2. `npm install`
3. `npm run dev`

## Features
- **Jobs**: List and filter jobs, update status/priority.
- **Tasks**: Add and edit tasks per job.
- **Estimates**: Live calculation of markup, discount, and tax. Approve/Lock workflow.
