import { useEffect, useState } from 'react';
import { M3Card } from '../components/m3/M3Card';
import { M3CircularProgress } from '../components/m3/M3CircularProgress';
import { useAuth } from '../context/AuthContext';

interface AdminReports { activeUsers: number; sessionCount: number; attemptVolume: number; }

export function AdminDashboard() {
  const { token } = useAuth();
  const [reports, setReports] = useState<AdminReports | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReports() {
      try {
        const res = await fetch('/api/admin/reports', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Failed to fetch reports');
        setReports(await res.json());
      } catch (err) { setError(err instanceof Error ? err.message : 'Unknown error'); }
      finally { setLoading(false); }
    }
    fetchReports();
  }, [token]);

  if (loading) return (<div className="flex items-center justify-center p-8" data-testid="admin-dashboard-loading"><M3CircularProgress /></div>);
  if (error) return <div className="p-4 text-red-600" data-testid="admin-dashboard-error">{error}</div>;

  return (
    <div className="p-4 space-y-4" data-testid="admin-dashboard">
      <h1 className="text-2xl font-semibold text-gray-900">Admin Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="admin-reports">
        <M3Card variant="elevated">
          <p className="text-xs font-medium text-gray-500">Active Users</p>
          <p className="text-3xl font-bold text-gray-900" data-testid="active-users">{reports?.activeUsers ?? 0}</p>
        </M3Card>
        <M3Card variant="elevated">
          <p className="text-xs font-medium text-gray-500">Sessions</p>
          <p className="text-3xl font-bold text-gray-900" data-testid="session-count">{reports?.sessionCount ?? 0}</p>
        </M3Card>
        <M3Card variant="elevated">
          <p className="text-xs font-medium text-gray-500">Attempts</p>
          <p className="text-3xl font-bold text-gray-900" data-testid="attempt-volume">{reports?.attemptVolume ?? 0}</p>
        </M3Card>
      </div>
    </div>
  );
}
