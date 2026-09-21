'use client';

// =============================================================================
// ACC Auction Portal — Franchise Navigation Component
// =============================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function FranchiseNav() {
  const pathname = usePathname();

  const isDashboard = pathname === '/franchise';
  const isSquad = pathname === '/franchise/squad' || pathname.startsWith('/franchise/squad');
  const isPlayers = pathname === '/franchise/players' || pathname.startsWith('/franchise/players');

  return (
    <nav className="flex flex-col gap-1 text-sm">
      <Link
        href="/franchise"
        className={`rounded-md px-3 py-2 font-medium transition-colors ${
          isDashboard
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-semibold'
            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
        }`}
      >
        Dashboard
      </Link>
      <Link
        href="/franchise/squad"
        className={`rounded-md px-3 py-2 font-medium transition-colors ${
          isSquad
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-semibold'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
        }`}
      >
        My Squad
      </Link>
      <Link
        href="/franchise/players"
        className={`rounded-md px-3 py-2 font-medium transition-colors ${
          isPlayers
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-semibold'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
        }`}
      >
        Player Catalog
      </Link>
      <Link
        href="/live"
        className="rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        Live Auction
      </Link>
    </nav>
  );
}
