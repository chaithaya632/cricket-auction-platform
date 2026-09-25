import { cache } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';

/**
 * Server-side Supabase client for Server Components and Server Actions.
 * Uses the anon key with cookie-based auth.
 * Forwards client IP to Supabase Auth so rate limits are evaluated per client
 * rather than aggregating all traffic under Vercel's serverless IP pool.
 * Memoized per server render cycle with React cache().
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();
  const clientHeaders: Record<string, string> = {};

  try {
    const headerStore = await headers();
    const forwardedFor = headerStore.get('x-forwarded-for');
    const realIp = headerStore.get('x-real-ip');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : realIp;
    if (clientIp) {
      clientHeaders['x-forwarded-for'] = clientIp;
    }
  } catch {
    // headers() might not be available in non-request contexts
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: clientHeaders,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
});

// Phase 3: createAdminClient (service-role key) will be added here
// when elevated-privilege server-side operations are needed.

