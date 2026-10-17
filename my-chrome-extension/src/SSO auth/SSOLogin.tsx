import React, { useEffect, useState } from 'react';
import {
  confirmEmailVerification,
  getInitialAuthState,
  loginWithSSO,
  logout,
  requestEduEmailVerification,
} from './authService';
import type { AuthState } from './types';

/**
 * SSOLogin.tsx — Passwordless .edu SSO & Email Verification Component
 *
 * - Passwords completely removed.
 * - Enforces strictly .edu domain for all logins.
 * - Securely hashes token + email and saves to browser storage.
 */

export const SSOLogin: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    tokens: null,
    user: null,
    error: null,
  });

  const [loading, setLoading] = useState<boolean>(true);

  // Email verification state
  const [eduEmail, setEduEmail] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [verificationSent, setVerificationSent] = useState<boolean>(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [debugLinkToken, setDebugLinkToken] = useState<string | null>(null);

  useEffect(() => {
    getInitialAuthState().then((state) => {
      setAuthState(state);
      setLoading(false);
    });
  }, []);

  // 1. SSO Login Handler
  const handleSSOLogin = async () => {
    setLoading(true);
    setInfoMessage(null);
    const result = await loginWithSSO();
    setAuthState(result);
    setLoading(false);
  };

  // 2. Request Verification Email Handler
  const handleRequestVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setInfoMessage(null);
    setLoading(true);

    const result = await requestEduEmailVerification(eduEmail);
    if (!result.success) {
      setAuthState((prev) => ({ ...prev, error: result.message }));
      setLoading(false);
      return;
    }

    setVerificationSent(true);
    setInfoMessage(result.message);
    if (result.verificationCode) {
      setDebugLinkToken(result.verificationCode);
    }
    setLoading(false);
  };

  // 3. Confirm Verification Code / Link Handler
  const handleConfirmVerification = async (codeToUse?: string) => {
    setLoading(true);
    const code = codeToUse || verificationCode;
    const result = await confirmEmailVerification(code);
    setAuthState(result);
    setLoading(false);
  };

  // 4. Logout Handler
  const handleLogout = async () => {
    setLoading(true);
    await logout(false);
    setAuthState({
      isAuthenticated: false,
      tokens: null,
      user: null,
      error: null,
    });
    setVerificationSent(false);
    setInfoMessage(null);
    setLoading(false);
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <p style={{ textAlign: 'center', color: '#4a5568' }}>Checking authentication state...</p>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // LOGGED IN VIEW
  // --------------------------------------------------------------------------
  if (authState.isAuthenticated) {
    return (
      <div style={containerStyle}>
        <div style={badgeStyle}>.EDU VERIFIED</div>
        <h2 style={{ margin: '8px 0', fontSize: '18px' }}>Welcome, {authState.user?.name || 'Student'}!</h2>

        <div style={infoBoxStyle}>
          <p><strong>Email:</strong> {authState.user?.email}</p>
          <p><strong>Username:</strong> {authState.user?.username}</p>
          <p style={{ fontSize: '11px', color: '#2b6cb0', marginTop: '6px' }}>
            ✓ Verified token/email hash stored securely on extension. Future SSO logins will automatically recognize this device.
          </p>
        </div>

        <button onClick={handleLogout} style={logoutButtonStyle}>
          Log Out
        </button>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // LOGGED OUT VIEW (PASSWORDLESS)
  // --------------------------------------------------------------------------
  return (
    <div style={containerStyle}>
      <h2 style={{ marginBottom: '4px', fontSize: '18px' }}>Student Sign In</h2>
      <p style={{ fontSize: '12px', color: '#718096', marginBottom: '14px' }}>
        Access restricted strictly to <strong>.edu</strong> accounts.
      </p>

      {/* Error Message */}
      {authState.error && <div style={errorStyle}>{authState.error}</div>}

      {/* Success / Info Message */}
      {infoMessage && <div style={infoAlertStyle}>{infoMessage}</div>}

      {/* 1. SSO LOGIN BUTTON */}
      <button onClick={handleSSOLogin} style={ssoButtonStyle}>
        Sign In with SSO (.edu)
      </button>

      <div style={dividerStyle}>
        <span>OR VERIFY BY EMAIL</span>
      </div>

      {/* 2. PASSWORDLESS EMAIL VERIFICATION */}
      {!verificationSent ? (
        <form onSubmit={handleRequestVerification} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <input
            type="email"
            placeholder="yourname@university.edu"
            value={eduEmail}
            onChange={(e) => setEduEmail(e.target.value)}
            style={inputStyle}
            required
          />
          <button type="submit" style={submitButtonStyle}>
            Send Verification Link
          </button>
        </form>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <input
            type="text"
            placeholder="Enter 6-digit code from email"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
            style={inputStyle}
          />
          <button onClick={() => handleConfirmVerification()} style={submitButtonStyle}>
            Verify Code & Save Login
          </button>

          {/* Quick link to simulate clicking verification link in email */}
          {debugLinkToken && (
            <button
              onClick={() => handleConfirmVerification(debugLinkToken)}
              style={simulateLinkButtonStyle}
            >
              Simulate Clicking Verification Link ({debugLinkToken})
            </button>
          )}

          <button
            onClick={() => setVerificationSent(false)}
            style={{ ...submitButtonStyle, backgroundColor: '#e2e8f0', color: '#4a5568' }}
          >
            ← Back to change email
          </button>
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------------------------------
// STYLES
// ----------------------------------------------------------------------------
const containerStyle: React.CSSProperties = {
  padding: '16px',
  fontFamily: 'sans-serif',
  width: '300px',
  boxSizing: 'border-box',
};

const ssoButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  backgroundColor: '#4285F4',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  fontSize: '13px',
  fontWeight: 'bold',
  cursor: 'pointer',
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
};

const infoBoxStyle: React.CSSProperties = {
  backgroundColor: '#f7fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  padding: '10px',
  textAlign: 'left',
  fontSize: '13px',
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#c6f6d5',
  color: '#22543d',
  fontSize: '11px',
  padding: '2px 8px',
  borderRadius: '12px',
  fontWeight: 'bold',
};

const errorStyle: React.CSSProperties = {
  backgroundColor: '#fed7d7',
  color: '#9b2c2c',
  padding: '8px',
  borderRadius: '4px',
  marginBottom: '10px',
  fontSize: '12px',
};

const infoAlertStyle: React.CSSProperties = {
  backgroundColor: '#bee3f8',
  color: '#2b6cb0',
  padding: '8px',
  borderRadius: '4px',
  marginBottom: '10px',
  fontSize: '12px',
};

const dividerStyle: React.CSSProperties = {
  margin: '16px 0 12px 0',
  textAlign: 'center',
  fontSize: '11px',
  color: '#a0aec0',
  borderBottom: '1px solid #e2e8f0',
  lineHeight: '0.1em',
};

const inputStyle: React.CSSProperties = {
  padding: '8px',
  border: '1px solid #cbd5e0',
  borderRadius: '4px',
  fontSize: '13px',
};

const submitButtonStyle: React.CSSProperties = {
  padding: '9px',
  backgroundColor: '#2b6cb0',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  fontSize: '13px',
  fontWeight: 'bold',
  cursor: 'pointer',
};

const simulateLinkButtonStyle: React.CSSProperties = {
  padding: '7px',
  backgroundColor: '#38a169',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 'bold',
  cursor: 'pointer',
};

export default SSOLogin;
