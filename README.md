# INFOLAB – Real Time Lab Monitoring Dashboard

Production-oriented React 18 + Vite dashboard and Node/Express + Prisma/PostgreSQL API for monitoring computer labs in real time.

## Setup

1. Create a PostgreSQL database named `infolab`.
2. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`, JWT secrets, and `CLIENT_URL`.
3. Copy `frontend/.env.example` to `frontend/.env` if the API is not on the default port.
4. Run `npm install`, then `npm run install:all`.
5. Run `npm run prisma:generate --prefix backend`, `npm run prisma:migrate --prefix backend`, and `npm run seed`.
6. Run `npm run dev` from the repository root. Frontend: `http://localhost:5173`; API: `http://localhost:4000`.

Demo accounts: `admin@infolab.dev` / `password123`, and `staff@infolab.dev` / `password123`.

The API includes JWT access/refresh tokens, role protected administration routes, Zod validation, security middleware, CRUD for labs/PCs/users, status history, alert persistence, and Socket.io events (`pc:status`, `alert:new`). The dashboard provides live filtering, search, availability summaries, loading/empty states and responsive layouts.

## Email alerts and test data

The seed command creates 2 labs and 12 PCs with mixed Online, Offline, and Maintenance states. Admins can test live behavior with these protected endpoints:

```text
POST /api/test/generate-alert
POST /api/test/toggle-pc
```

The first generates a mock high-temperature alert; the second toggles a seeded PC and emits a live status event. Both also exercise the notification pipeline.

Email alerts are sent to all Admin email addresses. If `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASSWORD` are configured, the app uses that SMTP service. If they are unset, Nodemailer automatically uses its free Ethereal test mailbox and prints a preview URL in the backend console. Ethereal is for testing and does not deliver to a real inbox. For free-tier real delivery, configure Brevo or Gmail App Password SMTP values in `backend/.env` using `backend/.env.example`.

## Docker, Nginx, and blue/green deployment

On a Linux deployment host, copy `backend/.env`, set `CLIENT_URL` to the public site URL, and use a PostgreSQL host reachable from Docker (not `localhost` unless PostgreSQL is in the same Docker network). Then bootstrap the active blue slot:

```bash
docker compose up -d --build api-blue frontend edge
```

Nginx serves the React app, proxies `/api/`, and forwards `/socket.io/` WebSocket upgrades to the active backend. On every approved deployment, run:

```bash
bash deploy/blue-green.sh
```

The script builds and starts the inactive slot, waits for its health check, validates Nginx, reloads traffic to the new slot, and stops the old slot. If health checks fail, it exits before changing Nginx, so the old slot remains active. GitHub Actions runs backend/frontend validation and Docker builds on pull requests, then runs this deployment over SSH on pushes to `main`. Configure `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, and `DEPLOY_PATH` repository secrets.
