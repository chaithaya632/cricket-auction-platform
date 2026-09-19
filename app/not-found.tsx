import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-6xl font-bold" style={{ color: 'var(--primary)' }}>
        404
      </h1>
      <p className="text-xl" style={{ color: 'var(--muted-foreground)' }}>
        Page not found
      </p>
      <Link
        href="/"
        className="mt-4 rounded-md px-6 py-2 text-sm font-medium transition-colors"
        style={{
          backgroundColor: 'var(--primary)',
          color: 'var(--primary-foreground)',
        }}
      >
        Back to Home
      </Link>
    </div>
  );
}
