// =============================================================================
// ACC Auction Portal — Safe Authentication Error Handling
// =============================================================================
// Formats authentication errors into safe, user-friendly messages.
// Never exposes database internals, stack traces, SQL errors, or credentials.
// =============================================================================

export function formatAuthError(error: unknown): string {
  if (!error) {
    return 'An unexpected error occurred. Please try again.';
  }

  const rawMessage =
    typeof error === 'string'
      ? error
      : error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';

  const lower = rawMessage.toLowerCase();

  // Invalid login credentials
  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid_credentials') ||
    lower.includes('invalid grant') ||
    lower.includes('wrong password') ||
    lower.includes('user not found')
  ) {
    return 'Invalid email or password. Please verify your credentials and try again.';
  }

  // Email verification required
  if (lower.includes('email not confirmed') || lower.includes('unconfirmed')) {
    return 'Email confirmation pending. Please check your inbox to verify your account.';
  }

  // Rate limiting / abuse protection
  if (
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('over_email_send_rate_limit')
  ) {
    return 'Too many login attempts. Please wait a moment and try again.';
  }

  // Missing or invalid parameters
  if (lower.includes('missing email') || lower.includes('missing password')) {
    return 'Email and password are both required.';
  }

  // Network / server connection error
  if (
    lower.includes('network') ||
    lower.includes('fetch failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('timeout') ||
    lower.includes('connection refused') ||
    lower.includes('econnrefused') ||
    lower.includes('refused')
  ) {
    return 'Unable to reach the authentication service. Please check your internet connection.';
  }

  // Default safe generic message (never expose internal traces or SQL errors)
  return 'Authentication failed. Please verify your details and try again.';
}
