import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Handles the OAuth callback redirect from the server.
 * Extracts the token and user from query params, stores them, and redirects to dashboard.
 */
export function AuthCallbackPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    const userJson = searchParams.get('user');

    if (token && userJson) {
      try {
        const user = JSON.parse(userJson);
        login(token, user);
        navigate('/dashboard', { replace: true });
        return;
      } catch {
        // fall through to error
      }
    }

    // If we got here, something went wrong
    navigate('/login?error=auth_failed', { replace: true });
  }, [searchParams, login, navigate]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <p className="text-body-lg text-on-surface-variant">Signing you in…</p>
    </div>
  );
}
