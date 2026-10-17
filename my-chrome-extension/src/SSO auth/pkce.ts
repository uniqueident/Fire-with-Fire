/**
 * pkce.ts — Cryptographic Security Helpers (PKCE, State, Nonce, and Email/Token Hashing)
 *
 * Implements RFC 7636 (PKCE), OIDC Core, and Web Crypto SHA-256 hashing.
 */

// Application salt mixed into the token/email hash for added defense against rainbow table attacks
const APP_HASH_SALT = 'fire-with-fire:edu-sso-salt:v1';

/**
 * Validates that an email has valid syntax and strictly ends with '.edu'.
 */
export function validateEduEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  
  // Standard email pattern ending with .edu
  const eduRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.edu$/;
  return eduRegex.test(trimmed);
}

/**
 * Converts an ArrayBuffer into a Base64URL string (RFC 4648 §5 without padding).
 */
export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Converts an ArrayBuffer to a standard hex string.
 */
export function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generates a cryptographically secure random string with given character length.
 */
export function generateRandomString(length: number = 64): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);

  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[randomValues[i] % charset.length];
  }
  return result;
}

/**
 * Generates a 6-digit verification code for email confirmation.
 */
export function generateVerificationCode(): string {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  const code = (values[0] % 900000) + 100000; //any 6 digit #  100000 <= x <= 999999
  return code.toString();
}

/**
 * Securely hashes an email and token together using SHA-256 (Web Crypto).
 * Returns the hex digest stored on the browser extension as proof of verification.
 */
export async function hashTokenAndEmail(email: string, token: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  const rawInput = `${normalizedEmail}:${token}:${APP_HASH_SALT}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(rawInput);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(digest);
}

/**
 * Generates a PKCE Code Verifier (RFC 7636).
 */
export function generateCodeVerifier(): string {
  return generateRandomString(64);
}

/**
 * Computes the PKCE Code Challenge using SHA-256 (S256 method).
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufferToBase64Url(digest);
}

/**
 * Generates an Anti-CSRF state token.
 */
export function generateState(): string {
  return generateRandomString(32);
}

/**
 * Generates an OIDC Nonce to mitigate ID token replay attacks.
 */
export function generateNonce(): string {
  return generateRandomString(32);
}
