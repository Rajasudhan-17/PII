import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Shield, Lock, Mail, AlertTriangle } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../types/api';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Extract safe redirect location if redirected from a protected route
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/dashboard';

  const validateForm = (): boolean => {
    if (!email.trim()) {
      setError({ message: 'Email address is required.', code: 'VALIDATION_ERROR' });
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError({ message: 'Please provide a valid corporate email format.', code: 'INVALID_EMAIL' });
      return false;
    }
    if (!password) {
      setError({ message: 'Password is required.', code: 'VALIDATION_ERROR' });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    setError(null);

    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'ACCOUNT_LOCKED') {
          setError({
            code: 'ACCOUNT_LOCKED',
            message: 'Your account has been temporarily locked due to repeated failed login attempts. Please wait 15 minutes before retrying or contact your organization administrator.',
          });
        } else if (err.code === 'INVALID_CREDENTIALS') {
          setError({
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email address or password. Please verify your credentials and try again.',
          });
        } else if (err.code === 'NETWORK_ERROR') {
          setError({
            code: 'NETWORK_ERROR',
            message: 'Unable to connect to the privacy platform API. Please ensure the backend server is reachable at VITE_API_BASE_URL.',
          });
        } else {
          setError({
            code: err.code,
            message: err.message || 'Authentication failed. Please verify your credentials.',
          });
        }
      } else {
        setError({
          code: 'AUTH_FAILED',
          message: 'An unexpected authentication error occurred. Please check network connectivity.',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-cool flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-xl bg-brand-teal text-white items-center justify-center shadow-md mb-3">
            <Shield className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-deep-teal">
            Intelligent PII Platform
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Enterprise Detection, Redaction, De-identification & Verification
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-surface-white rounded-xl border border-surface-border shadow-card p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-text-primary">Sign in to your tenant</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Enter your organization account credentials
            </p>
          </div>

          {error && (
            <Alert
              variant={error.code === 'ACCOUNT_LOCKED' ? 'warning' : 'critical'}
              title={error.code === 'ACCOUNT_LOCKED' ? 'Account Temporarily Locked' : 'Authentication Error'}
              className="mb-5"
              onDismiss={() => setError(null)}
            >
              <div className="space-y-1">
                <p>{error.message}</p>
                {error.code && (
                  <p className="font-mono text-[10px] opacity-80 uppercase tracking-wider">
                    Error Code: {error.code}
                  </p>
                )}
              </div>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              placeholder="user@enterprise.org"
              disabled={isLoading}
              required
              autoFocus
              leftIcon={<Mail className="w-4 h-4" />}
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="••••••••••••"
              disabled={isLoading}
              required
              leftIcon={<Lock className="w-4 h-4" />}
            />

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full"
                isLoading={isLoading}
                disabled={isLoading}
              >
                Sign In
              </Button>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEmail('admin@pii-platform.local');
                  setPassword('AdminPass123!');
                  if (error) setError(null);
                }}
                className="flex-1 text-[11px] font-medium py-1.5 px-2 rounded border border-brand-teal/40 bg-brand-pale-teal/40 text-brand-deep-teal hover:bg-brand-pale-teal transition-colors"
              >
                Use Admin Demo
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail('reviewer@pii-platform.local');
                  setPassword('ReviewerPass123!');
                  if (error) setError(null);
                }}
                className="flex-1 text-[11px] font-medium py-1.5 px-2 rounded border border-surface-border bg-surface-cool text-text-secondary hover:bg-slate-200 transition-colors"
              >
                Use Reviewer Demo
              </button>
            </div>
          </form>

          <div className="mt-6 pt-5 border-t border-surface-border text-center">
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-text-secondary mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-text-muted" />
              <span>Security Controls Active</span>
            </div>
            <p className="text-[11px] text-text-secondary leading-relaxed">
              Protected by multi-tenant RBAC, brute-force lockout, and zero raw PII storage policies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
