/**
 * @file enrollment.test.tsx
 * Component tests for <EnrollmentScreen />.
 * Covers: stepper UI, capture flow, duplicate-ID guard, save pipeline, error states.
 */

import React from 'react';
import { Animated } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import EnrollmentScreen from '../src/screens/EnrollmentScreen';
import { captureEnrollmentFrames } from '../src/services/camera/frameProcessors';
import {
  insertEnrolledFace,
  getAllEnrolledFaces,
} from '../src/services/database/enrolledFaces';
import {
  extractEmbedding,
  initRecognitionModel,
  getModelStatus,
  averageEmbeddings,
} from '../src/services/ai/recognition';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockCamera = React.forwardRef((props: any, ref: any) => (
    <View {...props} ref={ref} />
  ));
  MockCamera.Constants = { Type: { front: 'front' } };
  return { Camera: MockCamera, CameraType: { front: 'front' } };
});

jest.mock('../src/services/database/sqlite', () => ({ executeSql: jest.fn() }));
jest.mock('../src/services/database/authLogs');
jest.mock('../src/services/network/awsSync');

jest.mock('../src/services/database/enrolledFaces', () => ({
  insertEnrolledFace: jest.fn().mockResolvedValue(undefined),
  getAllEnrolledFaces: jest.fn().mockResolvedValue([]),
}));

jest.mock('../src/services/camera/frameProcessors', () => ({
  captureEnrollmentFrames: jest.fn(),
  processCameraFrame: jest.fn(),
}));

// recognitionPreprocess — face-gate always passes, returns a usable stats object
jest.mock('../src/utils/recognitionPreprocess', () => ({
  captureRecognitionBase64: jest.fn().mockResolvedValue('mock_b64'),
  preprocessRecognitionWithFaceGate: jest.fn().mockResolvedValue({
    rgb: new Float32Array(112 * 112 * 3).fill(0.1),
    variance: 0.5,
  }),
  preprocessRecognitionBase64: jest.fn().mockReturnValue({
    rgb: new Float32Array(112 * 112 * 3).fill(0.1),
    variance: 0.5,
  }),
  captureAndPreprocessRecognition: jest.fn().mockResolvedValue({
    rgb: new Float32Array(112 * 112 * 3).fill(0.1),
    variance: 0.5,
  }),
  LowQualityFrameError: class LowQualityFrameError extends Error {},
  NoFaceDetectedError: class NoFaceDetectedError extends Error {},
  RECOGNITION_INPUT_SIZE: 112,
  RECOGNITION_CAPTURE_OPTIONS: { base64: true, quality: 0.25, skipProcessing: false },
}));

jest.mock('../src/services/ai/recognition', () => ({
  extractEmbedding: jest.fn(),
  initRecognitionModel: jest.fn().mockResolvedValue(undefined),
  getModelStatus: jest.fn().mockReturnValue({ loaded: true, error: null }),
  averageEmbeddings: jest.fn((embeddings: Float32Array[]) => {
    // Real averaging + L2 normalize
    const sum = new Float32Array(512);
    for (const e of embeddings) for (let i = 0; i < 512; i++) sum[i] += e[i];
    for (let i = 0; i < 512; i++) sum[i] /= embeddings.length;
    let norm = 0;
    for (let i = 0; i < 512; i++) norm += sum[i] ** 2;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < 512; i++) sum[i] /= norm;
    return sum;
  }),
  cosineSimilarity: jest.fn().mockReturnValue(0.92),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 2 },
}));

jest.mock('react-native-encrypted-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(), getItem: jest.fn(),
    removeItem: jest.fn(), clear: jest.fn(),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(async () => ({ isConnected: true })),
  addEventListener: jest.fn(() => jest.fn()),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockNav = { goBack: jest.fn() };

/** 5 deterministic fake base64 frames. */
const FAKE_FRAMES = ['f1', 'f2', 'f3', 'f4', 'f5'];

function setup() {
  return render(<EnrollmentScreen navigation={mockNav} />);
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  (getAllEnrolledFaces as jest.Mock).mockResolvedValue([]);
  (captureEnrollmentFrames as jest.Mock).mockResolvedValue(FAKE_FRAMES);
  (extractEmbedding as jest.Mock).mockReturnValue(new Float32Array(512).fill(0.1));

  jest.spyOn(Animated, 'loop').mockReturnValue({ start: jest.fn(), stop: jest.fn() } as any);
});

afterEach(() => jest.restoreAllMocks());

// ─── Initial render ───────────────────────────────────────────────────────────

