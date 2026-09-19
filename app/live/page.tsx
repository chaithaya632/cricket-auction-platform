export default function LiveAuctionPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <div className="text-6xl">📺</div>
      <h1 className="text-3xl font-bold">Live Auction</h1>
      <p
        className="max-w-md text-center text-sm"
        style={{ color: 'var(--muted-foreground)' }}
      >
        The live auction view will show real-time bidding, player information,
        timer, franchise statuses, and squad updates.
      </p>
      <div
        className="mt-4 rounded-md px-4 py-2 text-sm"
        style={{
          backgroundColor: 'var(--muted)',
          color: 'var(--muted-foreground)',
        }}
      >
        Coming in Phase 8 (Realtime) + Phase 9 (Auction UI)
      </div>
    </div>
  );
}
