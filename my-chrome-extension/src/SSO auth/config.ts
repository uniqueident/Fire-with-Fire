import type { AuthConfig } from './types';

/**
 * config.ts — Identity Provider (IdP) Settings
 *
 * Defines the configuration needed to communicate with your OAuth 2.0 / OIDC provider.
 * 
 * SETUP STEPS:
 * 1. Register an application in your IdP console (Google Cloud, Auth0, Okta, etc.).
 * 2. Set application type to "Single-Page Application" (SPA) or "Public Client" (NO client secret).
 * 3. Add your Chrome extension redirect URI to your IdP's "Allowed Redirect URIs".
 *    URI format: https://<your-extension-id>.chromiumapp.org/
 * 4. Populate the fields below with your IdP values.
 */

export const getExtensionRedirectUri = (): string => {
  if (typeof chrome !== 'undefined' && chrome.identity?.getRedirectURL) {
    return chrome.identity.getRedirectURL();
  }
  // Fallback for development in regular browser tab
  return 'https://<your-extension-id>.chromiumapp.org/';
};

export const defaultAuthConfig: AuthConfig = {
  // Client ID registered with the IdP (Public Client)
  clientId: '178450922583-7bt787fl10nng1n7e0e99av73d9afvjp.apps.googleusercontent.com',

  // Expected issuer URL (must match the 'iss' claim in the returned ID token)
  // Google: 'https://accounts.google.com'
  // Auth0:  'https://<your-tenant>.us.auth0.com/'
  // Okta:   'https://<your-dev-domain>.okta.com'
  issuer: 'https://accounts.google.com',

  // IdP Endpoints
  authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  userInfoEndpoint: 'https://www.googleapis.com/oauth2/v3/userinfo',

  // Scopes: openid (identity), email (user email), profile (name and picture)
  scopes: ['openid', 'email', 'profile'],

  // Redirect URI registered with IdP
  redirectUri: getExtensionRedirectUri(),
};
