import Dexie, { type Table } from 'dexie';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CachedQuestion {
  id: string;
  sessionId: string;
  stem: string;
  type: string;
  options: { id: string; label: string }[];
  media: {
    id: string;
    url: string;
    altText: string;
    attribution: string;
    type: string;
    timing?: string;
  }[];
}

export interface PendingAttempt {
  id?: number; // auto-incremented
  sessionId: string;
  questionId: string;
  selectedOptionId?: string;
  rawResponseText?: string;
  answerFormat: string;
  durationMs: number;
  confidenceRating?: number;
  createdAt: string; // ISO timestamp
  synced?: boolean;
}

export interface ActiveSession {
  id: string; // session ID — only one active session at a time
  mode: string;
  totalQuestions: number;
  currentIndex: number;
  startedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Database                                                           */
/* ------------------------------------------------------------------ */

export class OfflineDatabase extends Dexie {
  cachedQuestions!: Table<CachedQuestion, string>;
  pendingAttempts!: Table<PendingAttempt, number>;
  activeSession!: Table<ActiveSession, string>;

  constructor(dbName = 'PAExamPrepOffline') {
    super(dbName);
    this.version(1).stores({
      cachedQuestions: 'id, sessionId',
      pendingAttempts: '++id, sessionId, synced',
      activeSession: 'id',
    });
  }
}

export const offlineDb = new OfflineDatabase();

/* ------------------------------------------------------------------ */
/*  Helper functions                                                   */
/* ------------------------------------------------------------------ */

/**
 * Cache a set of questions for a study session so they're available offline.
 */
export async function cacheSessionQuestions(
  sessionId: string,
  questions: Omit<CachedQuestion, 'sessionId'>[],
): Promise<void> {
  const records = questions.map((q) => ({ ...q, sessionId }));
  await offlineDb.cachedQuestions.bulkPut(records);
}

/**
 * Retrieve cached questions for a given session.
 */
export async function getCachedQuestions(sessionId: string): Promise<CachedQuestion[]> {
  return offlineDb.cachedQuestions.where('sessionId').equals(sessionId).toArray();
}

/**
 * Save an attempt locally when offline.
 */
export async function savePendingAttempt(attempt: Omit<PendingAttempt, 'id' | 'synced'>): Promise<number> {
  return offlineDb.pendingAttempts.add({ ...attempt, synced: false });
}

/**
 * Get all unsynced pending attempts.
 */
export async function getUnsyncedAttempts(): Promise<PendingAttempt[]> {
  return offlineDb.pendingAttempts.filter((a) => !a.synced).toArray();
}

/**
 * Sync pending attempts to the API. Marks each as synced on success.
 * Returns the count of successfully synced attempts.
 * Handles conflicts (409 duplicate) by marking them as synced.
 */
export async function syncPendingAttempts(
  token: string,
  apiBase = '/api',
): Promise<{ synced: number; failed: number }> {
  const pending = await getUnsyncedAttempts();
  let synced = 0;
  let failed = 0;

  for (const attempt of pending) {
    try {
      const res = await fetch(`${apiBase}/attempts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: attempt.sessionId,
          questionId: attempt.questionId,
          selectedOptionId: attempt.selectedOptionId,
          rawResponseText: attempt.rawResponseText,
          answerFormat: attempt.answerFormat,
          durationMs: attempt.durationMs,
          confidenceRating: attempt.confidenceRating,
        }),
      });

      if (res.ok || res.status === 409) {
        // 409 = duplicate attempt, treat as already synced
        if (attempt.id != null) {
          await offlineDb.pendingAttempts.update(attempt.id, { synced: true });
        }
        synced++;
      } else {
        failed++;
      }
    } catch {
      // Network error — leave as unsynced for next retry
      failed++;
    }
  }

  return { synced, failed };
}

/**
 * Save or update the active session metadata.
 */
export async function saveActiveSession(session: ActiveSession): Promise<void> {
  await offlineDb.activeSession.put(session);
}

/**
 * Get the active session metadata.
 */
export async function getActiveSession(sessionId: string): Promise<ActiveSession | undefined> {
  return offlineDb.activeSession.get(sessionId);
}

/**
 * Clear all cached data for a completed session.
 */
export async function clearSessionData(sessionId: string): Promise<void> {
  await offlineDb.cachedQuestions.where('sessionId').equals(sessionId).delete();
  await offlineDb.pendingAttempts.where('sessionId').equals(sessionId).delete();
  await offlineDb.activeSession.delete(sessionId);
}

/**
 * Clear all synced attempts (cleanup after successful sync).
 */
export async function clearSyncedAttempts(): Promise<void> {
  const synced = await offlineDb.pendingAttempts.filter((a) => !!a.synced).toArray();
  await offlineDb.pendingAttempts.bulkDelete(synced.map((a) => a.id!));
}
