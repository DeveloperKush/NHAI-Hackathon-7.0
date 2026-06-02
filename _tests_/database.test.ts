/**
 * @file database.test.ts
 * Unit tests for the SQLite database layer and AES-256 encryption.
 * Uses an in-memory mock of expo-sqlite and react-native-encrypted-storage.
 */

import { initDatabase } from '../src/services/database/sqlite';
import {
  insertEnrolledFace,
  getAllEnrolledFaces,
  deleteEnrolledFace,
} from '../src/services/database/enrolledFaces';
import {
  insertAuthLog,
  getUnsyncedLogs,
  deleteSyncedLogs,
} from '../src/services/database/authLogs';
import { AuthLog } from '../src/types';

// ─── In-memory SQLite mock ────────────────────────────────────────────────────

const tables: {
  enrolled_faces: Record<string, { user_id: string; embedding: string; enrolled_at: string }>;
  auth_logs: Record<string, {
    log_id: string; user_id: string; timestamp: string;
    gps_lat: number | null; gps_lng: number | null;
    device_id: string; similarity_score: number; photo_thumb: string; synced: number;
  }>;
} = { enrolled_faces: {}, auth_logs: {} };

jest.mock('expo-sqlite', () => ({
  openDatabase: jest.fn(() => ({
    transaction(
      cb: (tx: any) => void,
      _err?: (e: any) => void,
      ok?: () => void
    ) {
      const tx = {
        executeSql(
          sql: string,
          params: any[] = [],
          success?: (tx: any, r: any) => void,
          _fail?: (tx: any, e: any) => boolean
        ) {
          const s = sql.trim().replace(/\s+/g, ' ');
          let rows: any[] = [];
          let rowsAffected = 0;

          if (s.startsWith('CREATE TABLE')) {
            /* no-op */
          } else if (s.startsWith('INSERT OR REPLACE INTO enrolled_faces')) {
            const [uid, emb, at] = params;
            tables.enrolled_faces[uid] = { user_id: uid, embedding: emb, enrolled_at: at };
            rowsAffected = 1;
          } else if (s.startsWith('SELECT user_id, embedding FROM enrolled_faces')) {
            rows = Object.values(tables.enrolled_faces);
          } else if (s.startsWith('SELECT COUNT(*)')) {
            rows = [{ n: Object.keys(tables.enrolled_faces).length }];
          } else if (s.startsWith('DELETE FROM enrolled_faces WHERE user_id')) {
            const [uid] = params;
            if (tables.enrolled_faces[uid]) { delete tables.enrolled_faces[uid]; rowsAffected = 1; }
          } else if (s.startsWith('INSERT OR REPLACE INTO auth_logs')) {
            const [id, uid, ts, lat, lng, dev, score, thumb] = params;
            tables.auth_logs[id] = { log_id: id, user_id: uid, timestamp: ts, gps_lat: lat,
              gps_lng: lng, device_id: dev, similarity_score: score, photo_thumb: thumb, synced: 0 };
            rowsAffected = 1;
          } else if (s.includes('FROM auth_logs WHERE synced = 0')) {
            rows = Object.values(tables.auth_logs).filter(r => r.synced === 0);
          } else if (s.includes('FROM auth_logs ORDER BY timestamp DESC')) {
            rows = Object.values(tables.auth_logs).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
          } else if (s.includes('DELETE FROM auth_logs WHERE log_id IN')) {
            params.forEach(id => { if (tables.auth_logs[id]) { delete tables.auth_logs[id]; rowsAffected++; } });
          } else if (s.startsWith('DELETE FROM enrolled_faces') || s.startsWith('DELETE FROM auth_logs')) {
            tables.enrolled_faces = {};
            tables.auth_logs = {};
          }

          success?.({}, {
            rowsAffected,
            rows: { length: rows.length, item: (i: number) => rows[i], _array: rows },
          });
        },
      };
      cb(tx);
      ok?.();
    },
  })),
}));

// ─── EncryptedStorage mock (persists across a test, cleared in afterEach) ────

const secureStore: Record<string, string> = {};

jest.mock('react-native-encrypted-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn((k: string, v: string) => { secureStore[k] = v; return Promise.resolve(); }),
    getItem: jest.fn((k: string) => Promise.resolve(secureStore[k] ?? null)),
    removeItem: jest.fn((k: string) => { delete secureStore[k]; return Promise.resolve(); }),
    clear: jest.fn(() => { Object.keys(secureStore).forEach(k => delete secureStore[k]); return Promise.resolve(); }),
  },
}));

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  tables.enrolled_faces = {};
  tables.auth_logs = {};
  // Clear encryption key cache so each test gets a fresh key
  const { clearCachedKey } = require('../src/services/encryption/secureStorage');
  clearCachedKey();
});

// ─── enrolled_faces ───────────────────────────────────────────────────────────

