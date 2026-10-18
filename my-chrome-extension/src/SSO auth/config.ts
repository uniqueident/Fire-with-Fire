import type { AuthConfig } from './types';

export const CHROME_OAUTH_CLIENT_ID_PLACEHOLDER =
  'YOUR_CHROME_EXTENSION_CLIENT_ID.apps.googleusercontent.com';

export function getChromeExtensionId(): string {
  return typeof chrome !== 'undefined' ? chrome.runtime.id : '';
}

export function getChromeOAuthClientId(): string {
  if (typeof chrome === 'undefined') {
    return '';
  }
  return chrome.runtime.getManifest().oauth2?.client_id || '';
}

export const defaultAuthConfig: AuthConfig = {
  userInfoEndpoint: 'https://www.googleapis.com/oauth2/v3/userinfo',
};
