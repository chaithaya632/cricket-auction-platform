// =============================================================================
// ACC Auction Portal — User Profile Badge Component
// =============================================================================

import type { UserPermissionContext } from '@/lib/permissions/types';

interface UserProfileBadgeProps {
  context: UserPermissionContext;
  showSeason?: boolean;
}

export function UserProfileBadge({
  context,
  showSeason = true,
}: UserProfileBadgeProps) {
  const { user, activeSeason, roles, assignedFranchise } = context;

  const roleLabels = roles.map((r) => {
    if (r.role === 'franchise' && assignedFranchise) {
      return `${assignedFranchise.short_name || assignedFranchise.name} Rep`;
    }
    if (r.role === 'super_admin') return 'Super Admin';
    if (r.role === 'operator') return 'Operator';
    if (r.role === 'player') return 'Player';
    return 'Viewer';
  });

  const displayRole = roleLabels.join(', ') || 'User';

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 font-semibold text-white text-xs">
        {user.full_name?.charAt(0).toUpperCase() || 'U'}
      </div>
      <div className="text-left">
        <p className="text-xs font-semibold leading-none text-gray-900 dark:text-gray-100">
          {user.full_name}
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
          <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-200">
            {displayRole}
          </span>
          {showSeason && activeSeason && (
            <span>• {activeSeason.name}</span>
          )}
        </div>
      </div>
    </div>
  );
}
