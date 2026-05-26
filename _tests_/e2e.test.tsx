import React from 'react';
import { Animated } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { initDatabase } from '../src/services/database/sqlite';
import { insertEnrolledFace, getAllEnrolledFaces } from '../src/services/database/enrolledFaces';
import { getUnsyncedLogs } from '../src/services/database/authLogs';
import { processCameraFrame } from '../src/services/camera/frameProcessors';
import { extractEmbedding } from '../src/services/ai/recognition';
import DemoAuthScreen from '../src/screens/DemoAuthScreen';

// Mock config module to avoid config resolve issue
jest.mock('../src/constants/config', () => ({
  AWS_SYNC_URL: 'http://localhost:3001/api/sync',
  SIMILARITY_THRESHOLD: 0.6,
  THRESHOLD_RANGE: { permissive: 0.55, strict: 0.65 },
  LIVENESS_TIMEOUT_MS: 10000,
  REQUIRED_CHALLENGES: 2,
  MODEL_PATHS: { mobilefacenet: 'assets/models/mobilefacenet_int8.tflite' },
}));

// Global mock tables to simulate SQLite in-memory
const mockTables: {
  enrolled_faces: Record<string, { user_id: string; embedding: string; enrolled_at: string }>;
  auth_logs: Record<string, {
    log_id: string;
    user_id: string;
    timestamp: string;
    gps_lat: number | null;
    gps_lng: number | null;
    device_id: string;
    similarity_score: number;
    photo_thumb: string;
    synced: number;
  }>;
} = {
  enrolled_faces: {},
  auth_logs: {},
};

// Mock expo-sqlite using an in-memory database simulation
jest.mock('expo-sqlite', () => {
  return {
    openDatabase: jest.fn(() => ({
      transaction: (
        callback: (tx: any) => void,
        errorCallback?: (err: any) => void,
        successCallback?: () => void
      ) => {
        const tx = {
          executeSql: (
            sql: string,
            params: any[] = [],
            success?: (tx: any, result: any) => void,
            failure?: (tx: any, err: any) => boolean
          ) => {
            try {
              const normalizedSql = sql.trim().replace(/\s+/g, ' ');
              let resultRows: any[] = [];
              let rowsAffected = 0;
              let insertId: number | undefined;

              if (normalizedSql.startsWith('CREATE TABLE')) {
                rowsAffected = 0;
              } else if (normalizedSql.startsWith('INSERT OR REPLACE INTO enrolled_faces')) {
                const [userId, embedding, enrolledAt] = params;
                mockTables.enrolled_faces[userId] = {
                  user_id: userId,
                  embedding,
                  enrolled_at: enrolledAt,
                };
                rowsAffected = 1;
              } else if (normalizedSql.startsWith('SELECT user_id, embedding FROM enrolled_faces')) {
                resultRows = Object.values(mockTables.enrolled_faces);
              } else if (normalizedSql.startsWith('DELETE FROM enrolled_faces WHERE user_id = ?')) {
                const [userId] = params;
                if (mockTables.enrolled_faces[userId]) {
                  delete mockTables.enrolled_faces[userId];
                  rowsAffected = 1;
                }
              } else if (normalizedSql.startsWith('INSERT OR REPLACE INTO auth_logs')) {
                const [logId, userId, timestamp, gpsLat, gpsLng, deviceId, similarityScore, photoThumb] = params;
                mockTables.auth_logs[logId] = {
                  log_id: logId,
                  user_id: userId,
                  timestamp,
                  gps_lat: gpsLat,
                  gps_lng: gpsLng,
                  device_id: deviceId,
                  similarity_score: similarityScore,
                  photo_thumb: photoThumb,
                  synced: 0,
                };
                rowsAffected = 1;
              } else if (normalizedSql.includes('FROM auth_logs WHERE synced = 0')) {
                resultRows = Object.values(mockTables.auth_logs).filter(log => log.synced === 0);
              } else if (normalizedSql.includes('FROM auth_logs ORDER BY timestamp DESC')) {
                // Return all auth logs for recent list
                resultRows = Object.values(mockTables.auth_logs).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
              } else if (normalizedSql.includes('DELETE FROM auth_logs WHERE log_id IN')) {
                params.forEach(id => {
                  if (mockTables.auth_logs[id]) {
                    delete mockTables.auth_logs[id];
                    rowsAffected++;
                  }
                });
              }

              const result = {
                rowsAffected,
                insertId,
                rows: {
                  length: resultRows.length,
                  item: (idx: number) => resultRows[idx],
                  _array: resultRows,
                },
              };

              if (success) {
                success({}, result);
              }
            } catch (err) {
              if (failure) {
                failure({}, err);
              } else {
                throw err;
              }
            }
          },
        };
        callback(tx);
        if (successCallback) {
          successCallback();
        }
      },
    })),
  };
});

