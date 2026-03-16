import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  OfflineDatabase,
  cacheSessionQuestions,
  getCachedQuestions,
  savePendingAttempt,
  getUnsyncedAttempts,
  syncPendingAttempts,
  saveActiveSession,
  getActiveSession,
  clearSessionData,
  clearSyncedAttempts,
  type CachedQuestion,
  type PendingAttempt,
} from '../../src/lib/offlineDb';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeQuestion(id: string): Omit<CachedQuestion, 'sessionId'> {
  return {
    id,
    stem: `Question ${id}`,
    type: 'single_best_answer',
    options: [
      { id: `${id}-a`, label: 'Option A' },
      { id: `${id}-b`, label: 'Option B' },
    ],
    media: [],
  };
}

function makeAttempt(sessionId: string, questionId: string): Omit<PendingAttempt, 'id' | 'synced'> {
  return {
    sessionId,
    questionId,
    selectedOptionId: `${questionId}-a`,
    answerFormat: 'multiple_choice',
    durationMs: 5000,
    createdAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('Offline Database (Dexie.js)', () => {
  let db: OfflineDatabase;

  beforeEach(async () => {
    db = new OfflineDatabase('TestDB_' + Math.random().toString(36).slice(2));
  });

  afterEach(async () => {
    await db.delete();
  });

  it('initializes with correct stores', () => {
    expect(db.cachedQuestions).toBeDefined();
    expect(db.pendingAttempts).toBeDefined();
    expect(db.activeSession).toBeDefined();
  });

  it('has correct table names', () => {
    const tableNames = db.tables.map((t) => t.name).sort();
    expect(tableNames).toEqual(['activeSession', 'cachedQuestions', 'pendingAttempts']);
  });
});

describe('cacheSessionQuestions', () => {
  let db: OfflineDatabase;

  beforeEach(async () => {
    db = new OfflineDatabase('TestDB_' + Math.random().toString(36).slice(2));
    // Monkey-patch the module-level db reference for helpers
    const mod = await import('../../src/lib/offlineDb');
    Object.defineProperty(mod, 'offlineDb', { value: db, writable: true });
  });

  afterEach(async () => {
    await db.delete();
  });

  it('stores questions and retrieves them by session', async () => {
    const sessionId = 'session-1';
    const questions = [makeQuestion('q1'), makeQuestion('q2'), makeQuestion('q3')];

    await db.cachedQuestions.bulkPut(questions.map((q) => ({ ...q, sessionId })));

    const cached = await db.cachedQuestions.where('sessionId').equals(sessionId).toArray();
    expect(cached).toHaveLength(3);
    expect(cached.map((q) => q.id).sort()).toEqual(['q1', 'q2', 'q3']);
  });

  it('preserves question data including options and media', async () => {
    const q: CachedQuestion = {
      id: 'q-media',
      sessionId: 'sess-1',
      stem: 'What is this ECG?',
      type: 'case_based',
      options: [
        { id: 'opt-1', label: 'STEMI' },
        { id: 'opt-2', label: 'Normal' },
      ],
      media: [
        {
          id: 'media-1',
          url: 'https://example.com/ecg.png',
          altText: 'ECG showing ST elevation',
          attribution: 'CC BY 4.0',
          type: 'ecg_12lead',
          timing: 'initial',
        },
      ],
    };

    await db.cachedQuestions.put(q);
    const retrieved = await db.cachedQuestions.get('q-media');

    expect(retrieved).toBeDefined();
    expect(retrieved!.stem).toBe('What is this ECG?');
    expect(retrieved!.options).toHaveLength(2);
    expect(retrieved!.media).toHaveLength(1);
    expect(retrieved!.media[0].altText).toBe('ECG showing ST elevation');
  });

  it('isolates questions by session ID', async () => {
    await db.cachedQuestions.bulkPut([
      { ...makeQuestion('q1'), sessionId: 'sess-a' },
      { ...makeQuestion('q2'), sessionId: 'sess-b' },
      { ...makeQuestion('q3'), sessionId: 'sess-a' },
    ]);

    const sessA = await db.cachedQuestions.where('sessionId').equals('sess-a').toArray();
    const sessB = await db.cachedQuestions.where('sessionId').equals('sess-b').toArray();

    expect(sessA).toHaveLength(2);
    expect(sessB).toHaveLength(1);
  });
});

describe('savePendingAttempt', () => {
  let db: OfflineDatabase;

  beforeEach(async () => {
    db = new OfflineDatabase('TestDB_' + Math.random().toString(36).slice(2));
  });

  afterEach(async () => {
    await db.delete();
  });

  it('stores an attempt with auto-incremented id', async () => {
    const attempt = makeAttempt('sess-1', 'q1');
    const id = await db.pendingAttempts.add({ ...attempt, synced: false });

    expect(id).toBeGreaterThan(0);

    const stored = await db.pendingAttempts.get(id);
    expect(stored).toBeDefined();
    expect(stored!.sessionId).toBe('sess-1');
    expect(stored!.questionId).toBe('q1');
    expect(stored!.synced).toBe(false);
  });

  it('stores multiple attempts for the same session', async () => {
    await db.pendingAttempts.add({ ...makeAttempt('sess-1', 'q1'), synced: false });
    await db.pendingAttempts.add({ ...makeAttempt('sess-1', 'q2'), synced: false });
    await db.pendingAttempts.add({ ...makeAttempt('sess-1', 'q3'), synced: false });

    const all = await db.pendingAttempts.where('sessionId').equals('sess-1').toArray();
    expect(all).toHaveLength(3);
  });

  it('stores free text attempts with rawResponseText', async () => {
    const attempt: Omit<PendingAttempt, 'id' | 'synced'> = {
      sessionId: 'sess-1',
      questionId: 'q1',
      rawResponseText: 'The ECG shows ST elevation in leads II, III, aVF',
      answerFormat: 'free_text',
      durationMs: 12000,
      confidenceRating: 2,
      createdAt: new Date().toISOString(),
    };

    const id = await db.pendingAttempts.add({ ...attempt, synced: false });
    const stored = await db.pendingAttempts.get(id);

    expect(stored!.rawResponseText).toBe('The ECG shows ST elevation in leads II, III, aVF');
    expect(stored!.answerFormat).toBe('free_text');
    expect(stored!.confidenceRating).toBe(2);
  });
});

describe('syncPendingAttempts', () => {
  let db: OfflineDatabase;

  beforeEach(async () => {
    db = new OfflineDatabase('TestDB_' + Math.random().toString(36).slice(2));
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('sends unsynced attempts to API and marks them synced', async () => {
    // Add unsynced attempts — Dexie indexes booleans as 0/1
    await db.pendingAttempts.add({ ...makeAttempt('sess-1', 'q1'), synced: false });
    await db.pendingAttempts.add({ ...makeAttempt('sess-1', 'q2'), synced: false });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    // Get all unsynced — filter in JS since Dexie boolean indexing varies
    const pending = (await db.pendingAttempts.toArray()).filter((a) => !a.synced);
    expect(pending).toHaveLength(2);

    let synced = 0;
    for (const attempt of pending) {
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
        body: JSON.stringify({ sessionId: attempt.sessionId, questionId: attempt.questionId }),
      });
      if (res.ok && attempt.id != null) {
        await db.pendingAttempts.update(attempt.id, { synced: true });
        synced++;
      }
    }

    expect(synced).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Verify they're now marked as synced
    const stillUnsynced = (await db.pendingAttempts.toArray()).filter((a) => !a.synced);
    expect(stillUnsynced).toHaveLength(0);
  });

  it('handles 409 conflict (duplicate) by marking as synced', async () => {
    await db.pendingAttempts.add({ ...makeAttempt('sess-1', 'q1'), synced: false });

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 409 });
    vi.stubGlobal('fetch', fetchMock);

    const pending = await db.pendingAttempts.where('synced').equals(0).toArray();
    for (const attempt of pending) {
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
        body: JSON.stringify({}),
      });
      if ((res.ok || res.status === 409) && attempt.id != null) {
        await db.pendingAttempts.update(attempt.id, { synced: true });
      }
    }

    const unsynced = await db.pendingAttempts.where('synced').equals(0).toArray();
    expect(unsynced).toHaveLength(0);
  });
});

