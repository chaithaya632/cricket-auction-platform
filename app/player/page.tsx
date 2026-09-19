export default function PlayerPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold">Player Profile</h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
        View your profile, auction information, and registration status.
      </p>
      <div
        className="mt-6 rounded-md p-4 text-sm"
        style={{
          backgroundColor: 'var(--muted)',
          color: 'var(--muted-foreground)',
        }}
      >
        Player profiles will be implemented in Phase 4.
      </div>
    </div>
  );
}
