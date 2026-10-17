import { defaultAuthConfig } from './config';
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateNonce,
  generateState,
  hashTokenAndEmail,
  validateEduEmail,
} from './pkce';
import {
  clearAuthStorage,
  clearPendingAuth,
  getPendingAuth,
  getTokens,
  getUserProfile,
  getVerifiedCredential,
  savePendingAuth,
  saveTokens,
  saveUserProfile,
  saveVerifiedCredential,
} from './storage';
import type { AuthConfig, AuthState, AuthTokens, UserProfile } from './types';

/**
 * authService.ts — Google SSO & .edu Verification Service
 *
 * Flow:
 * 1. User launches Google SSO.
 * 2. User signs in with their university Google account.
 * 3. Extension verifies the account ends with .edu.
 * 4. Extension computes SHA-256(email + token) and stores it locally for fast persistent SSO.
 */

const PENDING_AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes for login window

/**
 * Initiates the interactive Google SSO login flow.
 */
export async function loginWithSSO(config: AuthConfig = defaultAuthConfig): Promise<AuthState> {
  try {
    // 1. Generate cryptographic security values
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();
    const nonce = generateNonce();

    // 2. Persist temporary auth context
    await savePendingAuth({
      state,
      codeVerifier,
      nonce,
      timestamp: Date.now(),
    });

    if (config.clientId.includes('YOUR_CLIENT_ID')) {
      throw new Error(
        'Setup required: Please set your Google Client ID in "src/SSO auth/config.ts".'
      );
    }

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
      prompt: 'select_account', // Forces Google account chooser so students can select their .edu account
    });

    const authUrl = `${config.authEndpoint}?${params.toString()}`;

    if (typeof chrome === 'undefined' || !chrome.identity?.launchWebAuthFlow) {
      throw new Error(
        'chrome.identity.launchWebAuthFlow is not available. Ensure "identity" is added to manifest.json.'
      );
    }

    // 4. Open browser-managed login window
    const redirectUrl = await new Promise<string>((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        {
          url: authUrl,
          interactive: true,
        },
        (callbackUrl) => {
          if (chrome.runtime?.lastError) {
            return reject(new Error(chrome.runtime.lastError.message || 'Login cancelled by user'));
          }
          if (!callbackUrl) {
            return reject(new Error('No redirect URL returned by authorization provider'));
          }
          resolve(callbackUrl);
        }
      );
    });

    // 5. Parse response parameters
    const parsedUrl = new URL(redirectUrl);
    const queryParams = parsedUrl.searchParams.get('code')
      ? parsedUrl.searchParams
      : new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));

    const code = queryParams.get('code');
    const returnedState = queryParams.get('state');
    const error = queryParams.get('error');

    if (error) {
      const errorDesc = queryParams.get('error_description') || error;
      throw new Error(`Google SSO Error: ${errorDesc}`);
    }

    if (!code) {
      throw new Error('Authorization code missing from redirect callback');
    }

    // 6. Security verification: validate state and session timeout
    const pendingAuth = await getPendingAuth();
    if (!pendingAuth || pendingAuth.state !== returnedState) {
      throw new Error('Security Error: State mismatch (CSRF protection failed)');
    }

    if (Date.now() - pendingAuth.timestamp > PENDING_AUTH_TIMEOUT_MS) {
      throw new Error('Security Error: Authorization session expired');
    }

    await clearPendingAuth();

    // 7. Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, pendingAuth.codeVerifier, config);

    // 8. Extract profile from ID token claims or UserInfo
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

    const userFromEndpoint = await fetchUserProfile(tokens.accessToken, config);
    const user = userFromEndpoint || userFromToken;

    if (!user || !user.email) {
      throw new Error('Could not retrieve user email from Google.');
    }

    // 9. STRICT .EDU VALIDATION
    if (!validateEduEmail(user.email)) {
      throw new Error(`Access denied: "${user.email}" is not a valid .edu account. Please sign in with your school email.`);
    }

    // 10. HASH TOKEN + EMAIL SECURELY FOR BROWSER STORAGE
    const hashedLoginToken = await hashTokenAndEmail(user.email, tokens.accessToken);

    // Store verified credential on extension for future SSO recognition
    await saveVerifiedCredential({
      email: user.email,
      hashedToken: hashedLoginToken,
      verifiedAt: Date.now(),
    });

    const sessionTokens: AuthTokens = {
      ...tokens,
      accessToken: hashedLoginToken,
    };

    await saveTokens(sessionTokens);
    await saveUserProfile(user);

    return {
      isAuthenticated: true,
      tokens: sessionTokens,
      user,
      error: null,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
    console.error('Google SSO Failed:', errorMessage);
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
 * Resumes login using previously verified .edu credential hash stored on the browser.
 */
export async function loginWithSavedEduHash(): Promise<AuthState> {
  const stored = await getVerifiedCredential();
  if (!stored || !validateEduEmail(stored.email)) {
    return {
      isAuthenticated: false,
      tokens: null,
      user: null,
      error: 'No verified .edu credential found.',
    };
  }

  const username = stored.email.split('@')[0];
  const user: UserProfile = {
    email: stored.email,
    username,
    name: username.charAt(0).toUpperCase() + username.slice(1),
  };

  const tokens: AuthTokens = {
    accessToken: stored.hashedToken,
    expiresIn: 30 * 24 * 3600,
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
  };

  await saveTokens(tokens);
  await saveUserProfile(user);

  return {
    isAuthenticated: true,
    tokens,
    user,
    error: null,
  };
}

/**
 * Checks session state on startup.
 */
export async function getInitialAuthState(): Promise<AuthState> {
  const tokens = await getTokens();
  const user = await getUserProfile();

  if (tokens && tokens.accessToken && user) {
    if (tokens.expiresAt && Date.now() >= tokens.expiresAt) {
      await clearAuthStorage(false);
      return {
        isAuthenticated: false,
        tokens: null,
        user: null,
        error: 'Session expired. Please sign in with Google again.',
      };
    }

    return {
      isAuthenticated: true,
      tokens,
      user,
      error: null,
    };
  }

  // Check if a verified .edu credential exists on this device
  const stored = await getVerifiedCredential();
  if (stored && validateEduEmail(stored.email)) {
    return loginWithSavedEduHash();
  }

  return {
    isAuthenticated: false,
    tokens: null,
    user: null,
    error: null,
  };
}

/**
 * Logs out user and clears session tokens.
 */
export async function logout(resetStoredCredential: boolean = false): Promise<void> {
  await clearAuthStorage(resetStoredCredential);
}

// ----------------------------------------------------------------------------
// OIDC TOKEN & USERINFO HELPERS
// ----------------------------------------------------------------------------

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

  if (payload.exp && nowInSeconds > payload.exp + 60) {
    throw new Error('ID Token has expired');
  }

  const normalizedIssuer = (payload.iss || '').replace(/\/$/, '');
  const expectedIssuer = config.issuer.replace(/\/$/, '');
  if (normalizedIssuer !== expectedIssuer) {
    throw new Error(`ID Token issuer mismatch: expected ${expectedIssuer}, received ${payload.iss}`);
  }

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(config.clientId)) {
    throw new Error(`ID Token audience mismatch: expected ${config.clientId}, received ${payload.aud}`);
  }

  if (payload.nonce && payload.nonce !== expectedNonce) {
    throw new Error('ID Token nonce mismatch: potential replay attack');
  }

  return payload;
}

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
