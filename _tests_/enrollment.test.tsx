import React from 'react';
import { Animated } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import EnrollmentScreen from '../src/screens/EnrollmentScreen';
import {
  captureEnrollmentFrames,
  processCameraFrame,
} from '../src/services/camera/frameProcessors';
import { extractEmbedding } from '../src/services/ai/recognition';
import {
  insertEnrolledFace,
  getAllEnrolledFaces,
} from '../src/services/database/enrolledFaces';

// Mock expo-camera
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockCamera = React.forwardRef((props: any, ref: any) => <View {...props} ref={ref} />);
  MockCamera.Constants = { Type: { front: 'front' } };
  return { Camera: MockCamera, CameraType: { front: 'front' } };
});

// Mock database services
jest.mock('../src/services/database/sqlite');
jest.mock('../src/services/database/authLogs');
jest.mock('../src/services/database/enrolledFaces', () => ({
  insertEnrolledFace: jest.fn().mockResolvedValue(undefined),
  getAllEnrolledFaces: jest.fn(),
}));

jest.mock('../src/services/network/awsSync');

// Mock frameProcessors and recognition services
jest.mock('../src/services/camera/frameProcessors', () => ({
  captureEnrollmentFrames: jest.fn(),
  processCameraFrame: jest.fn(),
}));

jest.mock('../src/services/ai/recognition', () => ({
  extractEmbedding: jest.fn(),
}));

// Mock expo-location & netinfo & react-native-encrypted-storage to avoid crashes
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 2 },
}));

jest.mock('react-native-encrypted-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(),
    getItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(async () => ({ isConnected: true, type: 'wifi' })),
  addEventListener: jest.fn(() => jest.fn()),
}));

describe('EnrollmentScreen Component Tests', () => {
  const mockNavigation = {
    goBack: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (getAllEnrolledFaces as jest.Mock).mockResolvedValue([]);
    (captureEnrollmentFrames as jest.Mock).mockResolvedValue([
      'frame-data-1',
      'frame-data-2',
      'frame-data-3',
      'frame-data-4',
      'frame-data-5',
    ]);
    (processCameraFrame as jest.Mock).mockResolvedValue(new Float32Array(112 * 112));
    (extractEmbedding as jest.Mock).mockReturnValue(new Float32Array(512));

    // Mock Animated.loop to avoid act/timer warnings
    jest.spyOn(Animated, 'loop').mockReturnValue({
      start: () => {},
      stop: () => {},
    } as any);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('Save button is disabled until 3+ frames captured and user_id is entered', async () => {
    const { getByTestId, getByPlaceholderText } = render(
      <EnrollmentScreen navigation={mockNavigation} />
    );

    const saveButton = getByTestId('save-button');
    const captureButton = getByTestId('capture-button');
    const input = getByPlaceholderText('Enter unique worker ID');

    // Initially disabled
    expect(saveButton.props.accessibilityState?.disabled).toBe(true);

    // Enter user_id, still disabled (0 frames captured)
    fireEvent.changeText(input, 'worker_123');
    expect(saveButton.props.accessibilityState?.disabled).toBe(true);

    // Trigger capture (which returns 5 frames)
    await act(async () => {
      fireEvent.press(captureButton);
    });

    // Wait for frames state to update and button to enable
    await waitFor(() => {
      expect(saveButton.props.accessibilityState?.disabled).toBe(false);
    });
  });

  test('Capture 5 frames, average embeddings, assert stored length === 512', async () => {
    // Return unique embeddings to check correct averaging
    let callCount = 0;
    (extractEmbedding as jest.Mock).mockImplementation(() => {
      const emb = new Float32Array(512);
      emb.fill(callCount++); // 0, 1, 2, 3, 4
      return emb;
    });

    const { getByTestId, getByPlaceholderText } = render(
      <EnrollmentScreen navigation={mockNavigation} />
    );

    const input = getByPlaceholderText('Enter unique worker ID');
    const captureButton = getByTestId('capture-button');
    const saveButton = getByTestId('save-button');

    fireEvent.changeText(input, 'worker_john');

    // Capture
    await act(async () => {
      fireEvent.press(captureButton);
    });

    // Save
    await waitFor(() => {
      expect(saveButton.props.accessibilityState?.disabled).toBe(false);
    });

    await act(async () => {
      fireEvent.press(saveButton);
    });

    expect(insertEnrolledFace).toHaveBeenCalled();
    const [userIdArg, embeddingArg] = (insertEnrolledFace as jest.Mock).mock.calls[0];

    expect(userIdArg).toBe('worker_john');
    expect(embeddingArg).toBeInstanceOf(Float32Array);
    expect(embeddingArg.length).toBe(512);

    // Verify embedding averaging calculation: (0 + 1 + 2 + 3 + 4) / 5 = 2
    // But normalized! So all values should be equal and normalized
    // If original averages are 2, normalized should have same relative values (constant values)
    const expectedVal = 2 / Math.sqrt(512 * 2 * 2); // since all 512 elements are 2
    expect(embeddingArg[0]).toBeCloseTo(expectedVal, 5);

    // Assert it calls goBack on success
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  test('Duplicate user_id shows error banner', async () => {
    // Mock user list with existing worker ID
    (getAllEnrolledFaces as jest.Mock).mockResolvedValue([
      { user_id: 'worker_exists', embedding: new Float32Array(512) },
    ]);

    const { getByText, getByTestId, getByPlaceholderText } = render(
      <EnrollmentScreen navigation={mockNavigation} />
    );

    const input = getByPlaceholderText('Enter unique worker ID');
    const captureButton = getByTestId('capture-button');
    const saveButton = getByTestId('save-button');

    fireEvent.changeText(input, 'worker_exists');

    // Capture
    await act(async () => {
      fireEvent.press(captureButton);
    });

    // Save
    await waitFor(() => {
      expect(saveButton.props.accessibilityState?.disabled).toBe(false);
    });

    await act(async () => {
      fireEvent.press(saveButton);
    });

    // Storing should NOT have been called
    expect(insertEnrolledFace).not.toHaveBeenCalled();

    // Verify error banner is shown
    expect(getByText('Duplicate Personnel ID. This user is already enrolled.')).toBeTruthy();
  });
});
