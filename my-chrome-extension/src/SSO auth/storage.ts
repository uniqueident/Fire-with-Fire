import type { AuthTokens, PendingAuthState, UserProfile } from './types';

/**
 * storage.ts — Saving and Reading Auth Data in the Browser
 *
 * This file handles storing and retrieving tokens and user profile data
 * inside the Chrome extension's built-in storage.
 *
 * WHY NOT JUST USE localStorage?
 * localStorage is visible to any web page script, which is a security risk
 * for tokens. Chrome extensions have their own isolated storage areas that
 * are much safer — content scripts and web pages can't read them.
 *
 * STORAGE AREAS USED:
 * - chrome.storage.session: In-memory. Fastest and most secure. Wiped when browser closes.
 *   Used for: access tokens, user profile, pending login state.
 * - Falls back to localStorage/sessionStorage if running outside the extension
 *   (e.g., local Vite dev server in a regular browser tab).
 *
 * You don't need to change anything here for the MVP.
 * See the TODO at the bottom if you want tokens to survive browser restarts.
 */

// ---- STORAGE KEY NAMES ----------------------------------------------------
// These are the named "slots" where each piece of data gets stored.
// Think of them like variable names in the browser's storage dictionary.
const STORAGE_KEYS = {
  TOKENS: 'sso_auth_tokens',       // Stores the access token (and optionally id/refresh tokens)
  USER: 'sso_auth_user',           // Stores the logged-in user's name and email
  PENDING_AUTH: 'sso_pending_auth', // Stores temporary PKCE state while login popup is open
};

// ---- ENVIRONMENT DETECTION ------------------------------------------------
// Checks if we're running inside a real Chrome extension (vs. a plain browser tab).
// This determines whether to use chrome.storage or fall back to localStorage.
const hasChromeStorage = (): boolean => {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage);
};

// Returns the right storage area to use (chrome.storage.session if available).
const getStorageArea = () => {
  if (hasChromeStorage()) {
    // session storage is in-memory only — safest option for short-lived tokens.
    // Falls back to local storage if session isn't available.
    return chrome.storage.session || chrome.storage.local;
  }
  return null; // Means we're in a plain browser — use localStorage instead
};

// ---- SAVE TOKENS ----------------------------------------------------------
// Called after a successful login to store the access token in the browser.
// The token is what gets sent with API requests to prove the user is logged in.
export async function saveTokens(tokens: AuthTokens): Promise<void> {
  const storage = getStorageArea();
  if (storage) {
    await storage.set({ [STORAGE_KEYS.TOKENS]: tokens });
  } else {
    // Fallback for local browser dev testing (not a Chrome extension context)
    localStorage.setItem(STORAGE_KEYS.TOKENS, JSON.stringify(tokens));
  }
}

// ---- GET TOKENS -----------------------------------------------------------
// Called when the extension opens or makes an API request to check if the
// user is logged in and retrieve their stored access token.
export async function getTokens(): Promise<AuthTokens | null> {
  const storage = getStorageArea();
  if (storage) {
    const result = await storage.get(STORAGE_KEYS.TOKENS);
    return (result[STORAGE_KEYS.TOKENS] as AuthTokens) || null;
  }
  const item = localStorage.getItem(STORAGE_KEYS.TOKENS);
  return item ? (JSON.parse(item) as AuthTokens) : null;
}

// ---- SAVE USER PROFILE ----------------------------------------------------
// Called after login to store the user's name and email so the popup can
// display "Welcome, Nate!" without making another network request every time.
export async function saveUserProfile(user: UserProfile): Promise<void> {
  const storage = getStorageArea();
  if (storage) {
    await storage.set({ [STORAGE_KEYS.USER]: user });
  } else {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  }
}

// ---- GET USER PROFILE -----------------------------------------------------
// Called when the popup opens to display the user's name and email.
export async function getUserProfile(): Promise<UserProfile | null> {
  const storage = getStorageArea();
  if (storage) {
    const result = await storage.get(STORAGE_KEYS.USER);
    return (result[STORAGE_KEYS.USER] as UserProfile) || null;
  }
  const item = localStorage.getItem(STORAGE_KEYS.USER);
  return item ? (JSON.parse(item) as UserProfile) : null;
}

// ---- SAVE PENDING AUTH STATE ----------------------------------------------
// Called right before the login popup opens.
// Stores the PKCE code_verifier and anti-CSRF state so we can retrieve them
// after the user logs in and the IdP redirects back to the extension.
// We save it to storage (not just memory) because the service worker might
// shut down while the user is on the login page.
export async function savePendingAuth(pending: PendingAuthState): Promise<void> {
  const storage = getStorageArea();
  if (storage) {
    await storage.set({ [STORAGE_KEYS.PENDING_AUTH]: pending });
  } else {
    sessionStorage.setItem(STORAGE_KEYS.PENDING_AUTH, JSON.stringify(pending));
  }
}

// ---- GET PENDING AUTH STATE -----------------------------------------------
// Called after the login popup closes to retrieve the state and verifier
// we saved before opening the popup. Used to verify the response and
// complete the token exchange.
export async function getPendingAuth(): Promise<PendingAuthState | null> {
  const storage = getStorageArea();
  if (storage) {
    const result = await storage.get(STORAGE_KEYS.PENDING_AUTH);
    return (result[STORAGE_KEYS.PENDING_AUTH] as PendingAuthState) || null;
  }
  const item = sessionStorage.getItem(STORAGE_KEYS.PENDING_AUTH);
  return item ? (JSON.parse(item) as PendingAuthState) : null;
}

// ---- CLEAR PENDING AUTH STATE ---------------------------------------------
// Called immediately after the state is verified (successfully or not).
// The pending state is one-time use — we delete it so it can't be replayed.
export async function clearPendingAuth(): Promise<void> {
  const storage = getStorageArea();
  if (storage) {
    await storage.remove(STORAGE_KEYS.PENDING_AUTH);
  } else {
    sessionStorage.removeItem(STORAGE_KEYS.PENDING_AUTH);
  }
}

// ---- CLEAR ALL AUTH DATA (LOGOUT) -----------------------------------------
// Called on logout. Removes all stored tokens and user info from the browser,
// effectively ending the session.
export async function clearAuthStorage(): Promise<void> {
  const storage = getStorageArea();
  if (storage) {
    await storage.remove([
      STORAGE_KEYS.TOKENS,
      STORAGE_KEYS.USER,
      STORAGE_KEYS.PENDING_AUTH,
    ]);
  } else {
    localStorage.removeItem(STORAGE_KEYS.TOKENS);
    localStorage.removeItem(STORAGE_KEYS.USER);
    sessionStorage.removeItem(STORAGE_KEYS.PENDING_AUTH);
  }
}

// ---- TODO: THINGS TO ADD MANUALLY LATER -----------------------------------
// 1. LOCK DOWN SESSION STORAGE (security hardening):
//    Prevent content scripts from reading tokens by restricting access:
//    if (chrome.storage?.session?.setAccessLevel) {
//      chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
//    }
//
// 2. STAY LOGGED IN ACROSS BROWSER RESTARTS (refresh tokens):
//    If you add 'offline_access' to your scopes (in config.ts), the IdP gives
//    you a refresh token. Store it in chrome.storage.local instead of session:
//    await chrome.storage.local.set({ refresh_token: tokens.refreshToken });
//    Then on startup, check for a refresh token and silently get a new access token.
