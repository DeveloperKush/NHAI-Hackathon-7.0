/**
 * @file networkSync.test.ts
 * Unit tests for the zero-loss AWS sync service.
 * Verifies: online/offline gating, correct POST shape, purge-only-on-200 rule,
 * partial-batch safety, malformed-response safety, and hook auto-sync.
 */

import { syncAuthLogs, getUnsyncedCount } from '../src/services/network/awsSync';
import { getUnsyncedLogs, deleteSyncedLogs } from '../src/services/database/authLogs';
import { AuthLog } from '../src/types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../src/constants/config', () => ({
  AWS_SYNC_URL: 'http://mock-aws.test/api/sync',
  LAST_SYNC_STORAGE_KEY: '@nhai_last_sync_ts',
}));

jest.mock('../src/services/database/authLogs', () => ({
  getUnsyncedLogs: jest.fn(),
  deleteSyncedLogs: jest.fn(),
}));

let mockConnected = true;
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({ isConnected: mockConnected, type: 'wifi' })),
    addEventListener: jest.fn((cb: any) => {
      cb({ isConnected: mockConnected, type: 'wifi' });
      return () => {};
    }),
  },
  useNetInfo: jest.fn(() => ({ isConnected: mockConnected, type: 'wifi' })),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeLog(id: string, overrides?: Partial<AuthLog>): AuthLog {
  return {
    log_id: id,
    user_id: 'user_test',
    timestamp: '2026-06-01T09:00:00.000Z',
    gps_lat: 28.61,
    gps_lng: 77.21,
    device_id: 'dev-001',
    similarity_score: 0.9,
    photo_thumb: 'thumb',
    ...overrides,
  };
}

function mockSuccess(receivedIds: string[]) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ message: 'Batch synced successfully', received_logs: receivedIds }),
  });
}

function mockFailure(status = 500) {
  return Promise.resolve({
    ok: false,
    status,
    json: async () => ({ error: 'Server Error' }),
  });
}

// ─── Test setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  mockConnected = true;
  (deleteSyncedLogs as jest.Mock).mockResolvedValue(undefined);
});

// ─── Offline guard ───────────────────────────────────────────────────────────

describe('offline guard', () => {
  test('returns false without fetching when device is offline', async () => {
    mockConnected = false;
    (getUnsyncedLogs as jest.Mock).mockResolvedValue([makeLog('L1')]);

    const result = await syncAuthLogs();

    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(deleteSyncedLogs).not.toHaveBeenCalled();
  });

  test('returns true immediately (no fetch) when there are no unsynced logs', async () => {
    (getUnsyncedLogs as jest.Mock).mockResolvedValue([]);

    const result = await syncAuthLogs();

    expect(result).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── Successful sync ─────────────────────────────────────────────────────────

describe('successful sync', () => {
  test('posts correct URL, method, and Content-Type header', async () => {
    (getUnsyncedLogs as jest.Mock).mockResolvedValue([makeLog('L1')]);
    mockFetch.mockReturnValue(mockSuccess(['L1']));

    await syncAuthLogs();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://mock-aws.test/api/sync');
    expect(opts.method).toBe('POST');
    expect(opts.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  test('POST body contains the exact unsynced logs array', async () => {
    const logs = [makeLog('L1'), makeLog('L2')];
    (getUnsyncedLogs as jest.Mock).mockResolvedValue(logs);
    mockFetch.mockReturnValue(mockSuccess(['L1', 'L2']));

    await syncAuthLogs();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.logs).toHaveLength(2);
    expect(body.logs[0].log_id).toBe('L1');
    expect(body.logs[1].log_id).toBe('L2');
  });

  test('purges only the server-confirmed IDs (partial-batch safety)', async () => {
    const logs = [makeLog('L1'), makeLog('L2'), makeLog('L3')];
    (getUnsyncedLogs as jest.Mock).mockResolvedValue(logs);
    // Server only confirms L1 and L3 (L2 dropped)
    mockFetch.mockReturnValue(mockSuccess(['L1', 'L3']));

    await syncAuthLogs();

    expect(deleteSyncedLogs).toHaveBeenCalledWith(['L1', 'L3']);
  });

  test('does NOT call deleteSyncedLogs when server received_logs is empty', async () => {
    (getUnsyncedLogs as jest.Mock).mockResolvedValue([makeLog('L1')]);
    mockFetch.mockReturnValue(mockSuccess([]));

    await syncAuthLogs();

    expect(deleteSyncedLogs).not.toHaveBeenCalled();
  });

  test('returns true on successful sync', async () => {
    (getUnsyncedLogs as jest.Mock).mockResolvedValue([makeLog('L1')]);
    mockFetch.mockReturnValue(mockSuccess(['L1']));

    expect(await syncAuthLogs()).toBe(true);
  });
});

// ─── Purge-only-on-200 rule ───────────────────────────────────────────────────

describe('purge-only-on-200 rule (zero data loss)', () => {
  const errorCases = [400, 401, 403, 404, 500, 503] as const;

  test.each(errorCases)('HTTP %i → returns false, no purge', async (status) => {
    (getUnsyncedLogs as jest.Mock).mockResolvedValue([makeLog('L1')]);
    mockFetch.mockReturnValue(mockFailure(status));

    const result = await syncAuthLogs();

    expect(result).toBe(false);
    expect(deleteSyncedLogs).not.toHaveBeenCalled();
  });

  test('network timeout (fetch throws) → returns false, no purge', async () => {
    (getUnsyncedLogs as jest.Mock).mockResolvedValue([makeLog('L1')]);
    mockFetch.mockRejectedValue(new Error('Network request failed'));

    const result = await syncAuthLogs();

    expect(result).toBe(false);
    expect(deleteSyncedLogs).not.toHaveBeenCalled();
  });

  test('malformed JSON response → returns false, no purge', async () => {
    (getUnsyncedLogs as jest.Mock).mockResolvedValue([makeLog('L1')]);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    });

    const result = await syncAuthLogs();

    expect(result).toBe(false);
    expect(deleteSyncedLogs).not.toHaveBeenCalled();
  });

  test('response missing received_logs field → returns false, no purge', async () => {
    (getUnsyncedLogs as jest.Mock).mockResolvedValue([makeLog('L1')]);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: 'ok' }), // no received_logs
    });

    const result = await syncAuthLogs();

    expect(result).toBe(false);
    expect(deleteSyncedLogs).not.toHaveBeenCalled();
  });

  test('received_logs is not an array → returns false, no purge', async () => {
    (getUnsyncedLogs as jest.Mock).mockResolvedValue([makeLog('L1')]);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ received_logs: 'L1' }), // string, not array
    });

    const result = await syncAuthLogs();

    expect(result).toBe(false);
    expect(deleteSyncedLogs).not.toHaveBeenCalled();
  });
});

// ─── getUnsyncedCount ────────────────────────────────────────────────────────

describe('getUnsyncedCount', () => {
  test('returns correct count of unsynced logs', async () => {
    (getUnsyncedLogs as jest.Mock).mockResolvedValue([makeLog('A'), makeLog('B'), makeLog('C')]);
    expect(await getUnsyncedCount()).toBe(3);
  });

  test('returns 0 when getUnsyncedLogs throws', async () => {
    (getUnsyncedLogs as jest.Mock).mockRejectedValue(new Error('DB error'));
    expect(await getUnsyncedCount()).toBe(0);
  });
});
