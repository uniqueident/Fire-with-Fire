/**
 * types.ts — Shared data shapes used across all auth files.
 */

// All settings needed to connect to your Identity Provider. Filled out in config.ts.
export interface AuthConfig {
  clientId: string;          // Your OAuth public client ID from the IdP console
  authEndpoint: string;      // IdP's login page URL
  tokenEndpoint: string;     // IdP's token exchange URL
  userInfoEndpoint?: string; // IdP's user profile URL (optional but recommended)
  issuer: string;            // IdP's issuer string — used to verify the id_token came from the right place
  scopes: string[];          // Permissions to request (e.g. ['openid', 'email', 'profile'])
  redirectUri: string;       // Auto-generated — copy this value into your IdP's allowed redirect URIs
}

// Tokens returned by the IdP or generated locally via hash.
export interface AuthTokens {
  accessToken: string;   // Token used for authenticated operations
  idToken?: string;      // Signed JWT proving who the user is
  refreshToken?: string; // Long-lived token (not used in MVP)
  expiresIn?: number;    // Lifetime of the token in seconds
  expiresAt?: number;    // Calculated absolute expiry timestamp in ms
}

// User identity data.
export interface UserProfile {
  id?: string;
  username?: string;
  email?: string;
  name?: string;
  picture?: string;
}

// The full login state passed to the UI component.
export interface AuthState {
  isAuthenticated: boolean;
  tokens: AuthTokens | null;
  user: UserProfile | null;
  error?: string | null;
  pendingEmailVerification?: boolean;
}

// Temporary data saved to storage right before the login popup opens.
export interface PendingAuthState {
  state: string;        // Anti-CSRF token
  codeVerifier: string; // PKCE secret
  nonce: string;        // One-time value embedded in the id_token
  timestamp: number;    // Login attempt start time
}

// In-flight email verification request (Magic Link / Code)
export interface PendingEmailVerification {
  email: string;
  token: string;
  code: string;         // 6-digit confirmation code or magic link token
  createdAt: number;
  expiresAt: number;    // Link expires after e.g. 15 minutes
}

// The persistent secure record stored on the browser extension for future SSO/login
export interface StoredUserCredential {
  email: string;
  hashedToken: string;  // SHA-256(email + token + salt)
  verifiedAt: number;
}

// In-flight email verification request (Magic Link / Code)
export interface PendingEmailVerification {
  email: string;
  token: string;
  code: string;         // 6-digit confirmation code or magic link token
  createdAt: number;
  expiresAt: number;    // Link expires after e.g. 15 minutes
}

// The persistent secure record stored on the browser extension for future SSO/login
export interface StoredUserCredential {
  email: string;
  hashedToken: string;  // SHA-256(email + token + salt)
  verifiedAt: number;
}

