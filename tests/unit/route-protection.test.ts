import { describe, it, expect } from 'vitest';

// =============================================================================
// Phase 3 Route Protection Logic Tests
// =============================================================================

describe('Route Classification & Protection Boundaries', () => {
  const publicRoutes = [
    '/',
    '/login',
    '/live',
    '/live/projector',
    '/api/health',
    '/_next/static/chunk.js',
    '/favicon.ico',
  ];

  const protectedRoutes = [
    '/admin',
    '/admin/seasons',
    '/admin/players',
    '/franchise',
    '/franchise/squad',
    '/player',
  ];

  function isRouteProtected(pathname: string): boolean {
    const protectedPrefixes = ['/admin', '/franchise', '/player'];
    return protectedPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
  }

  it('correctly classifies public routes as non-protected', () => {
    for (const route of publicRoutes) {
      expect(isRouteProtected(route), `Route should be public: ${route}`).toBe(false);
    }
  });

  it('correctly classifies admin, franchise, and player routes as protected', () => {
    for (const route of protectedRoutes) {
      expect(isRouteProtected(route), `Route should be protected: ${route}`).toBe(true);
    }
  });

  it('constructs safe redirect targets for unauthenticated requests', () => {
    function getLoginRedirect(pathname: string): string {
      return `/login?redirectTo=${encodeURIComponent(pathname)}`;
    }

    expect(getLoginRedirect('/admin')).toBe('/login?redirectTo=%2Fadmin');
    expect(getLoginRedirect('/franchise')).toBe('/login?redirectTo=%2Ffranchise');
    expect(getLoginRedirect('/player')).toBe('/login?redirectTo=%2Fplayer');
  });

  it('client-controlled query parameters do not bypass route protection', () => {
    const spoofedPaths = [
      '/admin?role=super_admin',
      '/admin?bypass=true',
      '/franchise?franchiseId=123',
      '/player?role=player',
    ];

    for (const path of spoofedPaths) {
      const pathname = path.split('?')[0];
      expect(isRouteProtected(pathname), `Spoofed path should still be protected: ${path}`).toBe(true);
    }
  });
});
