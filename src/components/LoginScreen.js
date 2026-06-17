'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase';

export default function LoginScreen({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const supabase = createClient();

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) throw loginError;
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
        <h1 className="auth-title">Aura</h1>
        
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
