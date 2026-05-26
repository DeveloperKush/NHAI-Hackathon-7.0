import React from 'react';
import { Animated } from 'react-native';
import { render, act } from '@testing-library/react-native';
import FaceAuthenticator from '../src/components/FaceAuthenticator';
import { useAuth } from '../src/hooks/useAuth';

// Mock expo-constants to return a mock device ID
jest.mock('expo-constants', () => ({
  installationId: 'mock-device-id-1234',
  sessionId: 'mock-session-id',
}));

// Mock expo-camera with a forwardRef component to avoid ref warnings
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockCamera = React.forwardRef((props: any, ref: any) => <View {...props} ref={ref} />);
  MockCamera.Constants = { Type: { front: 'front' } };
  return { Camera: MockCamera, CameraType: { front: 'front' } };
});

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 0, Heavy: 2 },
  NotificationFeedbackType: { Error: 2 },
}));

// Mock database & network modules to avoid loading expo-sqlite/expo-location
jest.mock('expo-sqlite', () => ({
  openDatabase: jest.fn().mockReturnValue({
    transaction: jest.fn(),
  }),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 2 },
}));

jest.mock('react-native-encrypted-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn().mockResolvedValue(undefined),
    getItem: jest.fn().mockResolvedValue(null),
    removeItem: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(async () => ({
    isConnected: true,
    type: 'wifi',
  })),
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('../src/services/database/sqlite');
jest.mock('../src/services/database/authLogs');
jest.mock('../src/services/database/enrolledFaces');
jest.mock('../src/services/network/awsSync');
jest.mock('../src/services/camera/frameProcessors');

// Mock useAuth hook
jest.mock('../src/hooks/useAuth');

describe('FaceAuthenticator Component Tests', () => {
  const mockOnAuthSuccess = jest.fn();
  const mockOnLivenessFailed = jest.fn();
  const mockOnEnrollmentRequired = jest.fn();
  const mockStartAuth = jest.fn();
  const mockReset = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      status: 'idle',
      logData: null,
      error: null,
      prompt: null,
      startAuth: mockStartAuth,
      reset: mockReset,
    });

    // Mock Animated.loop to be a no-op to avoid state updates / act() warnings in tests
    jest.spyOn(Animated, 'loop').mockReturnValue({
      start: () => {},
      stop: () => {},
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('calls startAuth on mount', () => {
    render(
      <FaceAuthenticator
        onAuthSuccess={mockOnAuthSuccess}
        onLivenessFailed={mockOnLivenessFailed}
        onEnrollmentRequired={mockOnEnrollmentRequired}
      />
    );
    expect(mockStartAuth).toHaveBeenCalledWith(true);
  });

  test('assert status pill transitions correctly', () => {
    // 1. Idle/Ready state
    const { getByTestId, rerender } = render(
      <FaceAuthenticator
        onAuthSuccess={mockOnAuthSuccess}
        onLivenessFailed={mockOnLivenessFailed}
        onEnrollmentRequired={mockOnEnrollmentRequired}
      />
    );
    expect(getByTestId('status-pill').props.children.props.children).toBe('Ready');

    // 2. Scanning state
    (useAuth as jest.Mock).mockReturnValue({
      status: 'scanning',
      logData: null,
      error: null,
      prompt: null,
      startAuth: mockStartAuth,
      reset: mockReset,
    });
    rerender(
      <FaceAuthenticator
        onAuthSuccess={mockOnAuthSuccess}
        onLivenessFailed={mockOnLivenessFailed}
        onEnrollmentRequired={mockOnEnrollmentRequired}
      />
    );
    expect(getByTestId('status-pill').props.children.props.children).toBe('Scanning…');

    // 3. Liveness state
    (useAuth as jest.Mock).mockReturnValue({
      status: 'liveness',
      logData: null,
      error: null,
      prompt: 'Please blink',
      startAuth: mockStartAuth,
      reset: mockReset,
    });
    rerender(
      <FaceAuthenticator
        onAuthSuccess={mockOnAuthSuccess}
        onLivenessFailed={mockOnLivenessFailed}
        onEnrollmentRequired={mockOnEnrollmentRequired}
      />
    );
    expect(getByTestId('status-pill').props.children.props.children).toBe('Liveness Check');

    // 4. Matching state
    (useAuth as jest.Mock).mockReturnValue({
      status: 'matching',
      logData: null,
      error: null,
      prompt: null,
      startAuth: mockStartAuth,
      reset: mockReset,
    });
    rerender(
      <FaceAuthenticator
        onAuthSuccess={mockOnAuthSuccess}
        onLivenessFailed={mockOnLivenessFailed}
        onEnrollmentRequired={mockOnEnrollmentRequired}
      />
    );
    expect(getByTestId('status-pill').props.children.props.children).toBe('Matching…');

    // 5. Authenticated state
    (useAuth as jest.Mock).mockReturnValue({
      status: 'authenticated',
      logData: { user_id: 'test' },
      error: null,
      prompt: null,
      startAuth: mockStartAuth,
      reset: mockReset,
    });
    rerender(
      <FaceAuthenticator
        onAuthSuccess={mockOnAuthSuccess}
        onLivenessFailed={mockOnLivenessFailed}
        onEnrollmentRequired={mockOnEnrollmentRequired}
      />
    );
    expect(getByTestId('status-pill').props.children.props.children).toBe('Authenticated');
  });

  test('assert banner text changes with liveness state (prompt or error)', () => {
    // 1. Liveness challenge active (prompt active)
    (useAuth as jest.Mock).mockReturnValue({
      status: 'liveness',
      logData: null,
      error: null,
      prompt: 'Please smile',
      startAuth: mockStartAuth,
      reset: mockReset,
    });

    const { getByText, rerender } = render(
      <FaceAuthenticator
        onAuthSuccess={mockOnAuthSuccess}
        onLivenessFailed={mockOnLivenessFailed}
        onEnrollmentRequired={mockOnEnrollmentRequired}
      />
    );

    // Prompt banner should show message
    expect(getByText('Please smile')).toBeTruthy();

    // 2. Failure state (error active)
    (useAuth as jest.Mock).mockReturnValue({
      status: 'failed',
      logData: null,
      error: { code: 'SPOOF_DETECTED', message: 'Spoof detected' },
      prompt: null,
      startAuth: mockStartAuth,
      reset: mockReset,
    });

    rerender(
      <FaceAuthenticator
        onAuthSuccess={mockOnAuthSuccess}
        onLivenessFailed={mockOnLivenessFailed}
        onEnrollmentRequired={mockOnEnrollmentRequired}
      />
    );

    expect(getByText('Spoof detected')).toBeTruthy();
  });
});
