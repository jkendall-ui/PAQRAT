import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../src/context/AuthContext';
import { SessionReviewPage } from '../../src/pages/SessionReviewPage';
import type { ReactNode } from 'react';

function renderWithProviders(ui: ReactNode, { route = '/study/session/s1/review' } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="/study/session/:id/review" element={ui} />
            <Route path="/dashboard" element={<div data-testid="dashboard-page">Dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const mockSession = {
  id: 's1',
  mode: 'adaptive',
  totalQuestions: 3,
  questions: [
    { id: 'q1', stem: 'What is the most common cause of CAP?' },
    { id: 'q2', stem: 'Which ECG finding indicates hyperkalemia?' },
    { id: 'q3', stem: 'What is the treatment for PE?' },
  ],
  attempts: [
    { id: 'a1', questionId: 'q1', isCorrect: true, duration: 30000, flagged: false },
    { id: 'a2', questionId: 'q2', isCorrect: false, duration: 45000, flagged: true },
    { id: 'a3', questionId: 'q3', isCorrect: true, duration: 25000, flagged: false },
  ],
};

function mockFetchSession() {
  (global.fetch as Mock).mockImplementation((url: string, opts?: RequestInit) => {
    if (typeof url === 'string' && url.includes('/sessions/') && (!opts?.method || opts.method === 'GET')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockSession),
      });
    }
    if (typeof url === 'string' && url.includes('/sessions/') && opts?.method === 'PATCH') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ended_at: new Date().toISOString() }),
      });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

function mockFetchLoading() {
  (global.fetch as Mock).mockImplementation(() => new Promise(() => {}));
}

beforeEach(() => {
  localStorage.clear();
  global.fetch = vi.fn();
});

describe('SessionReviewPage', () => {
  it('renders loading state', () => {
    mockFetchLoading();
    renderWithProviders(<SessionReviewPage />);
    expect(screen.getByTestId('review-loading')).toBeInTheDocument();
  });

  it('renders score summary after loading', async () => {
    mockFetchSession();
    renderWithProviders(<SessionReviewPage />);

    const scoreDisplay = await screen.findByTestId('score-display');
    expect(scoreDisplay).toBeInTheDocument();
    expect(scoreDisplay.textContent).toBe('2 / 3');
    expect(screen.getByText('67% correct')).toBeInTheDocument();
  });

  it('renders time spent', async () => {
    mockFetchSession();
    renderWithProviders(<SessionReviewPage />);

    const timeCard = await screen.findByTestId('time-card');
    expect(timeCard).toBeInTheDocument();
    // 30000 + 45000 + 25000 = 100000ms ≈ 2 min
    expect(screen.getByText('2 min')).toBeInTheDocument();
  });

  it('renders flagged questions', async () => {
    mockFetchSession();
    renderWithProviders(<SessionReviewPage />);

    const flaggedCard = await screen.findByTestId('flagged-card');
    expect(flaggedCard).toBeInTheDocument();
    expect(screen.getByText('Flagged Questions (1)')).toBeInTheDocument();
    expect(screen.getByText('Which ECG finding indicates hyperkalemia?')).toBeInTheDocument();
  });

  it('end session button opens dialog', async () => {
    mockFetchSession();
    renderWithProviders(<SessionReviewPage />);

    const endBtn = await screen.findByTestId('end-session-button');
    fireEvent.click(endBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to end this session/)).toBeInTheDocument();
  });

  it('shows return to dashboard after ending session', async () => {
    mockFetchSession();
    renderWithProviders(<SessionReviewPage />);

    // Click end session
    const endBtn = await screen.findByTestId('end-session-button');
    fireEvent.click(endBtn);

    // Confirm in dialog
    const confirmBtn = screen.getByTestId('confirm-end-button');
    fireEvent.click(confirmBtn);

    // Wait for PATCH call and state update
    const returnBtn = await screen.findByTestId('return-dashboard-button');
    expect(returnBtn).toBeInTheDocument();
    expect(returnBtn.textContent).toBe('Return to Dashboard');

    // Verify PATCH was called
    await waitFor(() => {
      const calls = (global.fetch as Mock).mock.calls;
      const patchCall = calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('/sessions/') && (c[1] as RequestInit)?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
    });
  });
});
