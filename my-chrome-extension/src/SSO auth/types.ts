/**
 * types.ts — Shared data shapes for Google SSO
 */

export interface AuthConfig {
  userInfoEndpoint: string;
}

export interface AuthTokens {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresAt?: number;
}

export interface UserProfile {
  id?: string;
  username?: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  tokens: AuthTokens | null;
  user: UserProfile | null;
  error?: string | null;
}

export interface PendingAuthState {
  state: string;
  codeVerifier: string;
  nonce: string;
  timestamp: number;
}

export interface StoredUserCredential {
  email: string;
  hashedToken: string;
  verifiedAt: number;
}
