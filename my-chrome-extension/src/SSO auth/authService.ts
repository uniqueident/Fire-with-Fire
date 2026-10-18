import { defaultAuthConfig, getChromeOAuthClientId } from './config';
import {
  hashTokenAndEmail,
  validateEmailAddress,
} from './pkce';
import {
  clearAuthStorage,
  getTokens,
  getUserProfile,
  getVerifiedCredential,
  saveTokens,
  saveUserProfile,
  saveVerifiedCredential,
} from './storage';
import type { AuthConfig, AuthState, AuthTokens, UserProfile } from './types';

/**
 * authService.ts — Google SSO & account verification service
 *
 * Flow:
 * 1. User launches Google SSO.
 * 2. User signs in with their Google account.
 * 3. Extension verifies the account has a valid email address.
 * 4. Extension computes SHA-256(email + token) and stores it locally for fast persistent SSO.
 */

/**
 * Initiates the interactive Google SSO login flow.
 */
export async function loginWithSSO(config: AuthConfig = defaultAuthConfig): Promise<AuthState> {
  try {
    const clientId = getChromeOAuthClientId();
    if (!clientId) {
      throw new Error(
        'Setup required: Create a Google OAuth client of type Chrome Extension for this extension ID, then put its client ID in manifest.json under oauth2.client_id.'
      );
    }

    if (typeof chrome === 'undefined' || !chrome.identity?.getAuthToken) {
      throw new Error(
        'Chrome Identity API is unavailable. Open the installed extension popup, not the localhost development page.'
      );
    }

    const tokenResult = await chrome.identity.getAuthToken({ interactive: true });
    if (!tokenResult.token) {
      throw new Error('Google sign-in did not return an access token.');
    }

    const accessToken = tokenResult.token;
    const user = await fetchUserProfile(accessToken, config);
    if (!validateEmailAddress(user.email)) {
      throw new Error(`Access denied: "${user.email}" is not a valid email address.`);
    }

    const hashedLoginToken = await hashTokenAndEmail(user.email, accessToken);

    await saveVerifiedCredential({
      email: user.email,
      hashedToken: hashedLoginToken,
      verifiedAt: Date.now(),
    });

    const sessionTokens: AuthTokens = {
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
    return {
      isAuthenticated: false,
      tokens: null,
      user: null,
      error: errorMessage,
    };
  }
}

/**
 * Resumes login using a previously verified account credential stored on the browser.
 */
export async function loginWithSavedCredential(): Promise<AuthState> {
  const stored = await getVerifiedCredential();
  if (!stored || !validateEmailAddress(stored.email)) {
    return {
      isAuthenticated: false,
      tokens: null,
      user: null,
      error: 'No verified account credential found.',
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

  // Check if a verified account credential exists on this device.
  const stored = await getVerifiedCredential();
  if (stored && validateEmailAddress(stored.email)) {
    return loginWithSavedCredential();
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
// GOOGLE USERINFO HELPER
// ----------------------------------------------------------------------------

async function fetchUserProfile(
  accessToken: string,
  config: AuthConfig
): Promise<UserProfile> {
  const response = await fetch(config.userInfoEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Google account info (${response.status}): ${errorText}`);
  }

  const data: {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
  } = await response.json();

  if (!data.email) {
    throw new Error('Google did not return an email address. Confirm the email scope is configured in manifest.json.');
  }

  return {
    id: data.sub,
    email: data.email,
    name: data.name,
    username: data.name || data.email.split('@')[0],
    picture: data.picture,
  };
}
