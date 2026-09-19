# ACC Architecture Overview

## High-Level Architecture

```
                         AVANTHI CRICKET CHAMPIONSHIP
                                      |
                    +-----------------+-----------------+
                    |                                   |
              PUBLIC WEBSITE                      AUTHENTICATED APP
                    |                                   |
          Players / Teams / Info              +----------+----------+
                                              |          |          |
                                            ADMIN    FRANCHISE    USER/PLAYER
                                              |          |          |
                                              +----------+----------+
                                                         |
                                                   AUCTION ENGINE
                                                         |
                          +------------------------------+----------------+
                          |                              |                |
                       DATABASE                       RULE ENGINE      REALTIME
                          |                              |                |
                     PostgreSQL                    Purse/Buckets       Live UI
                                                   Max Bid/Scarcity
```

## Stack

- **Frontend**: Next.js, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons
- **Backend**: Next.js server-side (Server Actions, API Routes)
- **Database**: Supabase PostgreSQL
- **Auth**: Supabase Auth
- **Realtime**: Supabase Realtime
- **Storage**: Supabase Storage
- **Validation**: Zod + server-side
- **Charts**: Recharts

## Key Architectural Decisions

1. **Event-sourced auction** — `auction_events` is the authoritative history
2. **Domain layer separation** — `domain/` contains pure business logic, no I/O
3. **Player identity model** — `players` (permanent) → `player_season_registrations` (per season)
4. **Backend-authoritative** — All auction rules validated server-side in PostgreSQL transactions
5. **Realtime for distribution** — Supabase Realtime broadcasts state, does not determine correctness
