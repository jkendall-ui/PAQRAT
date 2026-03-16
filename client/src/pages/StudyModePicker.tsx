import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { M3SegmentedButton } from '../components/m3/M3SegmentedButton';
import { M3Button } from '../components/m3/M3Button';
import { M3Card } from '../components/m3/M3Card';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Brain, Zap, HeartPulse, ArrowLeft } from 'lucide-react';

type StudyMode = 'adaptive' | 'exam_simulation' | 'weak_spot_sprint' | 'ecg_interpretation';
type AnswerFormat = 'multiple_choice' | 'free_text' | 'audio';

interface GapCategory { categoryId: string; categoryName: string; reason: string; }

const modeCards: { value: StudyMode; label: string; description: string; icon: typeof Brain }[] = [
  { value: 'adaptive', label: 'Adaptive Session', description: 'AI-powered questions that adapt to your level', icon: Brain },
  { value: 'exam_simulation', label: 'Exam Simulation', description: 'Timed practice that mirrors the real PA exam', icon: BookOpen },
  { value: 'weak_spot_sprint', label: 'Weak Spot Sprint', description: 'Focus on your weakest topic areas', icon: Zap },
  { value: 'ecg_interpretation', label: 'ECG Interpretation', description: 'Read ECGs step-by-step with AI feedback', icon: HeartPulse },
];

const adaptiveFormatOptions = [
  { value: 'multiple_choice' as const, label: 'Multiple Choice' },
  { value: 'free_text' as const, label: 'Free Text' },
];

const allFormatOptions = [
  { value: 'multiple_choice' as const, label: 'Multiple Choice' },
  { value: 'free_text' as const, label: 'Free Text' },
  { value: 'audio' as const, label: 'Audio' },
];

export function StudyModePicker() {
  const navigate = useNavigate();
  const { token, refreshToken, logout } = useAuth();
  const [mode, setMode] = useState<StudyMode | null>(null);
  const [answerFormat, setAnswerFormat] = useState<AnswerFormat>('multiple_choice');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [gaps, setGaps] = useState<GapCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'weak_spot_sprint') {
      fetch('/api/progress/gaps', { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => res.json())
        .then((data: { gaps: GapCategory[] }) => {
          setGaps(data.gaps);
          if (data.gaps.length > 0 && !selectedCategory) setSelectedCategory(data.gaps[0].categoryId);
        })
        .catch(() => setGaps([]));
    }
  }, [mode, token, selectedCategory]);

  const startSession = async (sessionMode: string, catId?: string) => {
    const body: Record<string, string> = { mode: sessionMode };
    if (catId) body.categoryId = catId;
    let res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    // If 401, try refreshing the token once
    if (res.status === 401) {
      await refreshToken();
      // Re-read token from localStorage after refresh
      const newToken = localStorage.getItem('pa_auth_token');
      if (newToken) {
        res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${newToken}` },
          body: JSON.stringify(body),
        });
      }
    }
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error?.code ?? 'UNKNOWN');
    }
    return res.json();
  };

  const handleSelectMode = (m: StudyMode) => {
    setMode(m);
    setError(null);
    // ECG interpretation is always free_text
    if (m === 'ecg_interpretation') setAnswerFormat('free_text');
    else setAnswerFormat('multiple_choice');
  };

  const handleBack = () => {
    setMode(null);
    setError(null);
  };

  const handleStart = async () => {
    if (!mode) return;
    if (!token) {
      setError('You need to sign in first.');
      return;
    }
    setLoading(true); setError(null);
    try {
      const result = await startSession(
        mode,
        mode === 'weak_spot_sprint' ? selectedCategory : undefined,
      );
      navigate(`/study/session/${result.session.id}${mode === 'ecg_interpretation' ? '?mode=ecg_interpretation' : ''}`);
    } catch (err: any) {
      if (err.message === 'FORBIDDEN' && mode !== 'ecg_interpretation') {
        try {
          const diagResult = await startSession('diagnostic');
          navigate(`/study/session/${diagResult.session.id}`);
          return;
        } catch {
          setError('Could not start diagnostic session. Please try again.');
          return;
        }
      }
      if (err.message === 'UNAUTHORIZED') {
        logout();
        navigate('/login');
      } else {
        setError(`Could not start session: ${err.message}`);
      }
    } finally { setLoading(false); }
  };

  // Determine which format options to show based on mode
  const getFormatOptions = () => {
    if (mode === 'adaptive') return adaptiveFormatOptions;
    if (mode === 'ecg_interpretation') return []; // no choice, always free_text
    return allFormatOptions;
  };

  const formatOpts = getFormatOptions();

  // Step 1: Mode selection
  if (!mode) {
    return (
      <div className="flex justify-center p-4" data-testid="study-mode-picker">
        <div className="w-full max-w-lg flex flex-col gap-5">
          <h1 className="text-xl font-semibold text-gray-900 text-center">
            What type of studying do you want to do?
          </h1>
          <div className="flex flex-col gap-3" data-testid="mode-selector">
            {modeCards.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => handleSelectMode(m.value)}
                  className="flex items-center gap-4 w-full rounded-lg border border-gray-200 bg-white px-4 py-4 text-left shadow-sm hover:border-blue-400 hover:bg-blue-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                  data-testid={`mode-${m.value}`}
                >
                  <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                    <Icon size={22} />
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-gray-900">{m.label}</span>
                    <span className="text-xs text-gray-500">{m.description}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Configuration for the selected mode
  return (
    <div className="flex justify-center p-4" data-testid="study-mode-picker">
      <M3Card variant="elevated" className="w-full max-w-lg flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleBack}
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Back to mode selection">
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">
            {modeCards.find((m) => m.value === mode)?.label}
          </h1>
        </div>

        {/* Answer format — only show if there are options to pick */}
        {formatOpts.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-600">Answer Format</label>
            <M3SegmentedButton options={formatOpts} value={answerFormat} onChange={setAnswerFormat} data-testid="format-selector" />
          </div>
        )}

        {/* ECG interpretation note */}
        {mode === 'ecg_interpretation' && (
          <p className="text-xs text-gray-500">
            You'll interpret each ECG through 10 structured steps (rate, rhythm, axis, etc.) with free-text answers evaluated by AI.
          </p>
        )}

        {/* Weak spot sprint category selector */}
        {mode === 'weak_spot_sprint' && (
          <div className="flex flex-col gap-2" data-testid="category-selector">
            <label className="text-sm font-medium text-gray-600" htmlFor="category-select">Gap Category</label>
            <select id="category-select" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded border border-gray-300 bg-white text-gray-900 px-3 h-10 text-sm">
              {gaps.map((g) => (<option key={g.categoryId} value={g.categoryId}>{g.categoryName}</option>))}
            </select>
          </div>
        )}

        {error && <p className="text-red-600 text-xs text-center">{error}</p>}

        <M3Button variant="filled" onClick={handleStart}
          disabled={loading || (mode === 'weak_spot_sprint' && !selectedCategory)} data-testid="start-session-btn">
          {loading ? 'Starting…' : 'Start Session'}
        </M3Button>
      </M3Card>
    </div>
  );
}
