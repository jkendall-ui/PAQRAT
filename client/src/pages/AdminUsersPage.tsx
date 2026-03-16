import { useEffect, useState, useCallback } from 'react';
import { M3Card } from '../components/m3/M3Card';
import { M3Button } from '../components/m3/M3Button';
import { M3Dialog } from '../components/m3/M3Dialog';
import { M3CircularProgress } from '../components/m3/M3CircularProgress';
import { useAuth } from '../context/AuthContext';

interface AdminUser { id: string; name: string; email: string; createdAt: string; plan: string; lastActive: string; blocked?: boolean; }

export function AdminUsersPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blockTarget, setBlockTarget] = useState<AdminUser | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data.users);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unknown error'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleBlockToggle() {
    if (!blockTarget) return;
    const newBlocked = !blockTarget.blocked;
    try {
      const res = await fetch(`/api/admin/users/${blockTarget.id}/block`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocked: newBlocked }),
      });
      if (!res.ok) throw new Error('Failed to update user');
      setUsers(prev => prev.map(u => u.id === blockTarget.id ? { ...u, blocked: newBlocked } : u));
    } catch { /* silently fail */ }
    finally { setBlockTarget(null); }
  }

  if (loading) return (<div className="flex items-center justify-center p-8" data-testid="admin-users-loading"><M3CircularProgress /></div>);
  if (error) return <div className="p-4 text-red-600" data-testid="admin-users-error">{error}</div>;

  return (
    <div className="p-4 space-y-4" data-testid="admin-users">
      <h1 className="text-2xl font-semibold text-gray-900">User Management</h1>
      <div className="space-y-2" data-testid="user-list">
        {users.map(user => (
          <M3Card key={user.id} variant="outlined" data-testid={`user-row-${user.id}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm font-medium text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">{user.email}</p>
                <p className="text-xs text-gray-500">
                  Joined: {new Date(user.createdAt).toLocaleDateString()} · Plan: {user.plan} · Last active: {new Date(user.lastActive).toLocaleDateString()}
                </p>
              </div>
              <M3Button variant={user.blocked ? 'filled' : 'outlined'} onClick={() => setBlockTarget(user)} data-testid={`block-btn-${user.id}`}>
                {user.blocked ? 'Unblock' : 'Block'}
              </M3Button>
            </div>
          </M3Card>
        ))}
      </div>
      <M3Dialog open={!!blockTarget} onClose={() => setBlockTarget(null)} title={blockTarget?.blocked ? 'Unblock User' : 'Block User'}
        actions={<>
          <M3Button variant="text" onClick={() => setBlockTarget(null)}>Cancel</M3Button>
          <M3Button variant="filled" onClick={handleBlockToggle} data-testid="confirm-block">{blockTarget?.blocked ? 'Unblock' : 'Block'}</M3Button>
        </>}>
        <p>Are you sure you want to {blockTarget?.blocked ? 'unblock' : 'block'} {blockTarget?.name}?</p>
      </M3Dialog>
    </div>
  );
}
