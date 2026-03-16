import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../src/context/AuthContext';
import { LoginPage } from '../../src/pages/LoginPage';
import type { ReactNode } from 'react';

function renderWithProviders(ui: ReactNode, { route = '/login' } = {}) {
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

beforeEach(() => {
  localStorage.clear();
});

describe('LoginPage', () => {
  it('renders the app title', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByRole('heading', { name: /PA Exam Prep/i })).toBeInTheDocument();
  });

  it('renders the sign-in button', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
  });

  it('renders the tagline', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByText(/adaptive study platform/i)).toBeInTheDocument();
  });
});
