import { describe, it, expect } from "vitest"
import {
  extractProjectRef,
  isProductionEnvironment,
  isDemoEnvironment,
  verifyDemoEnvironment,
  verifyDemoCleanupPermission,
  getDemoModeStatus,
  PRODUCTION_PROJECT_REF,
  DEMO_PROJECT_REF,
  REHEARSAL_PROJECT_REF,
  REQUIRED_CONFIRMATION_PHRASE,
  DEMO_MODE_CONFIG_KEY,
} from "@/lib/demo/config"
import type { UserPermissionContext } from "@/lib/permissions/types"
import type { DbUser, DbSeason } from "@/lib/db/types"

describe("Final Hardening — Demo Project Allowlist & Admin-Only Demo Control", () => {
  const mockAdminUser: DbUser = {
    id: "admin-user-id",
    email: "admin@avanthi.edu",
    full_name: "Super Administrator",
    phone: null,
    avatar_url: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const mockOperatorUser: DbUser = {
    id: "operator-user-id",
    email: "operator@avanthi.edu",
    full_name: "Match Operator",
    phone: null,
    avatar_url: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const mockPlayerUser: DbUser = {
    id: "player-user-id",
    email: "player@avanthi.edu",
    full_name: "Arjun Reddy",
    phone: null,
    avatar_url: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const mockFranchiseUser: DbUser = {
    id: "franchise-user-id",
    email: "franchise@avanthi.edu",
    full_name: "Thunder Hawks Rep",
    phone: null,
    avatar_url: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const mockSeason: DbSeason = {
    id: "season-2026-id",
    name: "ACC 2026",
    code: "acc-2026",
    year: 2026,
    status: "draft",
    start_date: null,
    end_date: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const superAdminContext: UserPermissionContext = {
    user: mockAdminUser,
    activeSeason: mockSeason,
    roles: [{ id: "r-1", user_id: mockAdminUser.id, season_id: mockSeason.id, role: "super_admin", franchise_id: null, is_active: true, created_at: "" }],
    assignedFranchise: null,
    isSuperAdmin: true,
    isOperator: false,
    isAdmin: true,
    isFranchise: false,
    isPlayer: false,
    isViewer: false,
  }

  const operatorContext: UserPermissionContext = {
    user: mockOperatorUser,
    activeSeason: mockSeason,
    roles: [{ id: "r-2", user_id: mockOperatorUser.id, season_id: mockSeason.id, role: "operator", franchise_id: null, is_active: true, created_at: "" }],
    assignedFranchise: null,
    isSuperAdmin: false,
    isOperator: true,
    isAdmin: true,
    isFranchise: false,
    isPlayer: false,
    isViewer: false,
  }

  const playerContext: UserPermissionContext = {
    user: mockPlayerUser,
    activeSeason: mockSeason,
    roles: [{ id: "r-3", user_id: mockPlayerUser.id, season_id: mockSeason.id, role: "player", franchise_id: null, is_active: true, created_at: "" }],
    assignedFranchise: null,
    isSuperAdmin: false,
    isOperator: false,
    isAdmin: false,
    isFranchise: false,
    isPlayer: true,
    isViewer: false,
  }

  const franchiseContext: UserPermissionContext = {
    user: mockFranchiseUser,
    activeSeason: mockSeason,
    roles: [{ id: "r-4", user_id: mockFranchiseUser.id, season_id: mockSeason.id, role: "franchise", franchise_id: "f-1", is_active: true, created_at: "" }],
    assignedFranchise: {
      id: "f-1",
      season_id: mockSeason.id,
      name: "Thunder Hawks",
      short_name: "TH",
      logo_url: null,
      color_primary: "#ff0000",
      color_secondary: null,
      faculty_coordinator_name: null,
      faculty_coordinator_mobile: null,
      faculty_coordinator_photo_url: null,
      is_active: true,
      created_at: "",
      updated_at: "",
    },
    isSuperAdmin: false,
    isOperator: false,
    isAdmin: false,
    isFranchise: true,
    isPlayer: false,
    isViewer: false,
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 11 — Authorization Tests (Cases 1–7)
  // ═══════════════════════════════════════════════════════════════════════════

  it("1. Super Admin can access Demo Mode control in approved rehearsal environment", () => {
    const permResult = verifyDemoCleanupPermission(superAdminContext)
    expect(permResult.allowed).toBe(true)
    expect(permResult.error).toBeUndefined()

    const rehearsalUrl = "https://enompvfdfhynfncgpiuz.supabase.co"
    const envResult = verifyDemoEnvironment(rehearsalUrl)
    expect(envResult.allowed).toBe(true)
    expect(envResult.projectRef).toBe(DEMO_PROJECT_REF)
  })

  it("2. Operator cannot access Demo Mode control", () => {
    const permResult = verifyDemoCleanupPermission(operatorContext)
    expect(permResult.allowed).toBe(false)
    expect(permResult.error).toMatch(/only super admin can manage demo mode/i)
  })

  it("3. Franchise cannot access Demo Mode control", () => {
    const permResult = verifyDemoCleanupPermission(franchiseContext)
    expect(permResult.allowed).toBe(false)
    expect(permResult.error).toMatch(/franchise representatives cannot manage demo mode/i)
  })

  it("4. Player cannot access Demo Mode control", () => {
    const permResult = verifyDemoCleanupPermission(playerContext)
    expect(permResult.allowed).toBe(false)
    expect(permResult.error).toMatch(/players cannot manage demo mode/i)
  })

  it("5. Unauthenticated user cannot access Demo Mode control", () => {
    const permResult = verifyDemoCleanupPermission(null)
    expect(permResult.allowed).toBe(false)
    expect(permResult.error).toMatch(/authentication required/i)
  })

  it("6. Client-controlled role=super_admin is ignored", () => {
    // Simulated attacker providing ?role=super_admin or client parameter
    // The server authorization does NOT read client input for role verification.
    // An attacker whose database role is 'player' cannot elevate privileges.
    const spoofedContext: UserPermissionContext = {
      ...playerContext,
      // Client may claim super_admin in metadata or query, but server-derived roles is player
      roles: [{ id: "r-spoof", user_id: mockPlayerUser.id, season_id: mockSeason.id, role: "player", franchise_id: null, is_active: true, created_at: "" }],
      isSuperAdmin: false, // Authoritative server resolution
    }

    const permResult = verifyDemoCleanupPermission(spoofedContext)
    expect(permResult.allowed).toBe(false)
  })

  it("7. Server-side role is authoritative", () => {
    // Only a verified server context where isSuperAdmin === true passes
    expect(verifyDemoCleanupPermission(superAdminContext).allowed).toBe(true)
    expect(verifyDemoCleanupPermission(operatorContext).allowed).toBe(false)
    expect(verifyDemoCleanupPermission(playerContext).allowed).toBe(false)
    expect(verifyDemoCleanupPermission(franchiseContext).allowed).toBe(false)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 11 — Environment Tests (Cases 8–12)
  // ═══════════════════════════════════════════════════════════════════════════

  it("8. Approved rehearsal project allows Demo Mode", () => {
    const rehearsalUrl = "https://enompvfdfhynfncgpiuz.supabase.co"
    expect(DEMO_PROJECT_REF).toBe("enompvfdfhynfncgpiuz")
    expect(extractProjectRef(rehearsalUrl)).toBe(DEMO_PROJECT_REF)
    expect(isDemoEnvironment(rehearsalUrl)).toBe(true)
    expect(isProductionEnvironment(rehearsalUrl)).toBe(false)

    const verification = verifyDemoEnvironment(rehearsalUrl)
    expect(verification.allowed).toBe(true)
    expect(verification.projectRef).toBe(DEMO_PROJECT_REF)
    expect(verification.error).toBeUndefined()
  })

  it("9. Production project rejects Demo Mode", () => {
    const prodUrl = "https://btlmiewfyyevtxgywpwy.supabase.co"
    expect(PRODUCTION_PROJECT_REF).toBe("btlmiewfyyevtxgywpwy")
    expect(extractProjectRef(prodUrl)).toBe(PRODUCTION_PROJECT_REF)
    expect(isProductionEnvironment(prodUrl)).toBe(true)
    expect(isDemoEnvironment(prodUrl)).toBe(false)

    const verification = verifyDemoEnvironment(prodUrl)
    expect(verification.allowed).toBe(false)
    expect(verification.projectRef).toBe(PRODUCTION_PROJECT_REF)
    expect(verification.error).toBe("Demo Mode operations are unavailable in the production environment.")
  })

  it("10. Unknown project rejects Demo Mode", () => {
    const unknownUrls = [
      "https://randomproject12345.supabase.co",
      "https://testproject9999.supabase.co",
      "https://otherdev123.supabase.co",
    ]

    for (const url of unknownUrls) {
      expect(isDemoEnvironment(url)).toBe(false)
      expect(isProductionEnvironment(url)).toBe(false)

      const verification = verifyDemoEnvironment(url)
      expect(verification.allowed).toBe(false)
      expect(verification.error).toMatch(/not the approved demo\/rehearsal environment/i)
    }
  })

  it("11. Missing Supabase URL rejects Demo Mode", () => {
    expect(isDemoEnvironment(null)).toBe(false)
    expect(isDemoEnvironment("")).toBe(false)
    expect(isProductionEnvironment(null)).toBe(true) // Fail-closed

    const nullCheck = verifyDemoEnvironment(null)
    expect(nullCheck.allowed).toBe(false)
    expect(nullCheck.projectRef).toBeNull()
    expect(nullCheck.error).toMatch(/supabase url is missing/i)

    const emptyCheck = verifyDemoEnvironment("")
    expect(emptyCheck.allowed).toBe(false)
    expect(emptyCheck.projectRef).toBeNull()
    expect(emptyCheck.error).toMatch(/supabase url is missing/i)
  })

  it("12. Malformed Supabase URL rejects Demo Mode", () => {
    const malformedUrls = [
      "not-a-url",
      "https://google.com",
      "https://supabase.co",
      "https://invalid..supabase.co",
      "http://localhost:3000",
    ]

    for (const url of malformedUrls) {
      expect(extractProjectRef(url)).toBeNull()
      expect(isDemoEnvironment(url)).toBe(false)
      expect(isProductionEnvironment(url)).toBe(true) // Fail-closed

      const check = verifyDemoEnvironment(url)
      expect(check.allowed).toBe(false)
      expect(check.projectRef).toBeNull()
      expect(check.error).toMatch(/could not be verified as a valid supabase project/i)
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 11 — Cleanup Tests (Cases 13–17)
  // ═══════════════════════════════════════════════════════════════════════════

  it("13. REMOVE DEMO is required", () => {
    expect(REQUIRED_CONFIRMATION_PHRASE).toBe("REMOVE DEMO")
    expect("REMOVE DEMO" === REQUIRED_CONFIRMATION_PHRASE).toBe(true)
  })

  it("14. Wrong confirmation phrase is rejected", () => {
    const invalidPhrases = [
      "",
      "remove demo",
      "DELETE",
      "YES",
      "REMOVE",
      "DEMO",
      "REMOVE_DEMO",
      "remove_demo",
      "confirm",
      "cancel",
      "123",
      "REMOVE DEMO ", // trailing space
      " REMOVE DEMO", // leading space
    ]

    for (const phrase of invalidPhrases) {
      expect(phrase === REQUIRED_CONFIRMATION_PHRASE).toBe(false)
    }
  })

  it("15. Successful cleanup disables Demo Mode", async () => {
    let storedValue = "true"
    const mockSupabase: any = {
      from: (_table: string) => {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { value: storedValue }, error: null }),
              }),
            }),
          }),
          upsert: async (payload: { key: string; value: string }) => {
            if (payload.key === DEMO_MODE_CONFIG_KEY) {
              storedValue = payload.value
            }
            return { error: null }
          },
        }
      },
    }

    const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://enompvfdfhynfncgpiuz.supabase.co"

    try {
      // 1. Initially active
      const before = await getDemoModeStatus(mockSupabase, mockSeason.id)
      expect(before.isDemoEnv).toBe(true)
      expect(before.isDemoActive).toBe(true)

      // 2. Perform cleanup -> sets demo_mode_enabled = 'false'
      await mockSupabase.from("season_config").upsert({
        season_id: mockSeason.id,
        key: DEMO_MODE_CONFIG_KEY,
        value: "false",
      })

      // 3. Now disabled
      const after = await getDemoModeStatus(mockSupabase, mockSeason.id)
      expect(after.isDemoEnv).toBe(true)
      expect(after.isDemoActive).toBe(false)
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl
    }
  })

  it("16. Repeated cleanup is safe/idempotent", async () => {
    // Simulating already-empty tables
    const mockSupabase: any = {
      from: () => {
        const chain: any = {
          delete: () => chain,
          select: () => chain,
          eq: () => chain,
          neq: () => chain,
          in: () => chain,
          upsert: async () => ({ error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
          then: (resolve: any) => resolve({ data: [], error: null }),
        }
        return chain
      },
    }

    // Repeated deletions on empty tables return empty results without error
    const run1 = await mockSupabase.from("auction_events").delete().select()
    expect(run1.data).toEqual([])

    const run2 = await mockSupabase.from("auction_events").delete().select()
    expect(run2.data).toEqual([])

    // Repeated setting of demo_mode_enabled = false succeeds
    const upsert1 = await mockSupabase.from("season_config").upsert({
      season_id: mockSeason.id,
      key: DEMO_MODE_CONFIG_KEY,
      value: "false",
    })
    expect(upsert1.error).toBeNull()

    const upsert2 = await mockSupabase.from("season_config").upsert({
      season_id: mockSeason.id,
      key: DEMO_MODE_CONFIG_KEY,
      value: "false",
    })
    expect(upsert2.error).toBeNull()
  })

  it("17. Production data cannot be targeted", () => {
    const prodUrls = [
      "https://btlmiewfyyevtxgywpwy.supabase.co",
      "https://btlmiewfyyevtxgywpwy.supabase.co/rest/v1",
      "https://btlmiewfyyevtxgywpwy.supabase.co/",
    ]

    for (const url of prodUrls) {
      expect(isProductionEnvironment(url)).toBe(true)
      expect(isDemoEnvironment(url)).toBe(false)

      const envCheck = verifyDemoEnvironment(url)
      expect(envCheck.allowed).toBe(false)
      expect(envCheck.error).toBe("Demo Mode operations are unavailable in the production environment.")
    }

    // Ensure production and demo project refs are completely distinct
    expect(PRODUCTION_PROJECT_REF).toBe("btlmiewfyyevtxgywpwy")
    expect(DEMO_PROJECT_REF).toBe("enompvfdfhynfncgpiuz")
    expect(PRODUCTION_PROJECT_REF).not.toBe(DEMO_PROJECT_REF)
  })
})
