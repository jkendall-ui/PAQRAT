import { useState, useRef } from 'react';
import { M3Card } from '../components/m3/M3Card';
import { M3Button } from '../components/m3/M3Button';
import { useAuth } from '../context/AuthContext';

export function AdminImportPage() {
  const { token } = useAuth();
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const questionFileRef = useRef<HTMLInputElement>(null);
  const caseFileRef = useRef<HTMLInputElement>(null);

  async function handleImport(type: 'questions' | 'cases', file: File) {
    setImportErrors([]); setImportSuccess(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const url = type === 'questions' ? '/api/admin/questions/import' : '/api/admin/cases/import';
      const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(json) });
      if (!res.ok) { const data = await res.json(); setImportErrors(data.error?.details ?? [data.error?.message ?? 'Import failed']); return; }
      setImportSuccess(`${type === 'questions' ? 'Questions' : 'Cases'} imported successfully`);
    } catch (err) { setImportErrors([err instanceof Error ? err.message : 'Invalid JSON file']); }
  }

  async function handleExport(type: 'questions' | 'cases') {
    const url = type === 'questions' ? '/api/admin/questions/export' : '/api/admin/cases/export';
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${type}-export.json`; a.click(); URL.revokeObjectURL(a.href);
    } catch { setImportErrors(['Export failed']); }
  }

  function onFileChange(type: 'questions' | 'cases', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (file) handleImport(type, file);
  }

  return (
    <div className="p-4 space-y-4" data-testid="admin-import">
      <h1 className="text-2xl font-semibold text-gray-900">Import / Export</h1>
      <M3Card variant="outlined">
        <h2 className="text-base font-medium text-gray-900 mb-3">Questions</h2>
        <div className="flex gap-2 flex-wrap">
          <input ref={questionFileRef} type="file" accept=".json" className="hidden" data-testid="question-file-input" onChange={e => onFileChange('questions', e)} />
          <M3Button variant="filled" onClick={() => questionFileRef.current?.click()} data-testid="import-questions-btn">Import Questions</M3Button>
          <M3Button variant="outlined" onClick={() => handleExport('questions')} data-testid="export-questions-btn">Export Questions</M3Button>
        </div>
      </M3Card>
      <M3Card variant="outlined">
        <h2 className="text-base font-medium text-gray-900 mb-3">Cases</h2>
        <div className="flex gap-2 flex-wrap">
          <input ref={caseFileRef} type="file" accept=".json" className="hidden" data-testid="case-file-input" onChange={e => onFileChange('cases', e)} />
          <M3Button variant="filled" onClick={() => caseFileRef.current?.click()} data-testid="import-cases-btn">Import Cases</M3Button>
          <M3Button variant="outlined" onClick={() => handleExport('cases')} data-testid="export-cases-btn">Export Cases</M3Button>
        </div>
      </M3Card>
      {importSuccess && (<div className="p-3 rounded-md bg-green-50 text-green-800" data-testid="import-success">{importSuccess}</div>)}
      {importErrors.length > 0 && (<div className="p-3 rounded-md bg-red-50 text-red-800 space-y-1" data-testid="import-errors">{importErrors.map((err, i) => (<p key={i}>{err}</p>))}</div>)}
    </div>
  );
}
