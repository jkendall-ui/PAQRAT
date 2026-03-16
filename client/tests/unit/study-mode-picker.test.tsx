import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../src/context/AuthContext';
import { StudyModePicker } from '../../src/pages/StudyModePicker';
import type { ReactNode } from 'react';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={['/study']}>
          {ui}
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const mockGaps = {
  gaps: [
    { categoryId: 'cat-1', categoryName: 'Pulmonary', reason: 'Error rate above 40%' },
    { categoryId: 'cat-2', categoryName: 'Neurology', reason: 'Elo declining' },
  ],
};

beforeEach(() => {
  localStorage.clear();
  mockNavigate.mockReset();
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  ) as Mock;
});

describe('StudyModePicker', () => {
  it('renders step 1 with all four mode buttons', () => {
    renderWithProviders(<StudyModePicker />);
    expect(screen.getByText('What type of studying do you want to do?')).toBeInTheDocument();
    expect(screen.getByText('Adaptive Session')).toBeInTheDocument();
    expect(screen.getByText('Exam Simulation')).toBeInTheDocument();
    expect(screen.getByText('Weak Spot Sprint')).toBeInTheDocument();
    expect(screen.getByText('ECG Interpretation')).toBeInTheDocument();
  });

  it('does not show answer format or start button on step 1', () => {
    renderWithProviders(<StudyModePicker />);
    expect(screen.queryByTestId('format-selector')).not.toBeInTheDocument();
    expect(screen.queryByTestId('start-session-btn')).not.toBeInTheDocument();
  });

  it('shows answer format options after selecting Adaptive Session', () => {
    renderWithProviders(<StudyModePicker />);
    fireEvent.click(screen.getByTestId('mode-adaptive'));
    expect(screen.getByTestId('format-selector')).toBeInTheDocument();
    expect(screen.getByText('Multiple Choice')).toBeInTheDocument();
    expect(screen.getByText('Free Text')).toBeInTheDocument();
    // Adaptive should NOT show Audio
    expect(screen.queryByText('Audio')).not.toBeInTheDocument();
    expect(screen.getByTestId('start-session-btn')).toBeInTheDocument();
  });

  it('does not show answer format for ECG Interpretation', () => {
    renderWithProviders(<StudyModePicker />);
    fireEvent.click(screen.getByTestId('mode-ecg_interpretation'));
    // No format selector for ECG mode
    expect(screen.queryByTestId('format-selector')).not.toBeInTheDocument();
    expect(screen.getByTestId('start-session-btn')).toBeInTheDocument();
  });

  it('shows category selector when Weak Spot Sprint is selected', async () => {
    (global.fetch as Mock).mockImplementation((url: string) => {
      if (url.includes('/progress/gaps')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockGaps) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    renderWithProviders(<StudyModePicker />);
    fireEvent.click(screen.getByTestId('mode-weak_spot_sprint'));

    await waitFor(() => {
      expect(screen.getByTestId('category-selector')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Pulmonary')).toBeInTheDocument();
      expect(screen.getByText('Neurology')).toBeInTheDocument();
    });
  });

  it('back button returns to step 1', () => {
    renderWithProviders(<StudyModePicker />);
    fireEvent.click(screen.getByTestId('mode-adaptive'));
    expect(screen.getByTestId('start-session-btn')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Back to mode selection'));
    expect(screen.getByText('What type of studying do you want to do?')).toBeInTheDocument();
    expect(screen.queryByTestId('start-session-btn')).not.toBeInTheDocument();
  });
});
