// =============================================================================
// ACC Auction Portal — Domain: Bid Increments & Next Legal Bid (Spec §21)
// =============================================================================
// Rules (from bid_increment_rules table & seed):
//   0 – 99   : +10  (e.g., ₹20 → ₹30, ₹90 → ₹100)
//   100 – 199: +20  (e.g., ₹100 → ₹120, ₹180 → ₹200)
//   200+     : +30  (e.g., ₹200 → ₹230, ₹250 → ₹280)
//
// CONSTRAINTS:
// - Opening bid on an unbid lot must equal base_price.
// - Jump bids are strictly prohibited: proposed bid MUST equal next legal bid.
// - Underbids are strictly prohibited.
// =============================================================================

export interface BidIncrementRule {
  minPrice: number;
  maxPrice: number | null;
  increment: number;
  sortOrder?: number;
}

export const DEFAULT_BID_INCREMENT_RULES: BidIncrementRule[] = [
  { minPrice: 0, maxPrice: 99, increment: 10, sortOrder: 1 },
  { minPrice: 100, maxPrice: 199, increment: 20, sortOrder: 2 },
  { minPrice: 200, maxPrice: null, increment: 30, sortOrder: 3 },
];

/**
 * Returns the bid increment amount for a given current price.
 */
export function getIncrementForPrice(
  currentPrice: number,
  rules: BidIncrementRule[] = DEFAULT_BID_INCREMENT_RULES
): number {
  const matchingRule = rules.find((rule) => {
    const isAboveMin = currentPrice >= rule.minPrice;
    const isBelowMax = rule.maxPrice === null || currentPrice <= rule.maxPrice;
    return isAboveMin && isBelowMax;
  });

  if (!matchingRule) {
    // Fallback default: highest tier increment
    return 30;
  }

  return matchingRule.increment;
}

/**
 * Calculates the exact next legal bid for an auction lot.
 * - If no bid has been placed yet (currentPrice is null), next bid = basePrice.
 * - If a bid has been placed, next bid = currentPrice + incrementForTier.
 */
export function calculateNextBid(
  currentPrice: number | null,
  basePrice: number,
  rules: BidIncrementRule[] = DEFAULT_BID_INCREMENT_RULES
): number {
  if (currentPrice === null || currentPrice === undefined) {
    return basePrice;
  }

  const increment = getIncrementForPrice(currentPrice, rules);
  return currentPrice + increment;
}

export interface BidValidationResult {
  valid: boolean;
  expectedBid: number;
  reason?: string;
}

/**
 * Validates whether a proposed bid amount matches the next legal bid.
 * Rejects jump bids and underbids.
 */
export function validateBidAmount(
  proposedBid: number,
  currentPrice: number | null,
  basePrice: number,
  rules: BidIncrementRule[] = DEFAULT_BID_INCREMENT_RULES
): BidValidationResult {
  const expectedBid = calculateNextBid(currentPrice, basePrice, rules);

  if (proposedBid !== expectedBid) {
    if (proposedBid < expectedBid) {
      return {
        valid: false,
        expectedBid,
        reason: `Bid of ₹${proposedBid} is below the next required bid of ₹${expectedBid}.`,
      };
    }
    return {
      valid: false,
      expectedBid,
      reason: `Jump bids are prohibited. The exact next legal bid is ₹${expectedBid}.`,
    };
  }

  return {
    valid: true,
    expectedBid,
  };
}