// Mock expo-camera
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockCamera = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: jest.fn().mockResolvedValue({
        uri: 'file://mock_frame.jpg',
        width: 112,
        height: 112,
        base64: 'A'.repeat(12544),
      }),
    }));
    return <View {...props} />;
  });
  MockCamera.Constants = { Type: { front: 'front' } };
  return { Camera: MockCamera, CameraType: { front: 'front' } };
});

// Mock expo-location to return fixed coordinates
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: { latitude: 28.6139, longitude: 77.2090 },
  }),
  Accuracy: { Balanced: 2 },
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  installationId: 'mock-device-id-1234',
  sessionId: 'mock-session-id',
}));

// Mock NetInfo as connected
jest.mock('@react-native-community/netinfo', () => {
  return {
    __esModule: true,
    default: {
      fetch: jest.fn(async () => ({ isConnected: true, type: 'wifi' })),
      addEventListener: jest.fn((callback) => {
        callback({ isConnected: true, type: 'wifi' });
        return () => {};
      }),
    },
    useNetInfo: jest.fn(() => ({ isConnected: true, type: 'wifi' })),
  };
});

// Mock react-native-encrypted-storage
jest.mock('react-native-encrypted-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
        return Promise.resolve();
      }),
      getItem: jest.fn((key: string) => Promise.resolve(store[key] || null)),
      removeItem: jest.fn((key: string) => {
        delete store[key];
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        Object.keys(store).forEach(key => delete store[key]);
        return Promise.resolve();
      }),
    },
  };
});

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 0, Heavy: 2 },
  NotificationFeedbackType: { Error: 2 },
}));

describe('NHAI Datalake E2E Mock Integration Test Flow', () => {
  const mockNavigation = {
    navigate: jest.fn(),
  };

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    mockTables.enrolled_faces = {};
    mockTables.auth_logs = {};
    jest.clearAllMocks();

    // Mock Animated.loop
    jest.spyOn(Animated, 'loop').mockReturnValue({
      start: () => {},
      stop: () => {},
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('E2E Flow: Enroll ➔ Authenticate with GPS ➔ Check UI List ➔ Sync ➔ Local Purge', async () => {
    const userId = 'worker_sharma_987';

    // 1. Enroll the worker
    const base64Data = 'A'.repeat(12544);
    const mockFrame = {
      uri: 'file://mock_frame.jpg',
      width: 112,
      height: 112,
      base64: base64Data,
    };
    const processed = await processCameraFrame(mockFrame);
    const enrolledEmbedding = extractEmbedding(processed);

    await insertEnrolledFace(userId, enrolledEmbedding);

    // Assert user enrolled successfully in mock database
    const enrolledUsers = await getAllEnrolledFaces();
    expect(enrolledUsers.length).toBe(1);
    expect(enrolledUsers[0].user_id).toBe(userId);

    // Setup fetch mock for cloud synchronization simulation
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation((url, options) => {
      callCount++;
      if (callCount === 1) {
        // First call (background sync) fails to keep logs in SQLite
        return Promise.resolve({
          status: 500,
          json: () => Promise.resolve({ error: 'Internal Server Error' }),
        } as any);
      }
      // Second call (manual sync) succeeds and purges logs
      const { logs } = JSON.parse(options.body);
      const syncedLogIds = logs.map((l: any) => l.log_id);
      return Promise.resolve({
        status: 200,
        json: () => Promise.resolve({
          message: 'Batch synced successfully',
          received_logs: syncedLogIds,
        }),
      } as any);
    });

    // 2. Render DemoAuthScreen (auto-starts authentication pipeline)
    const { getByText, getAllByText, getByTestId } = render(
      <DemoAuthScreen navigation={mockNavigation as any} />
    );

    // 3. Wait for pipeline to complete and verify matching success
    // Wait for the green success card with user ID details to render on screen
    await waitFor(() => {
      expect(getByText('Success Details')).toBeTruthy();
    }, { timeout: 4000 });

    expect(getAllByText(userId).length).toBeGreaterThan(0);
    expect(getByText('28.6139, 77.2090')).toBeTruthy(); // Displayed coordinates formatted

    // Verify AuthLog insertion and correct coordinates in database
    const unsyncedLogs = await getUnsyncedLogs();
    expect(unsyncedLogs.length).toBe(1);
    expect(unsyncedLogs[0].user_id).toBe(userId);
    expect(unsyncedLogs[0].gps_lat).toBeCloseTo(28.6139, 4);
    expect(unsyncedLogs[0].gps_lng).toBeCloseTo(77.2090, 4);

    // 4. Assert unsynced log appears in recent logs list on screen
    expect(getByTestId(`log-item-${unsyncedLogs[0].log_id}`)).toBeTruthy();

    // 5. Trigger sync by pressing the "Sync Now" button
    const syncButton = getByTestId('sync-button');
    await act(async () => {
      fireEvent.press(syncButton);
    });

    // Wait for sync response and local database purge
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // Verify local SQLite log database has been successfully purged post HTTP 200
    const unsyncedLogsAfterSync = await getUnsyncedLogs();
    expect(unsyncedLogsAfterSync.length).toBe(0);
  });
});
