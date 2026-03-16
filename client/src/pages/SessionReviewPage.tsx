import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { M3Card } from '../components/m3/M3Card';
import { M3Button } from '../components/m3/M3Button';
import { M3Dialog } from '../components/m3/M3Dialog';
import { M3CircularProgress } from '../components/m3/M3CircularProgress';

interface AttemptData { id: string; questionId: string; isCorrect: boolean; duration: number; flagged?: boolean; }
interface QuestionData { id: string; stem: string; }
interface SessionData { id: string; mode: string; questions: QuestionData[]; totalQuestions: number; attempts: AttemptData[]; }

export function SessionReviewPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    fetch(`/api/sessions/${sessionId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => { if (!res.ok) throw new Error('Failed to load session'); return res.json(); })
      .then((data: SessionData) => { setSession(data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [sessionId, token]);

  const stats = useMemo(() => {
    if (!session) return null;
    const correct = session.attempts.filter((a) => a.isCorrect).length;
    const total = session.attempts.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
    const totalTimeMs = session.attempts.reduce((sum, a) => sum + a.duration, 0);
    const totalMinutes = Math.round(totalTimeMs / 60000);
    const flaggedAttempts = session.attempts.filter((a) => a.flagged);
    const flaggedQuestions = flaggedAttempts.map((a) => session.questions.find((q) => q.id === a.questionId)).filter((q): q is QuestionData => !!q);
    return { correct, total, percentage, totalMinutes, flaggedQuestions };
  }, [session]);

  const handleEndSession = async () => {
    if (!sessionId) return;
    setEnding(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to end session');
      setEnded(true);
    } catch { setError('Failed to end session'); }
    finally { setEnding(false); setDialogOpen(false); }
  };

  if (loading) return (<div className="flex items-center justify-center min-h-[60vh]" data-testid="review-loading"><M3CircularProgress indeterminate size={48} /></div>);
  if (error || !session || !stats) return (<div className="p-4 text-center text-red-600" data-testid="review-error">{error ?? 'Session not found'}</div>);

  return (
    <div className="flex flex-col gap-4 p-4 max-w-lg mx-auto" data-testid="review-page">
      <h1 className="text-2xl font-semibold text-gray-900 text-center">Session Review</h1>
      <M3Card variant="outlined" data-testid="score-card">
        <div className="flex flex-col items-center gap-2">
          <span className="text-4xl text-blue-600" data-testid="score-display">{stats.correct} / {stats.total}</span>
          <span className="text-base text-gray-600">{stats.percentage}% correct</span>
        </div>
      </M3Card>
      <M3Card variant="outlined" data-testid="time-card">
        <div className="flex flex-col items-center gap-1">
          <span className="text-xl font-semibold text-gray-900">{stats.totalMinutes} min</span>
          <span className="text-sm text-gray-600">Time spent</span>
        </div>
      </M3Card>
      {stats.flaggedQuestions.length > 0 && (
        <M3Card variant="filled" data-testid="flagged-card">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-900">Flagged Questions ({stats.flaggedQuestions.length})</span>
            <ul className="list-disc list-inside">
              {stats.flaggedQuestions.map((q) => (<li key={q.id} className="text-sm text-gray-600">{q.stem}</li>))}
            </ul>
          </div>
        </M3Card>
      )}
      {!ended ? (
        <M3Button variant="filled" onClick={() => setDialogOpen(true)} data-testid="end-session-button">End Session</M3Button>
      ) : (
        <M3Button variant="filled" onClick={() => navigate('/dashboard')} data-testid="return-dashboard-button">Return to Dashboard</M3Button>
      )}
      <M3Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="End Session"
        actions={<>
          <M3Button variant="text" onClick={() => setDialogOpen(false)}>Cancel</M3Button>
          <M3Button variant="filled" onClick={handleEndSession} disabled={ending} data-testid="confirm-end-button">{ending ? 'Ending…' : 'Confirm'}</M3Button>
        </>}>
        <p>Are you sure you want to end this session? This action cannot be undone.</p>
      </M3Dialog>
    </div>
  );
}
