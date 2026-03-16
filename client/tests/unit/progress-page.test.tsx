import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../src/context/AuthContext';
import { ProgressPage } from '../../src/pages/ProgressPage';
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
        <MemoryRouter initialEntries={['/progress']}>
          {ui}
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const mockHeatmap = {
  categories: [
    { categoryId: '1', categoryName: 'Cardiology', elo: 1200, masteryLevel: 'proficient' },
    { categoryId: '2', categoryName: 'Pulmonary', elo: 800, masteryLevel: 'beginner' },
    { categoryId: '3', categoryName: 'Gastroenterology', elo: 1050, masteryLevel: 'intermediate' },
    { categoryId: '4', categoryName: 'Neurology', elo: 1350, masteryLevel: 'expert' },
    { categoryId: '5', categoryName: 'Dermatology', elo: 600, masteryLevel: 'novice' },
    { categoryId: '6', categoryName: 'Endocrinology', elo: 1100, masteryLevel: 'proficient' },
  ],
};

const mockTrends = {
  trends: [
    { date: '2025-01-10', accuracy: 55, attempts: 20 },
    { date: '2025-01-11', accuracy: 62, attempts: 25 },
    { date: '2025-01-12', accuracy: 68, attempts: 30 },
  ],
};

const mockSummary = {
  totalAttempts: 450,
  accuracyRate: 72,
  totalStudyMinutes: 1530,
  predictedScoreBand: '450-500',
};

function mockFetchSuccess() {
  (global.fetch as Mock).mockImplementation((url: string) => {
    if (url.includes('/progress/heatmap')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHeatmap) });
    }
    if (url.includes('/analytics/trends')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTrends) });
    }
    if (url.includes('/analytics/summary')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSummary) });
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

describe('ProgressPage', () => {
  it('renders loading state', () => {
    mockFetchLoading();
    renderWithProviders(<ProgressPage />);
    expect(screen.getByTestId('progress-loading')).toBeInTheDocument();
  });

  it('renders heatmap grid with categories', async () => {
    mockFetchSuccess();
    renderWithProviders(<ProgressPage />);
    const grid = await screen.findByTestId('heatmap-grid');
    expect(grid).toBeInTheDocument();
    // Categories appear in both heatmap and breakdown, so use getAllByText
    expect(screen.getAllByText('Cardiology').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Pulmonary').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Neurology').length).toBeGreaterThanOrEqual(1);
    // Check mastery labels are shown as text (not color alone)
    expect(screen.getByTestId('heatmap-cell-1')).toHaveTextContent('Proficient');
    expect(screen.getByTestId('heatmap-cell-2')).toHaveTextContent('Beginner');
    expect(screen.getByTestId('heatmap-cell-5')).toHaveTextContent('Novice');
  });

  it('renders analytics summary', async () => {
    mockFetchSuccess();
    renderWithProviders(<ProgressPage />);
    const summary = await screen.findByTestId('analytics-summary');
    expect(summary).toBeInTheDocument();
    expect(screen.getByText('450')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.getByText('25h 30m')).toBeInTheDocument();
    expect(screen.getByText('450-500')).toBeInTheDocument();
  });

  it('renders accuracy trend chart', async () => {
    mockFetchSuccess();
    renderWithProviders(<ProgressPage />);
    const chart = await screen.findByTestId('accuracy-trend-chart');
    expect(chart).toBeInTheDocument();
    expect(screen.getByLabelText('Accuracy trend over time')).toBeInTheDocument();
  });
});
