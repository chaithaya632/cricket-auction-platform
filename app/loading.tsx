export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent"
          style={{ borderColor: 'var(--muted)', borderTopColor: 'var(--primary)' }}
        />
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Loading...
        </p>
      </div>
    </div>
  );
}
