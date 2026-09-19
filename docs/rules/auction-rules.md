# ACC Auction Rules Reference

Complete auction rules derived from the specification.

## Bidding (spec §17)

| Current Price | Increment |
|--------------|-----------|
| Below 100    | +10       |
| 100–199      | +20       |
| 200+         | +30       |

No jump bidding allowed.

### Examples
- 90 → 100
- 100 → 120
- 200 → 230
- 50 → 150 ❌ ILLEGAL

## Timer (spec §18)

- First bid window: **30 seconds**
- After each valid bid: **20 seconds** (full reset)
- Timer continues even if everyone passes
- Timer expiry does NOT automatically sell the player

## Hammer (spec §19)

Timer expiry alone never creates a sale. Only the auctioneer's HAMMER confirms sale.

## Bucket System (spec §10)

| Bucket | Group |
|--------|-------|
| B1 | B.Tech Year 1 |
| B2 | B.Tech Year 2 |
| B3 | B.Tech Year 3 |
| B4 | B.Tech Year 4 |
| B5 | Diploma |

PG players do not belong to a mandatory bucket.

Default minimum per bucket: **2 auction purchases**

## Auction Order (spec §16)

B3 → B4 → B2 → B5 → B1 → PG

## Squad Rules (spec §15)

- Starting purse: **1000** (configurable)
- Min auction purchases: **15**
- Min bucket purchases: **2 per B1–B5**
- Max squad: **22**
- Min squad: **17**
- Max referrals: **5**

## Max Permissible Bid (spec §20)

```
G = 15 − auction_purchases_so_far
D = Σ over 5 buckets max(0, minimum_required − bought_in_bucket)
reserve_slots = max(0, max(G, D) − 1)
max_bid = purse − 20 × reserve_slots
```

### Acceptance Test Cases

| Purse | Purchases | Buckets Met | Expected Max Bid |
|-------|-----------|-------------|-----------------|
| 1000  | 0         | 0 of 5      | 720             |
| 1000  | 14        | all         | 1000            |
| 340   | 11        | 5 remaining | 260             |
| 200   | 13        | all         | 180             |
| 20    | 14        | all         | 20              |
| 600   | 15        | all         | 600             |

## Round 2 (spec §31)

- Reopens unsold players at base price 20
- Super Admin approves/orders requests
- Captains can recall passed players

## Endgame / Allotment (spec §32)

1. Auto-allot unsold needed-bucket players at 20 (labelled ALLOTTED, not SOLD)
2. Tie-breaking: most unfilled slots → smallest purse
3. Bucket exhaustion: uniform relaxation OR scouting at 20
4. No scouting while eligible unsold needed-bucket players remain
