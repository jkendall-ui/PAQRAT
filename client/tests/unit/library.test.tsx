import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../src/context/AuthContext';
import { LibraryPage } from '../../src/pages/LibraryPage';
import { CaseBrowserPage } from '../../src/pages/CaseBrowserPage';
import { CaseDetailPage } from '../../src/pages/CaseDetailPage';
import type { ReactNode } from 'react';

function renderWithProviders(ui: ReactNode, { route = '/library' } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="/library" element={ui} />
            <Route path="/library/cases" element={ui} />
            <Route path="/library/cases/:caseId" element={ui} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const mockQuestions = {
  questions: [
    { id: 'q1', stem: 'What causes CAP?', categoryName: 'Pulmonary', difficulty: 'medium' },
  ],
  total: 1,
  page: 1,
};

const mockBookmarks = {
  bookmarks: [
    { id: 'b1', questionId: 'q1', question: { id: 'q1', stem: 'Bookmarked question stem' } },
  ],
};

const mockCases = {
  cases: [
    {
      id: 'c1',
      case_id: 'CASE-001',
      title: 'Chest Pain Evaluation',
      clinical_context: 'A 55-year-old male presents with chest pain.',
      primary_topic: 'Cardiology',
      difficulty: 'hard',
    },
  ],
  total: 1,
  page: 1,
};

const mockCaseDetail = {
  id: 'c1',
  case_id: 'CASE-001',
  title: 'Chest Pain Evaluation',
  clinical_context: 'A 55-year-old male presents with substernal chest pain.',
  subCases: [
    { id: 'sc1', title: 'Initial Assessment', questions: [{ id: 'q1' }] },
    { id: 'sc2', title: 'Follow-up', questions: [] },
  ],
  tags: [{ tag: 'cardiology' }, { tag: 'acute' }],
  clinicalPearls: [{ pearl_text: 'Always obtain serial troponins.' }],
  references: [{ title: 'AHA Guidelines', url: 'https://example.com/aha' }],
};

beforeEach(() => {
  localStorage.clear();
  global.fetch = vi.fn();
});

describe('LibraryPage', () => {
  it('renders tabs', async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockQuestions),
    });
    renderWithProviders(<LibraryPage />);
    expect(screen.getByText('Question Bank')).toBeInTheDocument();
    expect(screen.getByText('Video Library')).toBeInTheDocument();
    expect(screen.getByText('My Bookmarks')).toBeInTheDocument();
    expect(screen.getByText('Reference Cards')).toBeInTheDocument();
  });

  it('renders search field', async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockQuestions),
    });
    renderWithProviders(<LibraryPage />);
    expect(screen.getByLabelText('Search questions')).toBeInTheDocument();
  });

  it('renders difficulty filter chips', async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockQuestions),
    });
    renderWithProviders(<LibraryPage />);
    expect(screen.getByText('Easy')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('Hard')).toBeInTheDocument();
  });
});

describe('CaseBrowserPage', () => {
  it('renders filter chips', async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCases),
    });
    renderWithProviders(<CaseBrowserPage />, { route: '/library/cases' });
    expect(screen.getByText('NCCPA')).toBeInTheDocument();
    expect(screen.getByText('Cardiology')).toBeInTheDocument();
    expect(screen.getByTestId('case-filter-bar')).toBeInTheDocument();
  });

  it('renders case count', async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCases),
    });
    renderWithProviders(<CaseBrowserPage />, { route: '/library/cases' });
    await screen.findByText('1 matching cases');
    expect(screen.getByTestId('case-count')).toBeInTheDocument();
  });
});

describe('CaseDetailPage', () => {
  it('renders case title', async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCaseDetail),
    });
    renderWithProviders(<CaseDetailPage />, { route: '/library/cases/c1' });
    const title = await screen.findByTestId('case-title');
    expect(title).toBeInTheDocument();
    expect(title.textContent).toBe('Chest Pain Evaluation');
  });

  it('renders clinical context', async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCaseDetail),
    });
    renderWithProviders(<CaseDetailPage />, { route: '/library/cases/c1' });
    await screen.findByTestId('clinical-context');
    expect(screen.getByText(/substernal chest pain/)).toBeInTheDocument();
  });

  it('renders keyword tags as input chips', async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCaseDetail),
    });
    renderWithProviders(<CaseDetailPage />, { route: '/library/cases/c1' });
    await screen.findByTestId('case-tags');
    expect(screen.getByText('cardiology')).toBeInTheDocument();
    expect(screen.getByText('acute')).toBeInTheDocument();
  });

  it('renders AI-recommended assist chips', async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCaseDetail),
    });
    renderWithProviders(<CaseDetailPage />, { route: '/library/cases/c1' });
    await screen.findByTestId('ai-actions');
    expect(screen.getByText('Review similar cases')).toBeInTheDocument();
    expect(screen.getByText('Generate practice questions')).toBeInTheDocument();
  });
});
