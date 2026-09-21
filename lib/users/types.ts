// =============================================================================
// ACC Auction Portal — User & Role Management Types
// =============================================================================

export interface AdminUserListItem {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  created_at: string;
  role: 'super_admin' | 'operator' | 'franchise' | 'player' | 'viewer' | null;
  role_id: string | null;
  franchise_id: string | null;
  franchise_name: string | null;
  franchise_short_code: string | null;
  is_active: boolean;
}

export interface AssignRoleInput {
  userId: string;
  role: 'super_admin' | 'operator' | 'franchise' | 'player' | 'viewer';
  franchiseId?: string | null;
}

export interface AssignRoleResult {
  success: boolean;
  error?: string;
  message?: string;
}
