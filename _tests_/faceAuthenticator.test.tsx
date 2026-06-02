/**
 * @file faceAuthenticator.test.tsx
 * Component tests for <FaceAuthenticator />.
 * useAuth is fully mocked so these tests are pure UI/prop contract tests.
 */

import React from 'react';
import { Animated } from 'react-native';
import { render, act, fireEvent, waitFor } from '@testing-library/react-native';
import FaceAuthenticator from '../src/components/FaceAuthenticator';
import { useAuth } from '../src/hooks/useAuth';
import { AuthLog, LivenessError } from '../src/types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('expo-constants', () => ({ installationId: 'test-device' }));

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockCamera = React.forwardRef((props: any, ref: any) => <View {...props} ref={ref} />);
  MockCamera.Constants = { Type: { front: 'front' } };
  return { Camera: MockCamera, CameraType: { front: 'front' } };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 0, Medium: 1, Heavy: 2 },
  NotificationFeedbackType: { Success: 0, Warning: 1, Error: 2 },
}));

jest.mock('expo-sqlite', () => ({ openDatabase: jest.fn(() => ({ transaction: jest.fn() })) }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 2 },
}));
jest.mock('react-native-encrypted-storage', () => ({
  __esModule: true,
  default: { setItem: jest.fn(), getItem: jest.fn(), removeItem: jest.fn(), clear: jest.fn() },
}));
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(async () => ({ isConnected: true })),
  addEventListener: jest.fn(() => jest.fn()),
}));
jest.mock('../src/services/database/sqlite');
jest.mock('../src/services/database/authLogs');
jest.mock('../src/services/database/enrolledFaces');
jest.mock('../src/services/network/awsSync');
jest.mock('../src/services/camera/frameProcessors');

// MediaPipe mock — fires onReadyCallback immediately so auth starts
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

jest.mock('../src/hooks/useAuth');

// ─── Shared defaults ─────────────────────────────────────────────────────────

const noop = jest.fn();
const mockStartAuth = jest.fn();
const mockReset = jest.fn();
const mockForceChallenge = jest.fn();

function mockUseAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  (useAuth as jest.Mock).mockReturnValue({
    status: 'idle',
    logData: null,
    error: null,
    prompt: null,
    startAuth: mockStartAuth,
    reset: mockReset,
    forceChallenge: mockForceChallenge,
    ...overrides,
  });
}

function renderAuth(props?: Partial<React.ComponentProps<typeof FaceAuthenticator>>) {
  return render(
    <FaceAuthenticator
      onAuthSuccess={props?.onAuthSuccess ?? noop}
      onLivenessFailed={props?.onLivenessFailed ?? noop}
      onEnrollmentRequired={props?.onEnrollmentRequired ?? noop}
      {...props}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth();
  jest.spyOn(Animated, 'loop').mockReturnValue({ start: jest.fn(), stop: jest.fn() } as any);
});
afterEach(() => jest.restoreAllMocks());

// ─── Mount behaviour ─────────────────────────────────────────────────────────

describe('mount behaviour', () => {
  test('calls startAuth(true) after WebView signals ready', async () => {
    jest.useFakeTimers();
    renderAuth();
    // The component schedules startAuth in a setTimeout(fn, 0) after webViewReady=true
    act(() => { jest.runAllTimers(); });
    await act(async () => { await Promise.resolve(); });
    expect(mockStartAuth).toHaveBeenCalledWith(true);
    jest.useRealTimers();
  });

  test('renders status pill on initial render', () => {
    const { getByTestId } = renderAuth();
    expect(getByTestId('status-pill')).toBeTruthy();
  });
});

// ─── Status pill text ────────────────────────────────────────────────────────

describe('status pill text', () => {
  const cases: [Parameters<typeof mockUseAuth>[0], string][] = [
    [{ status: 'idle' },                                    'Ready'],
    [{ status: 'scanning' },                                'Hold still\u2026'],
    [{ status: 'liveness', prompt: 'Please blink' },        'Please blink'],
    [{ status: 'liveness', prompt: 'Turn head slightly' },  'Turn head slightly'],
    [{ status: 'matching' },                                'Matching\u2026'],
    [{ status: 'authenticated', logData: null },            'Authenticated'],
    [{ status: 'authenticated', logData: { user_id: 'raj' } as AuthLog }, 'Welcome back, raj'],
    [{ status: 'failed' },                                  'Failed'],
  ];

  test.each(cases)('status=%p → pill shows "%s"', (authState, expected) => {
    mockUseAuth(authState);
    const { getByTestId } = renderAuth();
    const pillText = getByTestId('status-pill').props.children.props.children;
    expect(pillText).toBe(expected);
  });
});

