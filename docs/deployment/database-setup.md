# Database Setup Guide

## Prerequisites

- A Supabase project (free tier at [supabase.com](https://supabase.com))
- Supabase project URL and anon key configured in `.env.local`

## Migration Files

Migrations are in `supabase/migrations/` and must be applied in order:

| # | File | Description |
|---|------|-------------|
| 001 | `001_extensions.sql` | PostgreSQL extensions (uuid-ossp, pg_trgm) |
| 002 | `002_seasons.sql` | Seasons, season_config, base_price_tiers, bid_increment_rules |
| 003 | `003_users_roles.sql` | Users (profiles), season_roles |
| 004 | `004_players.sql` | Players (permanent identity) |
| 005 | `005_franchises.sql` | Franchises, franchise_members, deferred FK for season_roles |
| 006 | `006_registrations.sql` | Player_season_registrations, player_skill_profiles, deferred FK for franchise_members |
| 007 | `007_auction_foundation.sql` | Bucket_rules, auction_lots, auction_events (with sequence), franchise_referrals |
| 008 | `008_audit.sql` | Audit_logs |
| 009 | `009_rls.sql` | Row Level Security on all 16 tables |
| 010 | `010_views.sql` | Public-safe views (players, franchises, auction lots) |
| 011 | `011_seed.sql` | Default ACC 2026 season with configuration |

## Applying Migrations

### Option A: Supabase SQL Editor (Recommended for now)

1. Go to your Supabase project → SQL Editor
2. Run each migration file **in order** (001 through 011)
3. Each file is idempotent where possible (uses `IF NOT EXISTS`, `ON CONFLICT`)

### Option B: Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
supabase db push
```

### Option C: Fresh Reset (Development Only)

```bash
supabase db reset
```

## Verifying the Schema

After applying migrations, verify:

1. **Tables**: 16 tables should exist (check via Supabase Table Editor)
2. **Views**: 3 views: `public_players_view`, `public_franchises_view`, `public_auction_lots_view`
3. **RLS**: All tables should have RLS enabled (check via Authentication → Policies)
4. **Seed data**: Run `SELECT * FROM seasons;` — should show ACC 2026
5. **Config**: Run `SELECT * FROM season_config;` — should show 9 config keys
6. **Buckets**: Run `SELECT * FROM bucket_rules ORDER BY auction_order;` — should show B3, B4, B2, B5, B1, PG

## Seed Data Summary

The seed creates a default development season:

| Entity | Details |
|--------|---------|
| Season | ACC 2026, code: acc-2026, status: draft, active |
| Purse | 1000 per franchise |
| Squad | min 17, max 22 |
| Auction purchases | min 15 |
| Referrals | max 5 |
| Franchises | max 11 |
| Players | max 500 |
| Timer | 30s first bid, 20s subsequent |
| Buckets | B1-B5 (mandatory, 2 min purchases each), PG (optional) |
| Auction order | B3 → B4 → B2 → B5 → B1 → PG |
| Base prices | 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 230, 250 |
| Bid increments | <100: +10, 100-199: +20, 200+: +30 |

## Important Notes

- **No fake data**: The seed does not create fake players, franchises, or auction events
- **Idempotent**: All seed INSERTs use `ON CONFLICT DO NOTHING`
- **Single active season**: The partial unique index ensures only one season can be active at a time
- **Phase 3 dependency**: The `users.id` column will be linked to `auth.users(id)` when Supabase Auth is integrated
