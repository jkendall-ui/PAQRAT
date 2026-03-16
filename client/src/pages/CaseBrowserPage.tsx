import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { M3FilterChip, M3Card } from '../components/m3';
import { useAuth } from '../context/AuthContext';

interface CaseSummary { id: string; case_id: string; title: string; clinical_context: string; primary_topic: string; difficulty: string; }

const sourceTypes = ['NCCPA', 'PAEA', 'Custom'] as const;
const topics = ['Cardiology', 'Pulmonary', 'Gastroenterology', 'Neurology', 'Endocrine'] as const;
const difficulties = ['easy', 'medium', 'hard'] as const;
const boardRelevance = ['high', 'medium', 'low'] as const;
const clinicalUrgency = ['emergent', 'urgent', 'routine'] as const;

export function CaseBrowserPage() {
  const { token } = useAuth();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Record<string, string | null>>({
    source_type: null, primary_topic: null, difficulty: null, board_relevance: null, clinical_urgency: null,
  });

  const toggleFilter = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: prev[key] === value ? null : value }));
  };

  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) { if (v) params.set(k, v); }
      const res = await fetch(`/api/cases?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); setCases(data.cases ?? []); setTotal(data.total ?? 0); }
    } finally { setLoading(false); }
  }, [filters, token]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  return (
    <div className="p-4 space-y-4" data-testid="case-browser-page">
      <h1 className="text-xl font-semibold text-gray-900">Case Browser</h1>
      <div className="space-y-3" data-testid="case-filter-bar">
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 self-center">Source:</span>
          {sourceTypes.map((s) => (<M3FilterChip key={s} selected={filters.source_type === s} onClick={() => toggleFilter('source_type', s)}>{s}</M3FilterChip>))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 self-center">Topic:</span>
          {topics.map((t) => (<M3FilterChip key={t} selected={filters.primary_topic === t} onClick={() => toggleFilter('primary_topic', t)}>{t}</M3FilterChip>))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 self-center">Difficulty:</span>
          {difficulties.map((d) => (<M3FilterChip key={d} selected={filters.difficulty === d} onClick={() => toggleFilter('difficulty', d)}>{d.charAt(0).toUpperCase() + d.slice(1)}</M3FilterChip>))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 self-center">Board:</span>
          {boardRelevance.map((b) => (<M3FilterChip key={b} selected={filters.board_relevance === b} onClick={() => toggleFilter('board_relevance', b)}>{b.charAt(0).toUpperCase() + b.slice(1)}</M3FilterChip>))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 self-center">Urgency:</span>
          {clinicalUrgency.map((u) => (<M3FilterChip key={u} selected={filters.clinical_urgency === u} onClick={() => toggleFilter('clinical_urgency', u)}>{u.charAt(0).toUpperCase() + u.slice(1)}</M3FilterChip>))}
        </div>
      </div>
      <p className="text-xs text-gray-500" data-testid="case-count">{total} matching cases</p>
      {loading && <p className="text-sm text-gray-600">Loading cases...</p>}
      {!loading && (
        <div className="space-y-2" data-testid="case-list">
          {cases.map((c) => (
            <Link key={c.id} to={`/library/cases/${c.id}`} className="block no-underline">
              <M3Card variant="outlined">
                <p className="text-base font-medium text-gray-900">{c.title}</p>
                <p className="text-sm text-gray-600 line-clamp-2">{c.clinical_context}</p>
                <p className="text-xs text-gray-500 mt-1">{c.primary_topic} · {c.difficulty}</p>
              </M3Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
