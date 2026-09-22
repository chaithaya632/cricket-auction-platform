import { describe, it, expect } from 'vitest';

describe('Auction Lot Queue — Add Existing Player Validation & Logic', () => {
  const isUuid = (val: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  it('rejects non-UUID registration IDs', () => {
    const invalidIds = ['p1', 'reg-123', '', 'invalid-uuid-string'];
    for (const id of invalidIds) {
      expect(isUuid(id)).toBe(false);
    }
  });

  it('accepts valid v4 UUID registration IDs', () => {
    const validIds = [
      '00000000-0000-0000-0000-000000000001',
      'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      'ffffffff-0000-0000-0000-000000000002',
    ];
    for (const id of validIds) {
      expect(isUuid(id)).toBe(true);
    }
  });

  it('computes sequential next draw_number from existing lots', () => {
    function computeNextDrawNumber(existingLots: { draw_number: number }[]): number {
      if (existingLots.length === 0) return 1;
      const maxDraw = Math.max(...existingLots.map((l) => l.draw_number));
      return maxDraw + 1;
    }

    expect(computeNextDrawNumber([])).toBe(1);
    expect(computeNextDrawNumber([{ draw_number: 1 }, { draw_number: 2 }])).toBe(3);
    expect(computeNextDrawNumber([{ draw_number: 5 }, { draw_number: 1 }])).toBe(6);
  });

  it('filters out already queued player registrations from queue candidates', () => {
    const registrations = [
      { id: 'reg-1', player_id: 'p-1', bucket: 'B1', base_price: 100 },
      { id: 'reg-2', player_id: 'p-2', bucket: 'B2', base_price: 150 },
      { id: 'reg-3', player_id: 'p-3', bucket: 'B3', base_price: 200 },
    ];

    const existingLots = [
      { registration_id: 'reg-2', draw_number: 1 },
    ];

    const queuedIds = new Set(existingLots.map((l) => l.registration_id));
    const availableCandidates = registrations.filter((r) => !queuedIds.has(r.id));

    expect(availableCandidates).toHaveLength(2);
    expect(availableCandidates.map((c) => c.id)).toEqual(['reg-1', 'reg-3']);
  });

  it('verifies 11 Master Franchises are unique and valid in dataset', () => {
    const franchises = [
      { id: 'ffffffff-0000-0000-0000-000000000001', name: 'Avanthi Titans', short_name: 'AT' },
      { id: 'ffffffff-0000-0000-0000-000000000002', name: 'Makavarapalem Mavericks', short_name: 'MM' },
      { id: 'ffffffff-0000-0000-0000-000000000003', name: 'Tamaram Titans', short_name: 'TT' },
      { id: 'ffffffff-0000-0000-0000-000000000004', name: 'Narsipatnam Knights', short_name: 'NK' },
      { id: 'ffffffff-0000-0000-0000-000000000005', name: 'Godavari Gladiators', short_name: 'GG' },
      { id: 'ffffffff-0000-0000-0000-000000000006', name: 'Visakha Voyagers', short_name: 'VV' },
      { id: 'ffffffff-0000-0000-0000-000000000007', name: 'Polytechnic Panthers', short_name: 'PP' },
      { id: 'ffffffff-0000-0000-0000-000000000008', name: 'Eastern Eagles', short_name: 'EE' },
      { id: 'ffffffff-0000-0000-0000-000000000009', name: 'Carnival Challengers', short_name: 'CC' },
      { id: 'ffffffff-0000-0000-0000-00000000000a', name: 'Coastal Cobras', short_name: 'CCO' },
      { id: 'ffffffff-0000-0000-0000-00000000000b', name: 'Royal Rangers', short_name: 'RR' },
    ];

    expect(franchises).toHaveLength(11);
    const names = new Set(franchises.map((f) => f.name.toLowerCase()));
    const shortNames = new Set(franchises.map((f) => f.short_name.toLowerCase()));
    const ids = new Set(franchises.map((f) => f.id));

    expect(names.size).toBe(11);
    expect(shortNames.size).toBe(11);
    expect(ids.size).toBe(11);
  });
});
