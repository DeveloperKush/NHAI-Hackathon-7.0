import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabase('binary_brains.db');

export interface SQLResult {
  insertId?: number;
  rowsAffected: number;
  rows: {
    length: number;
    item: (index: number) => any;
    _array: any[];
  };
}

/**
 * Execute a SQL query on the database using a Promise-based wrapper.
 */
export function executeSql(sql: string, params: any[] = []): Promise<SQLResult> {
  return new Promise((resolve, reject) => {
    db.transaction(
      (tx) => {
        tx.executeSql(
          sql,
          params,
          (_, result) => {
            resolve(result);
          },
          (_, error) => {
            reject(error);
            return true; // rollback
          }
        );
      },
      (txError) => {
        reject(txError);
      }
    );
  });
}

/**
 * Initialize all required SQLite tables.
 */
export function initializeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    db.transaction(
      (tx) => {
        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS enrolled_faces (
            user_id TEXT PRIMARY KEY,
            embedding BLOB,
            enrolled_at TEXT
          );`,
          [],
          () => {},
          (_, err) => {
            reject(err);
            return true;
          }
        );

        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS auth_logs (
            log_id TEXT PRIMARY KEY,
            user_id TEXT,
            timestamp TEXT,
            gps_lat REAL,
            gps_lng REAL,
            device_id TEXT,
            similarity_score REAL,
            photo_thumb TEXT,
            synced INTEGER DEFAULT 0
          );`,
          [],
          () => {
            resolve();
          },
          (_, err) => {
            reject(err);
            return true;
          }
        );
      },
      (txError) => {
        console.error('Database initialization transaction failed:', txError);
        reject(txError);
      },
      () => {
        console.log('Database initialized successfully.');
        resolve();
      }
    );
  });
}

// Keep initDatabase for backwards compatibility with tests
export function initDatabase(): Promise<void> {
  return initializeDatabase();
}

// Execute schema creation immediately on module load
initializeDatabase().catch((err) => {
  console.error('Failed to initialize database schema immediately on module load:', err);
});
