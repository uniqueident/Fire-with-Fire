import React, { useEffect, useState } from 'react';
import { getInitialAuthState, loginWithSSO, logout } from './authService';
import type { AuthState } from './types';

/**
 * SSOLogin.tsx — The Login UI Component
 *
 * This is the React component that the user actually sees when they open the extension.
 * It has two states:
 *   - LOGGED OUT: Shows a "Sign In with SSO" button and an optional manual email/password form.
 *   - LOGGED IN:  Shows the user's name and email, and a "Log Out" button.
 *
 * This component doesn't do any auth logic itself — it just calls functions
 * from authService.ts and displays the result.
 *
 * HOW TO CUSTOMIZE THIS:
 * - Change the text, colors, and layout to match your app's design.
 * - Remove the manual email/password form if you only want SSO.
 * - Add your own error handling or loading spinners.
 */

export const SSOLogin: React.FC = () => {

  // ---- COMPONENT STATE ----------------------------------------------------
  // authState tracks whether the user is logged in and holds their info.
  // It starts as "not authenticated" and gets updated after checking storage or logging in.
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    tokens: null,
    user: null,
    error: null,
  });

  // loading is true while we're waiting for an async operation to finish.
  // We show a "Loading..." message instead of the login/logout views during this time.
  const [loading, setLoading] = useState<boolean>(true);

  // These hold the values typed into the manual email/password form.
  // Only used if you implement loginWithCredentials() in authService.ts.
  const [manualEmail, setManualEmail] = useState<string>('');
  const [manualPassword, setManualPassword] = useState<string>('');

  // ---- ON POPUP OPEN -------------------------------------------------------
  // useEffect with an empty [] runs once when the component first renders.
  // We use it to check if the user is already logged in (has a stored token).
  // This way, if they were logged in before, they don't have to log in again.
  useEffect(() => {
    getInitialAuthState().then((state) => {
      setAuthState(state);
      setLoading(false); // Done checking — show the real UI
    });
  }, []);

  // ---- SSO LOGIN HANDLER ---------------------------------------------------
  // Called when the user clicks "Sign In with SSO".
  // Triggers the full login flow (opens popup, exchanges code, fetches profile).
  // Updates the UI when it's done.
  const handleSSOLogin = async () => {
    setLoading(true);
    const result = await loginWithSSO();
    setAuthState(result);
    setLoading(false);
  };

  // ---- LOGOUT HANDLER ------------------------------------------------------
  // Called when the user clicks "Log Out".
  // Clears the session and resets the UI back to the logged-out view.
  const handleLogout = async () => {
    setLoading(true);
    await logout();
    setAuthState({
      isAuthenticated: false,
      tokens: null,
      user: null,
      error: null,
    });
    setLoading(false);
  };

  // ---- MANUAL LOGIN HANDLER ------------------------------------------------
  // Called when the user submits the email/password form.
  // TODO: Replace the alert() with a real call to your backend login API.
  //       See the commented-out loginWithCredentials() in authService.ts.
  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault(); // Prevents the form from reloading the page
    // TODO: Wire this up to your API:
    // const result = await loginWithCredentials(manualEmail, manualPassword);
    // setAuthState(result);
    alert(`Manual login triggered for: ${manualEmail}. Implement your backend API endpoint here.`);
  };

  // ---- LOADING VIEW --------------------------------------------------------
  // Shown briefly while we check if the user is already logged in on popup open.
  if (loading) {
    return (
      <div style={containerStyle}>
        <p>Loading authentication state...</p>
      </div>
    );
  }

  // ---- LOGGED IN VIEW ------------------------------------------------------
  // Shown when authState.isAuthenticated is true.
  // Displays the user's username and email from the profile fetched after login.
  if (authState.isAuthenticated) {
    return (
      <div style={containerStyle}>
        {/* Green "Logged In" badge */}
        <div style={badgeStyle}>Logged In</div>

        {/* Welcome message using the username from the IdP (or 'User' as fallback) */}
        <h2 style={{ margin: '8px 0' }}>Welcome, {authState.user?.username || 'User'}!</h2>

        {/* Info box showing the user's stored profile data */}
        <div style={infoBoxStyle}>
          <p><strong>Username:</strong> {authState.user?.username || 'N/A'}</p>
          <p><strong>Email:</strong> {authState.user?.email || 'N/A'}</p>
          <p style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>
            Token stored securely in browser storage.
          </p>
          {/* TODO: Add more profile fields here (e.g., profile picture, user ID) */}
        </div>

        {/* Log out button — calls handleLogout which clears everything */}
        <button onClick={handleLogout} style={logoutButtonStyle}>
          Log Out
        </button>
      </div>
    );
  }

  // ---- LOGGED OUT VIEW -----------------------------------------------------
  // Shown when the user is not logged in.
  // Has an SSO button and an optional manual login form below it.
  return (
    <div style={containerStyle}>
      <h2 style={{ marginBottom: '12px' }}>SSO Authentication</h2>

      {/* Error message — shown if the last login attempt failed */}
      {authState.error && (
        <div style={errorStyle}>
          {authState.error}
        </div>
      )}

      {/* SSO LOGIN BUTTON — the main action; opens the IdP login popup */}
      <button onClick={handleSSOLogin} style={ssoButtonStyle}>
        Sign In with SSO
      </button>

      {/* Visual divider between SSO and manual login */}
      <div style={dividerStyle}>
        <span>OR MANUAL LOGIN</span>
      </div>

      {/* MANUAL EMAIL/PASSWORD FORM ---------------------------------------- */}
      {/* This is optional — remove this block if you only want SSO.          */}
      {/* To make it work, implement loginWithCredentials() in authService.ts  */}
      {/* and replace the alert() in handleManualLogin above.                  */}
      <form onSubmit={handleManualLogin} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <input
          type="email"
          placeholder="Email / Username"
          value={manualEmail}
          onChange={(e) => setManualEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password"
          value={manualPassword}
          onChange={(e) => setManualPassword(e.target.value)}
          style={inputStyle}
        />
        <button type="submit" style={submitButtonStyle}>
          Log In with Password
        </button>
      </form>
    </div>
  );
};

