import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../src/context/AuthContext';
import { AdminDashboard } from '../../src/pages/AdminDashboard';
import { AdminUsersPage } from '../../src/pages/AdminUsersPage';
import { AdminQuestionsPage } from '../../src/pages/AdminQuestionsPage';
import { AdminImportPage } from '../../src/pages/AdminImportPage';
import { AdminMediaPage } from '../../src/pages/AdminMediaPage';
import type { ReactNode } from 'react';

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('pa_auth_token', 'test-token');
  localStorage.setItem(
    'pa_auth_user',
    JSON.stringify({ id: '1', email: 'admin@test.com', name: 'Admin', role: 'admin' }),
  );
  global.fetch = vi.fn();
});

// ── AdminDashboard ──────────────────────────────────────────────────────────

describe('AdminDashboard', () => {
  it('renders loading state initially', () => {
    (global.fetch as Mock).mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<AdminDashboard />);
    expect(screen.getByTestId('admin-dashboard-loading')).toBeInTheDocument();
  });

  it('renders reports after fetch', async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ activeUsers: 42, sessionCount: 150, attemptVolume: 3200 }),
    });
    renderWithProviders(<AdminDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId('admin-reports')).toBeInTheDocument();
    });
    expect(screen.getByTestId('active-users')).toHaveTextContent('42');
    expect(screen.getByTestId('session-count')).toHaveTextContent('150');
    expect(screen.getByTestId('attempt-volume')).toHaveTextContent('3200');
  });

  it('renders error on fetch failure', async () => {
    (global.fetch as Mock).mockResolvedValueOnce({ ok: false });
    renderWithProviders(<AdminDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId('admin-dashboard-error')).toBeInTheDocument();
    });
  });
});

// ── AdminUsersPage ──────────────────────────────────────────────────────────

describe('AdminUsersPage', () => {
  const mockUsers = {
    users: [
      {
        id: 'u1',
        name: 'Alice',
        email: 'alice@test.com',
        createdAt: '2025-01-01T00:00:00Z',
        plan: 'free',
        lastActive: '2025-06-01T00:00:00Z',
        blocked: false,
      },
      {
        id: 'u2',
        name: 'Bob',
        email: 'bob@test.com',
        createdAt: '2025-02-01T00:00:00Z',
        plan: 'premium',
        lastActive: '2025-06-10T00:00:00Z',
        blocked: true,
      },
    ],
    total: 2,
  };

  it('renders user list', async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUsers),
    });
    renderWithProviders(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByTestId('user-list')).toBeInTheDocument();
    });
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@test.com')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('bob@test.com')).toBeInTheDocument();
  });

  it('shows block button for active users and unblock for blocked users', async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUsers),
    });
    renderWithProviders(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByTestId('block-btn-u1')).toHaveTextContent('Block');
      expect(screen.getByTestId('block-btn-u2')).toHaveTextContent('Unblock');
    });
  });
});

// ── AdminQuestionsPage ──────────────────────────────────────────────────────

describe('AdminQuestionsPage', () => {
  const mockQuestions = {
    questions: [
      {
        id: 'q1',
        stem: 'What is the most common cause of chest pain?',
        type: 'multiple_choice',
        difficulty: 3,
        categoryName: 'Cardiology',
        isActive: true,
      },
      {
        id: 'q2',
        stem: 'Which antibiotic is first-line for pneumonia?',
        type: 'multiple_choice',
        difficulty: 2,
        categoryName: 'Pulmonary',
        isActive: false,
      },
    ],
    total: 2,
  };

  it('renders question list', async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockQuestions),
    });
    renderWithProviders(<AdminQuestionsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('question-list')).toBeInTheDocument();
    });
    expect(screen.getByText('What is the most common cause of chest pain?')).toBeInTheDocument();
    expect(screen.getByText('Which antibiotic is first-line for pneumonia?')).toBeInTheDocument();
  });

  it('shows add question button', async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockQuestions),
    });
    renderWithProviders(<AdminQuestionsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('create-question-btn')).toBeInTheDocument();
    });
  });

  it('shows deactivate button only for active questions', async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockQuestions),
    });
    renderWithProviders(<AdminQuestionsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('deactivate-btn-q1')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('deactivate-btn-q2')).not.toBeInTheDocument();
  });
});

// ── AdminImportPage ─────────────────────────────────────────────────────────

describe('AdminImportPage', () => {
  it('renders import and export buttons', () => {
    renderWithProviders(<AdminImportPage />);
    expect(screen.getByTestId('import-questions-btn')).toBeInTheDocument();
    expect(screen.getByTestId('export-questions-btn')).toBeInTheDocument();
    expect(screen.getByTestId('import-cases-btn')).toBeInTheDocument();
    expect(screen.getByTestId('export-cases-btn')).toBeInTheDocument();
  });

  it('renders file inputs for questions and cases', () => {
    renderWithProviders(<AdminImportPage />);
    expect(screen.getByTestId('question-file-input')).toBeInTheDocument();
    expect(screen.getByTestId('case-file-input')).toBeInTheDocument();
  });
});

// ── AdminMediaPage ──────────────────────────────────────────────────────────

describe('AdminMediaPage', () => {
  it('renders upload form with required fields', () => {
    renderWithProviders(<AdminMediaPage />);
    expect(screen.getByTestId('media-upload-form')).toBeInTheDocument();
    expect(screen.getByTestId('media-file-input')).toBeInTheDocument();
    expect(screen.getByLabelText('Alt Text')).toBeInTheDocument();
    expect(screen.getByLabelText('Attribution')).toBeInTheDocument();
    expect(screen.getByTestId('upload-media-btn')).toBeInTheDocument();
  });

  it('shows upload button text', () => {
    renderWithProviders(<AdminMediaPage />);
    expect(screen.getByTestId('upload-media-btn')).toHaveTextContent('Upload Media');
  });
});
