import { requirePlayer } from '@/lib/permissions/guards';

export default async function PlayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Authoritative server-side season guard
  await requirePlayer();
  return <>{children}</>;
}
