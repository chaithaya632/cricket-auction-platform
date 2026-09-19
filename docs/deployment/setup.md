# ACC Deployment & Setup Guide

## Prerequisites

- Node.js 18.17+
- npm
- A Supabase project (free tier)
- A Vercel account (free tier)
- A GitHub account

## Local Development Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd acc-auction
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase project credentials:
- `NEXT_PUBLIC_SUPABASE_URL` — from Supabase dashboard → Settings → API
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Supabase dashboard → Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase dashboard → Settings → API (keep secret!)

### 4. Run development server

```bash
npm run dev
```

Visit http://localhost:3000

### 5. Run tests

```bash
npx vitest run
```

### 6. Build for production

```bash
npm run build
```

## Deployment to Vercel

1. Push to GitHub
2. Import repository in Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

## Supabase Setup

1. Create a new project at https://supabase.com
2. Run migrations from `supabase/migrations/` (Phase 2)
3. Configure RLS policies (Phase 2)
4. Optionally seed data from `supabase/seed/` (Phase 2)
