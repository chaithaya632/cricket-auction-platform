// =============================================================================
// ACC Auction Portal — Supabase Session Middleware Helper
// =============================================================================

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Updates the Supabase auth session on every request and enforces
 * edge-level authentication guards for protected routes.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const pathname = request.nextUrl.pathname;

  // 1. Route protection check
  const protectedPrefixes = ['/admin', '/franchise', '/player'];
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  const allCookies = request.cookies.getAll();
  const hasAuthCookie = allCookies.some((c) =>
    c.name.includes('-auth-token')
  );

  // For unauthenticated public visitors, avoid redundant remote auth network calls
  if (!isProtected && !hasAuthCookie) {
    return supabaseResponse;
  }

  // 2. Refresh session and retrieve user
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    user = null;
  }

  // 3. Redirect unauthenticated requests on protected routes
  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirectTo', pathname);

    const redirectResponse = NextResponse.redirect(loginUrl);

    // Ensure session cookies are preserved across redirect
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });

    return redirectResponse;
  }

  return supabaseResponse;
}
