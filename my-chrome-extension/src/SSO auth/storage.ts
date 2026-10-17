import type {
  AuthTokens,
  PendingAuthState,
  PendingEmailVerification,
  StoredUserCredential,
  UserProfile,
} from './types';

/**
 * storage.ts — Secure Browser Storage Manager
 *
 * Stores active session tokens, user credentials, and hashed tokens on the browser extension.
 * - Active session tokens: stored in chrome.storage.session (memory-only, wiped on browser exit).
 * - Verified .edu hashed credentials: stored in chrome.storage.local (persists across sessions).
 */

const STORAGE_KEYS = {
  TOKENS: 'sso_auth_tokens',
  USER: 'sso_auth_user',
  PENDING_AUTH: 'sso_pending_auth',
  PENDING_EMAIL_VERIFICATION: 'sso_pending_email_verification',
  STORED_CREDENTIAL: 'sso_stored_user_credential',
};

const hasChromeStorage = (): boolean => {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage);
};

const getSessionStorage = () => {
  if (hasChromeStorage()) {
    return chrome.storage.session || chrome.storage.local;
  }
  return null;
};

const getLocalStorage = () => {
  if (hasChromeStorage()) {
    return chrome.storage.local;
  }
  return null;
};

/**
 * Saves access tokens to session storage.
 */
export async function saveTokens(tokens: AuthTokens): Promise<void> {
  const storage = getSessionStorage();
  if (storage) {
    await storage.set({ [STORAGE_KEYS.TOKENS]: tokens });
  } else {
    localStorage.setItem(STORAGE_KEYS.TOKENS, JSON.stringify(tokens));
  }
}

/**
 * Retrieves stored access tokens.
 */
export async function getTokens(): Promise<AuthTokens | null> {
  const storage = getSessionStorage();
  if (storage) {
    const result = await storage.get(STORAGE_KEYS.TOKENS);
    return (result[STORAGE_KEYS.TOKENS] as AuthTokens) || null;
  }
  const item = localStorage.getItem(STORAGE_KEYS.TOKENS);
  return item ? (JSON.parse(item) as AuthTokens) : null;
}

/**
 * Saves user profile to session storage.
 */
export async function saveUserProfile(user: UserProfile): Promise<void> {
  const storage = getSessionStorage();
  if (storage) {
    await storage.set({ [STORAGE_KEYS.USER]: user });
  } else {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  }
}

/**
 * Retrieves user profile from session storage.
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  const storage = getSessionStorage();
  if (storage) {
    const result = await storage.get(STORAGE_KEYS.USER);
    return (result[STORAGE_KEYS.USER] as UserProfile) || null;
  }
  const item = localStorage.getItem(STORAGE_KEYS.USER);
  return item ? (JSON.parse(item) as UserProfile) : null;
}

/**
 * Saves verified .edu user hash to persistent local storage for future SSO / logins.
 */
export async function saveVerifiedCredential(credential: StoredUserCredential): Promise<void> {
  const storage = getLocalStorage();
  if (storage) {
    await storage.set({ [STORAGE_KEYS.STORED_CREDENTIAL]: credential });
  } else {
    localStorage.setItem(STORAGE_KEYS.STORED_CREDENTIAL, JSON.stringify(credential));
  }
}

/**
 * Retrieves the stored verified .edu user hash.
 */
export async function getVerifiedCredential(): Promise<StoredUserCredential | null> {
  const storage = getLocalStorage();
  if (storage) {
    const result = await storage.get(STORAGE_KEYS.STORED_CREDENTIAL);
    return (result[STORAGE_KEYS.STORED_CREDENTIAL] as StoredUserCredential) || null;
  }
  const item = localStorage.getItem(STORAGE_KEYS.STORED_CREDENTIAL);
  return item ? (JSON.parse(item) as StoredUserCredential) : null;
}

/**
 * Saves pending email verification state (token + code).
 */
