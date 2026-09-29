import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getUserPermissionContext } from '@/lib/permissions/context';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { authUser, appUser } = await getCurrentUser();

  if (!authUser || !appUser) {
    redirect('/login?redirectTo=/admin');
  }

  const supabase = await createClient();
  const context = await getUserPermissionContext(supabase, appUser);

  // Allow if user is super_admin/operator OR has an active match_scorer assignment
  if (!context.isAdmin) {
    const { data: scorerAssignment } = await supabase
      .from('match_scorers')
      .select('id')
      .eq('user_id', appUser.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!scorerAssignment) {
      if (context.roles.length === 0) {
        redirect('/onboarding?reason=pending_access');
      }
      redirect('/?error=unauthorized_admin');
    }
  }

  return <>{children}</>;
}
