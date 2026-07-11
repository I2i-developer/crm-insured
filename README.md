# Insurance Renewal Management Portal

A hardened insurance renewal management system built with Next.js, Supabase, JWT authentication, and multi-channel renewal alerts.

## Features

- **Dashboard** - Overview with stats cards, upcoming renewals, quick actions
- **Policy Management** - Full CRUD, search, filter by company/status/date
- **Bulk Import** - Upload CSV/Excel to import multiple policies
- **Interaction Logs** - Track client communications with timeline view
- **Authentication** - JWT-based auth with login/register
- **Automated Alerts** - T-30 reminders and overdue notifications
- **Multi-channel Notifications** - Email (SendGrid), SMS/WhatsApp (Twilio)
- **Cron Jobs** - Daily automated checks for renewals

## Quick Start

### 1. Setup Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run `database/schema.sql`
3. Copy your project URL, anon key, and service role key

If you already created the database from an older version of this project, review and run `database/migrate-secure-ownership.sql` instead. Existing policies must be assigned to a user before the migration can enforce ownership.

### 2. Environment Setup

```bash
# In the frontend directory
cd frontend
copy .env.example .env.local

# Edit .env.local with your Supabase credentials and secrets
```

Required for local development:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `JWT_SECRET`
- `CRON_SECRET`

Generate strong secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Install & Run

```bash
npm install
cd frontend
npm install
cd ..
npm run dev
```

### 4. Open Application

- Go to [http://localhost:3000](http://localhost:3000)
- Register a new account
- Start managing policies!

## Tech Stack

- **Framework**: Next.js (App Router)
- **Database**: Supabase (PostgreSQL)
- **Styling**: CSS Modules
- **Auth**: JWT + scrypt password hashing
- **SMS/WhatsApp**: Twilio (mock mode if not configured)
- **Email**: SendGrid (mock mode if not configured)

## Project Structure

```
ins-sec/
├── frontend/
│   ├── app/
│   │   ├── (auth)/          # Login, Register pages
│   │   ├── (dashboard)/     # Dashboard, Policies, Interactions
│   │   │   ├── dashboard/
│   │   │   ├── policies/
│   │   │   ├── clients/
│   │   │   └── interactions/
│   │   └── api/             # API routes
│   │       ├── auth/
│   │       ├── policies/
│   │       ├── interactions/
│   │       ├── alerts/
│   │       └── cron/
│   ├── components/
│   ├── lib/
│   │   ├── api.js           # API client
│   │   ├── authContext.js    # Auth provider
│   │   ├── supabase.js      # Supabase client
│   │   ├── sendgrid.js      # Email service
│   │   └── twilio.js        # SMS/WhatsApp service
│   └── styles/
├── database/
│   └── schema.sql           # Database schema
└── .env.example
```

## API Endpoints

All endpoints require JWT authentication (except `/api/auth/login` and `/api/auth/register`).

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/policies` | List policies (with filters) |
| POST | `/api/policies` | Create policy |
| GET | `/api/policies/:id` | Get policy |
| PUT | `/api/policies/:id` | Update policy |
| DELETE | `/api/policies/:id` | Delete policy |
| POST | `/api/policies/import` | Bulk import CSV/Excel |
| GET | `/api/policies/stats` | Dashboard stats |
| GET | `/api/interactions` | List interactions |
| POST | `/api/interactions` | Create interaction |
| DELETE | `/api/interactions/:id` | Delete interaction |
| POST | `/api/alerts/send` | Send alert |
| GET | `/api/cron/renewals` | Run cron job manually |

## Cron Job

The cron job runs daily at 9:00 AM (set via external service like Vercel Cron or a system cron). It requires the `x-cron-secret` header to match `CRON_SECRET`.

It:
1. Checks all unpaid policies
2. Sends T-30 day reminders for upcoming renewals
3. Sends overdue alerts (every 3 days for unpaid overdue policies)

### Setting up Vercel Cron

In `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron/renewals",
    "schedule": "0 9 * * *"
  }]
}
```

Configure your scheduler to send:

```text
x-cron-secret: <your CRON_SECRET>
```

## Mock Mode

If no API keys are configured, services run in mock mode:
- Emails print to console
- SMS/WhatsApp print to console

This allows full functionality testing without external services.

## Security Notes

- All policy and interaction data is scoped by `user_id`.
- Browser clients do not access Supabase tables directly; API routes use `SUPABASE_SERVICE_KEY`.
- The schema enables RLS and removes the old public read/write/delete policies.
- Passwords are stored with scrypt hashes. Legacy SHA-256 hashes are upgraded automatically after a successful login.
- JWTs require `JWT_SECRET`; the app no longer falls back to a hardcoded development secret.

## License

Private - All rights reserved
