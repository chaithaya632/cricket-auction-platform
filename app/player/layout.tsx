export default function PlayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 py-8">
      {children}
    </div>
  );
}
