// =============================================================================
// ACC Auction Portal — Admin Dashboard Layout (Protected)
// =============================================================================

import Link from 'next/link';
import { requireAdmin } from '@/lib/permissions/guards';
import { UserProfileBadge } from '@/components/auth/user-profile-badge';
import { LogoutButton } from '@/components/auth/logout-button';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Authoritative server-side season guard
  const permContext = await requireAdmin();

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
              ACC Admin
            </Link>
          </div>

          <div className="mb-6 rounded-lg bg-gray-50 dark:bg-gray-900/60 p-3 border" style={{ borderColor: 'var(--border)' }}>
            <UserProfileBadge context={permContext} />
          </div>

          <nav className="flex flex-col gap-1 text-sm">
            <Link
              href="/admin"
              className="rounded-md px-3 py-2 font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Dashboard
            </Link>
            <Link
              href="/admin"
              className="rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Seasons
            </Link>
            <Link
              href="/admin"
              className="rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Players
            </Link>
            <Link
              href="/admin"
              className="rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Franchises
            </Link>
            <Link
              href="/admin"
              className="rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Auction
            </Link>
            <Link
              href="/admin"
              className="rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Audit Log
            </Link>
          </nav>
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