// ---- STYLES -----------------------------------------------------------------
// Basic inline styles to make the popup look presentable out of the box.
// TODO: Replace any of these with Tailwind classes or your own CSS file
//       once you have a design system in place.

// The outer wrapper — controls popup width and padding.
const containerStyle: React.CSSProperties = {
  padding: '16px',
  fontFamily: 'sans-serif',
  width: '280px',
  boxSizing: 'border-box',
};

// The "Sign In with SSO" button — blue, full width.
const ssoButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  backgroundColor: '#4285F4', // Google blue — change to match your brand
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  fontSize: '14px',
  fontWeight: 'bold',
  cursor: 'pointer',
};

// The red "Log Out" button shown on the logged-in view.
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

// The light grey box that shows username and email after login.
const infoBoxStyle: React.CSSProperties = {
  backgroundColor: '#f7fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  padding: '10px',
  textAlign: 'left',
  fontSize: '13px',
};

// The small green "Logged In" pill badge.
const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#c6f6d5',
  color: '#22543d',
  fontSize: '11px',
  padding: '2px 8px',
  borderRadius: '12px',
  fontWeight: 'bold',
};

// The red error message box shown when login fails.
const errorStyle: React.CSSProperties = {
  backgroundColor: '#fed7d7',
  color: '#9b2c2c',
  padding: '8px',
  borderRadius: '4px',
  marginBottom: '10px',
  fontSize: '12px',
};

// The "OR MANUAL LOGIN" divider line between SSO and the password form.
const dividerStyle: React.CSSProperties = {
  margin: '16px 0 10px 0',
  textAlign: 'center',
  fontSize: '11px',
  color: '#a0aec0',
  borderBottom: '1px solid #e2e8f0',
  lineHeight: '0.1em',
};

// Style for both email and password input fields.
const inputStyle: React.CSSProperties = {
  padding: '8px',
  border: '1px solid #cbd5e0',
  borderRadius: '4px',
  fontSize: '13px',
};

// The dark grey "Log In with Password" submit button.
const submitButtonStyle: React.CSSProperties = {
  padding: '8px',
  backgroundColor: '#4a5568',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  fontSize: '13px',
  cursor: 'pointer',
};

export default SSOLogin;
