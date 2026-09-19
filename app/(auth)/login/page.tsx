export default function LoginPage() {
  return (
    <div
      className="rounded-lg border p-8 shadow-sm"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">Welcome to ACC</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Sign in to access your dashboard
        </p>
      </div>

      {/* Login form — Phase 3 */}
      <div
        className="rounded-md p-4 text-center text-sm"
        style={{
          backgroundColor: 'var(--muted)',
          color: 'var(--muted-foreground)',
        }}
      >
        Authentication will be implemented in Phase 3.
        <br />
        Supabase Auth with role-based access control.
      </div>

      <div className="mt-6 text-center">
        <a
          href="/"
          className="text-sm hover:underline"
          style={{ color: 'var(--primary)' }}
        >
          ← Back to Home
        </a>
      </div>
    </div>
  );
}
