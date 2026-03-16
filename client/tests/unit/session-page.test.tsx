import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../src/context/AuthContext';
import { SessionPage } from '../../src/pages/SessionPage';
import type { ReactNode } from 'react';

function renderWithProviders(ui: ReactNode, { route = '/study/session/s1' } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="/study/session/:id" element={ui} />
            <Route path="/study/session/:id/review" element={<div data-testid="review-page">Review</div>} />
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
    {
      id: 'q1',
      stem: 'What is the most common cause of community-acquired pneumonia?',
      type: 'single_best_answer',
      options: [
        { id: 'o1', label: 'Streptococcus pneumoniae' },
        { id: 'o2', label: 'Haemophilus influenzae' },
        { id: 'o3', label: 'Mycoplasma pneumoniae' },
        { id: 'o4', label: 'Klebsiella pneumoniae' },
      ],
      media: [],
    },
    {
      id: 'q2',
      stem: 'Which ECG finding is most specific for hyperkalemia?',
      type: 'single_best_answer',
      options: [
        { id: 'o5', label: 'Peaked T waves' },
        { id: 'o6', label: 'ST depression' },
      ],
      media: [
        {
          id: 'm1',
          url: '/media/ecg1.png',
          altText: '12-lead ECG showing peaked T waves',
          attribution: 'CC BY-SA 4.0 LITFL',
          type: 'ecg_12lead',
          timing: 'initial',
        },
      ],
    },
    {
      id: 'q3',
      stem: 'Last question stem',
      type: 'single_best_answer',
      options: [{ id: 'o7', label: 'Option A' }],
      media: [],
    },
  ],
};

const mockAttemptResult = {
  id: 'a1',
  isCorrect: true,
  correctOptionId: 'o1',
  explanation: 'S. pneumoniae is the most common cause of CAP.',
  distractorExplanations: {
    o2: 'H. influenzae is second most common.',
  },
};

function mockFetchSession() {
  (global.fetch as Mock).mockImplementation((url: string, opts?: RequestInit) => {
    if (typeof url === 'string' && url.includes('/sessions/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockSession),
      });
    }
    if (typeof url === 'string' && url.includes('/attempts') && opts?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockAttemptResult),
      });
    }
    if (typeof url === 'string' && url.includes('/bookmarks') && opts?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 'b1' }),
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

