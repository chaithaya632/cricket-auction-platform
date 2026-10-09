import { createBrowserClient } from '@supabase/ssr';

let clientInstance: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Browser-side Supabase client.
 * Uses the public anon key — safe for client-side use.
 * RLS policies enforce authorization.
 * Maintains a persistent client singleton in browser context to avoid duplicate Realtime WebSockets.
 */
export function createClient() {
  if (typeof window === 'undefined') {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  if (!clientInstance) {
    clientInstance = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return clientInstance;
}

export function resetBrowserClientForTests() {
  clientInstance = null;
}
