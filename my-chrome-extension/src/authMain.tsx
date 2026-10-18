import React from 'react';
import SSOLogin from './SSO auth/SSOLogin';

interface AuthProps {
  onAuthChange: (isAuthenticated: boolean) => void;
}

const Auth: React.FC<AuthProps> = ({ onAuthChange }) => {
  return (
    <div className="p-4">
      <SSOLogin onAuthChange={onAuthChange} />
    </div>
  );
};

export default Auth;