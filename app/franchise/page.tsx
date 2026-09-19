export default function FranchiseDashboard() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Franchise Dashboard</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Manage your squad, track your purse, and bid in the live auction.
        </p>
        <div
          className="mt-3 inline-block rounded-md px-3 py-1 text-xs font-medium"
          style={{
            backgroundColor: 'var(--warning)',
            color: '#000',
          }}
        >
          Franchise identity from authentication — Phase 3
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div
          className="rounded-lg border p-6"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3 className="text-lg font-semibold">💰 Purse</h3>
          <p className="mt-2 text-3xl font-bold" style={{ color: 'var(--primary)' }}>
            ₹1000
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Starting purse (configurable per season)
          </p>
        </div>

        <div
          className="rounded-lg border p-6"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3 className="text-lg font-semibold">👥 Squad</h3>
          <p className="mt-2 text-3xl font-bold">0 / 22</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Players acquired
          </p>
        </div>

        <div
          className="rounded-lg border p-6"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3 className="text-lg font-semibold">📊 Bucket Status</h3>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>B1 (Year 1)</span>
              <span>0/2 required</span>
            </div>
            <div className="flex justify-between">
              <span>B2 (Year 2)</span>
              <span>0/2 required</span>
            </div>
            <div className="flex justify-between">
              <span>B3 (Year 3)</span>
              <span>0/2 required</span>
            </div>
            <div className="flex justify-between">
              <span>B4 (Year 4)</span>
              <span>0/2 required</span>
            </div>
            <div className="flex justify-between">
              <span>B5 (Diploma)</span>
              <span>0/2 required</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
