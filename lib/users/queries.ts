// =============================================================================
// ACC Auction Portal — User & Role Management Queries
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminUserListItem } from './types';

/**
 * Retrieves the complete list of registered users and their assigned
 * roles for the specified tournament season.
 */
export async function getAdminUsersList(
  supabase: SupabaseClient,
  seasonId: string
): Promise<AdminUserListItem[]> {
  try {
    // 1. Fetch all registered users
    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('id, email, full_name, phone, is_active, created_at')
      .order('created_at', { ascending: false });

    if (usersErr || !users) {
      return [];
    }

    // 2. Fetch all season role assignments for the target season
    const { data: seasonRoles } = await supabase
      .from('season_roles')
      .select('id, user_id, role, franchise_id, is_active')
      .eq('season_id', seasonId)
      .eq('is_active', true);

    // 3. Fetch franchises in this season for short name / team display
    const { data: franchises } = await supabase
      .from('franchises')
      .select('id, name, short_name')
      .eq('season_id', seasonId);

    const roleMap = new Map<string, any>();
    if (seasonRoles) {
      for (const r of seasonRoles) {
        roleMap.set(r.user_id, r);
      }
    }

    const franchiseMap = new Map<string, any>();
    if (franchises) {
      for (const f of franchises) {
        franchiseMap.set(f.id, f);
      }
    }

    // 4. Assemble merged user list
    return users.map((u) => {
      const assignedRole = roleMap.get(u.id);
      const assignedFranchise = assignedRole?.franchise_id
        ? franchiseMap.get(assignedRole.franchise_id)
        : null;

      return {
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        phone: u.phone || null,
        created_at: u.created_at,
        role: (assignedRole?.role as any) || null,
        role_id: assignedRole?.id || null,
        franchise_id: assignedRole?.franchise_id || null,
        franchise_name: assignedFranchise?.name || null,
        franchise_short_code: assignedFranchise?.short_name || null,
        is_active: assignedRole ? assignedRole.is_active : u.is_active,
      };
    });
  } catch {
    return [];
  }
}
