import React, { useEffect, useState } from 'react';
import { getInitialAuthState, loginWithSSO, logout } from './authService';
import type { AuthState } from './types';

interface SSOLoginProps {
  onAuthChange: (isAuthenticated: boolean) => void;
}

/**
 * SSOLogin.tsx — Production Google SSO UI
 */

export const SSOLogin: React.FC<SSOLoginProps> = ({ onAuthChange }) => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    tokens: null,
    user: null,
    error: null,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [showVerifiedWindow, setShowVerifiedWindow] = useState(false);

  useEffect(() => {
    getInitialAuthState().then((state) => {
      setAuthState(state);
      setShowVerifiedWindow(false);
      onAuthChange(state.isAuthenticated && Boolean(state.user));
      setLoading(false);
    });
  }, [onAuthChange]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    const result = await loginWithSSO();
    setAuthState(result);
    setShowVerifiedWindow(result.isAuthenticated && Boolean(result.user));
    onAuthChange(result.isAuthenticated && Boolean(result.user));
    setLoading(false);
  };

  const handleLogout = async () => {
    setLoading(true);
    await logout(false);
    setShowVerifiedWindow(false);
    onAuthChange(false);
    setAuthState({
      isAuthenticated: false,
      tokens: null,
      user: null,
      error: null,
    });
    setLoading(false);
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
      <>
        {showVerifiedWindow && (
          <div style={containerStyle}>
            <div style={badgeStyle}>GOOGLE ACCOUNT VERIFIED</div>
            <h2 style={{ margin: '8px 0', fontSize: '18px' }}>Welcome, {authState.user.name || 'Student'}!</h2>

            <div style={infoBoxStyle}>
              <p style={{ margin: '4px 0' }}><strong>Email:</strong> {authState.user.email}</p>
              <p style={{ margin: '4px 0' }}><strong>Username:</strong> {authState.user.username}</p>
              <p style={{ fontSize: '11px', color: '#2b6cb0', marginTop: '8px', lineHeight: '1.4' }}>
                ✓ Verified login stored securely on extension. Future logins will recognize this device.
              </p>
              <button style = {hideButtonStyle} onClick={() => setShowVerifiedWindow(false)}>
                Hide menu
              </button>
            </div>
          </div>
        )}
        
        <button onClick={handleLogout} style={logoutButtonStyle}>
          Log Out
        </button>
      </>
    );
  }

  // --------------------------------------------------------------------------
  // LOGGED OUT VIEW (GOOGLE SSO ONLY)
  // --------------------------------------------------------------------------
  return (
    <div style={containerStyle}>
      <header className="auth-header">
        <h2 className="auth-header-title">Student Sign In</h2>
        <p className="auth-header-description">
          Sign in with the Google account for this Chrome profile. Use a different Chrome profile to sign in as another account.
        </p>
      </header>

      {/* Error Message */}
      {authState.error && <div style={errorStyle}>{authState.error}</div>}

      {/* Google Sign In Button */}
      <button
        type="button"
        className="google-sign-in-button"
        onClick={handleGoogleLogin}
      >
        <svg width="18" height="18" viewBox="0 0 48 48" style={{ marginRight: '10px', verticalAlign: 'middle' }}>
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        Sign in with Google
      </button>

    </div>
  );
};

// ----------------------------------------------------------------------------
// STYLES
// ----------------------------------------------------------------------------
const containerStyle: React.CSSProperties = {
  padding: '20px 24px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  width: '100%',
  maxWidth: '340px',
  margin: '0 auto',
  textAlign: 'center',
  boxSizing: 'border-box',
};

const logoutButtonStyle: React.CSSProperties = {
  position: 'fixed',
  top: '6px',
  left: '6px',
  zIndex: 10,
  padding: '4px 10px',
  backgroundColor: '#e53e3e',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 'bold',
};

const hideButtonStyle: React.CSSProperties = {
  color: '#000000',
  backgroundColor: '#f7f7f7',
};

const infoBoxStyle: React.CSSProperties = {
  backgroundColor: '#f7fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  padding: '12px',
  textAlign: 'left',
  fontSize: '13px',
  color: '#0f0f0f',
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

export default SSOLogin;
