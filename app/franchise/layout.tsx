// =============================================================================
// ACC Auction Portal — Franchise Dashboard Layout (Protected)
// =============================================================================

import Link from 'next/link';
import { requireFranchise } from '@/lib/permissions/guards';
import { UserProfileBadge } from '@/components/auth/user-profile-badge';
import { LogoutButton } from '@/components/auth/logout-button';
import { FranchiseNav } from '@/components/franchise/franchise-nav';

export default async function FranchiseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Authoritative server-side season guard
  const permContext = await requireFranchise();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Sidebar */}
      <aside
        className="flex flex-col justify-between border-b md:border-b-0 md:border-r p-4 md:w-64"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <div className="mb-6 flex items-center justify-between">
            <Link href="/" className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {permContext.assignedFranchise.name}
            </Link>
          </div>

          <div className="mb-6 rounded-lg bg-gray-50 dark:bg-gray-900/60 p-3 border" style={{ borderColor: 'var(--border)' }}>
            <UserProfileBadge context={permContext} />
          </div>

          <FranchiseNav />
        </div>

        <div className="mt-8 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="text-xs hover:underline text-gray-500 hover:text-gray-700 dark:text-gray-400"
            >
              ← Public Site
            </Link>
            <LogoutButton variant="ghost" />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 md:p-8">{children}</main>
    </div>
  );
}
