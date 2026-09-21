import { describe, it, expect } from 'vitest';
import { loginSchema } from '@/lib/auth/validation';
import { formatAuthError } from '@/lib/auth/errors';

// =============================================================================
// Phase 3 Auth Unit Tests
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

describe('Safe Auth Error Formatting (formatAuthError)', () => {
  it('masks invalid login credentials into user-friendly message', () => {
    const message = formatAuthError(new Error('Invalid login credentials'));
    expect(message).toBe('Invalid email or password. Please verify your credentials and try again.');
    expect(message).not.toContain('Invalid login credentials');
  });

  it('handles email confirmation required error safely', () => {
    const message = formatAuthError('Email not confirmed');
    expect(message).toContain('Email confirmation pending');
  });

  it('handles rate limit error safely', () => {
    const message = formatAuthError('over_email_send_rate_limit: too many requests');
    expect(message).toBe('Too many login attempts. Please wait a moment and try again.');
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
