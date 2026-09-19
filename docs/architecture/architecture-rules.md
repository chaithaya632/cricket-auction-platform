# ACC Architecture Rules

These rules are LOCKED and must not be violated.

## 1. Event-Sourced Auction (spec §23, §34)

- `auction_events` is the authoritative history
- Mutable counters (purse, purchase count, bucket count) are projections/views, NOT sources of truth
- Undo appends an `UNDO_SALE` event; it does NOT delete the original event
- Auction state is always derivable from events + configuration + registration data

## 2. Player Identity Model (spec §8)

- A player is a human, not a season record
- `players` table holds permanent identity (roll number, name, mobile, photo)
- `player_season_registrations` holds season-specific data (base price, bucket, skills, payment)
- Changing current player info must NOT rewrite historical records

## 3. Backend Authority (spec §20, §25)

- The max permissible bid formula is ONLY computed server-side
- Bids must be validated inside PostgreSQL transactions
- PostgreSQL determines which simultaneous bid wins
- Frontend receives computed values but NEVER computes auction-critical values independently

## 4. Security (spec §35)

- Franchise identity comes from authentication, NOT from frontend dropdowns
- No service-role keys in the browser
- Mobile numbers excluded from public APIs at the query level, not just hidden in React
- RLS on all tables
- Activation/deactivation instead of destructive deletion

## 5. Max Permissible Bid Formula (spec §20)

```
G = 15 − auction_purchases_so_far
D = Σ over 5 buckets max(0, current_minimum − bought_in_bucket)
reserve_slots = max(0, max(G, D) − 1)
max_bid = purse − 20 × reserve_slots
```

## 6. Scarcity (spec §22)

Based on total player-slot demand, not simply number of franchises.
Warning only — must NOT block legal bidding.