describe('enrolled_faces table', () => {
  test('insert → retrieve: embedding survives AES-256 round-trip', async () => {
    const userId = 'worker_001';
    const emb = new Float32Array(512);
    for (let i = 0; i < 512; i++) emb[i] = Math.sin(i) * 0.5 + 0.5;

    await insertEnrolledFace(userId, emb);

    const faces = await getAllEnrolledFaces();
    expect(faces).toHaveLength(1);
    expect(faces[0].user_id).toBe(userId);
    expect(faces[0].embedding).toHaveLength(512);

    // Values should be preserved to float32 precision
    for (let i = 0; i < 512; i++) {
      expect(faces[0].embedding[i]).toBeCloseTo(emb[i], 5);
    }
  });

  test('insert duplicate user_id replaces existing embedding (OR REPLACE)', async () => {
    const userId = 'worker_dup';
    const emb1 = new Float32Array(512).fill(0.1);
    const emb2 = new Float32Array(512).fill(0.9);

    await insertEnrolledFace(userId, emb1);
    await insertEnrolledFace(userId, emb2);

    const faces = await getAllEnrolledFaces();
    expect(faces).toHaveLength(1);
    expect(faces[0].embedding[0]).toBeCloseTo(0.9, 5);
  });

  test('getAllEnrolledFaces returns empty array when no faces enrolled', async () => {
    const faces = await getAllEnrolledFaces();
    expect(faces).toHaveLength(0);
  });

  test('delete removes the entry and leaves rest intact', async () => {
    await insertEnrolledFace('a', new Float32Array(512).fill(0.1));
    await insertEnrolledFace('b', new Float32Array(512).fill(0.2));

    await deleteEnrolledFace('a');

    const faces = await getAllEnrolledFaces();
    expect(faces).toHaveLength(1);
    expect(faces[0].user_id).toBe('b');
  });

  test('getAllEnrolledFaces skips rows with corrupted embeddings (no throw)', async () => {
    // Manually inject a bad row
    tables.enrolled_faces['bad_user'] = {
      user_id: 'bad_user',
      embedding: 'NOT_VALID_CIPHERTEXT###',
      enrolled_at: new Date().toISOString(),
    };

    // Should not throw — just skip the corrupted row
    const faces = await getAllEnrolledFaces();
    const ids = faces.map(f => f.user_id);
    expect(ids).not.toContain('bad_user');
  });
});

// ─── auth_logs table ─────────────────────────────────────────────────────────

describe('auth_logs table', () => {
  const makeLog = (overrides?: Partial<AuthLog>): AuthLog => ({
    log_id: 'log-abc-123',
    user_id: 'worker_001',
    timestamp: '2026-06-02T10:00:00.000Z',
    gps_lat: 28.6139,
    gps_lng: 77.2090,
    device_id: 'device-xyz',
    similarity_score: 0.88,
    photo_thumb: 'base64thumb',
    ...overrides,
  });

  test('insert → getUnsyncedLogs returns the log with all fields', async () => {
    const log = makeLog();
    await insertAuthLog(log);

    const unsynced = await getUnsyncedLogs();
    expect(unsynced).toHaveLength(1);
    expect(unsynced[0].log_id).toBe(log.log_id);
    expect(unsynced[0].user_id).toBe(log.user_id);
    expect(unsynced[0].gps_lat).toBeCloseTo(log.gps_lat!, 4);
    expect(unsynced[0].gps_lng).toBeCloseTo(log.gps_lng!, 4);
    expect(unsynced[0].similarity_score).toBe(log.similarity_score);
    expect(unsynced[0].photo_thumb).toBe(log.photo_thumb);
    expect(unsynced[0].timestamp).toBe(log.timestamp);
  });

  test('insert log with null GPS fields stores nulls correctly', async () => {
    const log = makeLog({ log_id: 'log-no-gps', gps_lat: null, gps_lng: null });
    await insertAuthLog(log);

    const unsynced = await getUnsyncedLogs();
    const found = unsynced.find(l => l.log_id === 'log-no-gps');
    expect(found).toBeDefined();
    expect(found!.gps_lat).toBeNull();
    expect(found!.gps_lng).toBeNull();
  });

  test('deleteSyncedLogs removes only the specified IDs', async () => {
    await insertAuthLog(makeLog({ log_id: 'keep-1' }));
    await insertAuthLog(makeLog({ log_id: 'delete-2' }));
    await insertAuthLog(makeLog({ log_id: 'keep-3' }));

    await deleteSyncedLogs(['delete-2']);

    const remaining = await getUnsyncedLogs();
    const ids = remaining.map(l => l.log_id);
    expect(ids).toContain('keep-1');
    expect(ids).toContain('keep-3');
    expect(ids).not.toContain('delete-2');
  });

  test('deleteSyncedLogs with empty array is a no-op', async () => {
    await insertAuthLog(makeLog({ log_id: 'safe-log' }));
    await deleteSyncedLogs([]);
    const unsynced = await getUnsyncedLogs();
    expect(unsynced).toHaveLength(1);
  });

  test('getUnsyncedLogs returns empty array when all logs are purged', async () => {
    await insertAuthLog(makeLog({ log_id: 'purge-me' }));
    await deleteSyncedLogs(['purge-me']);
    expect(await getUnsyncedLogs()).toHaveLength(0);
  });

  test('multiple inserts accumulate — all appear in getUnsyncedLogs', async () => {
    for (let i = 0; i < 5; i++) {
      await insertAuthLog(makeLog({ log_id: `log-bulk-${i}` }));
    }
    const unsynced = await getUnsyncedLogs();
    expect(unsynced).toHaveLength(5);
  });
});
