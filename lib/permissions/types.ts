// =============================================================================
// ACC Auction Portal — Permissions & Season Authorization Types
// =============================================================================

import type { DbUser, DbSeason, DbSeasonRole, DbFranchise } from '@/lib/db/types';

export interface UserPermissionContext {
  user: DbUser;
  activeSeason: DbSeason | null;
  roles: DbSeasonRole[];
  assignedFranchise: DbFranchise | null;
  isSuperAdmin: boolean;
  isOperator: boolean;
  isAdmin: boolean;       // super_admin OR operator
  isFranchise: boolean;
  isPlayer: boolean;
  isViewer: boolean;
}

export interface PermissionCheckResult {
  isAuthorized: boolean;
  reason?: string;
}
