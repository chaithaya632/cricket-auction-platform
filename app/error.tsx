'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold" style={{ color: 'var(--destructive)' }}>
        Something went wrong
      </h1>
      <p className="text-lg" style={{ color: 'var(--muted-foreground)' }}>
        {error.message || 'An unexpected error occurred.'}
      </p>
      <button
        onClick={reset}
        className="mt-4 rounded-md px-6 py-2 text-sm font-medium transition-colors"
        style={{
          backgroundColor: 'var(--primary)',
          color: 'var(--primary-foreground)',
        }}
      >
        Try Again
      </button>
    </div>
  );
}
