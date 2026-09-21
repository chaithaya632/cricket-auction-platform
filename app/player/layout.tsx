// =============================================================================
// ACC Auction Portal — Player Portal Layout (Protected)
// =============================================================================

import Link from 'next/link';
import { requirePlayer } from '@/lib/permissions/guards';
import { UserProfileBadge } from '@/components/auth/user-profile-badge';
import { LogoutButton } from '@/components/auth/logout-button';

export default async function PlayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Authoritative server-side season guard
  const permContext = await requirePlayer();

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 py-8">
      <header
        className="mb-8 flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-4">
          <Link href="/" className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            ACC Player Portal
          </Link>
          <UserProfileBadge context={permContext} />
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-xs hover:underline text-gray-500 hover:text-gray-700 dark:text-gray-400"
          >
            ← Public Site
          </Link>
          <LogoutButton variant="outline" />
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