export async function savePendingEmailVerification(pending: PendingEmailVerification): Promise<void> {
  const storage = getSessionStorage();
  if (storage) {
    await storage.set({ [STORAGE_KEYS.PENDING_EMAIL_VERIFICATION]: pending });
  } else {
    sessionStorage.setItem(STORAGE_KEYS.PENDING_EMAIL_VERIFICATION, JSON.stringify(pending));
  }
}

/**
 * Retrieves pending email verification state.
 */
export async function getPendingEmailVerification(): Promise<PendingEmailVerification | null> {
  const storage = getSessionStorage();
  if (storage) {
    const result = await storage.get(STORAGE_KEYS.PENDING_EMAIL_VERIFICATION);
    return (result[STORAGE_KEYS.PENDING_EMAIL_VERIFICATION] as PendingEmailVerification) || null;
  }
  const item = sessionStorage.getItem(STORAGE_KEYS.PENDING_EMAIL_VERIFICATION);
  return item ? (JSON.parse(item) as PendingEmailVerification) : null;
}

/**
 * Clears pending email verification state.
 */
export async function clearPendingEmailVerification(): Promise<void> {
  const storage = getSessionStorage();
  if (storage) {
    await storage.remove(STORAGE_KEYS.PENDING_EMAIL_VERIFICATION);
  } else {
    sessionStorage.removeItem(STORAGE_KEYS.PENDING_EMAIL_VERIFICATION);
  }
}

/**
 * Saves pending PKCE authorization state.
 */
export async function savePendingAuth(pending: PendingAuthState): Promise<void> {
  const storage = getSessionStorage();
  if (storage) {
    await storage.set({ [STORAGE_KEYS.PENDING_AUTH]: pending });
  } else {
    sessionStorage.setItem(STORAGE_KEYS.PENDING_AUTH, JSON.stringify(pending));
  }
}

/**
 * Retrieves pending PKCE authorization state.
 */
export async function getPendingAuth(): Promise<PendingAuthState | null> {
  const storage = getSessionStorage();
  if (storage) {
    const result = await storage.get(STORAGE_KEYS.PENDING_AUTH);
    return (result[STORAGE_KEYS.PENDING_AUTH] as PendingAuthState) || null;
  }
  const item = sessionStorage.getItem(STORAGE_KEYS.PENDING_AUTH);
  return item ? (JSON.parse(item) as PendingAuthState) : null;
}

/**
 * Clears pending PKCE authorization state.
 */
export async function clearPendingAuth(): Promise<void> {
  const storage = getSessionStorage();
  if (storage) {
    await storage.remove(STORAGE_KEYS.PENDING_AUTH);
  } else {
    sessionStorage.removeItem(STORAGE_KEYS.PENDING_AUTH);
  }
}

/**
 * Clears active session tokens and user profile on logout.
 * Keeps verified .edu credential hash unless explicitly reset.
 */
export async function clearAuthStorage(resetStoredCredential: boolean = false): Promise<void> {
  const sessionStore = getSessionStorage();
  if (sessionStore) {
    await sessionStore.remove([
      STORAGE_KEYS.TOKENS,
      STORAGE_KEYS.USER,
      STORAGE_KEYS.PENDING_AUTH,
      STORAGE_KEYS.PENDING_EMAIL_VERIFICATION,
    ]);
  } else {
    localStorage.removeItem(STORAGE_KEYS.TOKENS);
    localStorage.removeItem(STORAGE_KEYS.USER);
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(STORAGE_KEYS.PENDING_AUTH);
      window.sessionStorage.removeItem(STORAGE_KEYS.PENDING_EMAIL_VERIFICATION);
    }
  }

  if (resetStoredCredential) {
    const localStorageArea = getLocalStorage();
    if (localStorageArea) {
      await localStorageArea.remove(STORAGE_KEYS.STORED_CREDENTIAL);
    } else {
      localStorage.removeItem(STORAGE_KEYS.STORED_CREDENTIAL);
    }
  }
}

/**
 * Locks down session storage so content scripts cannot inspect tokens.
 */
export async function lockDownSessionStorage() {
  if (chrome?.storage?.session?.setAccessLevel) {
    await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  }
}
