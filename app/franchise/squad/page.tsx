// =============================================================================
// ACC Auction Portal — Franchise My Squad Page (Phase 5 Placeholder)
// =============================================================================

import { requireFranchise } from '@/lib/permissions/guards';
import { createClient } from '@/lib/supabase/server';

export default async function FranchiseSquadPage() {
  // Authoritative server-side season & franchise guard
  const permContext = await requireFranchise();
  const { assignedFranchise, activeSeason } = permContext;

  const supabase = await createClient();

  // Read current purse and squad size from season configuration
  let purseDisplay = '1000';
  let maxSquadDisplay = '22';

  if (activeSeason) {
    const { data: configs } = await supabase
      .from('season_config')
      .select('key, value')
      .eq('season_id', activeSeason.id)
      .in('key', ['default_purse', 'max_squad_size']);

    if (configs) {
      const purseConfig = configs.find((c) => c.key === 'default_purse');
      if (purseConfig) purseDisplay = purseConfig.value;

      const squadConfig = configs.find((c) => c.key === 'max_squad_size');
      if (squadConfig) maxSquadDisplay = squadConfig.value;
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{assignedFranchise.name} — Squad</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Manage your squad roster, player acquisitions, and bucket allocations.
        </p>
        <div
          className="mt-3 inline-block rounded-md px-3 py-1 text-xs font-medium"
          style={{
            backgroundColor: 'var(--warning)',
            color: '#000',
          }}
        >
          Squad roster management will be implemented in Phase 5
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <div
          className="rounded-lg border p-6"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3 className="text-lg font-semibold">💰 Available Purse</h3>
          <p className="mt-2 text-3xl font-bold" style={{ color: 'var(--primary)' }}>
            ₹{purseDisplay}
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Configured purse for {activeSeason?.name || 'current season'}
          </p>
        </div>

        <div
          className="rounded-lg border p-6"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3 className="text-lg font-semibold">👥 Squad Size</h3>
          <p className="mt-2 text-3xl font-bold">0 / {maxSquadDisplay}</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Players acquired through auction & allotment
          </p>
        </div>

        <div
          className="rounded-lg border p-6"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3 className="text-lg font-semibold">🏷️ Franchise Code</h3>
          <p className="mt-2 text-3xl font-bold text-gray-800 dark:text-gray-200">
            {assignedFranchise.short_name}
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Status: {assignedFranchise.is_active ? 'Active' : 'Inactive'}
          </p>
        </div>
      </div>

      {/* Squad Roster Placeholder */}
      <div
        className="rounded-lg border p-8 text-center"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-2xl">
          🏏
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          No Players Acquired Yet
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-600 dark:text-gray-400">
          Squad players will be populated during the live auction and automatic allotment phases.
          Full squad tracking, captain/vice-captain designation, and referral verification will be
          activated in <span className="font-semibold text-gray-800 dark:text-gray-200">Phase 5 (Franchise Management & Squad Tracking)</span>.
        </p>
      </div>
    </div>
  );
}
