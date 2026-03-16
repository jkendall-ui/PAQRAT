import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../../src/context/AuthContext';
import { ProtectedRoute } from '../../src/components/ProtectedRoute';
import { AdminRoute } from '../../src/components/AdminRoute';
import { OfflineBanner } from '../../src/components/OfflineBanner';
import { AppLayout } from '../../src/components/AppLayout';
import { Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';

// Helper to render with all providers
function renderWithProviders(ui: ReactNode, { route = '/' } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[route]}>
          {ui}
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

// Helper component that logs in via context
function LoginHelper({ role = 'student' as const }: { role?: 'student' | 'admin' }) {
  const { login } = useAuth();
  return (
    <button onClick={() => login('fake-token', { id: '1', email: 'test@test.com', name: 'Test', role })}>
      Login
    </button>
  );
}

beforeEach(() => {
  localStorage.clear();
});

// ── App renders ───────────────────────────────────────────────────────────────

describe('App shell', () => {
  it('renders without crashing', async () => {
    // Import App dynamically to avoid BrowserRouter conflict with MemoryRouter
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { default: App } = await import('../../src/App');
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );
    expect(container).toBeTruthy();
  });
});

// ── ProtectedRoute ────────────────────────────────────────────────────────────

describe('ProtectedRoute', () => {
  it('redirects to /login when not authenticated', () => {
    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Route>
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>,
      { route: '/dashboard' },
    );
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders child route when authenticated', () => {
    localStorage.setItem('pa_auth_token', 'fake-token');
    localStorage.setItem('pa_auth_user', JSON.stringify({ id: '1', email: 'a@b.com', name: 'A', role: 'student' }));

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Dashboard Content</div>} />
        </Route>
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>,
      { route: '/dashboard' },
    );
    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
  });
});

// ── AdminRoute ────────────────────────────────────────────────────────────────

describe('AdminRoute', () => {
  it('redirects non-admin users to /dashboard', () => {
    localStorage.setItem('pa_auth_token', 'fake-token');
    localStorage.setItem('pa_auth_user', JSON.stringify({ id: '1', email: 'a@b.com', name: 'A', role: 'student' }));

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<div>Admin Panel</div>} />
          </Route>
          <Route path="/dashboard" element={<div>Student Dashboard</div>} />
        </Route>
        <Route path="/login" element={<div>Login</div>} />
      </Routes>,
      { route: '/admin' },
    );
    expect(screen.getByText('Student Dashboard')).toBeInTheDocument();
  });

  it('renders admin route for admin users', () => {
    localStorage.setItem('pa_auth_token', 'fake-token');
    localStorage.setItem('pa_auth_user', JSON.stringify({ id: '1', email: 'a@b.com', name: 'Admin', role: 'admin' }));

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<div>Admin Panel</div>} />
          </Route>
          <Route path="/dashboard" element={<div>Student Dashboard</div>} />
        </Route>
        <Route path="/login" element={<div>Login</div>} />
      </Routes>,
      { route: '/admin' },
    );
    expect(screen.getByText('Admin Panel')).toBeInTheDocument();
  });
});

// ── OfflineBanner ─────────────────────────────────────────────────────────────

describe('OfflineBanner', () => {
  it('renders when offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OfflineBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent('You are offline');
    vi.restoreAllMocks();
  });

  it('does not render when online', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

// ── Navigation destinations ───────────────────────────────────────────────────

describe('AppLayout navigation', () => {
  it('renders all 4 navigation destinations', () => {
    localStorage.setItem('pa_auth_token', 'fake-token');
    localStorage.setItem('pa_auth_user', JSON.stringify({ id: '1', email: 'a@b.com', name: 'A', role: 'student' }));

    renderWithProviders(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<div>Dashboard Content</div>} />
        </Route>
      </Routes>,
      { route: '/dashboard' },
    );

    // Both NavigationBar and NavigationRail render the same destinations
    const dashboardLinks = screen.getAllByText('Dashboard');
    expect(dashboardLinks.length).toBeGreaterThanOrEqual(2);

    const studyLinks = screen.getAllByText('Study');
    expect(studyLinks.length).toBeGreaterThanOrEqual(2);

    const libraryLinks = screen.getAllByText('Library');
    expect(libraryLinks.length).toBeGreaterThanOrEqual(2);

    const progressLinks = screen.getAllByText('Progress');
    expect(progressLinks.length).toBeGreaterThanOrEqual(2);
  });
});
