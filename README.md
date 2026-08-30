# Livingworth Academy

A complete full-stack starter for the Livingworth Academy website.

The portal includes student registration, administrator approval, separate student and admin sign-in, protected dashboards, and role-based API access.

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

The initial administrator uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`. Change these values before starting. Student accounts remain pending until approved in the administrator portal.

## Useful commands

```bash
docker compose ps
docker compose logs -f
docker compose down
docker compose down -v  # also removes database data
```

## Local development

Start MySQL, create a database using `backend/sql/init.sql`, then:

```bash
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

The frontend development server proxies `/api` to `http://localhost:5000`.
