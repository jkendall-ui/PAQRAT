import { useEffect, useRef, useCallback, useState } from 'react';
import { syncPendingAttempts, clearSyncedAttempts } from '../lib/offlineDb';

interface UseOfflineSyncOptions {
  token: string | null;
  enabled?: boolean;
}

interface UseOfflineSyncResult {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncResult: { synced: number; failed: number } | null;
  triggerSync: () => Promise<void>;
}

/**
 * Hook that listens for online/offline events and automatically
 * syncs pending attempts when connectivity is restored.
 */
export function useOfflineSync({ token, enabled = true }: UseOfflineSyncOptions): UseOfflineSyncResult {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{ synced: number; failed: number } | null>(null);
  const syncingRef = useRef(false);

  const doSync = useCallback(async () => {
    if (!token || syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);

    try {
      const result = await syncPendingAttempts(token);
      setLastSyncResult(result);
      if (result.synced > 0) {
        await clearSyncedAttempts();
      }
    } catch {
      // Sync failed silently — will retry on next online event
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [token]);

  useEffect(() => {
    if (!enabled) return;

    const handleOnline = () => {
      setIsOnline(true);
      doSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Sync on mount if already online
    if (navigator.onLine && token) {
      doSync();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [enabled, doSync, token]);

  return { isOnline, isSyncing, lastSyncResult, triggerSync: doSync };
}