describe('SessionPage', () => {
  it('renders loading state', () => {
    mockFetchLoading();
    renderWithProviders(<SessionPage />);
    expect(screen.getByTestId('session-loading')).toBeInTheDocument();
  });

  it('renders question stem after loading', async () => {
    mockFetchSession();
    renderWithProviders(<SessionPage />);
    const stem = await screen.findByTestId('question-stem');
    expect(stem).toBeInTheDocument();
    expect(stem.textContent).toBe('What is the most common cause of community-acquired pneumonia?');
  });

  it('renders answer options for multiple choice', async () => {
    mockFetchSession();
    renderWithProviders(<SessionPage />);
    const options = await screen.findByTestId('answer-options');
    expect(options).toBeInTheDocument();
    expect(screen.getByText('Streptococcus pneumoniae')).toBeInTheDocument();
    expect(screen.getByText('Haemophilus influenzae')).toBeInTheDocument();
    expect(screen.getByText('Mycoplasma pneumoniae')).toBeInTheDocument();
    expect(screen.getByText('Klebsiella pneumoniae')).toBeInTheDocument();
  });

  it('renders progress bar', async () => {
    mockFetchSession();
    renderWithProviders(<SessionPage />);
    await screen.findByTestId('session-page');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('Question 1 of 3')).toBeInTheDocument();
  });

  it('submit button calls POST /attempts', async () => {
    mockFetchSession();
    renderWithProviders(<SessionPage />);

    // Wait for question to load
    await screen.findByTestId('question-stem');

    // Select an option
    const radio = screen.getByDisplayValue('o1');
    fireEvent.click(radio);

    // Click submit
    const submitBtn = screen.getByTestId('submit-button');
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const calls = (global.fetch as Mock).mock.calls;
      const attemptCall = calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('/attempts') && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(attemptCall).toBeDefined();
      const body = JSON.parse((attemptCall![1] as RequestInit).body as string);
      expect(body.questionId).toBe('q1');
      expect(body.sessionId).toBe('s1');
      expect(body.selectedOptionId).toBe('o1');
    });
  });

  it('shows answer feedback after submission', async () => {
    mockFetchSession();
    renderWithProviders(<SessionPage />);

    await screen.findByTestId('question-stem');

    fireEvent.click(screen.getByDisplayValue('o1'));
    fireEvent.click(screen.getByTestId('submit-button'));

    const feedback = await screen.findByTestId('answer-feedback');
    expect(feedback).toBeInTheDocument();
    expect(screen.getByText('Correct!')).toBeInTheDocument();
    expect(screen.getByText(/S\. pneumoniae is the most common cause/)).toBeInTheDocument();
  });

  it('submit button is disabled when no option selected', async () => {
    mockFetchSession();
    renderWithProviders(<SessionPage />);
    await screen.findByTestId('question-stem');
    expect(screen.getByTestId('submit-button')).toBeDisabled();
  });

  it('renders flag and bookmark buttons', async () => {
    mockFetchSession();
    renderWithProviders(<SessionPage />);
    await screen.findByTestId('session-page');
    expect(screen.getByTestId('flag-button')).toBeInTheDocument();
    expect(screen.getByTestId('bookmark-button')).toBeInTheDocument();
  });

  it('renders confidence rating', async () => {
    mockFetchSession();
    renderWithProviders(<SessionPage />);
    await screen.findByTestId('session-page');
    expect(screen.getByTestId('confidence-rating')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });
});

describe('AnswerFeedback — ECG findings', () => {
  it('shows ECG findings grouped by category when present', async () => {
    const resultWithEcg = {
      ...mockAttemptResult,
      ecgFindings: [
        { category: 'Rate', findings: ['Normal sinus rate at 75 bpm'] },
        { category: 'Rhythm', findings: ['Regular rhythm', 'Normal P waves'] },
      ],
    };

    (global.fetch as Mock).mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/sessions/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSession),
        });
      }
      if (typeof url === 'string' && url.includes('/attempts') && opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(resultWithEcg),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });

    renderWithProviders(<SessionPage />);
    await screen.findByTestId('question-stem');

    fireEvent.click(screen.getByDisplayValue('o1'));
    fireEvent.click(screen.getByTestId('submit-button'));

    const ecgFindings = await screen.findByTestId('ecg-findings');
    expect(ecgFindings).toBeInTheDocument();
    expect(screen.getByText('Rate')).toBeInTheDocument();
    expect(screen.getByText('Normal sinus rate at 75 bpm')).toBeInTheDocument();
    expect(screen.getByText('Rhythm')).toBeInTheDocument();
    expect(screen.getByText('Regular rhythm')).toBeInTheDocument();
    expect(screen.getByText('Normal P waves')).toBeInTheDocument();
  });
});

describe('AnswerFeedback — answer summary', () => {
  it('shows answer summary when present', async () => {
    const resultWithSummary = {
      ...mockAttemptResult,
      answerSummary: 'The ECG shows normal sinus rhythm with no acute changes.',
    };

    (global.fetch as Mock).mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/sessions/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSession),
        });
      }
      if (typeof url === 'string' && url.includes('/attempts') && opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(resultWithSummary),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });

    renderWithProviders(<SessionPage />);
    await screen.findByTestId('question-stem');

    fireEvent.click(screen.getByDisplayValue('o1'));
    fireEvent.click(screen.getByTestId('submit-button'));

    const summary = await screen.findByTestId('answer-summary');
    expect(summary).toBeInTheDocument();
    expect(screen.getByText('The ECG shows normal sinus rhythm with no acute changes.')).toBeInTheDocument();
  });
});
