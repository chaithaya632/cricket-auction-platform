export default function AdminDashboard() {
  const cards = [
    { title: 'Seasons', description: 'Manage ACC editions', icon: '📅', phase: 2 },
    { title: 'Players', description: 'Player registrations', icon: '🏏', phase: 4 },
    { title: 'Franchises', description: 'Franchise management', icon: '🏆', phase: 5 },
    { title: 'Auction', description: 'Auction control panel', icon: '🔨', phase: 6 },
    { title: 'Referrals', description: 'Referral verification', icon: '🤝', phase: 5 },
    { title: 'Audit Log', description: 'System audit trail', icon: '📋', phase: 10 },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Super Admin control panel for the Avanthi Cricket Championship.
        </p>
        <div
          className="mt-3 inline-block rounded-md px-3 py-1 text-xs font-medium"
          style={{
            backgroundColor: 'var(--warning)',
            color: '#000',
          }}
        >
          Auth guard will be enforced in Phase 3
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-lg border p-6"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="text-3xl">{card.icon}</div>
            <h3 className="mt-3 text-lg font-semibold">{card.title}</h3>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {card.description}
            </p>
            <p
              className="mt-3 text-xs"
              style={{ color: 'var(--muted-foreground)' }}
            >
              Phase {card.phase}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
