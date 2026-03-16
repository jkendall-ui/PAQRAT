import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { M3Card } from '../components/m3/M3Card';
import { M3CircularProgress } from '../components/m3/M3CircularProgress';

type MasteryLevel = 'novice' | 'beginner' | 'intermediate' | 'proficient' | 'expert';
interface HeatmapCategory { categoryId: string; categoryName: string; elo: number; masteryLevel: MasteryLevel; }
interface HeatmapData { categories: HeatmapCategory[]; }
interface TrendPoint { date: string; accuracy: number; attempts: number; }
interface TrendsData { trends: TrendPoint[]; }
interface SummaryData { totalAttempts: number; accuracyRate: number; totalStudyMinutes: number; predictedScoreBand: string; }

async function fetchWithAuth(url: string, token: string | null) {
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.json();
}

const masteryColors: Record<MasteryLevel, { bg: string; text: string; label: string }> = {
  novice:       { bg: 'bg-red-600',    text: 'text-white',    label: 'Novice' },
  beginner:     { bg: 'bg-yellow-500', text: 'text-white',    label: 'Beginner' },
  intermediate: { bg: 'bg-blue-400',   text: 'text-white',    label: 'Intermediate' },
  proficient:   { bg: 'bg-blue-600',   text: 'text-white',    label: 'Proficient' },
  expert:       { bg: 'bg-green-600',  text: 'text-white',    label: 'Expert' },
};

const masteryPatterns: Record<MasteryLevel, string> = {
  novice: '▽', beginner: '○', intermediate: '◇', proficient: '●', expert: '★',
};

function formatStudyTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function HeatmapGrid({ categories, onCategoryTap }: { categories: HeatmapCategory[]; onCategoryTap: (id: string) => void }) {
  return (
    <div data-testid="heatmap-grid">
      <h2 className="text-base font-medium text-gray-900 mb-3">Category Mastery</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {categories.map((cat) => {
          const style = masteryColors[cat.masteryLevel];
          const pattern = masteryPatterns[cat.masteryLevel];
          return (
            <button key={cat.categoryId} data-testid={`heatmap-cell-${cat.categoryId}`}
              className={`${style.bg} ${style.text} rounded-lg p-3 text-left transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer min-h-[72px]`}
              onClick={() => onCategoryTap(cat.categoryId)}
              aria-label={`${cat.categoryName}: ${style.label} level, Elo ${cat.elo}`}>
              <span className="text-sm font-medium block truncate">{cat.categoryName}</span>
              <span className="text-xs block mt-1">{pattern} {style.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AccuracyTrendChart({ trends }: { trends: TrendPoint[] }) {
  if (trends.length === 0) {
    return (
      <div data-testid="accuracy-trend-chart">
        <h2 className="text-base font-medium text-gray-900 mb-3">Accuracy Trend</h2>
        <p className="text-sm text-gray-600">No trend data yet. Complete some sessions to see your progress.</p>
      </div>
    );
  }
  const width = 400; const height = 200;
  const padding = { top: 20, right: 20, bottom: 40, left: 45 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const points = trends.map((t, i) => ({
    x: padding.left + (trends.length === 1 ? chartW / 2 : (i / (trends.length - 1)) * chartW),
    y: padding.top + chartH - (t.accuracy / 100) * chartH, date: t.date, accuracy: t.accuracy,
  }));
  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const labelCount = Math.min(5, trends.length);
  const labelIndices: number[] = [];
  for (let i = 0; i < labelCount; i++) labelIndices.push(Math.round((i / (labelCount - 1 || 1)) * (trends.length - 1)));

  return (
    <div data-testid="accuracy-trend-chart">
      <h2 className="text-base font-medium text-gray-900 mb-3">Accuracy Trend</h2>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[500px]" role="img" aria-label="Accuracy trend over time">
        {[0, 25, 50, 75, 100].map((v) => {
          const y = padding.top + chartH - (v / 100) * chartH;
          return (<g key={v}><line x1={padding.left} y1={y} x2={padding.left + chartW} y2={y} stroke="#dfe1e6" strokeWidth={0.5} />
            <text x={padding.left - 8} y={y + 4} textAnchor="end" fill="#6b778c" fontSize="10">{v}%</text></g>);
        })}
        {labelIndices.map((idx) => (<text key={idx} x={points[idx].x} y={height - 8} textAnchor="middle" fill="#6b778c" fontSize="9">{trends[idx].date}</text>))}
        <polyline points={polylinePoints} fill="none" stroke="#0065ff" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (<circle key={i} cx={p.x} cy={p.y} r={3} fill="#0065ff" />))}
      </svg>
    </div>
  );
}

function AnalyticsSummary({ summary }: { summary: SummaryData }) {
  const cards = [
    { label: 'Total Questions', value: summary.totalAttempts.toLocaleString() },
    { label: 'Accuracy Rate', value: `${Math.round(summary.accuracyRate)}%` },
    { label: 'Study Time', value: formatStudyTime(summary.totalStudyMinutes) },
    { label: 'Predicted PANCE', value: summary.predictedScoreBand },
  ];
  return (
    <div data-testid="analytics-summary">
      <h2 className="text-base font-medium text-gray-900 mb-3">Summary</h2>
      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <M3Card key={card.label} variant="outlined">
            <p className="text-xs font-medium text-gray-500">{card.label}</p>
            <p className="text-xl font-semibold text-gray-900 mt-1">{card.value}</p>
          </M3Card>
        ))}
      </div>
    </div>
  );
}

function CategoryBreakdown({ categories }: { categories: HeatmapCategory[] }) {
  const sorted = [...categories].sort((a, b) => b.elo - a.elo);
  const strongest = sorted.slice(0, 3);
  const weakest = sorted.slice(-3).reverse();
  return (
    <div data-testid="category-breakdown">
      <h2 className="text-base font-medium text-gray-900 mb-3">Strongest &amp; Weakest</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-2">Strongest</p>
          {strongest.map((cat) => (
            <M3Card key={cat.categoryId} variant="outlined" className="mb-2">
              <p className="text-sm font-medium text-gray-900">{cat.categoryName}</p>
              <p className="text-xs text-gray-500">Elo {cat.elo} · {masteryColors[cat.masteryLevel].label}</p>
            </M3Card>
          ))}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500 mb-2">Weakest</p>
          {weakest.map((cat) => (
            <M3Card key={cat.categoryId} variant="outlined" className="mb-2">
              <p className="text-sm font-medium text-gray-900">{cat.categoryName}</p>
              <p className="text-xs text-gray-500">Elo {cat.elo} · {masteryColors[cat.masteryLevel].label}</p>
            </M3Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProgressPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const heatmapQuery = useQuery<HeatmapData>({ queryKey: ['progress', 'heatmap'], queryFn: () => fetchWithAuth('/api/progress/heatmap', token) });
  const trendsQuery = useQuery<TrendsData>({ queryKey: ['analytics', 'trends'], queryFn: () => fetchWithAuth('/api/analytics/trends', token) });
  const summaryQuery = useQuery<SummaryData>({ queryKey: ['analytics', 'summary'], queryFn: () => fetchWithAuth('/api/analytics/summary', token) });
  const isLoading = heatmapQuery.isLoading || trendsQuery.isLoading || summaryQuery.isLoading;

  if (isLoading) return (<div className="flex items-center justify-center min-h-[60vh]" data-testid="progress-loading"><M3CircularProgress indeterminate size={48} /></div>);

  const categories = heatmapQuery.data?.categories ?? [];
  const trends = trendsQuery.data?.trends ?? [];
  const summary = summaryQuery.data ?? { totalAttempts: 0, accuracyRate: 0, totalStudyMinutes: 0, predictedScoreBand: 'N/A' };
  const handleCategoryTap = (categoryId: string) => { navigate(`/progress/category/${categoryId}`); };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Progress</h1>
      <div className="mb-6"><HeatmapGrid categories={categories} onCategoryTap={handleCategoryTap} /></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-6">
          <AnalyticsSummary summary={summary} />
          <CategoryBreakdown categories={categories} />
        </div>
        <div><AccuracyTrendChart trends={trends} /></div>
      </div>
    </div>
  );
}
