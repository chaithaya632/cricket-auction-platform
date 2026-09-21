# ACC Auction Portal — Database Architecture

## Overview

The ACC Auction Portal uses **Supabase PostgreSQL** as the authoritative persistent data layer. The frontend is NEVER the source of truth. All state transitions, constraint enforcement, and data integrity are managed at the database level.

## Architecture Principles

1. **PostgreSQL is authoritative** — client-side calculations must never become authoritative database state
2. **Auction history is immutable** — `auction_events` is the authoritative auction history; events are never updated or deleted
3. **`auction_lots` is operational state** — a projection of current lot status, NOT a replacement for event history
4. **Derived values are not independent truth** — purse_remaining, max_bid, scarcity are computed from season config + events + rules by the domain layer
5. **Historical reproducibility** — a completed season remains understandable even after future seasons have different rules; season-sensitive data is stored with the season

## Tables

### Core (16 tables)

| Table | Migration | Purpose |
|-------|-----------|---------|
| `seasons` | 002 | ACC edition/season lifecycle |
| `season_config` | 002 | Per-season scalar configuration (key-value) |
| `base_price_tiers` | 002 | Per-season base price ladder |
| `bid_increment_rules` | 002 | Per-season bid increment tiers |
| `users` | 003 | Application profiles (linked to Supabase Auth) |
| `season_roles` | 003 | Per-season role assignments |
| `players` | 004 | Permanent player identity (one human = one row) |
| `franchises` | 005 | Per-season franchise/team |
| `franchise_members` | 005 | User membership in franchises |
| `player_season_registrations` | 006 | Player-season link with academic/auction data |
| `player_skill_profiles` | 006 | Per-registration skill questionnaire results |
| `bucket_rules` | 007 | Per-season bucket configuration and auction order |
| `auction_lots` | 007 | Operational lot state (projection) |
| `auction_events` | 007 | Immutable event log (AUTHORITATIVE) |
| `franchise_referrals` | 007 | Franchise player referrals |
| `audit_logs` | 008 | Administrative action audit trail |

### Views (3 views)

| View | Purpose | Excludes |
|------|---------|----------|
| `public_players_view` | Safe player info for public | mobile, cricheroes_registered_mobile, payment_status |
| `public_franchises_view` | Safe franchise info for public | faculty_coordinator_mobile |
| `public_auction_lots_view` | Safe auction lot info for public | all mobile/private fields |

## Relationships

```
seasons ─┬─→ season_config
         ├─→ base_price_tiers
         ├─→ bid_increment_rules
         ├─→ bucket_rules
         ├─→ season_roles ←── users
         ├─→ franchises ──→ franchise_members ←── users
         │                └─→ franchise_referrals
         ├─→ player_season_registrations ←── players
         │   └─→ player_skill_profiles
         ├─→ auction_lots ──→ auction_events
         └─→ audit_logs ←── users
```

## Season Isolation

- All major tables have a `season_id` foreign key
- Configuration (purse, squad sizes, timers, buckets, prices, increments) is per-season
- A player can register for multiple seasons but only once per season (`UNIQUE(player_id, season_id)`)
- A franchise belongs to exactly one season
- Only one season can be active at a time (enforced by partial unique index)

## Auction Event Architecture

`auction_events` is the **single source of truth** for auction history.

### Event Types
LOT_CREATED, PLAYER_SELECTED, BID_PLACED, PASS, RE_ENTER, HAMMER, SALE, UNSOLD, SKIP, UNDO_SALE, ALLOTMENT, SCOUTING, BUCKET_RELAXATION, PAUSE, RESUME

### Deterministic Ordering
- `sequence_number` (BIGSERIAL) provides globally unique, monotonically increasing sequence per season
- `UNIQUE(season_id, sequence_number)` enforces no duplicates
- Two events in the same millisecond are still deterministically ordered

### Immutability
- No INSERT/UPDATE/DELETE RLS policies for authenticated clients
- Mutations happen only via server-side operations
- Corrections append new events (e.g., `UNDO_SALE`) rather than modifying history

## RLS Strategy

| Access Level | Tables |
|-------------|--------|
| Authenticated SELECT | seasons, season_config, base_price_tiers, bid_increment_rules, bucket_rules, franchises, auction_lots, auction_events |
| Own-row SELECT | users, season_roles |
| Franchise-member SELECT | franchise_members, franchise_referrals |
| Denied (admin-only) | players (base table), player_season_registrations (base table), player_skill_profiles, audit_logs |
| No mutation policies | auction_events (immutable by design) |

## What Is Deferred to Later Phases

| Concern | Phase |
|---------|-------|
| Supabase Auth integration (users.id → auth.users) | Phase 3 |
| Service-role admin client | Phase 3 |
| Full RBAC RLS policies | Phase 3 |
| Referral count enforcement (max 5) | Phase 4+ (domain layer) |
| Max-bid, scarcity, undo computation | Phase 6+ (domain layer) |
| Realtime subscriptions | Phase 7 |
| Storage bucket policies | Phase 8 |
| Database functions/triggers for auction logic | NOT planned — domain layer handles this |