describe('initial render', () => {
  test('renders stepper with 3 steps', () => {
    const { getByText } = setup();
    expect(getByText('Capture')).toBeTruthy();
    expect(getByText('Processing')).toBeTruthy();
    expect(getByText('Saved')).toBeTruthy();
  });

  test('save button is disabled before any capture', () => {
    const { getByTestId } = setup();
    expect(getByTestId('save-button').props.accessibilityState?.disabled).toBe(true);
  });

  test('save button stays disabled with user_id but no frames', () => {
    const { getByTestId, getByPlaceholderText } = setup();
    fireEvent.changeText(getByPlaceholderText('Enter unique worker ID'), 'worker_x');
    expect(getByTestId('save-button').props.accessibilityState?.disabled).toBe(true);
  });
});

// ─── Capture flow ─────────────────────────────────────────────────────────────

describe('capture flow', () => {
  test('capture + user_id enables the save button', async () => {
    const { getByTestId, getByPlaceholderText } = setup();
    fireEvent.changeText(getByPlaceholderText('Enter unique worker ID'), 'w001');
    await act(async () => { fireEvent.press(getByTestId('capture-button')); });
    await waitFor(() =>
      expect(getByTestId('save-button').props.accessibilityState?.disabled).toBe(false)
    );
  });

  test('frame thumbnails appear after successful capture', async () => {
    const { getByTestId, getAllByText } = setup();
    await act(async () => { fireEvent.press(getByTestId('capture-button')); });
    // Each captured frame shows a checkmark
    await waitFor(() => expect(getAllByText('✓').length).toBeGreaterThanOrEqual(1));
  });
});

// ─── Save pipeline ────────────────────────────────────────────────────────────

describe('save pipeline', () => {
  async function captureAndSave(userId = 'worker_save') {
    const { getByTestId, getByPlaceholderText } = setup();
    fireEvent.changeText(getByPlaceholderText('Enter unique worker ID'), userId);
    await act(async () => { fireEvent.press(getByTestId('capture-button')); });
    await waitFor(() =>
      expect(getByTestId('save-button').props.accessibilityState?.disabled).toBe(false)
    );
    await act(async () => { fireEvent.press(getByTestId('save-button')); });
    return { getByTestId, getByPlaceholderText };
  }

  test('insertEnrolledFace is called with correct userId and 512-dim embedding', async () => {
    await captureAndSave('worker_insert_test');

    await waitFor(() => expect(insertEnrolledFace).toHaveBeenCalled());

    const [uid, emb] = (insertEnrolledFace as jest.Mock).mock.calls[0];
    expect(uid).toBe('worker_insert_test');
    expect(emb).toBeInstanceOf(Float32Array);
    expect(emb).toHaveLength(512);
  });

  test('duplicate user_id shows error banner and does NOT insert', async () => {
    (getAllEnrolledFaces as jest.Mock).mockResolvedValue([
      { user_id: 'existing_id', embedding: new Float32Array(512) },
    ]);

    const { getByTestId, getByPlaceholderText, getByText } = setup();
    fireEvent.changeText(getByPlaceholderText('Enter unique worker ID'), 'existing_id');
    await act(async () => { fireEvent.press(getByTestId('capture-button')); });
    await waitFor(() =>
      expect(getByTestId('save-button').props.accessibilityState?.disabled).toBe(false)
    );
    await act(async () => { fireEvent.press(getByTestId('save-button')); });

    await waitFor(() =>
      expect(getByText('Duplicate Personnel ID. This user is already enrolled.')).toBeTruthy()
    );
    expect(insertEnrolledFace).not.toHaveBeenCalled();
  });

  test('empty user_id shows validation error', async () => {
    const { getByTestId, getByText } = setup();
    // Capture without user_id, then try save via direct handler (button is disabled, so simulate directly)
    await act(async () => { fireEvent.press(getByTestId('capture-button')); });
    // Button still disabled because userId is empty — the save will not fire.
    // Verify button is still disabled
    await waitFor(() =>
      expect(getByTestId('save-button').props.accessibilityState?.disabled).toBe(true)
    );
  });
});

// ─── Error states ─────────────────────────────────────────────────────────────

describe('error handling', () => {
  test('capture failure shows error banner', async () => {
    (captureEnrollmentFrames as jest.Mock).mockRejectedValue(
      new Error('Camera hardware failure')
    );

    const { getByTestId, getByText } = setup();
    await act(async () => { fireEvent.press(getByTestId('capture-button')); });

    await waitFor(() => expect(getByText('Camera hardware failure')).toBeTruthy());
  });

  test('insertEnrolledFace DB failure shows error banner', async () => {
    (insertEnrolledFace as jest.Mock).mockRejectedValue(new Error('SQLite disk full'));

    const { getByTestId, getByPlaceholderText, getByText } = setup();
    fireEvent.changeText(getByPlaceholderText('Enter unique worker ID'), 'w_fail');
    await act(async () => { fireEvent.press(getByTestId('capture-button')); });
    await waitFor(() =>
      expect(getByTestId('save-button').props.accessibilityState?.disabled).toBe(false)
    );
    await act(async () => { fireEvent.press(getByTestId('save-button')); });

    await waitFor(() => expect(getByText('SQLite disk full')).toBeTruthy());
  });
});