// ─── Banners ─────────────────────────────────────────────────────────────────

describe('liveness & error banners', () => {
  test('shows liveness prompt banner during liveness state', () => {
    mockUseAuth({ status: 'liveness', prompt: 'Please smile' });
    const { getAllByText } = renderAuth();
    // Banner + status pill both show the prompt
    expect(getAllByText('Please smile').length).toBeGreaterThanOrEqual(1);
  });

  test('shows success banner on authenticated', () => {
    mockUseAuth({ status: 'authenticated', logData: { user_id: 'x' } as AuthLog });
    const { getByText } = renderAuth();
    expect(getByText('Verification Successful')).toBeTruthy();
  });

  test('shows error message on failed state', () => {
    const error: LivenessError = { code: 'SPOOF_DETECTED', message: 'Photo spoof rejected.' };
    mockUseAuth({ status: 'failed', error });
    const { getByText } = renderAuth();
    expect(getByText('Photo spoof rejected.')).toBeTruthy();
  });

  test('no error banner when there is no error', () => {
    mockUseAuth({ status: 'idle', error: null });
    const { queryByText } = renderAuth();
    expect(queryByText(/spoof/i)).toBeNull();
  });
});

// ─── Retry button ────────────────────────────────────────────────────────────

describe('retry button', () => {
  test('retry button present when failed', () => {
    mockUseAuth({ status: 'failed', error: { code: 'TIMEOUT', message: 'Timed out' } });
    const { getByTestId } = renderAuth();
    expect(getByTestId('retry-button')).toBeTruthy();
  });

  test('retry button absent when not failed', () => {
    mockUseAuth({ status: 'idle' });
    const { queryByTestId } = renderAuth();
    expect(queryByTestId('retry-button')).toBeNull();
  });

  test('pressing retry calls reset + startAuth', async () => {
    mockUseAuth({ status: 'failed', error: { code: 'TIMEOUT', message: 'T/O' } });
    const { getByTestId } = renderAuth();
    fireEvent.press(getByTestId('retry-button'));
    await act(async () => { await Promise.resolve(); });
    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(mockStartAuth).toHaveBeenCalledWith(true);
  });
});

// ─── Bypass button (demo) ─────────────────────────────────────────────────────

describe('bypass button', () => {
  test('bypass button appears after 3 s during liveness challenge', async () => {
    jest.useFakeTimers();
    mockUseAuth({ status: 'liveness', prompt: 'Please blink' });
    const { queryByTestId } = renderAuth();

    // Not yet shown
    expect(queryByTestId('bypass-button')).toBeNull();

    // Advance timers > 3 s
    act(() => { jest.advanceTimersByTime(3500); });

    await waitFor(() => expect(queryByTestId('bypass-button')).not.toBeNull());
    jest.useRealTimers();
  });

  test('pressing bypass calls forceChallenge', async () => {
    jest.useFakeTimers();
    mockUseAuth({ status: 'liveness', prompt: 'Please blink' });
    const { getByTestId } = renderAuth();

    act(() => { jest.advanceTimersByTime(3500); });
    await waitFor(() => getByTestId('bypass-button'));

    fireEvent.press(getByTestId('bypass-button'));
    expect(mockForceChallenge).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

// ─── Haptics ─────────────────────────────────────────────────────────────────

describe('haptic feedback', () => {
  const Haptics = require('expo-haptics');

  test('light haptic fires when prompt changes', async () => {
    mockUseAuth({ status: 'liveness', prompt: 'Please blink' });
    renderAuth();
    await act(async () => { await Promise.resolve(); });
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  test('heavy haptic fires on authenticated', async () => {
    mockUseAuth({ status: 'authenticated', logData: { user_id: 'x' } as AuthLog });
    renderAuth();
    await act(async () => { await Promise.resolve(); });
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy);
  });

  test('error haptic fires on failed', async () => {
    mockUseAuth({ status: 'failed', error: { code: 'TIMEOUT', message: 'T' } });
    renderAuth();
    await act(async () => { await Promise.resolve(); });
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Error
    );
  });
});
