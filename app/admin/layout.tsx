export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className="hidden w-64 border-r p-4 md:block"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="mb-6 text-lg font-bold" style={{ color: 'var(--primary)' }}>
          ACC Admin
        </h2>
        <nav className="flex flex-col gap-2 text-sm">
          <a href="/admin" className="rounded-md px-3 py-2 hover:bg-gray-100">
            Dashboard
          </a>
          <a href="/admin" className="rounded-md px-3 py-2 hover:bg-gray-100">
            Seasons
          </a>
          <a href="/admin" className="rounded-md px-3 py-2 hover:bg-gray-100">
            Players
          </a>
          <a href="/admin" className="rounded-md px-3 py-2 hover:bg-gray-100">
            Franchises
          </a>
          <a href="/admin" className="rounded-md px-3 py-2 hover:bg-gray-100">
            Auction
          </a>
          <a href="/admin" className="rounded-md px-3 py-2 hover:bg-gray-100">
            Audit Log
          </a>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
