import React, { useEffect, useState } from 'react';
import { getInitialAuthState, loginWithSSO, logout } from './authService';
import { defaultAuthConfig, getExtensionRedirectUri } from './config';
import type { AuthState } from './types';

/**
 * SSOLogin.tsx — Production Google SSO & .edu Verification UI
 */

export const SSOLogin: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    tokens: null,
    user: null,
    error: null,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [copiedRedirect, setCopiedRedirect] = useState<boolean>(false);
  const [showSetupGuide, setShowSetupGuide] = useState<boolean>(false);

  const redirectUri = getExtensionRedirectUri();
  const isConfigured = !defaultAuthConfig.clientId.includes('YOUR_CLIENT_ID');

  useEffect(() => {
    getInitialAuthState().then((state) => {
      setAuthState(state);
      setLoading(false);
    });
  }, []);

  const handleGoogleLogin = async () => {
    setLoading(true);
    const result = await loginWithSSO();
    setAuthState(result);
    setLoading(false);
  };

  const handleLogout = async () => {
    setLoading(true);
    await logout(false);
    setAuthState({
      isAuthenticated: false,
      tokens: null,
      user: null,
      error: null,
    });
    setLoading(false);
  };

  const handleCopyRedirectUri = () => {
    navigator.clipboard.writeText(redirectUri);
    setCopiedRedirect(true);
    setTimeout(() => setCopiedRedirect(false), 2000);
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <p style={{ textAlign: 'center', color: '#4a5568', fontSize: '13px' }}>Checking session...</p>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // LOGGED IN VIEW (.EDU VERIFIED)
  // --------------------------------------------------------------------------
  if (authState.isAuthenticated && authState.user) {
    return (
      <div style={containerStyle}>
        <div style={badgeStyle}>.EDU VERIFIED</div>
        <h2 style={{ margin: '8px 0', fontSize: '18px' }}>Welcome, {authState.user.name || 'Student'}!</h2>

        <div style={infoBoxStyle}>
          <p style={{ margin: '4px 0' }}><strong>Email:</strong> {authState.user.email}</p>
          <p style={{ margin: '4px 0' }}><strong>Username:</strong> {authState.user.username}</p>
          <p style={{ fontSize: '11px', color: '#2b6cb0', marginTop: '8px', lineHeight: '1.4' }}>
            ✓ Verified token/email hash stored securely on extension. Future logins will recognize this device.
          </p>
        </div>

        <button onClick={handleLogout} style={logoutButtonStyle}>
          Log Out
        </button>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // LOGGED OUT VIEW (GOOGLE SSO ONLY)
  // --------------------------------------------------------------------------
  return (
    <div style={containerStyle}>
      <h2 style={{ marginBottom: '4px', fontSize: '18px' }}>Student Sign In</h2>
      <p style={{ fontSize: '12px', color: '#718096', marginBottom: '16px' }}>
        Access restricted strictly to verified <strong>.edu</strong> Google accounts.
      </p>

      {/* Error Message */}
      {authState.error && <div style={errorStyle}>{authState.error}</div>}

      {/* Google Sign In Button */}
      <button onClick={handleGoogleLogin} style={googleButtonStyle}>
        <svg width="18" height="18" viewBox="0 0 48 48" style={{ marginRight: '10px', verticalAlign: 'middle' }}>
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        Sign in with Google (.edu)
      </button>

      {/* Setup Guide for Google Cloud Console */}
      <div style={{ marginTop: '16px', textAlign: 'center' }}>
        <button
          onClick={() => setShowSetupGuide(!showSetupGuide)}
          style={{ background: 'none', border: 'none', color: '#4285F4', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
        >
          {showSetupGuide ? '▲ Hide Setup Instructions' : (isConfigured ? '⚙️ View Redirect URI' : '⚠️ Google Cloud Setup Required')}
        </button>

        {showSetupGuide && (
          <div style={setupBoxStyle}>
            {redirectUri ? (
              <>
                <p style={{ margin: '0 0 6px 0', fontWeight: 'bold', fontSize: '11px' }}>Your Extension Redirect URI:</p>
                <input
                  type="text"
                  readOnly
                  value={redirectUri}
                  style={inputStyle}
                  onClick={handleCopyRedirectUri}
                />
                <button onClick={handleCopyRedirectUri} style={copyButtonStyle}>
                  {copiedRedirect ? '✓ Copied!' : 'Copy Redirect URI'}
                </button>
                <ol style={{ fontSize: '10px', color: '#4a5568', paddingLeft: '16px', marginTop: '8px', lineHeight: '1.4' }}>
                  <li>Paste this exact URI in <strong>Google Cloud Console → Credentials → Authorized redirect URIs</strong>.</li>
                  <li>Confirm the Client ID above belongs to that same OAuth client.</li>
                </ol>
              </>
            ) : (
              <p style={{ fontSize: '11px', lineHeight: '1.4' }}>
                Open this popup from the installed Chrome extension to get its redirect URI. A localhost URL is not valid for extension sign-in.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// STYLES
// ----------------------------------------------------------------------------
const containerStyle: React.CSSProperties = {
  padding: '16px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  width: '300px',
  boxSizing: 'border-box',
};

const googleButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px',
  backgroundColor: '#ffffff',
  color: '#3c4043',
  border: '1px solid #dadce0',
  borderRadius: '4px',
  fontSize: '13px',
  fontWeight: 'bold',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 1px 2px rgba(60,64,67,0.15)',
};

const logoutButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px',
  backgroundColor: '#e53e3e',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  marginTop: '12px',
  fontWeight: 'bold',
};

const infoBoxStyle: React.CSSProperties = {
  backgroundColor: '#f7fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  padding: '12px',
  textAlign: 'left',
  fontSize: '13px',
};

const setupBoxStyle: React.CSSProperties = {
  backgroundColor: '#f7fafc',
  border: '1px dashed #cbd5e0',
  borderRadius: '6px',
  padding: '10px',
  marginTop: '10px',
  textAlign: 'left',
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#c6f6d5',
  color: '#22543d',
  fontSize: '11px',
  padding: '2px 8px',
  borderRadius: '12px',
  fontWeight: 'bold',
  letterSpacing: '0.5px',
};

const errorStyle: React.CSSProperties = {
  backgroundColor: '#fed7d7',
  color: '#9b2c2c',
  padding: '8px 10px',
  borderRadius: '4px',
  marginBottom: '12px',
  fontSize: '12px',
  lineHeight: '1.4',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px',
  border: '1px solid #cbd5e0',
  borderRadius: '4px',
  fontSize: '10px',
  backgroundColor: '#edf2f7',
  boxSizing: 'border-box',
  cursor: 'pointer',
};

const copyButtonStyle: React.CSSProperties = {
  marginTop: '6px',
  fontSize: '11px',
  padding: '4px 8px',
  cursor: 'pointer',
  backgroundColor: '#edf2f7',
  border: '1px solid #cbd5e0',
  borderRadius: '4px',
  fontWeight: 'bold',
};

export default SSOLogin;
