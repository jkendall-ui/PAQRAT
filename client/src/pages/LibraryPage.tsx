import { useState, useEffect, useCallback } from 'react';
import { M3SegmentedButton, M3TextField, M3FilterChip, M3Card } from '../components/m3';
import { useAuth } from '../context/AuthContext';

type LibraryTab = 'questions' | 'videos' | 'bookmarks' | 'references';

const tabOptions = [
  { value: 'questions' as const, label: 'Question Bank' },
  { value: 'videos' as const, label: 'Video Library' },
  { value: 'bookmarks' as const, label: 'My Bookmarks' },
  { value: 'references' as const, label: 'Reference Cards' },
];

const difficultyOptions = ['easy', 'medium', 'hard'] as const;

interface Question { id: string; stem: string; categoryName: string; difficulty: string; }
interface Bookmark { id: string; questionId: string; question: { id: string; stem: string }; }

export function LibraryPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<LibraryTab>('questions');
  const [search, setSearch] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (selectedDifficulty) params.set('difficulty', selectedDifficulty);
      const res = await fetch(`/api/questions?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); setQuestions(data.questions ?? []); setTotalQuestions(data.total ?? 0); }
    } finally { setLoading(false); }
  }, [search, selectedDifficulty, token]);

  const fetchBookmarks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bookmarks', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); setBookmarks(data.bookmarks ?? []); }
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    if (activeTab === 'questions') fetchQuestions();
    if (activeTab === 'bookmarks') fetchBookmarks();
  }, [activeTab, fetchQuestions, fetchBookmarks]);

  return (
    <div className="p-4 space-y-4" data-testid="library-page">
      <h1 className="text-xl font-semibold text-gray-900">Library</h1>
      <M3SegmentedButton options={tabOptions} value={activeTab} onChange={setActiveTab} className="w-full" />
      {activeTab === 'questions' && (
        <div className="space-y-4" data-testid="question-bank">
          <M3TextField variant="outlined" label="Search questions" placeholder="Search by keyword..."
            value={search} onChange={(e) => setSearch(e.target.value)} data-testid="question-search" />
          <div className="flex gap-2 flex-wrap" data-testid="difficulty-filters">
            {difficultyOptions.map((d) => (
              <M3FilterChip key={d} selected={selectedDifficulty === d} onClick={() => setSelectedDifficulty(selectedDifficulty === d ? null : d)}>
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </M3FilterChip>
            ))}
          </div>
          {loading && <p className="text-sm text-gray-600">Loading...</p>}
          {!loading && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">{totalQuestions} questions found</p>
              {questions.map((q) => (
                <M3Card key={q.id} variant="outlined">
                  <p className="text-base text-gray-900">{q.stem}</p>
                  <p className="text-xs text-gray-500">{q.categoryName} · {q.difficulty}</p>
                </M3Card>
              ))}
            </div>
          )}
        </div>
      )}
      {activeTab === 'videos' && (
        <div data-testid="video-library">
          <M3Card variant="outlined"><p className="text-base text-gray-600">Video library coming soon. YouTube and Vimeo embeds will appear here.</p></M3Card>
        </div>
      )}
      {activeTab === 'bookmarks' && (
        <div className="space-y-2" data-testid="bookmarks-section">
          {loading && <p className="text-sm text-gray-600">Loading...</p>}
          {!loading && bookmarks.length === 0 && <p className="text-sm text-gray-600">No bookmarks yet.</p>}
          {bookmarks.map((b) => (<M3Card key={b.id} variant="outlined"><p className="text-base text-gray-900">{b.question.stem}</p></M3Card>))}
        </div>
      )}
      {activeTab === 'references' && (
        <div data-testid="reference-cards">
          <M3Card variant="outlined"><p className="text-base text-gray-600">Reference cards coming soon. Quick-reference summaries will appear here.</p></M3Card>
        </div>
      )}
    </div>
  );
}
