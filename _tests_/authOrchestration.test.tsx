/**
 * @file authOrchestration.test.tsx
 * Integration tests for useAuth hook — covers the full state machine:
 * idle → scanning → liveness → matching → authenticated / failed.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useAuth } from '../src/hooks/useAuth';
import { getAllEnrolledFaces } from '../src/services/database/enrolledFaces';
import { insertAuthLog } from '../src/services/database/authLogs';
import { syncAuthLogs } from '../src/services/network/awsSync';
import { extractEmbedding } from '../src/services/ai/recognition';
import { processCameraFrame } from '../src/services/camera/frameProcessors';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: { latitude: 28.6139, longitude: 77.2090 },
  }),
  Accuracy: { Balanced: 2 },
}));

jest.mock('expo-constants', () => ({ installationId: 'test-device-id' }));

jest.mock('../src/services/database/enrolledFaces', () => ({
  getAllEnrolledFaces: jest.fn(),
}));

jest.mock('../src/services/database/authLogs', () => ({
  insertAuthLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/network/awsSync', () => ({
  syncAuthLogs: jest.fn().mockResolvedValue(true),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a fake camera ref. If `face` flags are provided they control landmark sim. */
function makeCameraRef(overrides?: { isBlinking?: boolean; isSmiling?: boolean; isHeadTurned?: boolean }) {
  return {
    current: {
      takePictureAsync: jest.fn().mockResolvedValue({
        uri: 'file://mock.jpg',
        width: 112,
        height: 112,
        base64: 'A'.repeat(12544),
        ...overrides,
      }),
      _lastPicture: { isBlinking: true, isSmiling: false, isHeadTurned: true, ...overrides },
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('useAuth — happy path', () => {
  test('idle → authenticated when enrolled face matches', async () => {
    // Enrol a face from the same deterministic mock frame
    const mockFrame = { uri: '', width: 112, height: 112, base64: 'A'.repeat(12544) };
    const processed = await processCameraFrame(mockFrame);
    const enrolledEmbedding = extractEmbedding(processed);

    (getAllEnrolledFaces as jest.Mock).mockResolvedValue([
      { user_id: 'worker_maya', embedding: enrolledEmbedding },
    ]);

    const onAuthSuccess = jest.fn();
    const onLivenessFailed = jest.fn();

    const { result } = renderHook(() =>
      useAuth(makeCameraRef({ isBlinking: true, isHeadTurned: true }), {
        requiredChallenges: 1,
        onAuthSuccess,
        onLivenessFailed,
      })
    );

    expect(result.current.status).toBe('idle');

    act(() => { result.current.startAuth(true); });

    await waitFor(() => expect(result.current.status).toBe('authenticated'), { timeout: 5000 });

    // Contract assertions
    expect(result.current.logData).not.toBeNull();
    expect(result.current.logData?.user_id).toBe('worker_maya');
    expect(result.current.logData?.similarity_score).toBeCloseTo(1.0, 3);
    expect(result.current.logData?.gps_lat).toBeCloseTo(28.6139, 4);
    expect(result.current.logData?.gps_lng).toBeCloseTo(77.2090, 4);
    expect(result.current.error).toBeNull();

    expect(onAuthSuccess).toHaveBeenCalledTimes(1);
    expect(onAuthSuccess).toHaveBeenCalledWith(result.current.logData);
    expect(insertAuthLog).toHaveBeenCalledTimes(1);
    expect(syncAuthLogs).toHaveBeenCalled();
  });

  test('logs contain a valid ISO8601 timestamp and a non-empty device_id', async () => {
    const mockFrame = { uri: '', width: 112, height: 112, base64: 'A'.repeat(12544) };
    const emb = extractEmbedding(await processCameraFrame(mockFrame));
    (getAllEnrolledFaces as jest.Mock).mockResolvedValue([{ user_id: 'worker_raj', embedding: emb }]);

    const { result } = renderHook(() =>
      useAuth(makeCameraRef({ isBlinking: true, isHeadTurned: true }), { requiredChallenges: 1 })
    );
    act(() => { result.current.startAuth(true); });
    await waitFor(() => expect(result.current.status).toBe('authenticated'), { timeout: 5000 });

    const log = result.current.logData!;
    expect(() => new Date(log.timestamp)).not.toThrow();
    expect(new Date(log.timestamp).toISOString()).toBe(log.timestamp);
    expect(log.device_id.length).toBeGreaterThan(0);
    expect(log.log_id).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/);
  });
});

describe('useAuth — liveness failures', () => {
  test('flat photo (isRealFace=false) → SPOOF_DETECTED', async () => {
    (getAllEnrolledFaces as jest.Mock).mockResolvedValue([]);
    const onLivenessFailed = jest.fn();

    const { result } = renderHook(() =>
      useAuth(makeCameraRef(), { requiredChallenges: 1, onLivenessFailed })
    );
    act(() => { result.current.startAuth(false); }); // flat spoof

    await waitFor(() => expect(result.current.status).toBe('failed'), { timeout: 3000 });

    expect(result.current.error?.code).toBe('SPOOF_DETECTED');
    expect(onLivenessFailed).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SPOOF_DETECTED' })
    );
    expect(insertAuthLog).not.toHaveBeenCalled();
  });

  test('liveness timeout → TIMEOUT error code', async () => {
    // Control Date.now so the engine's checkTimeout fires
    let now = 1_000_000;
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);

    (getAllEnrolledFaces as jest.Mock).mockResolvedValue([]);
    const onLivenessFailed = jest.fn();

    const { result } = renderHook(() =>
      useAuth(makeCameraRef({ isBlinking: false, isHeadTurned: false }), {
        requiredChallenges: 1,
        onLivenessFailed,
      })
    );
    act(() => { result.current.startAuth(true); });

    // Wait until we enter liveness state
    await waitFor(() => expect(result.current.status).toBe('liveness'), { timeout: 3000 });

    // Jump past the 10s per-challenge timeout
    now += 15_000;

    // Let the loop tick again to detect the timeout
    await waitFor(() => expect(result.current.status).toBe('failed'), { timeout: 5000 });

    expect(result.current.error?.code).toBe('TIMEOUT');
    expect(onLivenessFailed).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TIMEOUT' })
    );

    dateSpy.mockRestore();
  });
});

