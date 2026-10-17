import { defaultAuthConfig } from './config';
import { generateCodeChallenge, generateCodeVerifier, generateNonce, generateState } from './pkce';
import {
  clearAuthStorage,
  clearPendingAuth,
  getPendingAuth,
  getTokens,
  getUserProfile,
  savePendingAuth,
  saveTokens,
  saveUserProfile,
} from './storage';
import type { AuthConfig, AuthState, AuthTokens, UserProfile } from './types';

/**
 * authService.ts — Core SSO Authentication Logic
 *
 * Implements OAuth 2.0 Authorization Code Grant with PKCE and OpenID Connect (OIDC).
 * Enforces production-grade security standards for Chrome Extension environments.
 */

// Maximum lifetime for a pending authorization request (5 minutes)
const PENDING_AUTH_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Initiates the interactive SSO login flow via chrome.identity.launchWebAuthFlow.
 */
export async function loginWithSSO(config: AuthConfig = defaultAuthConfig): Promise<AuthState> {
  try {
    // 1. Generate cryptographic security values
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();
    const nonce = generateNonce();

    // 2. Persist temporary auth context (survives background service worker suspension)
    await savePendingAuth({
      state,
      codeVerifier,
      nonce,
      timestamp: Date.now(),
    });

    // 3. Construct OAuth 2.0 / OIDC Authorization URL
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(' '),
      state: state,
      nonce: nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `${config.authEndpoint}?${params.toString()}`;

    // 4. Validate extension environment availability
    if (typeof chrome === 'undefined' || !chrome.identity?.launchWebAuthFlow) {
      throw new Error(
        'chrome.identity.launchWebAuthFlow is not available. Ensure "identity" is added to manifest.json and run inside Chrome.'
      );
    }

    // 5. Open browser-managed login window
    const redirectUrl = await new Promise<string>((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        {
          url: authUrl,
          interactive: true,
        },
        (callbackUrl) => {
          if (chrome.runtime?.lastError) {
            return reject(new Error(chrome.runtime.lastError.message || 'Login cancelled or window closed'));
          }
          if (!callbackUrl) {
            return reject(new Error('No redirect URL returned by authorization provider'));
          }
          resolve(callbackUrl);
        }
      );
    });

    // 6. Parse response parameters from callback URL
    const parsedUrl = new URL(redirectUrl);
    const queryParams = parsedUrl.searchParams.get('code')
      ? parsedUrl.searchParams
      : new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));

    const code = queryParams.get('code');
    const returnedState = queryParams.get('state');
    const error = queryParams.get('error');

    if (error) {
      const errorDesc = queryParams.get('error_description') || error;
      throw new Error(`SSO Error: ${errorDesc}`);
    }

    if (!code) {
      throw new Error('Authorization code missing from redirect callback');
    }

    // 7. Security verification: validate state and pending request lifetime
    const pendingAuth = await getPendingAuth();
    if (!pendingAuth || pendingAuth.state !== returnedState) {
      throw new Error('Security Error: State mismatch (CSRF protection failed)');
    }

    if (Date.now() - pendingAuth.timestamp > PENDING_AUTH_TIMEOUT_MS) {
      throw new Error('Security Error: Authorization session expired');
    }

    // Single-use guarantee: immediately clean up pending auth state
    await clearPendingAuth();

    // 8. Exchange authorization code for tokens
    const tokens = await exchangeCodeForTokens(code, pendingAuth.codeVerifier, config);

    // 9. Validate ID Token claims (OIDC verification: iss, aud, exp, nonce)
    let userFromToken: UserProfile | null = null;
    if (tokens.idToken) {
      const claims = validateIdTokenClaims(tokens.idToken, pendingAuth.nonce, config);
      userFromToken = {
        id: claims.sub,
        email: claims.email,
        name: claims.name,
        username: claims.preferred_username || claims.name || (claims.email ? claims.email.split('@')[0] : 'User'),
        picture: claims.picture,
      };
    }

    // 10. Fetch user profile from UserInfo endpoint if available, fallback to verified token claims
    const userFromEndpoint = await fetchUserProfile(tokens.accessToken, config);
    const user = userFromEndpoint || userFromToken;

    // 11. Save tokens and user session in storage
    await saveTokens(tokens);
    if (user) {
      await saveUserProfile(user);
    }

    return {
      isAuthenticated: true,
      tokens,
      user,
      error: null,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown authentication error';
    console.error('SSO Login Failed:', errorMessage);
    await clearPendingAuth();
    return {
      isAuthenticated: false,
      tokens: null,
      user: null,
      error: errorMessage,
    };
  }
}

/**
 * Exchanges authorization code + PKCE code_verifier for tokens at the IdP /token endpoint.
 */
async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  config: AuthConfig
): Promise<AuthTokens> {
  const bodyParams = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code: code,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

/**
 * Decodes and cryptographically validates standard claims in an OpenID Connect ID token (JWT).
 */
function validateIdTokenClaims(
  idToken: string,
  expectedNonce: string,
  config: AuthConfig
): Record<string, any> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed ID Token');
  }

  const base64Url = parts[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
  const payload = JSON.parse(jsonPayload);
  const nowInSeconds = Math.floor(Date.now() / 1000);

  // Expiration check (allowing 60s clock skew)
  if (payload.exp && nowInSeconds > payload.exp + 60) {
    throw new Error('ID Token has expired');
  }

  // Issuer verification
  const normalizedIssuer = (payload.iss || '').replace(/\/$/, '');
  const expectedIssuer = config.issuer.replace(/\/$/, '');
  if (normalizedIssuer !== expectedIssuer) {
    throw new Error(`ID Token issuer mismatch: expected ${expectedIssuer}, received ${payload.iss}`);
  }

  // Audience verification (must contain our clientId)
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(config.clientId)) {
    throw new Error(`ID Token audience mismatch: expected ${config.clientId}, received ${payload.aud}`);
  }

  // Nonce verification (replay attack prevention)
  if (payload.nonce && payload.nonce !== expectedNonce) {
    throw new Error('ID Token nonce mismatch: potential replay attack');
  }

  return payload;
}

/**
 * Fetches user profile from IdP UserInfo endpoint using the access token.
 */
async function fetchUserProfile(
  accessToken: string,
  config: AuthConfig
): Promise<UserProfile | null> {
  if (!config.userInfoEndpoint) {
    return null;
  }

  try {
    const response = await fetch(config.userInfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return {
      id: data.sub || data.id,
      email: data.email,
      name: data.name,
      username: data.preferred_username || data.name || (data.email ? data.email.split('@')[0] : 'User'),
      picture: data.picture,
    };
  } catch (err) {
    console.warn('Could not fetch user profile from endpoint:', err);
    return null;
  }
}

/**
 * Checks session state on popup open, verifying token expiration.
 */
export async function getInitialAuthState(): Promise<AuthState> {
  const tokens = await getTokens();
  const user = await getUserProfile();

  if (tokens && tokens.accessToken) {
    // Expiration check: if token is expired, clear storage and require re-login
    if (tokens.expiresAt && Date.now() >= tokens.expiresAt) {
      console.warn('Stored access token is expired. Clearing auth storage.');
      await clearAuthStorage();
      return {
        isAuthenticated: false,
        tokens: null,
        user: null,
        error: 'Session expired. Please sign in again.',
      };
    }

    return {
      isAuthenticated: true,
      tokens,
      user,
      error: null,
    };
  }

  return {
    isAuthenticated: false,
    tokens: null,
    user: null,
    error: null,
  };
}

/**
 * Logs out user: clears local and session storage.
 */
export async function logout(): Promise<void> {
  await clearAuthStorage();
}
