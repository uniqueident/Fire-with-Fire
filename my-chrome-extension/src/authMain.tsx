import React from 'react';
import SSOLogin from './SSO auth/SSOLogin';

const Auth: React.FC = () => {
  return (
    <div className="p-4">
      <SSOLogin />
    </div>
  );
};

export default Auth;