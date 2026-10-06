# Livingworth Academy

A complete full-stack starter for the Livingworth Academy website.

The portal includes student registration, administrator approval, separate student, mentor and administrator sign-in, protected dashboards, and role-based API access. Administrators can create mentor accounts; mentors can view approved learners and run live quizzes.

The public experience presents Livingworth Academy's 14-week DevOps Engineering Bootcamp, including its 42-class-day roadmap, Monday/Wednesday/Friday class rhythm, toolchain, cumulative practical projects, learner expectations and final capstone.

For frontend-only demonstrations, the administrator login page includes an offline preview. It uses browser-local sample applications and clearly labels approvals as non-production changes. Real authentication and persistent approvals continue to require the Express API and MySQL.

## Live quiz

Authenticated students can join a synchronized quiz room using a code. An administrator can build questions manually or import a CSV, open the lobby and start every student together. Each question is server-timed for 30 seconds, late and duplicate answers are rejected, and the leaderboard updates after every reveal.

CSV columns: `question,option1,option2,option3,option4,correctAnswer`. The correct answer is a number from 1 to 4.

## Stack

- React + Vite frontend
- Node.js + Express backend
- MySQL 8.4 database
- Nginx reverse proxy
- Docker Compose orchestration

## Run with Docker

```bash
cp .env.example .env
# Change the passwords in .env
docker compose up -d --build
```

Open `http://YOUR_SERVER_IP`. The API health endpoint is available at `/api/health`.

The initial administrator uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`. The optional first mentor uses `MENTOR_NAME`, `MENTOR_EMAIL` and `MENTOR_PASSWORD`. Change these values before starting. Student accounts remain pending until approved in the administrator portal.

Existing MySQL volumes are upgraded automatically when the backend starts, so adding the mentor portal does not require deleting academy data.

## Attendance

Administrators and mentors can mark approved students as present, late, absent or excused for Monday, Wednesday and Friday sessions. Students can see their attendance history and percentage in their own portal; excused sessions are excluded from the percentage.

## Useful commands

```bash
docker compose ps
docker compose logs -f
docker compose down
docker compose down -v  # also removes database data
```

### Application logs

All services log to standard output/error, ready for `docker logs` or Loki/Alloy collection:

```bash
# Everything
docker compose logs -f --tail=200

# Backend API requests, authentication events and errors
docker compose logs -f --tail=200 backend

# Public Nginx access and proxy errors
docker compose logs -f --tail=200 nginx

# Frontend web-server requests
docker compose logs -f --tail=200 frontend
```

Backend and public Nginx entries are structured JSON. Every API response includes an `X-Request-Id`, which can be searched across Nginx and backend logs. Browser crashes and unhandled promise failures appear as `frontend_error` events. Request bodies, passwords, tokens, cookies, quiz answers and uploaded content are not logged. Docker rotates each service log after 10 MB and retains five files. Set `LOG_LEVEL=debug` for more development detail or `LOG_HEALTHCHECKS=true` to include `/api/health` requests.

## Local development

Start MySQL, create a database using `backend/sql/init.sql`, then:

```bash
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

The frontend development server proxies `/api` to `http://localhost:5000`.
