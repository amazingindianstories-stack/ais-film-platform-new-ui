'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';

export default function LoginScreen({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await signIn('credentials', {
        redirect: false,
        email,
        password
      });
      if (res?.error) {
        throw new Error(res.error);
      }
      window.dispatchEvent(new CustomEvent('canvas:auth-changed'));
      window.dispatchEvent(new CustomEvent('canvas:navigate', { detail: { path: '/dashboard' } }));
      if (onLoginSuccess) onLoginSuccess();
    } catch (err) {
      setError('Sign in failed. Check your email and password.');
    } finally {
      setIsLoading(false);
    }
  };

  const closeLogin = () => {
    window.dispatchEvent(new CustomEvent('canvas:navigate', { detail: { path: '/dashboard' } }));
  };

  return (
    <section className="screen-auth">
      <div className="auth-card" data-anim>
        <button className="auth-close" onClick={closeLogin} aria-label="Close">×</button>
        <h1 className="auth-title">AIS Studio</h1>
        
        <div className="auth-header">
          <h2 className="auth-tab is-active">Sign in</h2>
        </div>

        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleAuthSubmit}>
          <div className="auth-group">
            <label>Email</label>
            <input 
              className="auth-input" 
              type="email" 
              placeholder="you@example.com" 
              required 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              disabled={isLoading}
            />
          </div>
          <div className="auth-group">
            <label>Password</label>
            <input 
              className="auth-input" 
              type="password" 
              placeholder="••••••••" 
              required 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              disabled={isLoading}
            />
          </div>
          <button type="submit" className="auth-submit" disabled={isLoading}>
            {isLoading ? 'Signing in…' : 'Enter the Studio'}
          </button>
        </form>
      </div>
    </section>
  );
}
