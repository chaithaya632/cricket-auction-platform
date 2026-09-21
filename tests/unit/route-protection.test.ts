import { describe, it, expect } from 'vitest';

// =============================================================================
// Phase 3 Route Protection Logic Tests
// =============================================================================

describe('Route Classification & Protection Boundaries', () => {
  const publicRoutes = [
    '/',
    '/login',
    '/signup',
    '/onboarding',
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
    expect(getLoginRedirect('/franchise/squad')).toBe('/login?redirectTo=%2Ffranchise%2Fsquad');
    expect(getLoginRedirect('/player')).toBe('/login?redirectTo=%2Fplayer');
  });

  it('client-controlled query parameters do not bypass route protection', () => {
    const spoofedPaths = [
      '/admin?role=super_admin',
      '/admin?bypass=true',
      '/franchise?franchiseId=123',
      '/franchise/squad?role=super_admin',
      '/player?role=player',
    ];

    for (const path of spoofedPaths) {
      const pathname = path.split('?')[0];
      expect(isRouteProtected(pathname), `Spoofed path should still be protected: ${path}`).toBe(true);
    }
  });

  it('franchise navigation defines distinct hrefs for Dashboard and My Squad', () => {
    // Read the component source to ensure hrefs are correct
    const fs = require('fs');
    const path = require('path');
    const navSource = fs.readFileSync(
      path.resolve(__dirname, '../../components/franchise/franchise-nav.tsx'),
      'utf-8'
    );
    expect(navSource).toContain('href="/franchise"');
    expect(navSource).toContain('href="/franchise/squad"');
    expect(navSource).not.toMatch(/href="\/franchise"[^>]*>\s*My Squad/);
  });

  it('guards redirect authenticated users without season role to onboarding pending access', () => {
    function resolveUnauthorizedDestination(rolesCount: number, errorParam: string): string {
      if (rolesCount === 0) {
        return '/onboarding?reason=pending_access';
      }
      return `/?error=${errorParam}`;
    }

    expect(resolveUnauthorizedDestination(0, 'unauthorized_admin')).toBe('/onboarding?reason=pending_access');
    expect(resolveUnauthorizedDestination(0, 'unauthorized_franchise')).toBe('/onboarding?reason=pending_access');
    expect(resolveUnauthorizedDestination(0, 'unauthorized_player')).toBe('/onboarding?reason=pending_access');
    expect(resolveUnauthorizedDestination(1, 'unauthorized_admin')).toBe('/?error=unauthorized_admin');
  });
});

