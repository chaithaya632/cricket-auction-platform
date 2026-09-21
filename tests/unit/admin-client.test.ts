// =============================================================================
// ACC Auction Portal — Unit Tests: Service-Role Client Security & Fail-Closed
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';

describe('Admin Client Security — Fail-Closed & Privilege Isolation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails closed with explicit error when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';

    expect(() => createAdminClient()).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY is required for privileged auction mutations/
    );
  });

  it('does NOT fall back to NEXT_PUBLIC_SUPABASE_ANON_KEY', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_should_not_be_used';

    expect(() => createAdminClient()).toThrow(
      /The system fails closed with no fallback to anon or publishable keys/
    );
  });

  it('fails closed if NEXT_PUBLIC_SUPABASE_URL is missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key';

    expect(() => createAdminClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL is not set/);
  });

  it('succeeds and creates client when SUPABASE_SERVICE_ROLE_KEY is provided', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-valid-service-role-key';

    const client = createAdminClient();
    expect(client).toBeDefined();
    expect(client.from).toBeDefined();
  });
});