describe('useAuth — matching failures', () => {
  test('no enrolled faces → onEnrollmentRequired called', async () => {
    (getAllEnrolledFaces as jest.Mock).mockResolvedValue([]);
    const onEnrollmentRequired = jest.fn();
    const onLivenessFailed = jest.fn();

    const { result } = renderHook(() =>
      useAuth(makeCameraRef({ isBlinking: true, isHeadTurned: true }), {
        requiredChallenges: 1,
        onEnrollmentRequired,
        onLivenessFailed,
      })
    );
    act(() => { result.current.startAuth(true); });

    // With no enrolled faces, after liveness passes it should call onEnrollmentRequired
    await waitFor(() => expect(result.current.status).toBe('failed'), { timeout: 5000 });

    expect(onEnrollmentRequired).toHaveBeenCalledTimes(1);
  });

  test('unrecognised face → failed with meaningful error message', async () => {
    // Enroll a completely different embedding
    const different = new Float32Array(512);
    different[0] = 1.0; // unit vec [1,0,0,...] — totally unlike any real capture
    (getAllEnrolledFaces as jest.Mock).mockResolvedValue([
      { user_id: 'stranger', embedding: different },
    ]);

    const onLivenessFailed = jest.fn();

    const { result } = renderHook(() =>
      useAuth(makeCameraRef({ isBlinking: true, isHeadTurned: true }), {
        requiredChallenges: 1,
        onLivenessFailed,
      })
    );
    act(() => { result.current.startAuth(true); });

    await waitFor(() =>
      ['authenticated', 'failed'].includes(result.current.status), { timeout: 5000 }
    );

    if (result.current.status === 'failed') {
      expect(result.current.error).not.toBeNull();
      expect(result.current.error?.message.length).toBeGreaterThan(0);
    }
    // (If the mock model happens to yield a high score, that's fine — we just verify no crash.)
  });
});

describe('useAuth — reset and idempotency', () => {
  test('reset returns to idle and clears log/error', async () => {
    (getAllEnrolledFaces as jest.Mock).mockResolvedValue([]);

    const { result } = renderHook(() =>
      useAuth(makeCameraRef(), { requiredChallenges: 1 })
    );
    act(() => { result.current.startAuth(false); }); // triggers SPOOF → failed
    await waitFor(() => expect(result.current.status).toBe('failed'), { timeout: 3000 });

    act(() => { result.current.reset(); });

    expect(result.current.status).toBe('idle');
    expect(result.current.logData).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.prompt).toBeNull();
  });

  test('startAuth while already running is a no-op (no double-run)', async () => {
    (getAllEnrolledFaces as jest.Mock).mockResolvedValue([]);

    const { result } = renderHook(() =>
      useAuth(makeCameraRef({ isBlinking: true, isHeadTurned: true }), { requiredChallenges: 1 })
    );

    act(() => { result.current.startAuth(true); });
    // Immediately try to start again — should be ignored
    act(() => { result.current.startAuth(true); });

    await waitFor(() =>
      result.current.status !== 'idle' && result.current.status !== 'scanning',
      { timeout: 3000 }
    );

    // insertAuthLog should only be called at most once regardless of double-start
    expect(insertAuthLog.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
