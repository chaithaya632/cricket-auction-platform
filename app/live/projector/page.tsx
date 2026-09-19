export default function ProjectorPage() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <h1 className="text-5xl font-extrabold tracking-tight">
        Avanthi Cricket Championship
      </h1>
      <p
        className="text-2xl"
        style={{ color: 'var(--muted-foreground)' }}
      >
        Projector Display
      </p>
      <div
        className="mt-4 rounded-md px-6 py-3 text-lg"
        style={{
          backgroundColor: 'var(--muted)',
          color: 'var(--muted-foreground)',
        }}
      >
        Large-format auction display — Phase 9
      </div>
    </div>
  );
}
