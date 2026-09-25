import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loginSchema, signupSchema } from '@/lib/auth/validation';
import { formatAuthError } from '@/lib/auth/errors';
import { loginAction, signupAction } from '@/lib/auth/actions';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getUserPermissionContext } from '@/lib/permissions/context';


// =============================================================================
// Phase 3 & Auth/Signup Fix Unit Tests
// =============================================================================

describe('Auth Validation (loginSchema)', () => {
  it('accepts valid credentials', () => {
    const result = loginSchema.safeParse({
      email: 'coordinator@avanthi.edu',
      password: 'strongPassword123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('coordinator@avanthi.edu');
      expect(result.data.password).toBe('strongPassword123');
    }
  });

  it('trims whitespace from email', () => {
    const result = loginSchema.safeParse({
      email: '  user@avanthi.edu  ',
      password: 'password123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@avanthi.edu');
    }
  });

  it('rejects empty email', () => {
    const result = loginSchema.safeParse({
      email: '',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email formats', () => {
    const invalidEmails = ['plainaddress', '@missingusername.com', 'user@.com', 'user@domain'];
    for (const email of invalidEmails) {
      const result = loginSchema.safeParse({ email, password: 'password123' });
      expect(result.success, `Should reject: ${email}`).toBe(false);
    }
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({
      email: 'user@avanthi.edu',
      password: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects passwords shorter than 6 characters', () => {
    const result = loginSchema.safeParse({
      email: 'user@avanthi.edu',
      password: '12345',
    });
    expect(result.success).toBe(false);
  });
});

describe('Signup Validation (signupSchema)', () => {
  it('accepts valid signup input', () => {
    const result = signupSchema.safeParse({
      fullName: 'Rahul Sharma',
      email: 'rahul@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fullName).toBe('Rahul Sharma');
      expect(result.data.email).toBe('rahul@example.com');
    }
  });

  it('rejects empty or whitespace-only full name', () => {
    const result = signupSchema.safeParse({
      fullName: '   ',
      email: 'rahul@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects mismatched password and confirmPassword', () => {
    const result = signupSchema.safeParse({
      fullName: 'Rahul Sharma',
      email: 'rahul@example.com',
      password: 'password123',
      confirmPassword: 'password456',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Passwords do not match');
    }
  });

  it('rejects passwords shorter than 6 characters', () => {
    const result = signupSchema.safeParse({
      fullName: 'Rahul Sharma',
      email: 'rahul@example.com',
      password: '12345',
      confirmPassword: '12345',
    });
    expect(result.success).toBe(false);
  });
});

describe('Safe Auth Error Formatting (formatAuthError)', () => {
  it('distinguishes wrong credentials with user-friendly message', () => {
    const message = formatAuthError(new Error('Invalid login credentials'));
    expect(message).toBe('Invalid email or password.');
  });

  it('distinguishes existing email on signup', () => {
    const message = formatAuthError(new Error('User already registered'));
    expect(message).toBe('An account with this email already exists. Please sign in instead.');
  });

  it('handles email confirmation required error safely', () => {
    const message = formatAuthError('Email not confirmed');
    expect(message).toContain('Email confirmation pending');
  });

  it('handles rate limit error safely and distinguishes login vs signup', () => {
    const signupMessage = formatAuthError('over_email_send_rate_limit: too many requests', 'signup');
    expect(signupMessage).toBe('Registration is temporarily rate limited. Please try again shortly.');

    const loginMessage = formatAuthError('rate limit exceeded: too many requests', 'login');
    expect(loginMessage).toBe('Too many login attempts. Please wait a moment and try again.');
  });

  it('masks PostgreSQL internal errors and does not expose SQL syntax', () => {
    const psqlError = new Error(
      'SELECT * FROM auth.users WHERE id = $1: relation "auth.users" does not exist'
    );
    const message = formatAuthError(psqlError);
    expect(message).toBe('Authentication failed. Please verify your details and try again.');
    expect(message).not.toContain('auth.users');
    expect(message).not.toContain('SELECT');
  });

  it('masks database connection errors and stack traces', () => {
    const connError = new Error('connect ECONNREFUSED 127.0.0.1:5432 at TCPConnectWrap.afterConnect');
    const message = formatAuthError(connError);
    expect(message).toContain('Unable to reach the authentication service');
    expect(message).not.toContain('ECONNREFUSED');
    expect(message).not.toContain('127.0.0.1');
    expect(message).not.toContain('TCPConnectWrap');
  });

  it('handles null and undefined gracefully', () => {
    expect(formatAuthError(null)).toBe('An unexpected error occurred. Please try again.');
    expect(formatAuthError(undefined)).toBe('An unexpected error occurred. Please try again.');
  });
});

// Mock Supabase server client and permissions for server actions tests
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/lib/permissions/context', () => ({
  getUserPermissionContext: vi.fn(),
}));

describe('Auth Server Actions', () => {
  const mockedCreateClient = vi.mocked(createClient);
  const mockedGetCurrentUser = vi.mocked(getCurrentUser);
  const mockedGetUserPermissionContext = vi.mocked(getUserPermissionContext);

  beforeEach(() => {
    vi.clearAllMocks();
  });


  describe('signupAction()', () => {
    it('rejects invalid inputs without calling Supabase', async () => {
      const result = await signupAction({
        fullName: '',
        email: 'invalid',
        password: '123',
        confirmPassword: '456',
      });
      expect(result.success).toBe(false);
      expect(mockedCreateClient).not.toHaveBeenCalled();
    });

    it('handles email confirmation required (no immediate session)', async () => {
      mockedCreateClient.mockResolvedValueOnce({
        auth: {
          signUp: vi.fn().mockResolvedValueOnce({
            data: { user: { id: 'user-1', email: 'new@example.com' }, session: null },
            error: null,
          }),
        },
      } as any);

      const result = await signupAction({
        fullName: 'New User',
        email: 'new@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.emailConfirmationRequired).toBe(true);
      expect(result.redirectTo).toContain('confirmation_required');
    });

    it('redirects to onboarding when session is created immediately', async () => {
      mockedCreateClient.mockResolvedValueOnce({
        auth: {
          signUp: vi.fn().mockResolvedValueOnce({
            data: {
              user: { id: 'user-2', email: 'session@example.com' },
              session: { access_token: 'tok' },
            },
            error: null,
          }),
        },
      } as any);

      const result = await signupAction({
        fullName: 'Session User',
        email: 'session@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.emailConfirmationRequired).toBe(false);
      expect(result.redirectTo).toBe('/onboarding');
    });

    it('handles existing user gracefully', async () => {
      mockedCreateClient.mockResolvedValueOnce({
        auth: {
          signUp: vi.fn().mockResolvedValueOnce({
            data: { user: null, session: null },
            error: new Error('User already registered'),
          }),
        },
      } as any);

      const result = await signupAction({
        fullName: 'Existing User',
        email: 'existing@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('An account with this email already exists. Please sign in instead.');
    });
  });

  describe('loginAction() and Authoritative Role Routing', () => {
    it('rejects invalid inputs without calling Supabase', async () => {
      const result = await loginAction({ email: '', password: '' });
      expect(result.success).toBe(false);
      expect(mockedCreateClient).not.toHaveBeenCalled();
    });

    it('routes admin user to /admin', async () => {
      mockedCreateClient.mockResolvedValueOnce({
        auth: {
          signInWithPassword: vi.fn().mockResolvedValueOnce({
            data: { user: { id: 'admin-1' } },
            error: null,
          }),
        },
      } as any);

      mockedGetCurrentUser.mockResolvedValueOnce({
        authUser: { id: 'admin-1' } as any,
        appUser: { id: 'admin-1', full_name: 'Admin' } as any,
      });

      mockedGetUserPermissionContext.mockResolvedValueOnce({
        isAdmin: true,
        isFranchise: false,
        isPlayer: false,
        roles: [{ role: 'super_admin' }],
      } as any);

      const result = await loginAction({
        email: 'admin@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.redirectTo).toBe('/admin');
    });

    it('routes franchise user to /franchise', async () => {
      mockedCreateClient.mockResolvedValueOnce({
        auth: {
          signInWithPassword: vi.fn().mockResolvedValueOnce({
            data: { user: { id: 'fran-1' } },
            error: null,
          }),
        },
      } as any);

      mockedGetCurrentUser.mockResolvedValueOnce({
        authUser: { id: 'fran-1' } as any,
        appUser: { id: 'fran-1', full_name: 'Owner' } as any,
      });

      mockedGetUserPermissionContext.mockResolvedValueOnce({
        isAdmin: false,
        isFranchise: true,
        isPlayer: false,
        roles: [{ role: 'franchise' }],
      } as any);

      const result = await loginAction({
        email: 'franchise@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.redirectTo).toBe('/franchise');
    });

    it('routes player user to /player', async () => {
      mockedCreateClient.mockResolvedValueOnce({
        auth: {
          signInWithPassword: vi.fn().mockResolvedValueOnce({
            data: { user: { id: 'player-1' } },
            error: null,
          }),
        },
      } as any);

      mockedGetCurrentUser.mockResolvedValueOnce({
        authUser: { id: 'player-1' } as any,
        appUser: { id: 'player-1', full_name: 'Player One' } as any,
      });

      mockedGetUserPermissionContext.mockResolvedValueOnce({
        isAdmin: false,
        isFranchise: false,
        isPlayer: true,
        roles: [{ role: 'player' }],
      } as any);

      const result = await loginAction({
        email: 'player@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.redirectTo).toBe('/player');
    });

    it('routes newly registered user with no season role to /onboarding', async () => {
      mockedCreateClient.mockResolvedValueOnce({
        auth: {
          signInWithPassword: vi.fn().mockResolvedValueOnce({
            data: { user: { id: 'newbie-1' } },
            error: null,
          }),
        },
      } as any);

      mockedGetCurrentUser.mockResolvedValueOnce({
        authUser: { id: 'newbie-1' } as any,
        appUser: { id: 'newbie-1', full_name: 'Newbie' } as any,
      });

      mockedGetUserPermissionContext.mockResolvedValueOnce({
        isAdmin: false,
        isFranchise: false,
        isPlayer: false,
        roles: [],
      } as any);

      const result = await loginAction({
        email: 'newbie@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.redirectTo).toBe('/onboarding');
    });

    it('prevents unauthorized access via spoofed redirectTo (non-admin requesting /admin)', async () => {
      mockedCreateClient.mockResolvedValueOnce({
        auth: {
          signInWithPassword: vi.fn().mockResolvedValueOnce({
            data: { user: { id: 'player-1' } },
            error: null,
          }),
        },
      } as any);

      mockedGetCurrentUser.mockResolvedValueOnce({
        authUser: { id: 'player-1' } as any,
        appUser: { id: 'player-1', full_name: 'Player' } as any,
      });

      mockedGetUserPermissionContext.mockResolvedValueOnce({
        isAdmin: false,
        isFranchise: false,
        isPlayer: true,
        roles: [{ role: 'player' }],
      } as any);

      // Player attempts to redirect to /admin
      const result = await loginAction(
        { email: 'player@example.com', password: 'password123' },
        '/admin'
      );

      expect(result.success).toBe(true);
      // Denied access to /admin; falls back to authorized portal /player
      expect(result.redirectTo).toBe('/player');
    });
  });

});