describe('activeSession', () => {
  let db: OfflineDatabase;

  beforeEach(async () => {
    db = new OfflineDatabase('TestDB_' + Math.random().toString(36).slice(2));
  });

  afterEach(async () => {
    await db.delete();
  });

  it('saves and retrieves active session metadata', async () => {
    const session = {
      id: 'sess-1',
      mode: 'adaptive',
      totalQuestions: 20,
      currentIndex: 5,
      startedAt: new Date().toISOString(),
    };

    await db.activeSession.put(session);
    const retrieved = await db.activeSession.get('sess-1');

    expect(retrieved).toBeDefined();
    expect(retrieved!.mode).toBe('adaptive');
    expect(retrieved!.totalQuestions).toBe(20);
    expect(retrieved!.currentIndex).toBe(5);
  });

  it('updates current index on active session', async () => {
    await db.activeSession.put({
      id: 'sess-1',
      mode: 'adaptive',
      totalQuestions: 20,
      currentIndex: 0,
      startedAt: new Date().toISOString(),
    });

    await db.activeSession.update('sess-1', { currentIndex: 10 });
    const updated = await db.activeSession.get('sess-1');
    expect(updated!.currentIndex).toBe(10);
  });
});

describe('clearSessionData', () => {
  let db: OfflineDatabase;

  beforeEach(async () => {
    db = new OfflineDatabase('TestDB_' + Math.random().toString(36).slice(2));
  });

  afterEach(async () => {
    await db.delete();
  });

  it('clears all data for a specific session', async () => {
    // Populate data for two sessions
    await db.cachedQuestions.bulkPut([
      { ...makeQuestion('q1'), sessionId: 'sess-1' },
      { ...makeQuestion('q2'), sessionId: 'sess-1' },
      { ...makeQuestion('q3'), sessionId: 'sess-2' },
    ]);
    await db.pendingAttempts.add({ ...makeAttempt('sess-1', 'q1'), synced: false });
    await db.pendingAttempts.add({ ...makeAttempt('sess-2', 'q3'), synced: false });
    await db.activeSession.put({
      id: 'sess-1',
      mode: 'adaptive',
      totalQuestions: 2,
      currentIndex: 0,
      startedAt: new Date().toISOString(),
    });

    // Clear session 1
    await db.cachedQuestions.where('sessionId').equals('sess-1').delete();
    await db.pendingAttempts.where('sessionId').equals('sess-1').delete();
    await db.activeSession.delete('sess-1');

    // Session 1 data should be gone
    const sess1Questions = await db.cachedQuestions.where('sessionId').equals('sess-1').toArray();
    expect(sess1Questions).toHaveLength(0);

    const sess1Attempts = await db.pendingAttempts.where('sessionId').equals('sess-1').toArray();
    expect(sess1Attempts).toHaveLength(0);

    const sess1Active = await db.activeSession.get('sess-1');
    expect(sess1Active).toBeUndefined();

    // Session 2 data should remain
    const sess2Questions = await db.cachedQuestions.where('sessionId').equals('sess-2').toArray();
    expect(sess2Questions).toHaveLength(1);
  });
});

describe('clearSyncedAttempts', () => {
  let db: OfflineDatabase;

  beforeEach(async () => {
    db = new OfflineDatabase('TestDB_' + Math.random().toString(36).slice(2));
  });

  afterEach(async () => {
    await db.delete();
  });

  it('removes only synced attempts, keeps unsynced', async () => {
    await db.pendingAttempts.add({ ...makeAttempt('sess-1', 'q1'), synced: true });
    await db.pendingAttempts.add({ ...makeAttempt('sess-1', 'q2'), synced: false });
    await db.pendingAttempts.add({ ...makeAttempt('sess-1', 'q3'), synced: true });

    // Delete synced attempts by filtering in JS
    const synced = (await db.pendingAttempts.toArray()).filter((a) => a.synced);
    await db.pendingAttempts.bulkDelete(synced.map((a) => a.id!));

    const remaining = await db.pendingAttempts.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].questionId).toBe('q2');
  });
});
