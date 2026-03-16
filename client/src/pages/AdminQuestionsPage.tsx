import { useEffect, useState, useCallback } from 'react';
import { M3Card } from '../components/m3/M3Card';
import { M3Button } from '../components/m3/M3Button';
import { M3TextField } from '../components/m3/M3TextField';
import { M3Dialog } from '../components/m3/M3Dialog';
import { M3CircularProgress } from '../components/m3/M3CircularProgress';
import { useAuth } from '../context/AuthContext';

interface AdminQuestion { id: string; stem: string; type: string; difficulty: number; categoryName: string; isActive: boolean; }
interface QuestionForm { stem: string; type: string; difficulty: string; categoryId: string; explanation: string; options: string; }
const emptyForm: QuestionForm = { stem: '', type: 'multiple_choice', difficulty: '3', categoryId: '', explanation: '', options: '' };

export function AdminQuestionsPage() {
  const { token } = useAuth();
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<QuestionForm>(emptyForm);
  const [deactivateTarget, setDeactivateTarget] = useState<AdminQuestion | null>(null);

  const fetchQuestions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/questions', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to fetch questions');
      setQuestions((await res.json()).questions);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unknown error'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  function openCreate() { setForm(emptyForm); setEditId(null); setShowForm(true); }
  function openEdit(q: AdminQuestion) {
    setForm({ stem: q.stem, type: q.type, difficulty: String(q.difficulty), categoryId: '', explanation: '', options: '' });
    setEditId(q.id); setShowForm(true);
  }

  async function handleSubmit() {
    const url = editId ? `/api/admin/questions/${editId}` : '/api/admin/questions';
    const method = editId ? 'PATCH' : 'POST';
    try {
      const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stem: form.stem, type: form.type, difficulty: Number(form.difficulty), categoryId: form.categoryId, explanation: form.explanation }) });
      if (!res.ok) throw new Error('Failed to save question');
      setShowForm(false); setLoading(true); fetchQuestions();
    } catch { /* silently fail */ }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    try {
      const res = await fetch(`/api/admin/questions/${deactivateTarget.id}/deactivate`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to deactivate');
      setQuestions(prev => prev.map(q => q.id === deactivateTarget.id ? { ...q, isActive: false } : q));
    } catch { /* silently fail */ }
    finally { setDeactivateTarget(null); }
  }

  function updateForm(field: keyof QuestionForm, value: string) { setForm(prev => ({ ...prev, [field]: value })); }

  if (loading) return (<div className="flex items-center justify-center p-8" data-testid="admin-questions-loading"><M3CircularProgress /></div>);
  if (error) return <div className="p-4 text-red-600" data-testid="admin-questions-error">{error}</div>;

  return (
    <div className="p-4 space-y-4" data-testid="admin-questions">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Question Bank</h1>
        <M3Button variant="filled" onClick={openCreate} data-testid="create-question-btn">Add Question</M3Button>
      </div>
      <div className="space-y-2" data-testid="question-list">
        {questions.map(q => (
          <M3Card key={q.id} variant="outlined" data-testid={`question-row-${q.id}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{q.stem}</p>
                <p className="text-xs text-gray-500">{q.type} · Difficulty: {q.difficulty} · {q.categoryName}{!q.isActive && ' · Inactive'}</p>
              </div>
              <div className="flex gap-2">
                <M3Button variant="text" onClick={() => openEdit(q)} data-testid={`edit-btn-${q.id}`}>Edit</M3Button>
                {q.isActive && (<M3Button variant="outlined" onClick={() => setDeactivateTarget(q)} data-testid={`deactivate-btn-${q.id}`}>Deactivate</M3Button>)}
              </div>
            </div>
          </M3Card>
        ))}
      </div>
      <M3Dialog open={showForm} onClose={() => setShowForm(false)} title={editId ? 'Edit Question' : 'Create Question'}
        actions={<>
          <M3Button variant="text" onClick={() => setShowForm(false)}>Cancel</M3Button>
          <M3Button variant="filled" onClick={handleSubmit} data-testid="save-question-btn">Save</M3Button>
        </>}>
        <div className="space-y-3" data-testid="question-form">
          <M3TextField label="Stem" value={form.stem} onChange={e => updateForm('stem', e.target.value)} />
          <M3TextField label="Type" value={form.type} onChange={e => updateForm('type', e.target.value)} />
          <M3TextField label="Difficulty (1-5)" value={form.difficulty} onChange={e => updateForm('difficulty', e.target.value)} type="number" />
          <M3TextField label="Category ID" value={form.categoryId} onChange={e => updateForm('categoryId', e.target.value)} />
          <M3TextField label="Explanation" value={form.explanation} onChange={e => updateForm('explanation', e.target.value)} />
        </div>
      </M3Dialog>
      <M3Dialog open={!!deactivateTarget} onClose={() => setDeactivateTarget(null)} title="Deactivate Question"
        actions={<>
          <M3Button variant="text" onClick={() => setDeactivateTarget(null)}>Cancel</M3Button>
          <M3Button variant="filled" onClick={handleDeactivate} data-testid="confirm-deactivate">Deactivate</M3Button>
        </>}>
        <p>Are you sure you want to deactivate this question? It will be hidden from students.</p>
      </M3Dialog>
    </div>
  );
}
