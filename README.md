# Playto Payout Engine

Minimal payout engine for merchants to request INR withdrawals against credited balance, with strict money integrity, idempotency, and concurrent payout safety.

## Stack

- Backend: Django + DRF
- Frontend: React + Tailwind
- Database: PostgreSQL
- Queue: Celery + Redis
- Containerization: docker-compose

## Setup

1. Copy `.env.example` to `.env`:
   - `cp .env.example .env` (Linux/macOS) or create `.env` manually on Windows.
2. Start everything:
   - `docker-compose up --build`
3. Run seed data:
   - `docker-compose exec backend python manage.py seed`

Backend runs on `http://localhost:8000`, frontend runs on `http://localhost:3000`.

## Test

Run tests:

`docker-compose exec backend python manage.py test`

## API Endpoints

- `GET /api/v1/merchants/`
- `GET /api/v1/merchants/<id>/balance/`
- `GET /api/v1/merchants/<id>/ledger/`
- `GET /api/v1/merchants/<id>/bank-accounts/`
- `POST /api/v1/payouts/` (requires `X-Merchant-ID` + `Idempotency-Key`)
- `GET /api/v1/payouts/?merchant=<id>`
- `GET /api/v1/payouts/<id>/`
