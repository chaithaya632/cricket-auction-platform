import { requireAdmin } from '@/lib/permissions/guards';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Authoritative server-side season guard
  await requireAdmin();
  return <>{children}</>;
}
