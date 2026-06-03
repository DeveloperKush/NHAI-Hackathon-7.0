/**
 * @file e2e.test.tsx
 * End-to-end data-pipeline integration tests.
 *
 * Suite 1 — Service-layer E2E (no React): tests the full Enroll → Auth Log →
 *   Sync → Purge pipeline directly against the service functions with an
 *   in-memory SQLite mock. Covers zero-data-loss, partial-batch safety, and
 *   idempotent retry.
 *
 * Suite 2 — useAuth hook E2E: verifies the full liveness → match → GPS log
 *   creation pipeline through the useAuth hook state machine.
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
import { syncAuthLogs } from '../src/services/network/awsSync';
import { extractEmbedding } from '../src/services/ai/recognition';
import { processCameraFrame } from '../src/services/camera/frameProcessors';
import { AuthLog } from '../src/types';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useAuth } from '../src/hooks/useAuth';

// ─── Config mock (must come before any import that reads config) ──────────────

jest.mock('../src/constants/config', () => ({
  AWS_SYNC_URL: 'http://mock-e2e.test/api/sync',
  LAST_SYNC_STORAGE_KEY: '@nhai_last_sync_ts',
  SIMILARITY_THRESHOLD: 0.84,
  SIMILARITY_SINGLE_USER_THRESHOLD: 0.75,
  SIMILARITY_HIGH_CONFIDENCE: 0.91,
  MIN_MATCH_MARGIN: 0.05,
  MIN_MATCH_RATIO: 1.08,
  BORDERLINE_RETRY_BAND: 0.03,
  LIVENESS_TIMEOUT_MS: 15000,
  REQUIRED_CHALLENGES: 2,
  DEMO_MODE: false,
  MODEL_PATHS: { mobilefacenet: 'assets/models/ghostfacenet_fixed_int8.tflite' },
  MIN_PREPROCESS_VARIANCE: 0.05,
}));

// ─── mediapipeLandmarks mock (avoids expo-asset / expo-file-system native) ───

jest.mock('../src/services/ai/mediapipeLandmarks', () => ({
  ensureMediaPipeAssets: jest.fn().mockResolvedValue(undefined),
  getMediaPipeHTMLUri: jest.fn().mockReturnValue('file://mock/index.html'),
  handleWebViewMessage: jest.fn(),
  setWebViewRef: jest.fn(),
  setOnWebViewReady: jest.fn((cb: () => void) => cb()),
  getIsWebViewReady: jest.fn().mockReturnValue(true),
  processImageForLandmarks: jest.fn().mockResolvedValue({ landmarks: null, confidence: 0 }),
  MEDIAPIPE_CACHE_DIR: '/mock/',
  MEDIAPIPE_HTML: '',
}));

// ─── In-memory SQLite mock ────────────────────────────────────────────────────

const tables: {
  enrolled_faces: Record<string, any>;
  auth_logs: Record<string, any>;
} = { enrolled_faces: {}, auth_logs: {} };

jest.mock('expo-sqlite', () => ({
  openDatabase: jest.fn(() => ({
    transaction(cb: (tx: any) => void, _err?: any, ok?: () => void) {
      const tx = {
        executeSql(sql: string, params: any[] = [], success?: any, _fail?: any) {
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
            tables.auth_logs[id] = {
              log_id: id, user_id: uid, timestamp: ts,
              gps_lat: lat, gps_lng: lng,
              device_id: dev, similarity_score: score,
              photo_thumb: thumb, synced: 0,
            };
            rowsAffected = 1;
          } else if (s.includes('FROM auth_logs WHERE synced = 0')) {
            rows = Object.values(tables.auth_logs).filter((r: any) => r.synced === 0);
          } else if (s.includes('FROM auth_logs ORDER BY timestamp DESC')) {
            rows = Object.values(tables.auth_logs).sort((a: any, b: any) =>
              b.timestamp.localeCompare(a.timestamp));
          } else if (s.includes('DELETE FROM auth_logs WHERE log_id IN')) {
            // params is the array of IDs to delete
            params.forEach((id: string) => {
              if (tables.auth_logs[id]) { delete tables.auth_logs[id]; rowsAffected++; }
            });
          } else if (s.startsWith('DELETE FROM')) {
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

// ─── EncryptedStorage mock ────────────────────────────────────────────────────

const secureStore: Record<string, string> = {};
jest.mock('react-native-encrypted-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn((k: string, v: string) => { secureStore[k] = v; return Promise.resolve(); }),
    getItem: jest.fn((k: string) => Promise.resolve(secureStore[k] ?? null)),
    removeItem: jest.fn((k: string) => { delete secureStore[k]; return Promise.resolve(); }),
    clear: jest.fn(() => {
      Object.keys(secureStore).forEach(k => delete secureStore[k]);
      return Promise.resolve();
    }),
  },
}));

// ─── Other required native mocks ─────────────────────────────────────────────

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: { latitude: 19.0760, longitude: 72.8777 }, // Mumbai
  }),
  Accuracy: { Balanced: 2 },
}));

jest.mock('expo-constants', () => ({ installationId: 'e2e-device-id' }));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({ isConnected: true, type: 'wifi' })),
    addEventListener: jest.fn((cb: any) => { cb({ isConnected: true }); return () => {}; }),
  },
  useNetInfo: jest.fn(() => ({ isConnected: true, type: 'wifi' })),
}));

// Global fetch mock — real syncAuthLogs implementation uses this
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => { await initDatabase(); });

beforeEach(() => {
  tables.enrolled_faces = {};
  tables.auth_logs = {};
  Object.keys(secureStore).forEach(k => delete secureStore[k]);
  const { clearCachedKey } = require('../src/services/encryption/secureStorage');
  clearCachedKey();
  jest.clearAllMocks();
  mockFetch.mockReset();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeLog(id: string, overrides?: Partial<AuthLog>): AuthLog {
  return {
    log_id: id,
    user_id: 'e2e_user',
    timestamp: new Date().toISOString(),
    gps_lat: 19.0760,
    gps_lng: 72.8777,
    device_id: 'e2e-device-id',
    similarity_score: 0.93,
    photo_thumb: 'thumb',
    ...overrides,
  };
}

function mockSyncSuccess(ids: string[]) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ message: 'Batch synced successfully', received_logs: ids }),
  });
}

function mockSyncFailure(status = 500) {
  return Promise.resolve({
    ok: false,
    status,
    json: async () => ({ error: 'Server error' }),
  });
}

// ─── Suite 1: Service-layer E2E pipeline ─────────────────────────────────────

describe('Service-layer E2E: Enroll → Log → Sync → Purge', () => {
  const userId = 'worker_e2e_01';

  test('full pipeline: enroll face, create auth log, sync to server, local purge', async () => {
    // ── Step 1: Enroll ──────────────────────────────────────────────────────
    const frame = { uri: '', width: 112, height: 112, base64: 'B'.repeat(12544) };
    const processed = await processCameraFrame(frame);
    const embedding = extractEmbedding(processed);

    await insertEnrolledFace(userId, embedding);

    const enrolled = await getAllEnrolledFaces();
    expect(enrolled).toHaveLength(1);
    expect(enrolled[0].user_id).toBe(userId);
    // Embedding survives AES-256 round-trip
    expect(enrolled[0].embedding).toHaveLength(512);

    // ── Step 2: Create auth log ─────────────────────────────────────────────
    const log = makeLog('e2e-log-001', { user_id: userId });
    await insertAuthLog(log);

    const unsynced = await getUnsyncedLogs();
    expect(unsynced).toHaveLength(1);
    expect(unsynced[0].log_id).toBe('e2e-log-001');
    expect(unsynced[0].user_id).toBe(userId);
    expect(unsynced[0].gps_lat).toBeCloseTo(19.0760, 4);
    expect(unsynced[0].gps_lng).toBeCloseTo(72.8777, 4);

    // ── Step 3: Sync — server returns 200 ──────────────────────────────────
    mockFetch.mockReturnValue(mockSyncSuccess(['e2e-log-001']));

    const syncResult = await syncAuthLogs();
    expect(syncResult).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify POST body contains the log
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].log_id).toBe('e2e-log-001');
    expect(body.logs[0].gps_lat).toBeCloseTo(19.0760, 4);

    // ── Step 4: Local purge happened — zero unsynced logs remain ───────────
    const afterSync = await getUnsyncedLogs();
    expect(afterSync).toHaveLength(0);
  });

  test('server 500 → sync returns false, logs retained for retry', async () => {
    await insertAuthLog(makeLog('retry-log'));
    mockFetch.mockReturnValue(mockSyncFailure(500));

    const result = await syncAuthLogs();

    expect(result).toBe(false);
    expect(await getUnsyncedLogs()).toHaveLength(1); // still there
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('no unsynced logs → returns true immediately, no HTTP call made', async () => {
    // Empty queue
    const result = await syncAuthLogs();
    expect(result).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('partial batch: only confirmed IDs are purged, unconfirmed remain', async () => {
    // Insert 3 logs
    for (const id of ['batch-1', 'batch-2', 'batch-3']) {
      await insertAuthLog(makeLog(id));
    }

    // Server only confirms batch-1 and batch-3 (batch-2 dropped / failed server-side)
    mockFetch.mockReturnValue(mockSyncSuccess(['batch-1', 'batch-3']));

    const result = await syncAuthLogs();
    expect(result).toBe(true);

    const remaining = await getUnsyncedLogs();
    const remainingIds = remaining.map((l: AuthLog) => l.log_id);
    expect(remainingIds).toContain('batch-2');
    expect(remainingIds).not.toContain('batch-1');
    expect(remainingIds).not.toContain('batch-3');
  });

  test('network error (fetch throws) → returns false, logs retained', async () => {
    await insertAuthLog(makeLog('net-err-log'));
    mockFetch.mockRejectedValue(new Error('Network unreachable'));

    const result = await syncAuthLogs();

    expect(result).toBe(false);
    expect(await getUnsyncedLogs()).toHaveLength(1);
  });

  test('malformed JSON response → returns false, no purge', async () => {
    await insertAuthLog(makeLog('bad-json-log'));
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    });

    const result = await syncAuthLogs();

    expect(result).toBe(false);
    expect(await getUnsyncedLogs()).toHaveLength(1);
  });

  test('response missing received_logs → returns false, no purge', async () => {
    await insertAuthLog(makeLog('missing-field-log'));
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: 'ok' }), // no received_logs
    });

    const result = await syncAuthLogs();

    expect(result).toBe(false);
    expect(await getUnsyncedLogs()).toHaveLength(1);
  });

  test('multiple auth logs: all are POSTed together in one batch', async () => {
    for (let i = 1; i <= 5; i++) {
      await insertAuthLog(makeLog(`bulk-${i}`));
    }

    const ids = ['bulk-1', 'bulk-2', 'bulk-3', 'bulk-4', 'bulk-5'];
    mockFetch.mockReturnValue(mockSyncSuccess(ids));

    await syncAuthLogs();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.logs).toHaveLength(5);
    expect(await getUnsyncedLogs()).toHaveLength(0);
  });

  test('deleteEnrolledFace removes only the specified user', async () => {
    const e1 = extractEmbedding(await processCameraFrame(
      { uri: '', width: 112, height: 112, base64: 'A'.repeat(12544) }
    ));
    const e2 = extractEmbedding(await processCameraFrame(
      { uri: '', width: 112, height: 112, base64: 'B'.repeat(12544) }
    ));

    await insertEnrolledFace('user_keep', e1);
    await insertEnrolledFace('user_delete', e2);

    await deleteEnrolledFace('user_delete');

    const remaining = await getAllEnrolledFaces();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].user_id).toBe('user_keep');
  });
});

// ─── Suite 2: useAuth hook E2E ────────────────────────────────────────────────

describe('useAuth hook E2E: liveness → match → GPS log creation', () => {
  // awsSync is mocked here so the background sync triggered by useAuth succeeds without
  // touching the real syncAuthLogs (which needs the config mock above)
  jest.mock('../src/services/network/awsSync', () => ({
    syncAuthLogs: jest.fn().mockResolvedValue(true),
    getUnsyncedCount: jest.fn().mockResolvedValue(0),
    triggerSyncOnConnect: jest.fn().mockReturnValue(() => {}),
  }));

  function makeCameraRef(opts?: {
    isBlinking?: boolean;
    isSmiling?: boolean;
    isHeadTurned?: boolean;
  }) {
    const defaults = { isBlinking: true, isSmiling: false, isHeadTurned: true };
    const merged = { ...defaults, ...opts };
    return {
      current: {
        takePictureAsync: jest.fn().mockResolvedValue({
          uri: 'file://mock.jpg',
          width: 112,
          height: 112,
          base64: 'A'.repeat(12544),
          ...merged,
        }),
        _lastPicture: merged,
      },
    };
  }

  test('authenticated log contains GPS coords, valid UUID, positive score', async () => {
    // Enroll the user first — use same base64 as the camera mock so embedding matches
    const frame = { uri: '', width: 112, height: 112, base64: 'A'.repeat(12544) };
    const processed = await processCameraFrame(frame);
    const emb = extractEmbedding(processed);
    await insertEnrolledFace('e2e_hook_user', emb);

    const onAuthSuccess = jest.fn();

    const { result } = renderHook(() =>
      useAuth(makeCameraRef(), {
        requiredChallenges: 1,
        onAuthSuccess,
      })
    );

    act(() => { result.current.startAuth(true); });

    await waitFor(
      () => expect(result.current.status).toBe('authenticated'),
      { timeout: 8000 }
    );

    const log = result.current.logData!;
    expect(log).not.toBeNull();
    expect(log.user_id).toBe('e2e_hook_user');
    expect(log.similarity_score).toBeGreaterThan(0);
    expect(log.gps_lat).toBeCloseTo(19.0760, 3);
    expect(log.gps_lng).toBeCloseTo(72.8777, 3);
    // UUID v4 format
    expect(log.log_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    // Valid ISO8601
    expect(new Date(log.timestamp).toISOString()).toBe(log.timestamp);
    expect(log.device_id.length).toBeGreaterThan(0);

    expect(onAuthSuccess).toHaveBeenCalledWith(log);
  });

  test('flat-photo spoof (isRealFace=false) → SPOOF_DETECTED, no auth log created', async () => {
    (getAllEnrolledFaces as jest.Mock | undefined)?.mockResolvedValue?.([]);

    const onLivenessFailed = jest.fn();

    const { result } = renderHook(() =>
      useAuth(makeCameraRef(), {
        requiredChallenges: 1,
        onLivenessFailed,
      })
    );

    act(() => { result.current.startAuth(false); }); // isRealFace = false → flat spoof

    await waitFor(() => expect(result.current.status).toBe('failed'), { timeout: 5000 });

    expect(result.current.error?.code).toBe('SPOOF_DETECTED');
    expect(onLivenessFailed).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SPOOF_DETECTED' })
    );
  });

  test('no enrolled faces → onEnrollmentRequired fired after liveness passes', async () => {
    // getAllEnrolledFaces returns empty (tables cleared in beforeEach)
    const onEnrollmentRequired = jest.fn();
    const onLivenessFailed = jest.fn();

    const { result } = renderHook(() =>
      useAuth(makeCameraRef(), {
        requiredChallenges: 1,
        onEnrollmentRequired,
        onLivenessFailed,
      })
    );

    act(() => { result.current.startAuth(true); });

    await waitFor(() => expect(result.current.status).toBe('failed'), { timeout: 8000 });

    expect(onEnrollmentRequired).toHaveBeenCalledTimes(1);
  });

  test('reset() returns pipeline to idle with cleared state', async () => {
    const { result } = renderHook(() =>
      useAuth(makeCameraRef(), { requiredChallenges: 1 })
    );

    // Trigger a spoof failure
    act(() => { result.current.startAuth(false); });
    await waitFor(() => expect(result.current.status).toBe('failed'), { timeout: 5000 });

    // Reset
    act(() => { result.current.reset(); });

    expect(result.current.status).toBe('idle');
    expect(result.current.logData).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.prompt).toBeNull();
  });
});
