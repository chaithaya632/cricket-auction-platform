import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  AUCTION_EVENT_TYPES,
  BUCKETS,
  PG_CATEGORY,
  BASE_PRICE_LADDER,
  ROLES,
  LOT_STATUS,
  CRICHEROES_STATUS,
  REGISTRATION_STATUS,
  PLAYER_TYPES,
  BID_INCREMENT_RULES,
  SQUAD_RULES,
  TIMER,
  DEFAULT_BUCKET_ORDER,
} from '@/lib/constants';
import { DB_TABLE_NAMES } from '@/lib/db/types';

// =============================================================================
// Phase 2 Schema Validation Tests
// =============================================================================
// These tests validate:
//   1. All migration files exist in the correct order
//   2. SQL CHECK constraints align with TypeScript constants
//   3. Seed data matches specification
//   4. Public views exclude private fields
//   5. Database types align with constants
// =============================================================================

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

/**
 * Read a migration file and return its SQL content.
 */
function readMigration(filename: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf-8');
}

/**
 * Check if a SQL file contains all values from a list within a CHECK constraint.
 */
function sqlContainsAllValues(sql: string, values: readonly string[]): boolean {
  return values.every((v) => sql.includes(`'${v}'`));
}

// ---------------------------------------------------------------------------
// Migration File Existence
// ---------------------------------------------------------------------------
describe('Migration files', () => {
  const expectedFiles = [
    '001_extensions.sql',
    '002_seasons.sql',
    '003_users_roles.sql',
    '004_players.sql',
    '005_franchises.sql',
    '006_registrations.sql',
    '007_auction_foundation.sql',
    '008_audit.sql',
    '009_rls.sql',
    '010_views.sql',
    '011_seed.sql',
    '012_auth_sync.sql',
  ];

  it('all 12 migration files exist', () => {
    for (const file of expectedFiles) {
      const fullPath = path.join(MIGRATIONS_DIR, file);
      expect(fs.existsSync(fullPath), `Missing migration: ${file}`).toBe(true);
    }
  });

  it('migrations are ordered correctly', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    expect(files).toEqual(expectedFiles);
  });
});

