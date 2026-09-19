export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Public header */}
      <header
        className="border-b px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <h1 className="text-lg font-bold" style={{ color: 'var(--primary)' }}>
            ACC
          </h1>
          <nav className="flex gap-4 text-sm">
            <a href="/" className="hover:underline">Home</a>
            <a href="/live" className="hover:underline">Live</a>
            <a href="/login" className="hover:underline">Login</a>
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">{children}</main>

      {/* Public footer */}
      <footer
        className="border-t px-4 py-6 text-center text-sm"
        style={{
          borderColor: 'var(--border)',
          color: 'var(--muted-foreground)',
        }}
      >
        © {new Date().getFullYear()} Avanthi Cricket Championship. All rights
        reserved.
      </footer>
    </div>
  );
}
