import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../src/context/AuthContext';
import { DashboardPage } from '../../src/pages/DashboardPage';
import type { ReactNode } from 'react';

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          {ui}
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const mockScores = {
  readinessScore: 72,
  topicScores: [
    { categoryId: '1', categoryName: 'Cardiology', elo: 1100, masteryLevel: 'proficient' },
  ],
};

const mockGaps = {
  gaps: [
    { categoryId: '2', categoryName: 'Pulmonary', reason: 'Error rate above 40%' },
    { categoryId: '3', categoryName: 'Gastroenterology', reason: 'Elo declining' },
    { categoryId: '4', categoryName: 'Neurology', reason: 'Not reviewed recently' },
  ],
};

const mockStreak = {
  currentStreak: 5,
  longestStreak: 12,
  lastStudyDate: '2025-01-15',
};

function mockFetchSuccess() {
  (global.fetch as Mock).mockImplementation((url: string) => {
    if (url.includes('/progress/scores')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScores) });
    }
    if (url.includes('/progress/gaps')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockGaps) });
    }
    if (url.includes('/progress/streak')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockStreak) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

function mockFetchLoading() {
  (global.fetch as Mock).mockImplementation(
    () => new Promise(() => {}), // never resolves
  );
}

beforeEach(() => {
  localStorage.clear();
  global.fetch = vi.fn();
});

describe('DashboardPage', () => {
  it('renders loading state', () => {
    mockFetchLoading();
    renderWithProviders(<DashboardPage />);
    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
  });

  it('renders readiness gauge with score', async () => {
    mockFetchSuccess();
    renderWithProviders(<DashboardPage />);
    const gauge = await screen.findByTestId('readiness-gauge');
    expect(gauge).toBeInTheDocument();
    expect(screen.getByLabelText(/readiness score: 72/i)).toBeInTheDocument();
  });

  it('renders focus cards', async () => {
    mockFetchSuccess();
    renderWithProviders(<DashboardPage />);
    const cards = await screen.findByTestId('focus-cards');
    expect(cards).toBeInTheDocument();
    expect(screen.getByText('Pulmonary')).toBeInTheDocument();
    expect(screen.getByText('Gastroenterology')).toBeInTheDocument();
    expect(screen.getByText('Neurology')).toBeInTheDocument();
  });

  it('renders streak counter', async () => {
    mockFetchSuccess();
    renderWithProviders(<DashboardPage />);
    const streak = await screen.findByTestId('streak-counter');
    expect(streak).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('day streak')).toBeInTheDocument();
  });

  it('renders FAB for starting adaptive session', async () => {
    mockFetchSuccess();
    renderWithProviders(<DashboardPage />);
    const fab = await screen.findByTestId('start-session-fab');
    expect(fab).toBeInTheDocument();
    expect(screen.getByText('Start Adaptive Session')).toBeInTheDocument();
  });
});
