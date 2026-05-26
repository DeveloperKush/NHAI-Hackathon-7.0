import { initDatabase } from '../src/services/database/sqlite';
import { insertEnrolledFace, getAllEnrolledFaces, deleteEnrolledFace } from '../src/services/database/enrolledFaces';
import { insertAuthLog, getUnsyncedLogs, deleteSyncedLogs } from '../src/services/database/authLogs';
import { AuthLog } from '../src/types';

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

// Mock react-native-encrypted-storage key-value store
jest.mock('react-native-encrypted-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
        return Promise.resolve();
      }),
      getItem: jest.fn((key: string) => {
        return Promise.resolve(store[key] || null);
      }),
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

describe('Database and Encryption Service Tests', () => {
  beforeAll(async () => {
    // Initialize the database tables
    await initDatabase();
  });

  test('Insert face with 512-d embedding, retrieve it, assert length === 512', async () => {
    const userId = 'user_123';
    
    // Create a mock 512-dimension float array
    const originalEmbedding = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      originalEmbedding[i] = Math.sin(i) * 0.5 + 0.5; // deterministic float values
    }

    // Insert the enrolled face
    await insertEnrolledFace(userId, originalEmbedding);

    // Retrieve all enrolled faces
    const faces = await getAllEnrolledFaces();
    expect(faces.length).toBe(1);
    expect(faces[0].user_id).toBe(userId);
    expect(faces[0].embedding.length).toBe(512);

    // Assert values are identical
    for (let i = 0; i < 512; i++) {
      expect(faces[0].embedding[i]).toBeCloseTo(originalEmbedding[i], 5);
    }

    // Delete the face
    await deleteEnrolledFace(userId);
    const facesAfterDelete = await getAllEnrolledFaces();
    expect(facesAfterDelete.length).toBe(0);
  });

  test('Insert auth log, retrieve unsynced, delete it', async () => {
    const authLog: AuthLog = {
      log_id: 'log_999',
      user_id: 'user_123',
      timestamp: new Date().toISOString(),
      gps_lat: 28.6139,
      gps_lng: 77.2090,
      device_id: 'device_xyz',
      similarity_score: 0.85,
      photo_thumb: 'base64encodedjpegthumbdata',
    };

    // Insert the log
    await insertAuthLog(authLog);

    // Retrieve unsynced logs
    const unsyncedLogs = await getUnsyncedLogs();
    expect(unsyncedLogs.length).toBe(1);
    expect(unsyncedLogs[0].log_id).toBe(authLog.log_id);
    expect(unsyncedLogs[0].user_id).toBe(authLog.user_id);
    expect(unsyncedLogs[0].gps_lat).toBeCloseTo(authLog.gps_lat!, 4);
    expect(unsyncedLogs[0].gps_lng).toBeCloseTo(authLog.gps_lng!, 4);
    expect(unsyncedLogs[0].similarity_score).toBe(authLog.similarity_score);
    expect(unsyncedLogs[0].photo_thumb).toBe(authLog.photo_thumb);

    // Delete the log
    await deleteSyncedLogs([authLog.log_id]);

    // Retrieve unsynced logs again to verify deletion
    const unsyncedLogsAfterDelete = await getUnsyncedLogs();
    expect(unsyncedLogsAfterDelete.length).toBe(0);
  });
});
