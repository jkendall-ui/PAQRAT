import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { M3Button } from '../components/m3/M3Button';
import { M3Card } from '../components/m3/M3Card';

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: 'Authentication failed — missing authorization code',
  invalid_token: 'Authentication failed — invalid token',
  account_suspended: 'Your account has been suspended',
  auth_failed: 'Authentication failed — please try again',
};

/** Official Google "G" logo SVG per Google branding guidelines */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

export function LoginPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const errCode = searchParams.get('error');
    if (errCode) setError(ERROR_MESSAGES[errCode] || 'Authentication failed');
  }, [searchParams]);

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <M3Card variant="elevated" className="w-full max-w-sm p-8 flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <span className="text-4xl text-blue-600" aria-hidden="true">📋</span>
          <h1 className="text-2xl font-semibold text-gray-900 text-center">PA Exam Prep</h1>
          <p className="text-sm text-gray-600 text-center">
            Adaptive study platform for PANCE &amp; PANRE success
          </p>
        </div>

        <a
          href={`${import.meta.env.VITE_API_URL ?? ''}/api/auth/google`}
          className="flex items-center gap-3 w-full justify-center rounded-md border border-[#dadce0] bg-white px-4 py-2.5 text-sm font-medium text-[#3c4043] shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#4285f4] focus:ring-offset-2 min-h-[44px]"
          role="button"
          aria-label="Sign in with Google"
        >
          <GoogleLogo />
          <span>Sign in with Google</span>
        </a>

        {import.meta.env.DEV && <DevLoginButtons />}

        {error && (
          <p className="text-xs text-red-600 text-center" role="alert">{error}</p>
        )}
      </M3Card>
    </div>
  );
}

function DevLoginButtons() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const devLogin = async (role: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Dev login failed');
      const data = await res.json();
      login(data.accessToken, data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dev login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-2 border-t border-gray-200 pt-4">
      <p className="text-xs text-gray-500 text-center">Dev Mode</p>
      <M3Button variant="outlined" onClick={() => devLogin('student')} disabled={loading} className="w-full">
        Dev Login (Student)
      </M3Button>
      <M3Button variant="text" onClick={() => devLogin('admin')} disabled={loading} className="w-full">
        Dev Login (Admin)
      </M3Button>
      {error && <p className="text-xs text-red-600 text-center" role="alert">{error}</p>}
    </div>
  );
}
