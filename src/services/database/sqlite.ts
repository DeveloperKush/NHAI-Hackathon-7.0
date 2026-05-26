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
export function initDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    db.transaction(
      (tx) => {
        // 1. enrolled_faces table
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

        // 2. auth_logs table
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
        reject(txError);
      }
    );
  });
}
