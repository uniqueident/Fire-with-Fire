import { defaultAuthConfig } from './config';
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateNonce,
  generateRandomString,
  generateState,
  generateVerificationCode,
  hashTokenAndEmail,
  validateEduEmail,
} from './pkce';
import {
  clearAuthStorage,
  clearPendingAuth,
  clearPendingEmailVerification,
  getPendingAuth,
  getPendingEmailVerification,
  getTokens,
  getUserProfile,
  getVerifiedCredential,
  savePendingAuth,
  savePendingEmailVerification,
  saveTokens,
  saveUserProfile,
  saveVerifiedCredential,
} from './storage';
import type { AuthConfig, AuthState, AuthTokens, UserProfile } from './types';

/**
 * authService.ts — Core Passwordless SSO & .edu Verification Service
 *
 * NO BACKEND REQUIRED:
 * - Passwords are fully eliminated.
 * - Enforces strict .edu email domain requirement.
 * - Securely hashes (email + token + salt) using Web Crypto SHA-256.
 * - Stores the user/token hash securely on the browser extension for persistent SSO access.
 */

const PENDING_AUTH_TIMEOUT_MS = 5 * 60 * 1000;         // 5 minutes for SSO popup
const EMAIL_VERIFICATION_TTL_MS = 15 * 60 * 1000;     // 15 minutes for email links

// ----------------------------------------------------------------------------
// 1. SSO LOGIN FLOW (WITH STRICT .EDU VALIDATION & TOKEN HASHING)
// ----------------------------------------------------------------------------

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

    if (typeof chrome === 'undefined' || !chrome.identity?.launchWebAuthFlow) {
      throw new Error(
        'chrome.identity.launchWebAuthFlow is not available. Ensure "identity" is in manifest.json.'
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
      throw new Error(`SSO Error: ${errorDesc}`);
    }

    if (!code) {
      throw new Error('Authorization code missing from redirect callback');
    }

    // 6. Security verification: validate state and TTL
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
      throw new Error('Could not retrieve user email from Identity Provider.');
    }

    // 9. STRICT .EDU VALIDATION
    if (!validateEduEmail(user.email)) {
      throw new Error(`Access restricted: ${user.email} is not a valid .edu email address.`);
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
      accessToken: hashedLoginToken, // Use secure hash as the active extension token
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

// ----------------------------------------------------------------------------
// 2. PASSWORDLESS EMAIL VERIFICATION (.EDU ONLY)
// ----------------------------------------------------------------------------

/**
 * Initiates email verification by checking the .edu domain, generating a secure token,
 * and staging the verification link / code.
 */
export async function requestEduEmailVerification(email: string): Promise<{
  success: boolean;
  message: string;
  verificationCode?: string;
  verificationLink?: string;
}> {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Strictly enforce .edu domain
  if (!validateEduEmail(normalizedEmail)) {
    return {
      success: false,
      message: 'Access denied: Only email addresses ending in .edu are authorized.',
    };
  }

  // 2. Generate random verification token and 6-digit code
  const token = generateRandomString(48);
  const code = generateVerificationCode();
  const now = Date.now();

  // 3. Save pending verification state in browser storage
  await savePendingEmailVerification({
    email: normalizedEmail,
    token,
    code,
    createdAt: now,
    expiresAt: now + EMAIL_VERIFICATION_TTL_MS,
  });

  // Construct verification link (can be dispatched via webhook / email service)
  const redirectBase = defaultAuthConfig.redirectUri || 'https://extension.local/';
  const verificationLink = `${redirectBase}?verify_email=${encodeURIComponent(normalizedEmail)}&verify_token=${token}`;

  // Log in development console for testing without a backend mail server
  console.log(`[Email Verification Sent] Email: ${normalizedEmail}`);
  console.log(`[Verification Code]: ${code}`);
  console.log(`[Verification Link]: ${verificationLink}`);

  return {
    success: true,
    message: `Verification link sent to ${normalizedEmail}. Click the link or enter the 6-digit code.`,
    verificationCode: code, // Provided for MVP immediate testing
    verificationLink,
  };
}

/**
 * Confirms email verification via the 6-digit code or link token.
 * Generates the SHA-256(email + token) hash and stores it for future SSO logins.
 */
export async function confirmEmailVerification(codeOrToken: string): Promise<AuthState> {
  const input = codeOrToken.trim();
  const pending = await getPendingEmailVerification();

  if (!pending) {
    return {
      isAuthenticated: false,
      tokens: null,
      user: null,
      error: 'No pending verification found. Please request a new verification link.',
    };
  }

  if (Date.now() > pending.expiresAt) {
    await clearPendingEmailVerification();
    return {
      isAuthenticated: false,
      tokens: null,
      user: null,
      error: 'Verification code expired. Please request a new one.',
    };
  }

  // Match either the 6-digit code or the full token
  if (input !== pending.code && input !== pending.token) {
    return {
      isAuthenticated: false,
      tokens: null,
      user: null,
      error: 'Invalid verification code. Please check and try again.',
    };
  }

  // 1. Cryptographically hash token and email together
  const hashedToken = await hashTokenAndEmail(pending.email, pending.token);

  // 2. Store user/token hash permanently on the browser extension for future SSO login
  await saveVerifiedCredential({
    email: pending.email,
    hashedToken,
    verifiedAt: Date.now(),
  });

  const tokens: AuthTokens = {
    accessToken: hashedToken,
    expiresIn: 30 * 24 * 3600, // 30-day credential validity
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
  };

  const username = pending.email.split('@')[0];
  const user: UserProfile = {
    email: pending.email,
    username,
    name: username.charAt(0).toUpperCase() + username.slice(1),
  };

  await saveTokens(tokens);
  await saveUserProfile(user);
  await clearPendingEmailVerification();

  return {
    isAuthenticated: true,
    tokens,
    user,
    error: null,
  };
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
      error: 'No verified .edu credential found on this extension.',
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

// ----------------------------------------------------------------------------
// 3. SESSION LIFECYCLE & HELPERS
// ----------------------------------------------------------------------------

export async function getInitialAuthState(): Promise<AuthState> {
  const tokens = await getTokens();
  const user = await getUserProfile();

  if (tokens && tokens.accessToken) {
    if (tokens.expiresAt && Date.now() >= tokens.expiresAt) {
      await clearAuthStorage(false);
      return {
        isAuthenticated: false,
        tokens: null,
        user: null,
        error: 'Session expired. Please verify your email again.',
      };
    }

    return {
      isAuthenticated: true,
      tokens,
      user,
      error: null,
    };
  }

  // Check if a verified .edu credential is ready to resume
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

export async function logout(resetStoredCredential: boolean = false): Promise<void> {
  await clearAuthStorage(resetStoredCredential);
}

// ----------------------------------------------------------------------------
// 4. OIDC TOKEN & USERINFO HELPERS
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
