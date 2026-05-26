import React from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncAuthLogs, triggerSyncOnConnect } from '../src/services/network/awsSync';
import { getUnsyncedLogs, deleteSyncedLogs } from '../src/services/database/authLogs';
import { useNetworkStatus as useNetworkStatusHook } from '../src/hooks/useNetworkStatus';
import { AuthLog } from '../src/types';

// Mock config module to avoid Babel compile-time inlining issues
jest.mock('../src/constants/config', () => ({
  AWS_SYNC_URL: 'http://localhost:3001/api/sync',
  SIMILARITY_THRESHOLD: 0.6,
  THRESHOLD_RANGE: { permissive: 0.55, strict: 0.65 },
  LIVENESS_TIMEOUT_MS: 10000,
  REQUIRED_CHALLENGES: 2,
  MODEL_PATHS: { mobilefacenet: 'assets/models/mobilefacenet_int8.tflite' },
}));

// Mock database module
jest.mock('../src/services/database/authLogs', () => ({
  getUnsyncedLogs: jest.fn(),
  deleteSyncedLogs: jest.fn(),
}));

// Setup netinfo state mocks
let mockIsConnected = true;
let mockListeners: ((state: any) => void)[] = [];

jest.mock('@react-native-community/netinfo', () => {
  return {
    __esModule: true,
    default: {
      fetch: jest.fn(async () => ({
        isConnected: mockIsConnected,
        type: 'wifi',
      })),
      addEventListener: jest.fn((callback) => {
        mockListeners.push(callback);
        // Call listener immediately with current state as NetInfo addEventListener does
        callback({
          isConnected: mockIsConnected,
          type: 'wifi',
        });
        return () => {
          mockListeners = mockListeners.filter((l) => l !== callback);
        };
      }),
    },
    useNetInfo: jest.fn(() => ({
      isConnected: mockIsConnected,
      type: 'wifi',
    })),
  };
});

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('Network Monitoring and Zero-Loss Sync Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockListeners = [];
    mockIsConnected = true;
  });

  test('Mock netinfo offline -> assert syncAuthLogs does not fetch', async () => {
    mockIsConnected = false;

    // Mock getUnsyncedLogs to return some logs
    const mockLogs: AuthLog[] = [
      {
        log_id: '123',
        user_id: 'user_1',
        timestamp: new Date().toISOString(),
        gps_lat: 12.34,
        gps_lng: 56.78,
        device_id: 'dev_1',
        similarity_score: 0.95,
        photo_thumb: 'thumb_1',
      },
    ];
    (getUnsyncedLogs as jest.Mock).mockResolvedValue(mockLogs);

    const result = await syncAuthLogs();

    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(deleteSyncedLogs).not.toHaveBeenCalled();
  });

  test('Mock netinfo online with 2 unsynced logs -> assert POST body has 2 logs, assert deleteSyncedLogs called with correct IDs', async () => {
    mockIsConnected = true;

    const mockLogs: AuthLog[] = [
      {
        log_id: '101',
        user_id: 'user_1',
        timestamp: '2026-05-26T12:00:00Z',
        gps_lat: 12.34,
        gps_lng: 56.78,
        device_id: 'dev_1',
        similarity_score: 0.95,
        photo_thumb: 'thumb_1',
      },
      {
        log_id: '102',
        user_id: 'user_2',
        timestamp: '2026-05-26T12:01:00Z',
        gps_lat: 12.35,
        gps_lng: 56.79,
        device_id: 'dev_1',
        similarity_score: 0.88,
        photo_thumb: 'thumb_2',
      },
    ];
    (getUnsyncedLogs as jest.Mock).mockResolvedValue(mockLogs);

    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({
        message: 'Batch synced successfully',
        received_logs: ['101', '102'],
      }),
    });

    const result = await syncAuthLogs();

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    
    // Assert request arguments
    const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('http://localhost:3001/api/sync');
    expect(calledOptions.method).toBe('POST');
    expect(calledOptions.headers).toEqual({ 'Content-Type': 'application/json' });
    
    const parsedBody = JSON.parse(calledOptions.body);
    expect(parsedBody.logs).toHaveLength(2);
    expect(parsedBody.logs[0].log_id).toBe('101');
    expect(parsedBody.logs[1].log_id).toBe('102');

    expect(deleteSyncedLogs).toHaveBeenCalledWith(['101', '102']);
  });

  test('Mock HTTP 500 -> assert deleteSyncedLogs NOT called', async () => {
    mockIsConnected = true;

    const mockLogs: AuthLog[] = [
      {
        log_id: '103',
        user_id: 'user_3',
        timestamp: '2026-05-26T12:02:00Z',
        gps_lat: 12.36,
        gps_lng: 56.80,
        device_id: 'dev_1',
        similarity_score: 0.90,
        photo_thumb: 'thumb_3',
      },
    ];
    (getUnsyncedLogs as jest.Mock).mockResolvedValue(mockLogs);

    mockFetch.mockResolvedValue({
      status: 500,
      json: async () => ({ error: 'Internal Server Error' }),
    });

    const result = await syncAuthLogs();

    expect(result).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(deleteSyncedLogs).not.toHaveBeenCalled();
  });

  test('React hook useNetworkStatus auto-calls syncAuthLogs when isConnected is true', async () => {
    const useEffectSpy = jest.spyOn(React, 'useEffect').mockImplementation((effect) => effect());
    
    mockIsConnected = true;
    (getUnsyncedLogs as jest.Mock).mockResolvedValue([]);

    const result = useNetworkStatusHook();

    expect(result.isConnected).toBe(true);
    expect(result.connectionType).toBe('wifi');
    
    // Flush microtasks
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(getUnsyncedLogs).toHaveBeenCalled();

    useEffectSpy.mockRestore();
  });

  test('React hook useNetworkStatus does NOT call syncAuthLogs when isConnected is false', async () => {
    const useEffectSpy = jest.spyOn(React, 'useEffect').mockImplementation((effect) => effect());
    
    mockIsConnected = false;
    (getUnsyncedLogs as jest.Mock).mockResolvedValue([]);

    const result = useNetworkStatusHook();

    expect(result.isConnected).toBe(false);
    expect(result.connectionType).toBe('wifi');
    
    // Flush microtasks
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(getUnsyncedLogs).not.toHaveBeenCalled();

    useEffectSpy.mockRestore();
  });
});
