/**
 * pkce.ts — Cryptographic Security Helpers (PKCE, State, and Nonce)
 *
 * Implements RFC 7636 (PKCE) and OIDC Core security standards using Web Crypto.
 *
 * SECURITY ROLES:
 * - Code Verifier: High-entropy secret retained by client during login flow.
 * - Code Challenge: SHA-256 hash of verifier sent to IdP during authorization request.
 * - State: Unpredictable token sent to IdP to prevent Cross-Site Request Forgery (CSRF).
 * - Nonce: Cryptographic token to bind the ID token to the authorization session,
 *   preventing token replay attacks.
 */

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
 * Generates a PKCE Code Verifier (RFC 7636).
 * Must be unguessable, minimum 43 characters, maximum 128 characters.
 */
export function generateCodeVerifier(): string {
  return generateRandomString(64);
}

/**
 * Computes the PKCE Code Challenge using SHA-256 (S256 method).
 * Formula: code_challenge = Base64URL(SHA-256(code_verifier))
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
