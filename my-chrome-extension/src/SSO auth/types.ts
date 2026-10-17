/**
 * types.ts — Shared data shapes used across all auth files.
 * You don't need to edit this unless you're adding new fields to track.
 */

// All settings needed to connect to your Identity Provider. Filled out in config.ts.
export interface AuthConfig {
  clientId: string;          //  Your OAuth public client ID from the IdP console
  authEndpoint: string;      //  IdP's login page URL
  tokenEndpoint: string;     //  IdP's token exchange URL
  userInfoEndpoint?: string; //  IdP's user profile URL (optional but recommended)
  issuer: string;            //  IdP's issuer string — used to verify the id_token came from the right place
  scopes: string[];          //  Permissions to request (e.g. ['openid', 'email', 'profile'])
  redirectUri: string;       // Auto-generated — copy this value into your IdP's allowed redirect URIs
}

// Tokens returned by the IdP after a successful login.
export interface AuthTokens {
  accessToken: string;   // Short-lived token used to call protected APIs
  idToken?: string;      // Signed JWT proving who the user is — we verify its claims after login
  refreshToken?: string; // Long-lived token for getting new access tokens without re-login (not used in MVP)
  expiresIn?: number;    // Lifetime of the access token in seconds (e.g. 3600)
  expiresAt?: number;    // Calculated absolute expiry timestamp in ms — checked on popup open
}

// User identity data fetched from the IdP's userinfo endpoint.
export interface UserProfile {
  id?: string;       // Unique user ID from IdP (called 'sub' in OIDC)
  username?: string; // Display name shown in the UI
  email?: string;
  name?: string;
  picture?: string;  // Profile photo URL
}

// The full login state passed to the UI component.
export interface AuthState {
  isAuthenticated: boolean;
  tokens: AuthTokens | null;
  user: UserProfile | null;
  error?: string | null;
}

// Temporary data saved to storage right before the login popup opens.
// Kept alive only for the duration of one login attempt, then deleted.
export interface PendingAuthState {
  state: string;        // Anti-CSRF token — must match what the IdP echoes back
  codeVerifier: string; // PKCE secret — sent during token exchange to prove request origin
  nonce: string;        // One-time value embedded in the id_token — verified after token exchange
  timestamp: number;    // Login attempt start time — pending auth expires after 5 minutes
}