// ---------------------------------------------------------------------------
// Table Definitions
// ---------------------------------------------------------------------------
describe('Table definitions in migrations', () => {
  it('all expected tables are defined across migrations', () => {
    // Read all migration SQL
    const allSql = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readMigration(f))
      .join('\n');

    for (const table of DB_TABLE_NAMES) {
      expect(
        allSql.includes(`CREATE TABLE ${table}`),
        `Missing CREATE TABLE for: ${table}`
      ).toBe(true);
    }
  });

  it('defines exactly 16 tables', () => {
    expect(DB_TABLE_NAMES.length).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// Constants ↔ SQL Alignment
// ---------------------------------------------------------------------------
describe('SQL CHECK constraints align with TypeScript constants', () => {
  it('auction event types match SQL CHECK in 007', () => {
    const sql = readMigration('007_auction_foundation.sql');
    expect(sqlContainsAllValues(sql, AUCTION_EVENT_TYPES)).toBe(true);
  });

  it('bucket values match SQL CHECK in 006 (registrations)', () => {
    const sql = readMigration('006_registrations.sql');
    const allBuckets = [...Object.values(BUCKETS), PG_CATEGORY];
    expect(sqlContainsAllValues(sql, allBuckets)).toBe(true);
  });

  it('bucket values match SQL CHECK in 007 (auction lots)', () => {
    const sql = readMigration('007_auction_foundation.sql');
    const allBuckets = [...Object.values(BUCKETS), PG_CATEGORY];
    expect(sqlContainsAllValues(sql, allBuckets)).toBe(true);
  });

  it('lot status values match SQL CHECK in 007', () => {
    const sql = readMigration('007_auction_foundation.sql');
    const statuses = Object.values(LOT_STATUS);
    expect(sqlContainsAllValues(sql, statuses)).toBe(true);
  });

  it('role values match SQL CHECK in 003', () => {
    const sql = readMigration('003_users_roles.sql');
    const roles = Object.values(ROLES);
    expect(sqlContainsAllValues(sql, roles)).toBe(true);
  });

  it('CricHeroes statuses match SQL CHECK in 006', () => {
    const sql = readMigration('006_registrations.sql');
    const statuses = Object.values(CRICHEROES_STATUS);
    expect(sqlContainsAllValues(sql, statuses)).toBe(true);
  });

  it('registration statuses match SQL CHECK in 006', () => {
    const sql = readMigration('006_registrations.sql');
    const statuses = Object.values(REGISTRATION_STATUS);
    expect(sqlContainsAllValues(sql, statuses)).toBe(true);
  });

  it('player types match SQL CHECK in skill profiles (006)', () => {
    const sql = readMigration('006_registrations.sql');
    const types = [...PLAYER_TYPES];
    expect(sqlContainsAllValues(sql, types)).toBe(true);
  });

  it('season statuses match SQL CHECK in 002', () => {
    const sql = readMigration('002_seasons.sql');
    const statuses = ['draft', 'registration', 'auction', 'completed', 'archived'];
    expect(sqlContainsAllValues(sql, statuses)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Seed Data Validation
// ---------------------------------------------------------------------------
describe('Seed data matches specification', () => {
  let seedSql: string;

  beforeAll(() => {
    seedSql = readMigration('011_seed.sql');
  });

  it('seeds a default ACC 2026 season', () => {
    expect(seedSql).toContain("'ACC 2026'");
    expect(seedSql).toContain("'acc-2026'");
    expect(seedSql).toContain('2026');
  });

  it('seeds default purse of 1000', () => {
    expect(seedSql).toContain("'default_purse'");
    expect(seedSql).toContain("'1000'");
  });

  it('seeds min auction purchases of 15', () => {
    expect(seedSql).toContain("'min_auction_purchases'");
    expect(seedSql).toContain("'15'");
  });

  it('seeds max squad size of 22', () => {
    expect(seedSql).toContain("'max_squad_size'");
    expect(seedSql).toContain("'22'");
  });

  it('seeds min squad size of 17', () => {
    expect(seedSql).toContain("'min_squad_size'");
    expect(seedSql).toContain("'17'");
  });

  it('seeds max referrals of 5', () => {
    expect(seedSql).toContain("'max_referrals'");
    expect(seedSql).toContain("'5'");
  });

  it('seeds first bid timer of 30 seconds', () => {
    expect(seedSql).toContain("'first_bid_timer_seconds'");
    expect(seedSql).toContain(`'${TIMER.FIRST_BID_SECONDS}'`);
  });

  it('seeds subsequent bid timer of 20 seconds', () => {
    expect(seedSql).toContain("'subsequent_bid_timer_seconds'");
    expect(seedSql).toContain(`'${TIMER.SUBSEQUENT_BID_SECONDS}'`);
  });

  it('seeds all 16 base price tiers', () => {
    for (const price of BASE_PRICE_LADDER) {
      expect(seedSql).toContain(`, ${price},`);
    }
  });

  it('seeds all 6 bucket rules (B1-B5 + PG)', () => {
    expect(seedSql).toContain("'B1'");
    expect(seedSql).toContain("'B2'");
    expect(seedSql).toContain("'B3'");
    expect(seedSql).toContain("'B4'");
    expect(seedSql).toContain("'B5'");
    expect(seedSql).toContain("'PG'");
  });

  it('seeds correct auction order (B3=1, B4=2, B2=3, B5=4, B1=5, PG=6)', () => {
    // B3 should have auction_order 1
    expect(seedSql).toMatch(/'B3'.*'B\.Tech Year 3'.*2.*true.*1/);
    // PG should have auction_order 6
    expect(seedSql).toMatch(/'PG'.*'Post Graduate'.*0.*false.*6/);
  });

  it('seeds 3 bid increment rules', () => {
    // Below 100: +10
    expect(seedSql).toContain(', 0, 99, 10,');
    // 100-199: +20
    expect(seedSql).toContain(', 100, 199, 20,');
    // 200+: +30 (NULL max)
    expect(seedSql).toContain(', 200, NULL, 30,');
  });

  it('uses ON CONFLICT for idempotency', () => {
    expect(seedSql).toContain('ON CONFLICT');
  });
});

// ---------------------------------------------------------------------------
// Privacy: Public Views
// ---------------------------------------------------------------------------
describe('Public views exclude private data', () => {
  let viewsSql: string;

  beforeAll(() => {
    viewsSql = readMigration('010_views.sql');
  });

  it('public_players_view does not select mobile', () => {
    // The view should join players but not select p.mobile
    const playerViewSection = viewsSql.split('public_players_view')[1]?.split('CREATE OR REPLACE VIEW')[0] || '';
    expect(playerViewSection).not.toMatch(/\bp\.mobile\b/);
    expect(playerViewSection).not.toContain('cricheroes_registered_mobile');
  });

  it('public_franchises_view does not select coordinator mobile', () => {
    const franchiseViewSection = viewsSql.split('public_franchises_view')[1]?.split('CREATE OR REPLACE VIEW')[0] || '';
    expect(franchiseViewSection).not.toContain('faculty_coordinator_mobile');
  });

  it('public_auction_lots_view does not select mobile', () => {
    const lotViewSection = viewsSql.split('public_auction_lots_view')[1] || '';
    expect(lotViewSection).not.toMatch(/\bp\.mobile\b/);
  });
});

// ---------------------------------------------------------------------------
// RLS
// ---------------------------------------------------------------------------
describe('RLS policies', () => {
  let rlsSql: string;

  beforeAll(() => {
    rlsSql = readMigration('009_rls.sql');
  });

  it('enables RLS on all tables', () => {
    for (const table of DB_TABLE_NAMES) {
      expect(
        rlsSql.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`),
        `Missing RLS enable for: ${table}`
      ).toBe(true);
    }
  });

  it('does not create INSERT policy for auction_events', () => {
    // Auction events should not have INSERT policies for authenticated users
    expect(rlsSql).not.toMatch(/ON auction_events\s+FOR INSERT/);
  });

  it('does not create UPDATE policy for auction_events', () => {
    expect(rlsSql).not.toMatch(/ON auction_events\s+FOR UPDATE/);
  });

  it('does not create DELETE policy for auction_events', () => {
    expect(rlsSql).not.toMatch(/ON auction_events\s+FOR DELETE/);
  });
});

// ---------------------------------------------------------------------------
// Structural Integrity
// ---------------------------------------------------------------------------
describe('Structural integrity', () => {
  it('auction_events has sequence_number for deterministic ordering', () => {
    const sql = readMigration('007_auction_foundation.sql');
    expect(sql).toContain('sequence_number');
    expect(sql).toContain('auction_event_seq');
  });

  it('auction_events has UNIQUE constraint on (season_id, sequence_number)', () => {
    const sql = readMigration('007_auction_foundation.sql');
    expect(sql).toContain('auction_events_sequence_unique');
  });

  it('player_season_registrations has UNIQUE(player_id, season_id)', () => {
    const sql = readMigration('006_registrations.sql');
    expect(sql).toContain('psr_player_season_unique');
  });

  it('players has UNIQUE roll_number', () => {
    const sql = readMigration('004_players.sql');
    expect(sql).toContain('UNIQUE');
    expect(sql).toContain('roll_number');
  });

  it('franchises has UNIQUE(season_id, name)', () => {
    const sql = readMigration('005_franchises.sql');
    expect(sql).toContain('franchises_name_unique');
  });

  it('only one active season allowed', () => {
    const sql = readMigration('002_seasons.sql');
    expect(sql).toContain('seasons_single_active_idx');
  });

  it('franchise captain uniqueness enforced', () => {
    const sql = readMigration('005_franchises.sql');
    expect(sql).toContain('franchise_members_captain_unique');
    expect(sql).toContain('franchise_members_vice_captain_unique');
  });

  it('year_override requires year_override_reason', () => {
    const sql = readMigration('006_registrations.sql');
    expect(sql).toContain('psr_override_reason_check');
  });
});

// ---------------------------------------------------------------------------
// Database Type Completeness
// ---------------------------------------------------------------------------
describe('Database types completeness', () => {
  it('DB_TABLE_NAMES covers all expected tables', () => {
    const expected = [
      'seasons', 'season_config', 'base_price_tiers', 'bid_increment_rules',
      'users', 'season_roles', 'players', 'franchises', 'franchise_members',
      'player_season_registrations', 'player_skill_profiles', 'bucket_rules',
      'auction_lots', 'auction_events', 'franchise_referrals', 'audit_logs',
    ];
    expect([...DB_TABLE_NAMES].sort()).toEqual(expected.sort());
  });
});
