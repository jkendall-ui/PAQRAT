import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { M3Card, M3Chip, M3SegmentedButton } from '../components/m3';
import { useAuth } from '../context/AuthContext';

interface SubCase { id: string; title: string; questions: unknown[]; }
interface CaseDetail {
  id: string; case_id: string; title: string; clinical_context: string;
  subCases: SubCase[]; tags: Array<{ tag: string }>; clinicalPearls: Array<{ pearl_text: string }>;
  references: Array<{ title: string; url: string }>;
}

export function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const { token } = useAuth();
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSubCase, setActiveSubCase] = useState('');
  const [pearlsOpen, setPearlsOpen] = useState(false);

  const fetchCase = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cases/${caseId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data: CaseDetail = await res.json();
        setCaseData(data);
        if (data.subCases.length > 0) setActiveSubCase(data.subCases[0].id);
      }
    } finally { setLoading(false); }
  }, [caseId, token]);

  useEffect(() => { fetchCase(); }, [fetchCase]);

  if (loading) return (<div className="p-4" data-testid="case-detail-loading"><p className="text-sm text-gray-600">Loading case...</p></div>);
  if (!caseData) return (<div className="p-4"><p className="text-sm text-red-600">Case not found.</p></div>);

  const subCaseTabOptions = caseData.subCases.map((sc) => ({ value: sc.id, label: sc.title }));

  return (
    <div className="p-4 space-y-4" data-testid="case-detail-page">
      <h1 className="text-xl font-semibold text-gray-900" data-testid="case-title">{caseData.title}</h1>
      <M3Card variant="outlined">
        <h2 className="text-base font-medium text-gray-900 mb-2">Clinical Context</h2>
        <p className="text-base text-gray-900" data-testid="clinical-context">{caseData.clinical_context}</p>
      </M3Card>
      {caseData.tags.length > 0 && (
        <div className="flex gap-2 flex-wrap" data-testid="case-tags">
          {caseData.tags.map((t, i) => (<M3Chip key={i} variant="input">{t.tag}</M3Chip>))}
        </div>
      )}
      {subCaseTabOptions.length > 0 && (
        <div className="space-y-3">
          <M3SegmentedButton options={subCaseTabOptions} value={activeSubCase} onChange={setActiveSubCase} className="w-full" />
          {caseData.subCases.filter((sc) => sc.id === activeSubCase).map((sc) => (
            <M3Card key={sc.id} variant="outlined" data-testid="sub-case-content">
              <h3 className="text-base font-medium text-gray-900">{sc.title}</h3>
              <p className="text-sm text-gray-600">{sc.questions.length} question{sc.questions.length !== 1 ? 's' : ''}</p>
            </M3Card>
          ))}
        </div>
      )}
      {caseData.clinicalPearls.length > 0 && (
        <div data-testid="clinical-pearls-panel">
          <button className="text-base font-medium text-blue-600 flex items-center gap-2" onClick={() => setPearlsOpen(!pearlsOpen)} data-testid="pearls-toggle">
            <span>{pearlsOpen ? '▼' : '▶'}</span>
            Clinical Pearls ({caseData.clinicalPearls.length})
          </button>
          {pearlsOpen && (
            <div className="mt-2 space-y-2">
              {caseData.clinicalPearls.map((p, i) => (<M3Card key={i} variant="filled"><p className="text-sm text-gray-900">{p.pearl_text}</p></M3Card>))}
            </div>
          )}
        </div>
      )}
      {caseData.references.length > 0 && (
        <div data-testid="case-references">
          <h2 className="text-base font-medium text-gray-900 mb-2">References</h2>
          <ul className="space-y-1">
            {caseData.references.map((r, i) => (
              <li key={i}><a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline">{r.title}</a></li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex gap-2 flex-wrap" data-testid="ai-actions">
        <M3Chip variant="assist">Review similar cases</M3Chip>
        <M3Chip variant="assist">Generate practice questions</M3Chip>
      </div>
    </div>
  );
}
