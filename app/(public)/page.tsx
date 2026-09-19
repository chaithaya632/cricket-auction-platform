export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16">
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
          Avanthi Cricket
          <br />
          <span style={{ color: 'var(--primary)' }}>Championship</span>
        </h1>
        <p
          className="max-w-2xl text-lg"
          style={{ color: 'var(--muted-foreground)' }}
        >
          The premier inter-department cricket tournament. Register as a player,
          manage your franchise, or watch the live auction.
        </p>
        <div className="flex gap-4">
          <a
            href="/login"
            className="rounded-md px-6 py-3 text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-foreground)',
            }}
          >
            Get Started
          </a>
          <a
            href="/live"
            className="rounded-md border px-6 py-3 text-sm font-medium transition-colors"
            style={{ borderColor: 'var(--border)' }}
          >
            Watch Live
          </a>
        </div>
      </section>

      {/* Info Cards */}
      <section className="mt-20 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <div
          className="rounded-lg border p-6"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3 className="mb-2 text-lg font-semibold">🏏 Players</h3>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Register with your roll number, set your base price, and showcase
            your cricket skills.
          </p>
        </div>
        <div
          className="rounded-lg border p-6"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3 className="mb-2 text-lg font-semibold">🏆 Franchises</h3>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Build your squad through the live auction. Manage your purse, meet
            bucket requirements, and compete.
          </p>
        </div>
        <div
          className="rounded-lg border p-6"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3 className="mb-2 text-lg font-semibold">📺 Live Auction</h3>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Watch the auction in real-time. See bids, timer, squads, and purse
            updates as they happen.
          </p>
        </div>
      </section>
    </div>
  );
}
