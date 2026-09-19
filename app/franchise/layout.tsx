export default function FranchiseLayout({
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
          Franchise
        </h2>
        <nav className="flex flex-col gap-2 text-sm">
          <a href="/franchise" className="rounded-md px-3 py-2 hover:bg-gray-100">
            Dashboard
          </a>
          <a href="/franchise" className="rounded-md px-3 py-2 hover:bg-gray-100">
            My Squad
          </a>
          <a href="/franchise" className="rounded-md px-3 py-2 hover:bg-gray-100">
            Live Auction
          </a>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
