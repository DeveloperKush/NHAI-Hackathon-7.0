import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { processCameraFrame, simulateLandmarksFromFrame } from '../src/services/camera/frameProcessors';
import { useAuth } from '../src/hooks/useAuth';
import { getAllEnrolledFaces } from '../src/services/database/enrolledFaces';
import { insertAuthLog } from '../src/services/database/authLogs';
import { extractEmbedding } from '../src/services/ai/recognition';

// Mock geolocation permissions and coordinate retrieval
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: { latitude: 28.6139, longitude: 77.2090 },
  }),
  Accuracy: { Balanced: 2 },
}));

// Mock expo-constants to return a mock device ID
jest.mock('expo-constants', () => ({
  installationId: 'mock-device-id-1234',
}));

// Mock database services
jest.mock('../src/services/database/enrolledFaces', () => ({
  getAllEnrolledFaces: jest.fn(),
}));

jest.mock('../src/services/database/authLogs', () => ({
  insertAuthLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/network/awsSync', () => ({
  syncAuthLogs: jest.fn().mockResolvedValue(true),
}));

describe('Phase 8: Camera Integration and Auth Orchestration Tests', () => {
  const base64Data = 'A'.repeat(12544); // 112 * 112 characters base64 representations
  const mockFrame = {
    uri: 'file://mock_frame.jpg',
    width: 112,
    height: 112,
    base64: base64Data,
  };

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('Frame Processors', () => {
    test('processCameraFrame resizes and normalizes frame to 112x112 Float32Array', async () => {
      const processed = await processCameraFrame(mockFrame);
      expect(processed).toBeInstanceOf(Float32Array);
      expect(processed.length).toBe(112 * 112 * 3);
      
      // Values should be normalized to [-1.0, 1.0]
      for (let i = 0; i < processed.length; i++) {
        expect(processed[i]).toBeGreaterThanOrEqual(-1.0);
        expect(processed[i]).toBeLessThanOrEqual(1.0);
      }
    });

    test('simulateLandmarksFromFrame generates 468 landmarks', () => {
      const realLandmarks = simulateLandmarksFromFrame(mockFrame, true);
      expect(realLandmarks.length).toBe(468);
      
      // Real landmarks have 3D depth variation
      const zs = realLandmarks.map(l => l.z);
      const mean = zs.reduce((sum, z) => sum + z, 0) / zs.length;
      const variance = zs.reduce((sum, z) => sum + Math.pow(z - mean, 2), 0) / zs.length;
      const stdDev = Math.sqrt(variance);
      expect(stdDev).toBeGreaterThan(0.002);

      const spoofLandmarks = simulateLandmarksFromFrame(mockFrame, false);
      expect(spoofLandmarks.length).toBe(468);
      // Flat spoof landmarks have z approximately 0
      spoofLandmarks.forEach(l => {
        expect(l.z).toBeCloseTo(0.0, 5);
      });
    });
  });

  describe('useAuth Hook', () => {
    let mockCameraRef: any;

    beforeEach(() => {
      mockCameraRef = {
        current: {
          takePictureAsync: jest.fn().mockResolvedValue({
            uri: 'file://taken_picture.jpg',
            width: 112,
            height: 112,
            base64: base64Data,
          }),
        },
      };
    });

    test('idle -> scanning -> liveness -> matching -> authenticated (when liveness passes + face matches)', async () => {
      // Step 1: Extract the expected embedding from our mock frame to enroll it in DB mock
      const processed = await processCameraFrame(mockFrame);
      const enrolledEmbedding = extractEmbedding(processed);

      (getAllEnrolledFaces as jest.Mock).mockResolvedValue([
        { user_id: 'user_john_doe', embedding: enrolledEmbedding },
      ]);

      const onAuthSuccess = jest.fn();
      const onLivenessFailed = jest.fn();

      const { result } = renderHook(() =>
        useAuth(mockCameraRef, {
          similarityThreshold: 0.6,
          requiredChallenges: 1, // Minimize required challenges for faster tests
          onAuthSuccess,
          onLivenessFailed,
        })
      );

      expect(result.current.status).toBe('idle');
      expect(result.current.logData).toBeNull();
      expect(result.current.error).toBeNull();

      // Trigger authentication
      act(() => {
        result.current.startAuth(true); // isRealFace = true
      });

      // Wait for matching & authentication success state
      await waitFor(
        () => {
          expect(result.current.status).toBe('authenticated');
        },
        { timeout: 3000 }
      );

      expect(result.current.logData).not.toBeNull();
      expect(result.current.logData?.user_id).toBe('user_john_doe');
      expect(result.current.logData?.similarity_score).toBeCloseTo(1.0, 5);
      expect(result.current.error).toBeNull();
      expect(onAuthSuccess).toHaveBeenCalledWith(result.current.logData);
      expect(insertAuthLog).toHaveBeenCalled();
    });

    test('idle -> scanning -> liveness -> failed (spoof detected when isRealFace=false)', async () => {
      (getAllEnrolledFaces as jest.Mock).mockResolvedValue([]);

      const onLivenessFailed = jest.fn();

      const { result } = renderHook(() =>
        useAuth(mockCameraRef, {
          requiredChallenges: 1,
          onLivenessFailed,
        })
      );

      // Trigger authentication with isRealFace = false (flat spoof)
      act(() => {
        result.current.startAuth(false);
      });

      // Wait for liveness depth failure
      await waitFor(() => {
        expect(result.current.status).toBe('failed');
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.error?.code).toBe('SPOOF_DETECTED');
      expect(onLivenessFailed).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'SPOOF_DETECTED' })
      );
    });

    test('idle -> scanning -> liveness -> failed (timeout)', async () => {
      let nowMock = 1000000;
      const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => nowMock);

      const onLivenessFailed = jest.fn();

      // We modify the camera mock to return frames that do NOT satisfy blink or challenges (e.g. no eye indicators)
      // Since it cannot pass the challenges, it will eventually time out.
      mockCameraRef.current.takePictureAsync.mockResolvedValue({
        uri: 'file://taken_picture.jpg',
        width: 112,
        height: 112,
        base64: base64Data,
        isBlinking: false, // Don't blink
        isSmiling: false,
        isHeadTurned: false,
      });

      const { result } = renderHook(() =>
        useAuth(mockCameraRef, {
          requiredChallenges: 1,
          onLivenessFailed,
        })
      );

      // Trigger authentication
      act(() => {
        result.current.startAuth(true);
      });

      // Wait for scanning to start and transition to liveness
      await waitFor(() => {
        expect(result.current.status).toBe('liveness');
      });

      // Advance mock clock by 11 seconds to trigger liveness engine timeout
      act(() => {
        nowMock += 11000;
      });

      // Wait for failure
      await waitFor(() => {
        expect(result.current.status).toBe('failed');
      });

      expect(result.current.error?.code).toBe('TIMEOUT');
      expect(onLivenessFailed).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'TIMEOUT' })
      );

      dateSpy.mockRestore();
    });
  });
});
