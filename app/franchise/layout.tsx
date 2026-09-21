import { requireFranchise } from '@/lib/permissions/guards';

export default async function FranchiseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Authoritative server-side season guard
  await requireFranchise();
  return <>{children}</>;
}
