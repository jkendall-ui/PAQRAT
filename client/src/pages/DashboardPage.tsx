import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { M3Card } from '../components/m3/M3Card';
import { M3FAB } from '../components/m3/M3FAB';
import { M3CircularProgress } from '../components/m3/M3CircularProgress';

interface TopicScore { categoryId: string; categoryName: string; elo: number; masteryLevel: string; }
interface ScoresData { readinessScore: number; topicScores: TopicScore[]; }
interface Gap { categoryId: string; categoryName: string; reason: string; }
interface GapsData { gaps: Gap[]; }
interface StreakData { currentStreak: number; longestStreak: number; lastStudyDate: string | null; }

function getGaugeColor(score: number): string {
  if (score < 40) return '#de350b';
  if (score <= 70) return '#ff991f';
  return '#0065ff';
}

function ReadinessGauge({ score }: { score: number }) {
  const size = 180;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference - (clamped / 100) * circumference;
  const color = getGaugeColor(clamped);

  return (
    <div className="flex flex-col items-center gap-2" data-testid="readiness-gauge">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Readiness score: ${clamped} out of 100`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#dfe1e6" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} className="transition-all duration-300" />
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" fill={color}
          style={{ fontSize: '40px', fontWeight: 700 }}>{clamped}</text>
      </svg>
      <span className="text-sm font-medium text-gray-600">Readiness Score</span>
    </div>
  );
}

function FocusCards({ gaps }: { gaps: Gap[] }) {
  const top3 = gaps.slice(0, 3);
  if (top3.length === 0) {
    return (
      <div data-testid="focus-cards">
        <h2 className="text-base font-medium text-gray-900 mb-3">Today's Focus</h2>
        <p className="text-sm text-gray-600">No focus areas identified yet. Keep studying!</p>
      </div>
    );
  }
  return (
    <div data-testid="focus-cards">
      <h2 className="text-base font-medium text-gray-900 mb-3">Today's Focus</h2>
      <div className="grid gap-3">
        {top3.map((gap) => (
          <M3Card key={gap.categoryId} variant="filled">
            <p className="text-sm font-medium text-gray-900">{gap.categoryName}</p>
            <p className="text-xs text-gray-600 mt-1">{gap.reason}</p>
          </M3Card>
        ))}
      </div>
    </div>
  );
}

function StreakCounter({ streak }: { streak: StreakData }) {
  return (
    <div className="flex items-center gap-2" data-testid="streak-counter">
      <span className="text-[28px]" role="img" aria-label="fire">🔥</span>
      <div>
        <span className="text-xl font-semibold text-gray-900">{streak.currentStreak}</span>
        <span className="text-sm text-gray-600 ml-1">day streak</span>
      </div>
    </div>
  );
}

function ExamCountdown({ daysRemaining }: { daysRemaining: number | null }) {
  if (daysRemaining === null) return null;
  return (
    <div className="flex items-center gap-2" data-testid="exam-countdown">
      <span className="text-[28px]" role="img" aria-label="calendar">📅</span>
      <div>
        <span className="text-xl font-semibold text-gray-900">{daysRemaining}</span>
        <span className="text-sm text-gray-600 ml-1">days until exam</span>
      </div>
    </div>
  );
}

async function fetchWithAuth(url: string, token: string | null) {
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.json();
}

export function DashboardPage() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const scoresQuery = useQuery<ScoresData>({ queryKey: ['progress', 'scores'], queryFn: () => fetchWithAuth('/api/progress/scores', token) });
  const gapsQuery = useQuery<GapsData>({ queryKey: ['progress', 'gaps'], queryFn: () => fetchWithAuth('/api/progress/gaps', token) });
  const streakQuery = useQuery<StreakData>({ queryKey: ['progress', 'streak'], queryFn: () => fetchWithAuth('/api/progress/streak', token) });

  const isLoading = scoresQuery.isLoading || gapsQuery.isLoading || streakQuery.isLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" data-testid="dashboard-loading">
        <M3CircularProgress indeterminate size={48} />
      </div>
    );
  }

  const readinessScore = scoresQuery.data?.readinessScore ?? 0;
  const gaps = gapsQuery.data?.gaps ?? [];
  const streak = streakQuery.data ?? { currentStreak: 0, longestStreak: 0, lastStudyDate: null };
  const examDaysRemaining: number | null = null;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2 flex justify-center py-4">
          <ReadinessGauge score={readinessScore} />
        </div>
        <div className="md:col-span-1"><FocusCards gaps={gaps} /></div>
        <div className="md:col-span-1 flex flex-col gap-4">
          <M3Card variant="filled"><StreakCounter streak={streak} /></M3Card>
          <ExamCountdown daysRemaining={examDaysRemaining} />
        </div>
      </div>
      <M3FAB icon={<span>▶</span>} label="Start Adaptive Session"
        className="fixed bottom-24 right-4 md:bottom-8 md:right-8 z-10"
        onClick={() => navigate('/study')} data-testid="start-session-fab" />
    </div>
  );
}
